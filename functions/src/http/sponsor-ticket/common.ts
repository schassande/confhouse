import * as logger from 'firebase-functions/logger';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import {
  authorizeConferenceOrganizerRequest,
  HttpError,
} from '../conference-http-common';
import type { Sponsor } from '../../../../shared/src/model/sponsor.model';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type {
  AuthorizedSponsorContext,
  SponsorTicketActionOperation,
  SponsorTicketActionReport,
  ParticipantTicketFieldInput,
} from './types';

/**
 * Executes one organizer-only sponsor ticket action and maps failures to HTTP responses.
 */
export async function handleSponsorTicketAction(
  req: any,
  res: any,
  operation: SponsorTicketActionOperation,
  action: (context: AuthorizedSponsorContext) => Promise<SponsorTicketActionReport>
): Promise<void> {
  const startedAt = Date.now();
  try {
    const context = await authorizeSponsorOrganizerRequest(req, operation);
    const report = await action(context);
    logger.info('sponsor ticket action completed', {
      operation,
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      requesterEmail: context.requesterEmail,
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
    logger.error('sponsor ticket action failed', {
      operation,
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({
      error: 'Sponsor ticket action failed',
      code: 'SPONSOR_TICKET_ACTION_ERROR',
      detail: message,
    });
  }
}

/**
 * Authenticates the requester, verifies organizer access, and loads the target conference and sponsor.
 */
export async function authorizeSponsorOrganizerRequest(
  req: any,
  operation: SponsorTicketActionOperation
): Promise<AuthorizedSponsorContext> {
  const organizerContext = await authorizeConferenceOrganizerRequest(req, operation);
  const { db, conferenceId, requesterEmail, conferenceRef, conferenceData } = organizerContext;
  const sponsorId = parseSponsorId(req.body, operation);
  const sponsorRef = db.collection(FIRESTORE_COLLECTIONS.SPONSOR).doc(sponsorId);
  const sponsorSnap = await sponsorRef.get();
  if (!sponsorSnap.exists) {
    throw new HttpError(404, 'Sponsor not found', `${operation} rejected: sponsor not found`, {
      conferenceId,
      sponsorId,
    });
  }

  const sponsorData = { ...(sponsorSnap.data() as Sponsor), id: sponsorSnap.id };
  if (String(sponsorData.conferenceId ?? '').trim() !== conferenceId) {
    throw new HttpError(400, 'Sponsor does not belong to conference', `${operation} rejected: sponsor conference mismatch`, {
      conferenceId,
      sponsorId,
    });
  }

  return {
    db,
    conferenceId,
    sponsorId,
    requesterEmail,
    conferenceRef,
    conferenceData: conferenceData as Record<string, unknown>,
    sponsorRef,
    sponsorData,
  };
}

/**
 * Loads one participant ticket and ensures the current sponsor owns it through participantTicketIds.
 */
export async function loadOwnedParticipantTicket(
  context: AuthorizedSponsorContext,
  participantTicketId: string,
  operation: SponsorTicketActionOperation
): Promise<ParticipantBilletWebTicket> {
  if (!normalizeStringArray(context.sponsorData.participantTicketIds).includes(participantTicketId)) {
    throw new HttpError(
      404,
      'Participant ticket not found on sponsor',
      `${operation} rejected: participant ticket is not linked to sponsor`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
      }
    );
  }

  const snap = await context.db
    .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
    .doc(participantTicketId)
    .get();

  if (!snap.exists) {
    throw new HttpError(
      404,
      'Participant ticket not found',
      `${operation} rejected: participant ticket document not found`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
      }
    );
  }

  const ticket = { ...(snap.data() as ParticipantBilletWebTicket), id: snap.id };
  if (String(ticket.conferenceId ?? '').trim() !== context.conferenceId) {
    throw new HttpError(
      400,
      'Participant ticket does not belong to conference',
      `${operation} rejected: participant ticket conference mismatch`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
      }
    );
  }

  return ticket;
}

export function parseSponsorId(body: any, operation: SponsorTicketActionOperation): string {
  const sponsorId = String(body?.sponsorId ?? '').trim();
  if (!sponsorId) {
    throw new HttpError(400, 'Missing sponsorId', `${operation} rejected: missing sponsorId`);
  }
  return sponsorId;
}

export function parseParticipantTicketId(body: any, operation: SponsorTicketActionOperation): string {
  const participantTicketId = String(body?.participantTicketId ?? '').trim();
  if (!participantTicketId) {
    throw new HttpError(400, 'Missing participantTicketId', `${operation} rejected: missing participantTicketId`);
  }
  return participantTicketId;
}

export function requiredText(value: unknown, message: string): string {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new HttpError(400, message, `Sponsor ticket action rejected: ${message}`);
  }
  return text;
}

export function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
}

export function parseParticipantTicketFieldInputs(value: unknown): ParticipantTicketFieldInput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => ({
    activityId: String((item as any)?.activityId ?? '').trim(),
    activityAttributeName: String((item as any)?.activityAttributeName ?? '').trim(),
    billetwebCustomFieldId: String((item as any)?.billetwebCustomFieldId ?? '').trim(),
    value: String((item as any)?.value ?? ''),
  }));
}

export function sanitizeFirestorePatch<T>(value: T): T {
  return removeUndefinedDeep(value) as T;
}

function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}
