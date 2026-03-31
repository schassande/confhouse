import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../../common/firebase-admin';
import { FIRESTORE_COLLECTIONS, FirestoreCollectionName } from '../../common/firestore-collections';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
  ensureRequesterIsOrganizer,
} from '../common';

const FIRESTORE_BATCH_SAFE_LIMIT = 450;

interface DeleteConferenceReport {
  conferenceDeleted: number;
  sessionsDeleted: number;
  conferenceSpeakersDeleted: number;
  personsDeleted: number;
  activitiesDeleted: number;
  activityParticipationsDeleted: number;
  sessionAllocationsDeleted: number;
  conferenceHallConfigsDeleted: number;
  conferenceSecretsDeleted: number;
  deletedAt: string;
}

interface AuthorizedContext {
  conferenceId: string;
  requesterEmail: string;
  conferenceRef: admin.firestore.DocumentReference;
}

interface PersonDeletionCandidate {
  id: string;
  email: string;
}

/**
 * Deletes conference.
 * @param req HTTP request.
 * @param res HTTP response.
 */
export const deleteConference = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    logger.info('deleteConference request received', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body ?? {}),
    });

    const db = admin.firestore();
    const context = await authorizeRequest(req, db);

    const sessionsDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.SESSION).where('conference.conferenceId', '==', context.conferenceId)
    );
    const conferenceSpeakersDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER).where('conferenceId', '==', context.conferenceId)
    );
    const activityParticipationsDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION).where('conferenceId', '==', context.conferenceId)
    );
    const activitiesDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.ACTIVITY).where('conferenceId', '==', context.conferenceId)
    );
    const sessionAllocationsDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.SESSION_ALLOCATION).where('conferenceId', '==', context.conferenceId)
    );
    const conferenceSecretsDeleted = await deleteByQuery(
      db,
      db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SECRET).where('conferenceId', '==', context.conferenceId)
    );
    const conferenceHallConfigsDeleted = await deleteConferenceHallConfigs(db, context.conferenceId);
    const personsDeleted = await deleteCandidatePersons(db, context.conferenceId);

    await context.conferenceRef.delete();
    const report: DeleteConferenceReport = {
      conferenceDeleted: 1,
      sessionsDeleted,
      conferenceSpeakersDeleted,
      personsDeleted,
      activitiesDeleted,
      activityParticipationsDeleted,
      sessionAllocationsDeleted,
      conferenceHallConfigsDeleted,
      conferenceSecretsDeleted,
      deletedAt: new Date().toISOString(),
    };

    logger.info('deleteConference completed', {
      conferenceId: context.conferenceId,
      requesterEmail: context.requesterEmail,
      report,
    });
    res.status(200).send({ report });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('deleteConference error', { message });
    res.status(500).send({
      error: 'Conference deletion failed',
      code: 'CONFERENCE_DELETE_ERROR',
      detail: message,
    });
  }
});

/**
 * Authorizes request.
 * @param req HTTP request.
 * @param db Firestore instance.
 * @returns Promise resolved with the computed result.
 */
async function authorizeRequest(req: any, db: admin.firestore.Firestore): Promise<AuthorizedContext> {
  ensurePostMethod(req.method, 'deleteConference');
  const conferenceId = parseConferenceId(req.body, 'deleteConference');
  const requesterEmail = await getRequesterEmailFromAuthorization(
    req.headers.authorization,
    conferenceId,
    'deleteConference'
  );
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, 'deleteConference');
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'deleteConference');
  return { conferenceId, requesterEmail, conferenceRef };
}

/**
 * Deletes conference hall configs.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @returns Promise resolved with the computed result.
 */
async function deleteConferenceHallConfigs(db: admin.firestore.Firestore, conferenceId: string): Promise<number> {
  const ids = new Set<string>();
  const querySnap = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .get();
  querySnap.docs.forEach((doc) => ids.add(doc.id));

  const directDocSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG).doc(conferenceId).get();
  if (directDocSnap.exists) {
    ids.add(directDocSnap.id);
  }

  await deleteByDocIds(db, FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG, Array.from(ids));
  return ids.size;
}

/**
 * Deletes candidate persons.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @returns Promise resolved with the computed result.
 */
async function deleteCandidatePersons(db: admin.firestore.Firestore, conferenceId: string): Promise<number> {
  const personsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.PERSON)
    .where('speaker.submittedConferenceIds', 'array-contains', conferenceId)
    .get();

  const personsToDelete: PersonDeletionCandidate[] = [];
  for (const personDoc of personsSnap.docs) {
    const data = personDoc.data() as any;
    const hasAccount = !!data?.hasAccount;
    if (hasAccount) {
      continue;
    }

    /**
     * Submitted conference ids.
     * @param Array.isArray(data?.speaker?.submittedConferenceIds) ? data.speaker.submittedConferenceIds Array.is array(data?.speaker?.submitted conference ids) ? data.speaker.submitted conference ids.
     * @returns Computed result.
     */
    const submittedConferenceIds = (Array.isArray(data?.speaker?.submittedConferenceIds)
      ? data.speaker.submittedConferenceIds
      : [])
      .map((value: unknown) => String(value ?? '').trim())
      .filter((value: string) => value.length > 0);

    if (submittedConferenceIds.length !== 1 || submittedConferenceIds[0] !== conferenceId) {
      continue;
    }

    personsToDelete.push({
      id: personDoc.id,
      email: String(data?.email ?? '').trim(),
    });
  }

  await deletePersonsAndEmailIndexes(db, personsToDelete);
  return personsToDelete.length;
}

/**
 * Deletes by query.
 * @param db Firestore instance.
 * @param query Query.
 * @returns Promise resolved with the computed result.
 */
async function deleteByQuery(db: admin.firestore.Firestore, query: admin.firestore.Query): Promise<number> {
  const snap = await query.get();
  const ids = snap.docs.map((doc) => doc.id);
  if (ids.length === 0) {
    return 0;
  }

  const collectionName = snap.docs[0].ref.parent.id as FirestoreCollectionName;
  await deleteByDocIds(db, collectionName, ids);
  return ids.length;
}

/**
 * Deletes by doc ids.
 * @param db Firestore instance.
 * @param collectionName Collection name.
 * @param ids Ids.
 * @returns Promise resolved when the operation completes.
 */
async function deleteByDocIds(
  db: admin.firestore.Firestore,
  collectionName: FirestoreCollectionName,
  ids: string[]
): Promise<void> {
  for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_SAFE_LIMIT) {
    const chunk = ids.slice(i, i + FIRESTORE_BATCH_SAFE_LIMIT);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection(collectionName).doc(id));
    }
    await batch.commit();
  }
}

/**
 * Deletes persons and email indexes.
 * @param db Firestore instance.
 * @param persons Persons.
 * @returns Promise resolved when the operation completes.
 */
async function deletePersonsAndEmailIndexes(
  db: admin.firestore.Firestore,
  persons: PersonDeletionCandidate[]
): Promise<void> {
  for (let i = 0; i < persons.length; i += Math.floor(FIRESTORE_BATCH_SAFE_LIMIT / 2)) {
    const chunk = persons.slice(i, i + Math.floor(FIRESTORE_BATCH_SAFE_LIMIT / 2));
    const batch = db.batch();
    for (const person of chunk) {
      batch.delete(db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(person.id));
      const emailKey = String(person.email ?? '').trim().toLowerCase();
      if (emailKey) {
        batch.delete(db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(emailKey));
      }
    }
    await batch.commit();
  }
}


