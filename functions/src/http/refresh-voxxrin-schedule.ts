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
import { generateVoxxrinDescriptorForConference } from './generate-voxxrin-event-descriptor';

const VOXXRIN_SECRET_TOKEN_NAME = 'VOXXRIN_SECRET_TOKEN';

export const refreshVoxxrinSchedule = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    applyCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    ensurePostMethod(req.method, 'refreshVoxxrinSchedule');

    const conferenceId = parseConferenceId(req.body, 'refreshVoxxrinSchedule');
    const db = admin.firestore();
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'refreshVoxxrinSchedule'
    );

    const { conferenceData } = await loadConference(db, conferenceId, 'refreshVoxxrinSchedule');
    ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'refreshVoxxrinSchedule');

    const generated = await generateVoxxrinDescriptorForConference(db, conferenceId, conferenceData);
    const baseUrl = String(generated.voxxrinConfig?.baseUrl ?? '').trim().replace(/\/+$/g, '');
    const eventId = String(generated.voxxrinConfig?.eventId ?? '').trim();
    const token = await loadVoxxrinSecretToken(db, conferenceId);
    if (!baseUrl || !eventId || !token) {
      throw new HttpError(
        400,
        'Incomplete Voxxrin configuration (missing baseUrl, eventId or token)',
        'refreshVoxxrinSchedule rejected: missing Voxxrin connection settings',
        { conferenceId, hasBaseUrl: !!baseUrl, hasEventId: !!eventId, hasToken: !!token }
      );
    }

    const refreshUrl = `https://${baseUrl}/api/crawlers/${encodeURIComponent(eventId)}/refreshScheduleRequest?token=${encodeURIComponent(token)}`;
    const voxxrinResponse = await callVoxxrinRefreshApi(refreshUrl);

    logger.info('refreshVoxxrinSchedule completed', {
      conferenceId,
      requesterEmail,
      storagePath: generated.storageResult.objectPath,
      archivedPreviousFilePath: generated.storageResult.archivedFilePath ?? null,
      voxxrinStatus: voxxrinResponse.status,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send({
      message: 'Voxxrin schedule refresh requested',
      filePath: generated.storageResult.objectPath,
      downloadUrl: generated.storageResult.publicDownloadUrl,
      archivedPreviousFilePath: generated.storageResult.archivedFilePath ?? null,
      voxxrinStatus: voxxrinResponse.status,
      voxxrinResponse: voxxrinResponse.payload,
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('refreshVoxxrinSchedule error', { message });
    res.status(500).send({
      error: 'Voxxrin schedule refresh failed',
      code: 'VOXXRIN_REFRESH_ERROR',
      detail: message,
    });
  }
});

async function loadVoxxrinSecretToken(db: admin.firestore.Firestore, conferenceId: string): Promise<string> {
  const secretSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SECRET)
    .where('conferenceId', '==', conferenceId)
    .where('secretName', '==', VOXXRIN_SECRET_TOKEN_NAME)
    .limit(1)
    .get();

  const secret = secretSnap.empty ? null : (secretSnap.docs[0].data() as { secretValue?: unknown });
  return String(secret?.secretValue ?? '').trim();
}

async function callVoxxrinRefreshApi(url: string): Promise<{ status: number; payload: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      redirect: 'follow',
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new HttpError(
      502,
      `Failed to call Voxxrin API: ${detail}`,
      'refreshVoxxrinSchedule rejected: Voxxrin API call failed'
    );
  }

  const rawBody = await response.text();
  const parsedBody = parseJsonOrText(rawBody);
  if (!response.ok) {
    throw new HttpError(
      502,
      `Voxxrin API error (${response.status})`,
      'refreshVoxxrinSchedule rejected: Voxxrin API returned non-2xx',
      { status: response.status, body: parsedBody }
    );
  }

  return { status: response.status, payload: parsedBody };
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

function applyCorsHeaders(req: any, res: any): void {
  const origin = String(req?.headers?.origin ?? '*');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
