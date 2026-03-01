import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import * as logger from 'firebase-functions/logger';
import { HttpError } from './conference-http-common';

const FIRESTORE_BATCH_LIMIT = 450;

/**
 * Entry returned by Voxxrin talksEditors API for one talk.
 */
interface VoxxrinTalkEditor {
  /** Voxxrin talk id, matched with `session.id` in Firestore. */
  talkId?: unknown;
  /** Private feedback registration URL for the talk. */
  registrationUrl?: unknown;
}

/**
 * Parameters required to synchronize private feedback URLs from Voxxrin.
 */
export interface RefreshVoxxrinFeedbackPrivateUrlsParams {
  /** Firestore instance. */
  db: admin.firestore.Firestore;
  /** Conference identifier. */
  conferenceId: string;
  /** Voxxrin base URL. */
  baseUrl: string;
  /** Voxxrin event id. */
  eventId: string;
  /** Voxxrin API secret token. */
  token: string;
}

/**
 * Synchronization report returned to the caller.
 */
export interface VoxxrinFeedbackPrivateUrlSyncReport {
  /** Number of conference sessions loaded from Firestore. */
  sessionsInConference: number;
  /** Number of talksEditors items returned by Voxxrin. */
  talksEditorsReceived: number;
  /** Number of sessions effectively updated. */
  sessionsUpdated: number;
  /** Number of talksEditors entries skipped (invalid/unmatched). */
  unmatchedTalkEditors: number;
}

/**
 * Retrieves talksEditors from Voxxrin and updates `conference.feedback.privateUrl`
 * on conference sessions with Firestore batch writes.
 */
export async function refreshVoxxrinFeedbackPrivateUrls(
  params: RefreshVoxxrinFeedbackPrivateUrlsParams
): Promise<VoxxrinFeedbackPrivateUrlSyncReport> {
  logger.info('refreshVoxxrinFeedbackPrivateUrls started', {
    conferenceId: params.conferenceId,
    baseUrl: params.baseUrl,
    eventId: params.eventId,
  });

  const talksEditorsUrl = buildTalksEditorsUrl(params.baseUrl, params.eventId, params.token);
  const talksEditors = await callVoxxrinTalksEditorsApi(talksEditorsUrl);
  logger.info('refreshVoxxrinFeedbackPrivateUrls talksEditors loaded', {
    conferenceId: params.conferenceId,
    talksEditorsReceived: talksEditors.length,
  });

  const report = await updateSessionFeedbackPrivateUrls(params.db, params.conferenceId, talksEditors);
  logger.info('refreshVoxxrinFeedbackPrivateUrls completed', {
    conferenceId: params.conferenceId,
    ...report,
  });
  return report;
}

/**
 * Builds the Voxxrin talksEditors endpoint URL.
 */
function buildTalksEditorsUrl(baseUrl: string, eventId: string, token: string): string {
  return `https://${baseUrl}/api/events/${encodeURIComponent(eventId)}/talksEditors?token=${encodeURIComponent(token)}&baseUrl=${encodeURIComponent(baseUrl)}`;
}

/**
 * Calls Voxxrin talksEditors endpoint and validates the response format.
 */
async function callVoxxrinTalksEditorsApi(url: string): Promise<VoxxrinTalkEditor[]> {
  logger.info('refreshVoxxrinFeedbackPrivateUrls calling Voxxrin talksEditors API');

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
      'refreshVoxxrinSchedule rejected: Voxxrin talksEditors API call failed'
    );
  }

  const rawBody = await response.text();
  const parsedBody = parseJsonOrText(rawBody);
  logger.info('refreshVoxxrinFeedbackPrivateUrls Voxxrin talksEditors API response received', {
    status: response.status,
  });

  if (!response.ok) {
    throw new HttpError(
      502,
      `Voxxrin API error (${response.status})`,
      'refreshVoxxrinSchedule rejected: Voxxrin talksEditors API returned non-2xx',
      { status: response.status, body: parsedBody }
    );
  }

  if (!Array.isArray(parsedBody)) {
    throw new HttpError(
      502,
      'Invalid Voxxrin API response format',
      'refreshVoxxrinSchedule rejected: invalid talksEditors response format'
    );
  }

  return parsedBody as VoxxrinTalkEditor[];
}

/**
 * Loads all sessions for a conference once, computes private URL updates,
 * then writes them in Firestore batches.
 */
