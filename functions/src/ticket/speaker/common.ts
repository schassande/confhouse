import * as logger from "firebase-functions/logger";
import { FIRESTORE_COLLECTIONS } from "../../common/firestore-collections";
import {
  authorizeConferenceOrganizerRequest,
  ensurePostMethod,
  HttpError,
  parseConferenceId,
} from "../../conference/common";
import {
  deleteBilletwebTicket,
  loadBilletwebConfig,
  loadBilletwebCredentials,
} from "../billetweb/client";
import type { ConferenceSpeaker } from "../../../../shared/src/model/speaker.model";
import type { ParticipantBilletWebTicket } from "../../../../shared/src/model/billetweb-config";

/** Response returned to the speaker ticket frontend service. */
export interface SpeakerTicketActionReport {
  /** Updated conference speaker projection. */
  conferenceSpeaker: ConferenceSpeaker;
  /** Created or updated ticket, omitted after deletion. */
  ticket?: ParticipantBilletWebTicket;
}

/**
 * Deletes the BilletWeb order linked to a conference speaker and returns its local ticket.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference identifier owning the speaker and ticket.
 * @param speaker Conference speaker carrying the ticket reference.
 * @returns Persisted ticket whose local document must be deleted atomically with the speaker update.
 */
export async function deleteSpeakerTicketFromBilletweb(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  speaker: ConferenceSpeaker,
): Promise<ParticipantBilletWebTicket> {
  const ticket = await loadTicket(db, conferenceId, speaker.ticketId);
  if (!ticket) {
    throw new HttpError(
      404,
      "Speaker ticket not found",
      "Speaker ticket rejected: ticket not found",
    );
  }
  const config = await loadBilletwebConfig(
    db,
    conferenceId,
    "DELETE_SPEAKER_TICKET",
  );
  const credentials = await loadBilletwebCredentials(
    db,
    conferenceId,
    config,
    "DELETE_SPEAKER_TICKET",
  );
  await deleteBilletwebTicket(credentials, ticket);
  return ticket;
}

/**
 * Authorizes and executes one speaker ticket HTTP action.
 *
 * @param req Incoming HTTP request.
 * @param res HTTP response writer.
 * @param operation Operation name used in errors and logs.
 * @param action Authorized action callback.
 */
export async function executeSpeakerTicketAction(
  req: any,
  res: any,
  operation: string,
  action: (
    db: FirebaseFirestore.Firestore,
    conferenceId: string,
    speaker: ConferenceSpeaker,
  ) => Promise<SpeakerTicketActionReport>,
): Promise<void> {
  try {
    ensurePostMethod(req.method, operation);
    const context = await authorizeConferenceOrganizerRequest(req, operation);
    const conferenceId = parseConferenceId(req.body, operation);
    if (conferenceId !== context.conferenceId) {
      throw new HttpError(
        400,
        "Conference mismatch",
        `${operation} rejected: conference mismatch`,
      );
    }
    const speakerId = String(req.body?.speakerId ?? "").trim();
    const snap = await context.db
      .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
      .doc(speakerId)
      .get();
    if (!snap.exists) {
      throw new HttpError(
        404,
        "Speaker not found",
        `${operation} rejected: speaker not found`,
      );
    }
    const speaker = { ...(snap.data() as ConferenceSpeaker), id: snap.id };
    if (speaker.conferenceId !== conferenceId) {
      throw new HttpError(
        400,
        "Speaker does not belong to conference",
        `${operation} rejected: conference mismatch`,
      );
    }
    const report = await action(context.db, conferenceId, speaker);
    res.status(200).send({ report });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Speaker ticket action failed";
    logger.error(operation, { message });
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).send({ error: message });
  }
}

/**
 * Loads and validates the ticket referenced by a speaker.
 *
 * @param db Firestore admin instance.
 * @param conferenceId Conference identifier expected on the ticket.
 * @param ticketId Persisted ticket identifier, when present.
 * @returns The validated ticket or `undefined` when no identifier is supplied.
 */
export async function loadTicket(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  ticketId: string | undefined,
): Promise<ParticipantBilletWebTicket | undefined> {
  const id = String(ticketId ?? "").trim();
  if (!id) {
    return undefined;
  }
  const snap = await db
    .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
    .doc(id)
    .get();
  if (!snap.exists) {
    throw new HttpError(
      404,
      "Speaker ticket not found",
      "Speaker ticket rejected: linked ticket missing",
    );
  }
  const ticket = {
    ...(snap.data() as ParticipantBilletWebTicket),
    id: snap.id,
  };
  if (ticket.conferenceId !== conferenceId) {
    throw new HttpError(
      400,
      "Speaker ticket does not belong to conference",
      "Speaker ticket rejected: ticket mismatch",
    );
  }
  return ticket;
}
