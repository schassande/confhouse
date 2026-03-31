import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
} from '../common';
import { recomputeAndPersistConferenceDashboard } from '../dashboard/compute';

const BATCH_SAFE_LIMIT = 450;
const CONFERENCE_SPEAKER_STATUSES = new Set(['ACCEPTED', 'SPEAKER_CONFIRMED', 'SCHEDULED', 'PROGRAMMED']);
const SPEAKER_ACTIVE_STATUSES = new Set(['ACCEPTED', 'PROGRAMMED']);

type SpeakerSessionDecision = 'CANCEL_SESSION' | 'REMOVE_SPEAKER_ONLY';

interface SpeakerSessionActionReport {
  updatedSession: any;
  deallocation: {
    deallocatedAllocations: any[];
    updatedSessions: any[];
  };
  removedFromConferenceSpeakerIds: string[];
  dashboardRefreshFailed: boolean;
}

/**
 * Handles a speaker-driven session action (cancel session or remove self from session).
 *
 * Workflow:
 * - validates HTTP method and payload
 * - authenticates requester from Firebase ID token
 * - verifies requester is one of the session speakers
 * - applies the requested action on the session
 * - synchronizes conference-speaker projection
 * - deallocates planning entries when session is cancelled
 * - removes speaker activity participations when no eligible session remains
 * - recomputes conference dashboard statistics
 */
