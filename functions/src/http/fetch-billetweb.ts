import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import {
  HttpError,
  ensurePostMethod,
  ensureRequesterIsOrganizer,
  getRequesterEmailFromAuthorization,
  loadConference,
  parseConferenceId,
} from './conference-http-common';

type BilletwebOperation = 'events' | 'tickets';

interface BilletwebEvent {
  id: string;
  ext_id: string;
  name: string;
  start: string;
  end: string;
}

interface BilletwebTicket {
  id: string;
  name: string;
  full_name: string;
}

export const fetchBilletweb = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    applyCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    ensurePostMethod(req.method, 'fetchBilletweb');

    const conferenceId = parseConferenceId(req.body, 'fetchBilletweb');
    const operation = parseOperation(req.body?.operation);
    const apiUrl = normalizeApiUrl(req.body?.apiUrl);
    const userId = requiredText(req.body?.userId, 'Missing userId');
    const keyVersion = requiredText(req.body?.keyVersion, 'Missing keyVersion');
    const key = requiredText(req.body?.key, 'Missing key');

    const db = admin.firestore();
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'fetchBilletweb'
    );
    const { conferenceData } = await loadConference(db, conferenceId, 'fetchBilletweb');
    ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'fetchBilletweb');

    const query = `?user=${encodeURIComponent(userId)}&key=${encodeURIComponent(key)}&version=${encodeURIComponent(keyVersion)}`;
    if (operation === 'events') {
      const url = `${apiUrl}/events${query}&past=1`;
      const payload = await callBilletwebApi(url);
      const events = normalizeEvents(payload);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send({ events });
      return;
    }

    const eventId = requiredText(req.body?.eventId, 'Missing eventId');
    const url = `${apiUrl}/event/${encodeURIComponent(eventId)}/tickets${query}`;
    const payload = await callBilletwebApi(url);
    const tickets = normalizeTickets(payload);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send({ tickets });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('fetchBilletweb error', { message });
    res.status(500).send({
      error: 'Billetweb API call failed',
      code: 'BILLETWEB_API_ERROR',
      detail: message,
    });
  }
});

function parseOperation(value: unknown): BilletwebOperation {
  const operation = String(value ?? '').trim();
  if (operation !== 'events' && operation !== 'tickets') {
    throw new HttpError(
      400,
      'Invalid operation',
      'fetchBilletweb rejected: invalid operation',
      { operation }
    );
  }
  return operation;
}

function requiredText(value: unknown, message: string): string {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new HttpError(400, message, `fetchBilletweb rejected: ${message}`);
  }
  return text;
}

function normalizeApiUrl(value: unknown): string {
  const raw = requiredText(value, 'Missing apiUrl').replace(/\/+$/g, '');
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `https://${raw}`;
}

async function callBilletwebApi(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new HttpError(
      502,
      `Failed to call Billetweb API: ${detail}`,
      'fetchBilletweb rejected: Billetweb API call failed'
    );
  }

  const rawBody = await response.text();
  const parsedBody = parseJsonOrText(rawBody);
  if (!response.ok) {
    throw new HttpError(
      502,
      `Billetweb API error (${response.status})`,
      'fetchBilletweb rejected: Billetweb API returned non-2xx',
      { status: response.status, body: parsedBody }
    );
  }

  return parsedBody;
}

function parseJsonOrText(value: string): unknown {
  const text = String(value ?? '').trim();
  if (!text) {
    return [];
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return [];
  }
}

function normalizeEvents(payload: unknown): BilletwebEvent[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((event) => ({
    id: String((event as { id?: unknown })?.id ?? '').trim(),
    ext_id: String((event as { ext_id?: unknown })?.ext_id ?? '').trim(),
    name: String((event as { name?: unknown })?.name ?? '').trim(),
    start: String((event as { start?: unknown })?.start ?? '').trim(),
    end: String((event as { end?: unknown })?.end ?? '').trim(),
  })).filter((event) => !!event.id);
}

function normalizeTickets(payload: unknown): BilletwebTicket[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((ticket) => {
    const id = String((ticket as { id?: unknown })?.id ?? '').trim();
    const name = String((ticket as { name?: unknown })?.name ?? '').trim();
    const fullName = String((ticket as { full_name?: unknown })?.full_name ?? name).trim();
    return {
      id,
      name,
      full_name: fullName,
    };
  }).filter((ticket) => !!ticket.id);
}

function applyCorsHeaders(req: { headers?: { origin?: unknown } }, res: { setHeader: (name: string, value: string) => void }): void {
  const origin = String(req?.headers?.origin ?? '*');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