async function updateSessionFeedbackPrivateUrls(
  db: admin.firestore.Firestore,
  conferenceId: string,
  talksEditors: VoxxrinTalkEditor[]
): Promise<VoxxrinFeedbackPrivateUrlSyncReport> {
  const sessionsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SESSION)
    .where('conference.conferenceId', '==', conferenceId)
    .get();

  const docBySessionId = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  sessionsSnap.docs.forEach((docSnap) => {
    const sessionId = String((docSnap.data() as { id?: unknown })?.id ?? '').trim();
    if (sessionId) {
      docBySessionId.set(sessionId, docSnap);
    }
  });

  const privateUrlByDocId = new Map<string, string>();
  let unmatchedTalkEditors = 0;

  talksEditors.forEach((editor) => {
    const talkId = String(editor?.talkId ?? '').trim();
    const registrationUrl = String(editor?.registrationUrl ?? '').trim();
    if (!talkId || !registrationUrl) {
      unmatchedTalkEditors += 1;
      logger.warn('refreshVoxxrinFeedbackPrivateUrls talksEditor ignored: missing talkId or registrationUrl', {
        conferenceId,
        talkId,
      });
      return;
    }

    const matchedSessionDoc = docBySessionId.get(talkId);
    if (!matchedSessionDoc) {
      unmatchedTalkEditors += 1;
      logger.warn('refreshVoxxrinFeedbackPrivateUrls talksEditor ignored: no matching session', {
        conferenceId,
        talkId,
      });
      return;
    }

    privateUrlByDocId.set(matchedSessionDoc.id, 'https://' + registrationUrl);
  });

  const docsToUpdate: admin.firestore.QueryDocumentSnapshot[] = [];
  sessionsSnap.docs.forEach((docSnap) => {
    const sessionId = String((docSnap.data() as { id?: unknown })?.id ?? '').trim() || docSnap.id;
    const nextPrivateUrl = privateUrlByDocId.get(docSnap.id);
    if (!nextPrivateUrl) {
      logger.info('refreshVoxxrinFeedbackPrivateUrls session skipped: no talksEditor match', {
        conferenceId,
        sessionId,
      });
      return;
    }

    const currentPrivateUrl = String(docSnap.get('conference.feedback.privateUrl') ?? '').trim();
    const hasFeedbackObject = !!docSnap.get('conference.feedback');
    if (currentPrivateUrl === nextPrivateUrl && hasFeedbackObject) {
      logger.info('refreshVoxxrinFeedbackPrivateUrls session skipped: already up to date', {
        conferenceId,
        sessionId,
      });
      return;
    }

    logger.info('refreshVoxxrinFeedbackPrivateUrls session queued for update', {
      conferenceId,
      sessionId,
      feedbackMissing: !hasFeedbackObject,
    });
    docsToUpdate.push(docSnap);
  });

  let committedBatchCount = 0;
  for (let i = 0; i < docsToUpdate.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docsToUpdate.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();

    chunk.forEach((docSnap) => {
      const privateUrl = privateUrlByDocId.get(docSnap.id);
      if (!privateUrl) {
        return;
      }

      const feedbackData = docSnap.get('conference.feedback');
      const docRef = db.collection(FIRESTORE_COLLECTIONS.SESSION).doc(docSnap.id);
      const sessionId = String((docSnap.data() as { id?: unknown })?.id ?? '').trim() || docSnap.id;

      if (!feedbackData || typeof feedbackData !== 'object') {
        logger.info('refreshVoxxrinFeedbackPrivateUrls updating session: initializing feedback object', {
          conferenceId,
          sessionId,
        });
        batch.update(docRef, {
          'conference.feedback': {
            publicUrl: '',
            detail: [],
            privateUrl,
          },
        });
        return;
      }

      logger.info('refreshVoxxrinFeedbackPrivateUrls updating session: setting privateUrl', {
        conferenceId,
        sessionId,
      });
      batch.update(docRef, {
        'conference.feedback.privateUrl': privateUrl,
      });
    });

    await batch.commit();
    committedBatchCount += 1;
  }

  logger.info('refreshVoxxrinFeedbackPrivateUrls update operation finished', {
    conferenceId,
    sessionsInConference: sessionsSnap.size,
    talksEditorsReceived: talksEditors.length,
    sessionsUpdated: docsToUpdate.length,
    unmatchedTalkEditors,
    committedBatchCount,
  });

  return {
    sessionsInConference: sessionsSnap.size,
    talksEditorsReceived: talksEditors.length,
    sessionsUpdated: docsToUpdate.length,
    unmatchedTalkEditors,
  };
}

/**
 * Parses a string as JSON and falls back to raw text payload.
 */
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
