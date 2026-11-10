import { onRequest } from "firebase-functions/https";
import { FIRESTORE_COLLECTIONS } from "../../common/firestore-collections";
import { HttpError } from "../../conference/common";
import {
  createBilletwebTicket,
  loadBilletwebConfig,
  loadBilletwebCredentials,
  updateBilletwebTicket,
} from "../billetweb/client";
import { executeSpeakerTicketAction, loadTicket } from "./common";
import type { ParticipantBilletWebTicket } from "../../../../shared/src/model/billetweb-config";
import type { Person } from "../../../../shared/src/model/person.model";

/** Creates or updates one speaker BilletWeb ticket through organizer-only server logic. */
export const upsertSpeakerTicket = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    await executeSpeakerTicketAction(
      req,
      res,
      "UPSERT_SPEAKER_TICKET",
      async (db, conferenceId, speaker) => {
        const personSnap = await db
          .collection(FIRESTORE_COLLECTIONS.PERSON)
          .doc(speaker.personId)
          .get();
        if (!personSnap.exists) {
          throw new HttpError(
            404,
            "Speaker person not found",
            "Speaker ticket rejected: person not found",
          );
        }
        const person = personSnap.data() as Person;
        const config = await loadBilletwebConfig(
          db,
          conferenceId,
          "UPSERT_SPEAKER_TICKET",
        );
        const ticketType = config.ticketTypes?.speaker;
        const ticketTypeId = String(ticketType?.ticketTypeId ?? "").trim();
        const ticketName =
          String(ticketType?.ticketTypeName ?? "").trim() || ticketTypeId;
        if (!ticketTypeId) {
          throw new HttpError(
            400,
            "Speaker BilletWeb ticket type is not configured",
            "Speaker ticket rejected: missing ticket type",
          );
        }
        const credentials = await loadBilletwebCredentials(
          db,
          conferenceId,
          config,
          "UPSERT_SPEAKER_TICKET",
        );
        const firstName = String(person.firstName ?? "").trim();
        const lastName = String(person.lastName ?? "").trim();
        const email = String(person.email ?? "")
          .trim()
          .toLowerCase();
        if (!firstName || !lastName || !email) {
          throw new HttpError(
            400,
            "Speaker identity is incomplete",
            "Speaker ticket rejected: incomplete identity",
          );
        }
        const existing = await loadTicket(db, conferenceId, speaker.ticketId);
        const ticket =
          existing && existing.ticketStatus === "CREATED"
            ? await updateBilletwebTicket(
                credentials,
                existing,
                firstName,
                lastName,
                email,
                {},
              )
            : await createBilletwebTicket(
                credentials,
                ticketName,
                firstName,
                lastName,
                email,
                {},
              );
        const ticketRef = existing
          ? db
              .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
              .doc(existing.id)
          : db
              .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
              .doc();
        const persisted: ParticipantBilletWebTicket = {
          ...(existing ?? ticket),
          ...ticket,
          id: ticketRef.id,
          conferenceId,
          personId: speaker.personId,
          ticketName,
          lastUpdated: Date.now().toString(),
        };
        const nextSpeaker = {
          ...speaker,
          ticketId: persisted.id,
          lastUpdated: Date.now().toString(),
        };
        const batch = db.batch();
        batch.set(ticketRef, persisted);
        batch.set(
          db
            .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
            .doc(speaker.id),
          nextSpeaker,
        );
        await batch.commit();
        return { conferenceSpeaker: nextSpeaker, ticket: persisted };
      },
    );
  },
);