export const speakerSessionAction = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  const startedAt = Date.now();
  try {
    ensurePostMethod(req.method, 'speakerSessionAction');
    const conferenceId = parseConferenceId(req.body, 'speakerSessionAction');
    const sessionId = parseSessionId(req.body);
    const decision = parseDecision(req.body);
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'speakerSessionAction'
    );

    const db = admin.firestore();
    const { conferenceData } = await loadConference(db, conferenceId, 'speakerSessionAction');
    const requesterPersonId = await loadPersonIdByEmail(db, requesterEmail, conferenceId);

    const sessionRef = db.collection(FIRESTORE_COLLECTIONS.SESSION).doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpError(404, 'Session not found', 'speakerSessionAction rejected: missing session', {
        conferenceId,
        sessionId,
      });
    }

    const previousSession = { ...(sessionSnap.data() as any), id: sessionSnap.id };
    if (String(previousSession?.conference?.conferenceId ?? '').trim() !== conferenceId) {
      throw new HttpError(400, 'Session does not belong to conference', 'speakerSessionAction rejected: conference mismatch', {
        conferenceId,
        sessionId,
      });
    }

    const previousSpeakerIds = extractSpeakerIds(previousSession);
    if (!previousSpeakerIds.includes(requesterPersonId)) {
      throw new HttpError(403, 'Forbidden: speaker access required', 'speakerSessionAction rejected: requester is not a session speaker', {
        conferenceId,
        sessionId,
        requesterPersonId,
      });
    }
    if (decision === 'REMOVE_SPEAKER_ONLY' && previousSpeakerIds.length < 2) {
      throw new HttpError(400, 'Cannot remove the only speaker', 'speakerSessionAction rejected: single speaker session', {
        conferenceId,
        sessionId,
      });
    }

    const nextSession = buildNextSession(previousSession, requesterPersonId, decision);
    nextSession.lastUpdated = Date.now().toString();
    await sessionRef.set(nextSession);

    await syncConferenceSpeakersFromSession(db, conferenceId, {
      ...nextSession,
      id: sessionId,
    }, previousSession);

    const deallocatedAllocations = decision === 'CANCEL_SESSION'
      ? await deallocateSession(db, conferenceId, sessionId)
      : [];

    const removedFromConferenceSpeakerIds = await cleanupSpeakerIfNoEligibleSessions(db, conferenceId, requesterPersonId);

    let dashboardRefreshFailed = false;
    try {
      await recomputeAndPersistConferenceDashboard(db, {
        conferenceId,
        conferenceData,
        trigger: 'AUTO_EVENT',
      });
    } catch (error) {
      dashboardRefreshFailed = true;
      logger.error('speakerSessionAction dashboard refresh failed', {
        conferenceId,
        sessionId,
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }

    const report: SpeakerSessionActionReport = {
      updatedSession: { ...nextSession, id: sessionId },
      deallocation: {
        deallocatedAllocations,
        updatedSessions: [],
      },
      removedFromConferenceSpeakerIds,
      dashboardRefreshFailed,
    };

    logger.info('speakerSessionAction completed', {
      conferenceId,
      sessionId,
      requesterEmail,
      requesterPersonId,
      decision,
      deallocatedCount: deallocatedAllocations.length,
      removedFromConferenceSpeakerIds,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(200).send({ report });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('speakerSessionAction failed', {
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({
      error: 'Speaker session action failed',
      code: 'SPEAKER_SESSION_ACTION_ERROR',
      detail: message,
    });
  }
});

/**
 * Reads and validates `sessionId` from request body.
 *
 * @param body HTTP request body.
 * @returns Normalized session id.
 */
function parseSessionId(body: any): string {
  const sessionId = String(body?.sessionId ?? '').trim();
  if (!sessionId) {
    throw new HttpError(400, 'Missing sessionId', 'speakerSessionAction rejected: missing sessionId');
  }
  return sessionId;
}

/**
 * Reads and validates speaker decision from request body.
 *
 * @param body HTTP request body.
 * @returns Validated speaker decision.
 */
function parseDecision(body: any): SpeakerSessionDecision {
  const decision = String(body?.decision ?? '').trim() as SpeakerSessionDecision;
  if (decision !== 'CANCEL_SESSION' && decision !== 'REMOVE_SPEAKER_ONLY') {
    throw new HttpError(400, 'Invalid decision', 'speakerSessionAction rejected: invalid decision', {
      decision,
    });
  }
  return decision;
}

/**
 * Loads a person id from a normalized email address.
 *
 * @param db Firestore admin instance.
 * @param email Authenticated requester email.
 * @param conferenceId Conference id for logging/error context.
 * @returns Person document id.
 */
async function loadPersonIdByEmail(
  db: admin.firestore.Firestore,
  email: string,
  conferenceId: string
): Promise<string> {
  const snap = await db
    .collection(FIRESTORE_COLLECTIONS.PERSON)
    .where('email', '==', email)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpError(403, 'Forbidden: person not found', 'speakerSessionAction rejected: person not found for email', {
      conferenceId,
      email,
    });
  }
  return snap.docs[0].id;
}

/**
 * Extracts distinct, non-empty speaker ids from a session-like object.
 *
 * @param session Session object.
 * @returns Ordered list of speaker ids.
 */
function extractSpeakerIds(session: any): string[] {
  return Array.from(
    new Set(
      [
        String(session?.speaker1Id ?? '').trim(),
        String(session?.speaker2Id ?? '').trim(),
        String(session?.speaker3Id ?? '').trim(),
      ].filter((id) => id.length > 0)
    )
  );
}

/**
 * Builds the next session payload from previous session and speaker decision.
 *
 * @param previousSession Existing session snapshot.
 * @param requesterPersonId Authenticated requester person id.
 * @param decision Requested action.
 * @returns Updated session payload.
 */
function buildNextSession(
  previousSession: any,
  requesterPersonId: string,
  decision: SpeakerSessionDecision
): any {
  if (decision === 'CANCEL_SESSION') {
    const currentStatus = String(previousSession?.conference?.status ?? '').trim().toUpperCase();
    const nextStatus = currentStatus === 'PROGRAMMED' ? 'CANCELLED' : 'DECLINED_BY_SPEAKER';
    return {
      ...previousSession,
      conference: {
        ...(previousSession?.conference ?? {}),
        status: nextStatus,
      },
    };
  }

  const nextSpeakerIds = extractSpeakerIds(previousSession).filter((speakerId) => speakerId !== requesterPersonId);
  return {
    ...previousSession,
    speaker1Id: nextSpeakerIds[0] ?? '',
    speaker2Id: nextSpeakerIds[1] ?? '',
    speaker3Id: nextSpeakerIds[2] ?? '',
  };
}

/**
 * Synchronizes `conference-speaker` projection for speakers impacted by one session update.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference id.
 * @param nextSession Session state after action.
 * @param previousSession Session state before action.
 */
async function syncConferenceSpeakersFromSession(
  db: admin.firestore.Firestore,
  conferenceId: string,
  nextSession: any,
  previousSession: any
): Promise<void> {
  const shouldExist = CONFERENCE_SPEAKER_STATUSES.has(String(nextSession?.conference?.status ?? '').trim().toUpperCase());
  const sessionId = String(nextSession?.id ?? '').trim();
  if (!sessionId) {
    return;
  }

  const nextSpeakerIds = extractSpeakerIds(nextSession);
  const previousSpeakerIds = extractSpeakerIds(previousSession);
  const personIdsToLoad = Array.from(new Set([...nextSpeakerIds, ...previousSpeakerIds]));
  if (personIdsToLoad.length === 0) {
    return;
  }

  const conferenceSpeakerSnap = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
    .where('conferenceId', '==', conferenceId)
    .get();
  const existingByPersonId = new Map<string, any>();
  conferenceSpeakerSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const personId = String(data?.personId ?? '').trim();
    if (!personIdsToLoad.includes(personId)) {
      return;
    }
    existingByPersonId.set(personId, { ...data, id: docSnap.id });
  });

  const source = String(nextSession?.conference?.conferenceHallId ?? '').trim() ? 'CONFERENCE_HALL' : 'MANUAL';
  const writes: Array<{ op: 'set' | 'delete'; id: string; value?: any }> = [];

  for (const personId of personIdsToLoad) {
    const existing = existingByPersonId.get(personId);
    const shouldContainSession = shouldExist && nextSpeakerIds.includes(personId);
    const currentSessionIds = normalizeIds(existing?.sessionIds);

    if (shouldContainSession) {
      const nextSessionIds = uniqueSorted([...currentSessionIds, sessionId]);
      if (sameIds(currentSessionIds, nextSessionIds)) {
        continue;
      }

      const nextConferenceSpeakerId = String(existing?.id ?? db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER).doc().id).trim();
      writes.push({
        op: 'set',
        id: nextConferenceSpeakerId,
        value: {
          id: nextConferenceSpeakerId,
          conferenceId,
          personId,
          unavailableSlotsId: normalizeIds(existing?.unavailableSlotsId),
          sessionIds: nextSessionIds,
          source: String(existing?.source ?? source).trim() || source,
          sourceId: String(existing?.sourceId ?? personId).trim(),
          lastUpdated: Date.now().toString(),
        },
      });
      continue;
    }

    if (!existing || !currentSessionIds.includes(sessionId)) {
      continue;
    }

    const nextSessionIds = currentSessionIds.filter((value) => value !== sessionId);
    if (nextSessionIds.length === 0) {
      writes.push({ op: 'delete', id: String(existing.id ?? '').trim() });
      continue;
    }

    writes.push({
      op: 'set',
      id: String(existing.id ?? '').trim(),
      value: {
        ...existing,
        unavailableSlotsId: normalizeIds(existing.unavailableSlotsId),
        sessionIds: nextSessionIds,
        lastUpdated: Date.now().toString(),
      },
    });
  }

  await commitConferenceSpeakerWrites(db, writes);
}

