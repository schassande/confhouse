import { onRequest } from "firebase-functions/https";
import { FIRESTORE_COLLECTIONS } from "../../common/firestore-collections";
import {
  deleteSpeakerTicketFromBilletweb,
  executeSpeakerTicketAction,
} from "./common";
import type { ConferenceSpeaker } from "../../../../shared/src/model/speaker.model";

/** Deletes one speaker BilletWeb ticket and clears its local conference-speaker reference. */
export const deleteSpeakerTicket = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    await executeSpeakerTicketAction(
      req,
      res,
      "DELETE_SPEAKER_TICKET",
      async (db, conferenceId, speaker) => {
        const ticket = await deleteSpeakerTicketFromBilletweb(
          db,
          conferenceId,
          speaker,
        );
        const nextSpeaker: ConferenceSpeaker = {
          ...speaker,
          lastUpdated: Date.now().toString(),
        };
        delete nextSpeaker.ticketId;
        const batch = db.batch();
        batch.delete(
          db
            .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
            .doc(ticket.id),
        );
        batch.set(
          db
            .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
            .doc(speaker.id),
          nextSpeaker,
        );
        await batch.commit();
        return { conferenceSpeaker: nextSpeaker };
      },
    );
  },
);
