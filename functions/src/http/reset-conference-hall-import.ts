import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
  ensureRequesterIsOrganizer,
} from './conference-http-common';

interface ResetReport {
  sessionDeleted: number;
  speakerDeleted: number;
  resetAt: string;
}

interface AuthorizedContext {
  conferenceId: string;
  requesterEmail: string;
  conferenceRef: admin.firestore.DocumentReference;
  conferenceData: any;
}

interface PersonDeletionCandidate {
  id: string;
  email: string;
}

/**
 * HTTP endpoint that resets Conference Hall imported data for a conference.
 * Workflow:
 * - validates request method and conference id
 * - authenticates caller from Firebase ID token
 * - authorizes only conference organizers
 * - deletes all sessions of the conference
 * - deletes orphan Conference Hall speakers without account
 * - updates conference lastUpdated
 * Returns a reset report with deleted counts.
 */
export const resetConferenceHallImport = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    logger.info('resetConferenceHallImport request received', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body ?? {}),
    });

    const db = admin.firestore();
    const context = await authorizeRequest(req, db);

    const report: ResetReport = {
      sessionDeleted: await deleteConferenceSessions(db, context.conferenceId),
      speakerDeleted: await deleteOrphanConferenceHallSpeakers(db, context.conferenceId),
      resetAt: new Date().toISOString(),
    };

    await updateConferenceLastUpdated(context.conferenceRef, context.conferenceData);

    logger.info('resetConferenceHallImport completed', {
      conferenceId: context.conferenceId,
      requesterEmail: context.requesterEmail,
      report,
    });
    res.status(200).send({ report });
  } catch (err: any) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    logger.error('resetConferenceHallImport error', err);
    res.status(500).send({
      error: 'Reset failed',
      code: 'RESET_ERROR',
      detail: err?.message ?? 'unknown error',
    });
  }
});

/**
 * Validates the incoming request, authenticates the caller and checks organizer authorization.
 * Returns the context needed by the reset workflow.
 */
async function authorizeRequest(req: any, db: admin.firestore.Firestore): Promise<AuthorizedContext> {
  ensurePostMethod(req.method, 'resetConferenceHallImport');
  const conferenceId = parseConferenceId(req.body, 'resetConferenceHallImport');
  const requesterEmail = await getRequesterEmailFromAuthorization(
    req.headers.authorization,
    conferenceId,
    'resetConferenceHallImport'
  );
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, 'resetConferenceHallImport');
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'resetConferenceHallImport');

  logger.info('resetConferenceHallImport conference loaded and authorized', {
    conferenceId,
    requesterEmail,
  });
  return { conferenceId, requesterEmail, conferenceRef, conferenceData };
}

/**
 * Deletes all sessions attached to the given conference and returns the deleted count.
 */
async function deleteConferenceSessions(db: admin.firestore.Firestore, conferenceId: string): Promise<number> {
  const sessionsSnap = await db.collection('session')
    .where('conference.conferenceId', '==', conferenceId)
    .get();
  logger.info('resetConferenceHallImport sessions loaded', {
    conferenceId,
    sessionCount: sessionsSnap.size,
  });

  await deleteByDocIds(db, 'session', sessionsSnap.docs.map((doc) => doc.id));
  logger.info('resetConferenceHallImport sessions deleted', {
    conferenceId,
    sessionDeleted: sessionsSnap.size,
  });
  return sessionsSnap.size;
}

/**
 * Deletes orphan Conference Hall speakers:
 * - preloads persons linked to this conference with `speaker.submittedConferenceIds`
 * - keeps only persons with `hasAccount = false`
 * - keeps only persons that are not linked to any other conference
 * Returns the number of deleted speakers.
 */
async function deleteOrphanConferenceHallSpeakers(db: admin.firestore.Firestore, conferenceId: string): Promise<number> {
  const personsSnap = await db.collection('person')
    .where('speaker.submittedConferenceIds', 'array-contains', conferenceId)
    .get();
  logger.info('resetConferenceHallImport candidate speakers loaded', {
    conferenceId,
    loadedSpeakerCandidates: personsSnap.size,
  });

  const personsToDelete: PersonDeletionCandidate[] = [];
  for (const personDoc of personsSnap.docs) {
    const data = personDoc.data() as any;
    const hasAccount = !!data?.hasAccount;
    if (hasAccount) {
      continue;
    }

    const submittedConferenceIds = (Array.isArray(data?.speaker?.submittedConferenceIds)
      ? data.speaker.submittedConferenceIds
      : [])
      .map((value: any) => String(value ?? '').trim())
      .filter((value: string) => value.length > 0);
    const hasOtherConference = submittedConferenceIds.some((id: string) => id !== conferenceId);
    if (hasOtherConference) {
      continue;
    }

    personsToDelete.push({
      id: personDoc.id,
      email: String(data?.email ?? '').trim(),
    });
  }

  await deletePersonsAndEmailIndexes(db, personsToDelete);
  logger.info('resetConferenceHallImport speakers deleted', {
    conferenceId,
    speakerDeleted: personsToDelete.length,
  });
  return personsToDelete.length;
}

/**
 * Updates conference lastUpdated after reset operations.
 */
async function updateConferenceLastUpdated(
  conferenceRef: admin.firestore.DocumentReference,
  conferenceData: any
): Promise<void> {
  await conferenceRef.set({
    ...conferenceData,
    lastUpdated: Date.now().toString(),
  });
  logger.info('resetConferenceHallImport conference updated', { conferenceId: conferenceRef.id });
}

/**
 * Deletes documents by id using batched writes.
 * Chunks are limited to keep a safe margin below Firestore batch limits.
 */
async function deleteByDocIds(db: admin.firestore.Firestore, collectionName: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 450) {
    const chunk = ids.slice(i, i + 450);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection(collectionName).doc(id));
    }
    await batch.commit();
  }
}

/**
 * Deletes persons and their corresponding `person_emails` index docs in batched writes.
 */
async function deletePersonsAndEmailIndexes(
  db: admin.firestore.Firestore,
  persons: PersonDeletionCandidate[]
): Promise<void> {
  for (let i = 0; i < persons.length; i += 225) {
    const chunk = persons.slice(i, i + 225);
    const batch = db.batch();
    for (const person of chunk) {
      batch.delete(db.collection('person').doc(person.id));
      const emailKey = String(person.email ?? '').trim().toLowerCase();
      if (emailKey) {
        batch.delete(db.collection('person_emails').doc(emailKey));
      }
    }
    await batch.commit();
  }
}