/**
 * Commits conference-speaker set/delete operations in Firestore batches.
 *
 * @param db Firestore admin instance.
 * @param writes Pending write operations.
 */
async function commitConferenceSpeakerWrites(
  db: admin.firestore.Firestore,
  writes: Array<{ op: 'set' | 'delete'; id: string; value?: any }>
): Promise<void> {
  const cleanWrites = writes.filter((write) => String(write.id ?? '').trim().length > 0);
  for (let i = 0; i < cleanWrites.length; i += BATCH_SAFE_LIMIT) {
    const batch = db.batch();
    const chunk = cleanWrites.slice(i, i + BATCH_SAFE_LIMIT);
    chunk.forEach((write) => {
      const ref = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER).doc(write.id);
      if (write.op === 'delete') {
        batch.delete(ref);
        return;
      }
      batch.set(ref, write.value ?? {});
    });
    await batch.commit();
  }
}

/**
 * Deletes all allocations for one session in one conference.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference id.
 * @param sessionId Session id.
 * @returns Deleted allocation payloads.
 */
async function deallocateSession(
  db: admin.firestore.Firestore,
  conferenceId: string,
  sessionId: string
): Promise<any[]> {
  const allocationsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SESSION_ALLOCATION)
    .where('conferenceId', '==', conferenceId)
    .where('sessionId', '==', sessionId)
    .get();

  const allocations = allocationsSnap.docs.map((docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }));
  const ids = allocations.map((allocation) => String(allocation.id ?? '').trim()).filter((id) => !!id);
  for (let i = 0; i < ids.length; i += BATCH_SAFE_LIMIT) {
    const batch = db.batch();
    const chunk = ids.slice(i, i + BATCH_SAFE_LIMIT);
    chunk.forEach((id) => batch.delete(db.collection(FIRESTORE_COLLECTIONS.SESSION_ALLOCATION).doc(id)));
    await batch.commit();
  }
  return allocations;
}

