import { onRequest } from 'firebase-functions/https';
import { buildBilletwebCustomPayload, createBilletwebTicket, findOrCreatePersonByEmail, loadBilletwebConfig, loadBilletwebCredentials, updateBilletwebTicket, upsertActivityParticipations } from './billetweb';
import { handleSponsorTicketAction, loadOwnedParticipantTicket, parseParticipantTicketFieldInputs, parseParticipantTicketId, requiredText } from './common';
import { saveParticipantTicket } from './sync';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type { AuthorizedSponsorContext, SponsorTicketActionReport } from './types';

/**
 * Creates or updates one sponsor BilletWeb ticket through organizer-only server logic.
 */
export const upsertSponsorParticipantTicket = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorTicketAction(req, res, 'UPSERT_PARTICIPANT_TICKET', async (context) => {
    return upsertSponsorParticipantTicketAction(context, req.body);
  });
});

/**
 * Persists participant data, synchronizes related activity participations, and creates or updates
 * the corresponding BilletWeb ticket for one sponsor-owned participant ticket slot.
 */
async function upsertSponsorParticipantTicketAction(
  context: AuthorizedSponsorContext,
  body: any
): Promise<SponsorTicketActionReport> {
  const participantTicketId = parseParticipantTicketId(body, 'UPSERT_PARTICIPANT_TICKET');
  const ticket = await loadOwnedParticipantTicket(context, participantTicketId, 'UPSERT_PARTICIPANT_TICKET');
  const firstName = requiredText(body?.firstName, 'Missing firstName');
  const lastName = requiredText(body?.lastName, 'Missing lastName');
  const email = requiredText(body?.email, 'Missing email').toLowerCase();
  const fieldInputs = parseParticipantTicketFieldInputs(body?.customFields);
  const billetwebConfig = await loadBilletwebConfig(context.db, context.conferenceId, 'UPSERT_PARTICIPANT_TICKET');
  const billetwebCredentials = await loadBilletwebCredentials(
    context.db,
    context.conferenceId,
    billetwebConfig,
    'UPSERT_PARTICIPANT_TICKET'
  );

  const person = await findOrCreatePersonByEmail(context.db, {
    email,
    firstName,
    lastName,
    preferredLanguage: String(context.sponsorData.communicationLanguage ?? 'fr').trim() || 'fr',
  });

  await upsertActivityParticipations(
    context.db,
    context.conferenceId,
    person.id,
    fieldInputs
  );

  const billetwebCustomPayload = buildBilletwebCustomPayload(fieldInputs, billetwebConfig.customFieldMappings);
  const billetwebTicket = ticket.ticketStatus === 'CREATED'
    ? await updateBilletwebTicket(billetwebCredentials, ticket, firstName, lastName, email, billetwebCustomPayload)
    : await createBilletwebTicket(billetwebCredentials, ticket.ticketName, firstName, lastName, email, billetwebCustomPayload);

  const nextTicket: ParticipantBilletWebTicket = {
    ...ticket,
    personId: person.id,
    ticketInternalId: billetwebTicket.ticketInternalId,
    ticketExtenalId: billetwebTicket.ticketExtenalId,
    ticketStatus: billetwebTicket.ticketStatus,
    orderId: billetwebTicket.orderId,
    orderEmail: billetwebTicket.orderEmail || email,
    orderDate: billetwebTicket.orderDate,
    downloadURL: billetwebTicket.downloadURL,
    manageURL: billetwebTicket.manageURL,
    lastUpdated: Date.now().toString(),
  };

  await saveParticipantTicket(context.db, nextTicket);

  return {
    sponsor: context.sponsorData,
    participantTicket: nextTicket,
  };
}
