import { onRequest } from 'firebase-functions/https';
import { handleSponsorTicketAction } from './common';
import { synchronizeSponsorParticipantTickets } from './sync';

/**
 * Synchronizes the sponsor ticket slots persisted in Firestore with the sponsor type quotas.
 * Missing slots are created and surplus slots are preserved.
 */
export const allocateSponsorTickets = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorTicketAction(req, res, 'ALLOCATE_TICKETS', synchronizeSponsorParticipantTickets);
});
