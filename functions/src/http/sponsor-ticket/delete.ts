import { onRequest } from 'firebase-functions/https';
import { deleteBilletwebTicket, loadBilletwebConfig, loadBilletwebCredentials } from './billetweb';
import { handleSponsorTicketAction, loadOwnedParticipantTicket, parseParticipantTicketId } from './common';
import { saveParticipantTicket } from './sync';
import { HttpError } from '../conference-http-common';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type { AuthorizedSponsorContext, SponsorTicketActionReport } from './types';

/**
 * Deletes one sponsor BilletWeb ticket through organizer-only server logic.
 */
export const deleteSponsorParticipantTicket = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorTicketAction(req, res, 'DELETE_PARTICIPANT_TICKET', async (context) => {
    return deleteSponsorParticipantTicketAction(context, req.body);
  });
});

/**
 * Deletes the BilletWeb ticket associated with one sponsor-owned participant ticket slot and
 * resets the persisted BilletWeb identifiers while keeping the slot itself available for reuse.
 */
async function deleteSponsorParticipantTicketAction(
  context: AuthorizedSponsorContext,
  body: any
): Promise<SponsorTicketActionReport> {
  const participantTicketId = parseParticipantTicketId(body, 'DELETE_PARTICIPANT_TICKET');
  const ticket = await loadOwnedParticipantTicket(context, participantTicketId, 'DELETE_PARTICIPANT_TICKET');
  if (ticket.ticketStatus !== 'CREATED') {
    throw new HttpError(
      409,
      'Ticket can only be deleted when status is CREATED',
      'DELETE_PARTICIPANT_TICKET rejected: ticket status is not CREATED',
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        participantTicketId,
        ticketStatus: ticket.ticketStatus,
      }
    );
  }

  const billetwebConfig = await loadBilletwebConfig(context.db, context.conferenceId, 'DELETE_PARTICIPANT_TICKET');
  const billetwebCredentials = await loadBilletwebCredentials(
    context.db,
    context.conferenceId,
    billetwebConfig,
    'DELETE_PARTICIPANT_TICKET'
  );
  await deleteBilletwebTicket(billetwebCredentials, ticket);

  const nextTicket: ParticipantBilletWebTicket = {
    ...ticket,
    ticketInternalId: '',
    ticketExtenalId: '',
    ticketStatus: 'DELETED',
    orderId: '',
    orderEmail: '',
    orderDate: '',
    downloadURL: '',
    manageURL: '',
    lastUpdated: Date.now().toString(),
  };

  await saveParticipantTicket(context.db, nextTicket);

  return {
    sponsor: context.sponsorData,
    participantTicket: nextTicket,
  };
}
