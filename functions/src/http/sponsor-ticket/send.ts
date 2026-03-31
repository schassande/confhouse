import { onRequest } from 'firebase-functions/https';
import { loadBilletwebConfig, loadBilletwebCredentials, sendBilletwebTicketEmail } from './billetweb';
import { handleSponsorTicketAction, loadOwnedParticipantTicket, parseParticipantTicketId } from './common';
import { HttpError } from '../conference-http-common';
import type { AuthorizedSponsorContext, SponsorTicketActionReport } from './types';

/**
 * Sends or resends one sponsor BilletWeb ticket notification email through organizer-only server logic.
 */
export const sendSponsorParticipantTicket = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorTicketAction(req, res, 'SEND_PARTICIPANT_TICKET', async (context) => {
    return sendSponsorParticipantTicketAction(context, req.body);
  });
});

/**
 * Calls BilletWeb `update_order` so the existing order notification email is sent again for one
 * sponsor-owned participant ticket slot.
 *
 * @param context Fully authorized organizer context for the target sponsor.
 * @param body Raw HTTP body containing `participantTicketId`.
 * @returns Current sponsor payload and unchanged participant ticket payload.
 */
async function sendSponsorParticipantTicketAction(
  context: AuthorizedSponsorContext,
  body: any
): Promise<SponsorTicketActionReport> {
  const participantTicketId = parseParticipantTicketId(body, 'SEND_PARTICIPANT_TICKET');
  const ticket = await loadOwnedParticipantTicket(context, participantTicketId, 'SEND_PARTICIPANT_TICKET');
  if (ticket.ticketStatus !== 'CREATED') {
    throw new HttpError(
      409,
      'Ticket can only be sent when status is CREATED',
      'SEND_PARTICIPANT_TICKET rejected: ticket status is not CREATED',
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
        ticketStatus: ticket.ticketStatus,
      }
    );
  }
  if (!String(ticket.orderId ?? '').trim() || !String(ticket.orderEmail ?? '').trim()) {
    throw new HttpError(
      409,
      'Ticket is missing BilletWeb order information',
      'SEND_PARTICIPANT_TICKET rejected: missing BilletWeb order information',
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
        orderId: ticket.orderId,
        orderEmail: ticket.orderEmail,
      }
    );
  }

  const billetwebConfig = await loadBilletwebConfig(context.db, context.conferenceId, 'SEND_PARTICIPANT_TICKET');
  const billetwebCredentials = await loadBilletwebCredentials(
    context.db,
    context.conferenceId,
    billetwebConfig,
    'SEND_PARTICIPANT_TICKET'
  );
  await sendBilletwebTicketEmail(billetwebCredentials, ticket);

  return {
    sponsor: context.sponsorData,
    participantTicket: ticket,
  };
}