/**
 * Removes conference-speaker projection and activity participations for a speaker
 * when they no longer have eligible sessions in the conference.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference id.
 * @param speakerId Speaker person id.
 * @returns Removed speaker ids (empty when unchanged).
 */
async function cleanupSpeakerIfNoEligibleSessions(
  db: admin.firestore.Firestore,
  conferenceId: string,
  speakerId: string
): Promise<string[]> {
  const hasEligibleSession = await speakerHasEligibleConferenceSession(db, conferenceId, speakerId);
  if (hasEligibleSession) {
    return [];
  }

  const conferenceSpeakerSnap = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
    .where('conferenceId', '==', conferenceId)
    .where('personId', '==', speakerId)
    .get();

  const activityParticipationsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION)
    .where('conferenceId', '==', conferenceId)
    .where('personId', '==', speakerId)
    .get();

  const writeOps: Array<{ collection: string; id: string }> = [];
  conferenceSpeakerSnap.docs.forEach((docSnap) => {
    writeOps.push({ collection: FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER, id: docSnap.id });
  });
  activityParticipationsSnap.docs.forEach((docSnap) => {
    writeOps.push({ collection: FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION, id: docSnap.id });
  });

  for (let i = 0; i < writeOps.length; i += BATCH_SAFE_LIMIT) {
    const batch = db.batch();
    const chunk = writeOps.slice(i, i + BATCH_SAFE_LIMIT);
    chunk.forEach((writeOp) => {
      batch.delete(db.collection(writeOp.collection).doc(writeOp.id));
    });
    await batch.commit();
  }

  return [speakerId];
}

/**
 * Checks whether a speaker still has at least one eligible session in the conference.
 *
 * Eligible statuses: `ACCEPTED`, `PROGRAMMED`.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference id.
 * @param speakerId Speaker person id.
 * @returns `true` when at least one eligible session exists.
 */
async function speakerHasEligibleConferenceSession(
  db: admin.firestore.Firestore,
  conferenceId: string,
  speakerId: string
): Promise<boolean> {
  const [speaker1Snap, speaker2Snap, speaker3Snap] = await Promise.all([
    db.collection(FIRESTORE_COLLECTIONS.SESSION).where('speaker1Id', '==', speakerId).get(),
    db.collection(FIRESTORE_COLLECTIONS.SESSION).where('speaker2Id', '==', speakerId).get(),
    db.collection(FIRESTORE_COLLECTIONS.SESSION).where('speaker3Id', '==', speakerId).get(),
  ]);

  const sessionById = new Map<string, any>();
  [speaker1Snap, speaker2Snap, speaker3Snap].forEach((snap) => {
    snap.docs.forEach((docSnap) => sessionById.set(docSnap.id, docSnap.data() as any));
  });

  for (const session of sessionById.values()) {
    if (String(session?.conference?.conferenceId ?? '').trim() !== conferenceId) {
      continue;
    }
    const status = String(session?.conference?.status ?? '').trim().toUpperCase();
    if (SPEAKER_ACTIVE_STATUSES.has(status)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes an unknown id list to unique, sorted, non-empty strings.
 *
 * @param values Unknown id list.
 * @returns Normalized ids.
 */
function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueSorted(
    values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0)
  );
}

/**
 * Returns a sorted list of unique values.
 *
 * @param values String list.
 * @returns Unique sorted values.
 */
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

/**
 * Compares two sorted id arrays by exact content.
 *
 * @param a First id list.
 * @param b Second id list.
 * @returns `true` when both arrays have same length and same values.
 */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}


