import * as logger from 'firebase-functions/logger';
import { admin } from '../../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import {
  authorizeConferenceOrganizerRequest,
  ensurePostMethod,
  getRequesterEmailFromAuthorization,
  HttpError,
  isRequesterOrganizer,
  loadConference,
  parseConferenceId,
} from '../../conference/common';
import type { Sponsor } from '../../../../shared/src/model/sponsor.model';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type {
  AuthorizedSponsorContext,
  SponsorTicketActionOperation,
  SponsorTicketActionReport,
  ParticipantTicketFieldInput,
} from '../common/types';

/**
 * Executes one sponsor ticket action and maps failures to HTTP responses.
 */
export async function handleSponsorTicketAction(
  req: any,
  res: any,
  operation: SponsorTicketActionOperation,
  action: (context: AuthorizedSponsorContext) => Promise<SponsorTicketActionReport>
): Promise<void> {
  const startedAt = Date.now();
  try {
    const context = await authorizeSponsorTicketRequest(req, operation);
    const report = await action(context);
    logger.info('sponsor ticket action completed', {
      operation,
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      requesterEmail: context.requesterEmail,
      requesterRole: context.requesterRole,
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
 * Authenticates the requester, verifies the allowed role for the current operation,
 * and loads the target conference and sponsor.
 */
export async function authorizeSponsorTicketRequest(
  req: any,
  operation: SponsorTicketActionOperation
): Promise<AuthorizedSponsorContext> {
  if (operation === 'ALLOCATE_TICKETS') {
    const organizerContext = await authorizeConferenceOrganizerRequest(req, operation);
    const { db, conferenceId, requesterEmail, conferenceRef, conferenceData } = organizerContext;
    return await loadAuthorizedSponsorContext(
      db,
      conferenceId,
      requesterEmail,
      'organizer',
      conferenceRef,
      conferenceData,
      req.body,
      operation
    );
  }

  ensurePostMethod(req.method, operation);
  const db = admin.firestore();
  const conferenceId = parseConferenceId(req.body, operation);
  const requesterEmail = await getRequesterEmailFromAuthorization(req.headers.authorization, conferenceId, operation);
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, operation);
  const requesterRole = isRequesterOrganizer(conferenceData, requesterEmail) ? 'organizer' : 'sponsor-admin';
  return await loadAuthorizedSponsorContext(
    db,
    conferenceId,
    requesterEmail,
    requesterRole,
    conferenceRef,
    conferenceData,
    req.body,
    operation
  );
}

/**
 * Loads the sponsor targeted by the request and verifies sponsor-admin access when needed.
 */
async function loadAuthorizedSponsorContext(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  requesterEmail: string,
  requesterRole: 'organizer' | 'sponsor-admin',
  conferenceRef: FirebaseFirestore.DocumentReference,
  conferenceData: Record<string, unknown>,
  body: any,
  operation: SponsorTicketActionOperation
): Promise<AuthorizedSponsorContext> {
  const sponsorId = parseSponsorId(body, operation);
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

  if (requesterRole === 'sponsor-admin') {
    const adminEmails = normalizeStringArray(sponsorData.adminEmails).map((email) => email.toLowerCase());
    if (!adminEmails.includes(requesterEmail.toLowerCase())) {
      throw new HttpError(
        403,
        'Requester is neither a sponsor admin nor a conference organizer',
        `${operation} rejected: requester is neither sponsor admin nor organizer`,
        {
          conferenceId,
          sponsorId,
          requesterEmail,
        }
      );
    }
  }

  return {
    db,
    conferenceId,
    sponsorId,
    requesterEmail,
    requesterRole,
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

/**
 * Parses sponsor id.
 * @param body Raw request body.
 * @param operation Operation name used for validation and error reporting.
 * @returns Computed result.
 */
export function parseSponsorId(body: any, operation: SponsorTicketActionOperation): string {
  const sponsorId = String(body?.sponsorId ?? '').trim();
  if (!sponsorId) {
    throw new HttpError(400, 'Missing sponsorId', `${operation} rejected: missing sponsorId`);
  }
  return sponsorId;
}

/**
 * Parses participant ticket id.
 * @param body Raw request body.
 * @param operation Operation name used for validation and error reporting.
 * @returns Computed result.
 */
export function parseParticipantTicketId(body: any, operation: SponsorTicketActionOperation): string {
  const participantTicketId = String(body?.participantTicketId ?? '').trim();
  if (!participantTicketId) {
    throw new HttpError(400, 'Missing participantTicketId', `${operation} rejected: missing participantTicketId`);
  }
  return participantTicketId;
}

/**
 * Required text.
 * @param value Raw input value.
 * @param message Message.
 * @returns Computed result.
 */
export function requiredText(value: unknown, message: string): string {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new HttpError(400, message, `Sponsor ticket action rejected: ${message}`);
  }
  return text;
}

/**
 * Normalizes string array.
 * @param values Input values.
 * @returns Computed result.
 */
export function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
}

/**
 * Parses participant ticket field inputs.
 * @param value Raw input value.
 * @returns Computed result.
 */
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

/**
 * Sanitize Firestore patch.
 * @param value Raw input value.
 * @returns Computed result.
 */
export function sanitizeFirestorePatch<T>(value: T): T {
  return removeUndefinedDeep(value) as T;
}

/**
 * Removes undefined deep.
 * @param value Raw input value.
 * @returns Computed result.
 */
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

