import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
  ensureRequesterIsOrganizer,
} from './conference-http-common';

const VOXXRIN_SECRET_TOKEN_NAME = 'VOXXRIN_SECRET_TOKEN';
const FIRESTORE_BATCH_LIMIT = 450;

interface VoxxrinTalkStats {
  talkId?: unknown;
  totalFavoritesCount?: unknown;
}

interface VoxxrinTalksStatsResponse {
  perTalkStats?: VoxxrinTalkStats[];
}

export const refreshVoxxrinOccupation = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  const startedAt = Date.now();
  try {
    ensurePostMethod(req.method, 'refreshVoxxrinOccupation');
    const conferenceId = parseConferenceId(req.body, 'refreshVoxxrinOccupation');
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'refreshVoxxrinOccupation'
    );

    const db = admin.firestore();
    const { conferenceData } = await loadConference(db, conferenceId, 'refreshVoxxrinOccupation');
    ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'refreshVoxxrinOccupation');

    const voxxrinConfig = await loadVoxxrinConfig(db, conferenceId);
    const baseUrl = String(voxxrinConfig?.baseUrl ?? '').trim().replace(/\/+$/g, '');
    const eventId = String(voxxrinConfig?.eventId ?? '').trim();
    const token = await loadVoxxrinSecretToken(db, conferenceId);
    if (!baseUrl || !eventId || !token) {
      throw new HttpError(
        400,
        'Incomplete Voxxrin configuration (missing baseUrl, eventId or token)',
        'refreshVoxxrinOccupation rejected: missing Voxxrin connection settings',
        { conferenceId, hasBaseUrl: !!baseUrl, hasEventId: !!eventId, hasToken: !!token }
      );
    }

    const statsUrl = `https://${baseUrl}/api/events/${encodeURIComponent(eventId)}/talksStats?token=${encodeURIComponent(token)}`;
    const stats = await callVoxxrinTalksStatsApi(statsUrl);
    const report = await updateSessionOccupations(db, conferenceId, stats.perTalkStats ?? []);

    logger.info('refreshVoxxrinOccupation completed', {
      conferenceId,
      requesterEmail,
      elapsedMs: Date.now() - startedAt,
      ...report,
    });

    res.status(200).send({
      report: {
        ...report,
        refreshedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('refreshVoxxrinOccupation failed', {
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({
      error: 'Voxxrin occupation refresh failed',
      code: 'VOXXRIN_OCCUPATION_REFRESH_ERROR',
      detail: message,
    });
  }
});

async function updateSessionOccupations(
  db: admin.firestore.Firestore,
  conferenceId: string,
  perTalkStats: VoxxrinTalkStats[]
): Promise<{
  sessionsInConference: number;
  statsReceived: number;
  sessionsUpdated: number;
  unmatchedTalkStats: number;
}> {
  const sessionsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SESSION)
    .where('conference.conferenceId', '==', conferenceId)
    .get();

  const sessionByDocId = new Map<string, admin.firestore.DocumentSnapshot>();
  sessionsSnap.docs.forEach((docSnap) => {
    sessionByDocId.set(String(docSnap.id ?? '').trim(), docSnap);
  });

  const updatesBySessionId = new Map<string, number>();
  let unmatchedTalkStats = 0;

  perTalkStats.forEach((stat) => {
    const talkId = String(stat?.talkId ?? '').trim();
    if (!talkId) {
      unmatchedTalkStats += 1;
      return;
    }

    const occupation = toNonNegativeInteger(stat?.totalFavoritesCount);
    if (occupation === null) {
      unmatchedTalkStats += 1;
      return;
    }

    const matchedDoc = sessionByDocId.get(talkId);
    if (!matchedDoc) {
      unmatchedTalkStats += 1;
      return;
    }

    updatesBySessionId.set(matchedDoc.id, occupation);
  });

  const updateEntries = Array.from(updatesBySessionId.entries());
  for (let i = 0; i < updateEntries.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = updateEntries.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(([sessionId, occupation]) => {
      batch.update(
        db.collection(FIRESTORE_COLLECTIONS.SESSION).doc(sessionId),
        { 'conference.occupation': occupation }
      );
    });
    await batch.commit();
  }

  return {
    sessionsInConference: sessionsSnap.size,
    statsReceived: perTalkStats.length,
    sessionsUpdated: updatesBySessionId.size,
    unmatchedTalkStats,
  };
}

function toNonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

async function loadVoxxrinConfig(db: admin.firestore.Firestore, conferenceId: string): Promise<any | null> {
  const querySnap = await db
    .collection(FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();

  if (!querySnap.empty) {
    return querySnap.docs[0].data() as any;
  }

  const byDocId = await db.collection(FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG).doc(conferenceId).get();
  if (byDocId.exists) {
    return byDocId.data() as any;
  }

  return null;
}

async function loadVoxxrinSecretToken(db: admin.firestore.Firestore, conferenceId: string): Promise<string> {
  const secretSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SECRET)
    .where('conferenceId', '==', conferenceId)
    .where('secretName', '==', VOXXRIN_SECRET_TOKEN_NAME)
    .limit(1)
    .get();

  const secret = secretSnap.empty ? null : (secretSnap.docs[0].data() as { secretValue?: unknown });
  return String(secret?.secretValue ?? '').trim();
}

async function callVoxxrinTalksStatsApi(url: string): Promise<VoxxrinTalksStatsResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      redirect: 'follow',
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new HttpError(
      502,
      `Failed to call Voxxrin API: ${detail}`,
      'refreshVoxxrinOccupation rejected: Voxxrin API call failed'
    );
  }

  const rawBody = await response.text();
  const parsedBody = parseJsonOrText(rawBody);
  if (!response.ok) {
    throw new HttpError(
      502,
      `Voxxrin API error (${response.status})`,
      'refreshVoxxrinOccupation rejected: Voxxrin API returned non-2xx',
      { status: response.status, body: parsedBody }
    );
  }

  if (!parsedBody || typeof parsedBody !== 'object') {
    throw new HttpError(
      502,
      'Invalid Voxxrin API response format',
      'refreshVoxxrinOccupation rejected: invalid Voxxrin API response'
    );
  }

  return parsedBody as VoxxrinTalksStatsResponse;
}

function parseJsonOrText(value: string): unknown {
  const text = String(value ?? '').trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}
