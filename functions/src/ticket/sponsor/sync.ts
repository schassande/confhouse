import * as logger from 'firebase-functions/logger';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import { HttpError } from '../../conference/common';
import { applySuccessfulSponsorBusinessEvent } from '../../sponsor/sponsor-helpers';
import { SponsorBusinessEvent, SponsorRecord } from '../../sponsor/sponsor-model';
import { sanitizeFirestorePatch, normalizeStringArray } from './common';
import { loadBilletwebConfig } from '../billetweb/client';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type { Sponsor, SponsorType } from '../../../../shared/src/model/sponsor.model';
import type { AuthorizedSponsorContext, SponsorTicketActionReport } from '../common/types';

/**
 * Synchronizes Firestore participant ticket slots with the quota implied by the sponsor type.
 *
 * Input:
 * - `context.conferenceId`: conference owning the sponsor
 * - `context.sponsorId`: sponsor being synchronized
 * - `context.sponsorData.participantTicketIds`: currently persisted ordered ticket slot ids
 * - `context.conferenceData.sponsoring.sponsorTypes`: quotas used to compute the expected slots
 *
 * Output:
 * - updated sponsor payload
 * - ordered list of resolved participant ticket slots
 *
 * @param context Fully authorized organizer context for the target sponsor.
 * @returns Updated sponsor payload and synchronized participant ticket slots.
 */
export async function synchronizeSponsorParticipantTickets(
  context: AuthorizedSponsorContext
): Promise<SponsorTicketActionReport> {
  logger.info('synchronizeSponsorParticipantTickets input', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    sponsorTypeId: context.sponsorData.sponsorTypeId,
    participantTicketIds: context.sponsorData.participantTicketIds ?? [],
  });

  const expectedTicketNames = await resolveExpectedSponsorTicketNames(context);
  const currentIds = normalizeStringArray(context.sponsorData.participantTicketIds);
  const existingTickets = await loadParticipantTicketsByIds(context.db, currentIds);
  const validExistingTickets = currentIds
    .map((id) => existingTickets.get(id))
    .filter((ticket): ticket is ParticipantBilletWebTicket => !!ticket)
    .filter((ticket) => String(ticket.conferenceId ?? '').trim() === context.conferenceId);

  logger.info('synchronizeSponsorParticipantTickets before iteration', {
    expectedTicketNames,
    currentIds,
    existingTickets,
    validExistingTickets,
  });


  const nextTickets: ParticipantBilletWebTicket[] = [];

  for (let index = 0; index < expectedTicketNames.length; index += 1) {
    const expectedTicketName = expectedTicketNames[index];
    const existingTicket = validExistingTickets[index];
    if (!existingTicket) {
      const createdTicket = await createParticipantTicket(context.db, context.conferenceId, expectedTicketName);
      nextTickets.push(createdTicket);
      continue;
    }

    if (existingTicket.ticketName !== expectedTicketName && existingTicket.ticketStatus !== 'CREATED') {
      const updatedTicket: ParticipantBilletWebTicket = {
        ...existingTicket,
        ticketName: expectedTicketName,
        lastUpdated: Date.now().toString(),
      };
      await saveParticipantTicket(context.db, updatedTicket);
      nextTickets.push(updatedTicket);
      continue;
    }

    nextTickets.push(existingTicket);
  }

  const preservedExtraTickets = validExistingTickets.slice(expectedTicketNames.length);
  const mergedTickets = [...nextTickets, ...preservedExtraTickets];
  const nextIds = mergedTickets.map((ticket) => ticket.id);
  const currentIdsKey = JSON.stringify(currentIds);
  const nextIdsKey = JSON.stringify(nextIds);

  let nextSponsor = context.sponsorData;
  if (currentIdsKey !== nextIdsKey) {
    const event: SponsorBusinessEvent = {
      type: 'TICKETS_ALLOCATED',
      at: new Date().toISOString(),
      by: context.requesterEmail,
      metadata: {
        expectedCount: expectedTicketNames.length,
        persistedCount: mergedTickets.length,
      },
    };
    const sponsorWithEvent = applySuccessfulSponsorBusinessEvent(
      {
        ...((context.sponsorData as unknown) as SponsorRecord & Record<string, unknown>),
        participantTicketIds: nextIds,
      },
      event
    ) as Sponsor & Record<string, unknown>;

    nextSponsor = {
      ...context.sponsorData,
      participantTicketIds: nextIds,
      businessEvents: sponsorWithEvent.businessEvents,
      logistics: sponsorWithEvent.logistics,
    };

    await context.sponsorRef.set(
      sanitizeFirestorePatch({
        participantTicketIds: nextIds,
        businessEvents: sponsorWithEvent.businessEvents,
        logistics: sponsorWithEvent.logistics,
      }),
      { merge: true }
    );
  }

  const report: SponsorTicketActionReport = {
    sponsor: nextSponsor,
    participantTickets: mergedTickets,
  };

  logger.info('synchronizeSponsorParticipantTickets output', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    expectedTicketNames,
    persistedTicketIds: report.sponsor.participantTicketIds ?? [],
    participantTicketCount: report.participantTickets?.length ?? 0,
  });

  return report;
}

/**
 * Resolves the ordered list of expected BilletWeb ticket names from the sponsor type quotas.
 *
 * Input:
 * - sponsor type configured on the sponsor
 * - BilletWeb sponsor ticket type configuration
 * - quota list from `SponsorType.conferenceTicketQuotas`
 *
 * Output:
 * - ordered list of ticket names, one entry per expected slot
 *
 * @param context Fully authorized organizer context for the target sponsor.
 * @returns Ordered list of expected BilletWeb ticket names.
 */
export async function resolveExpectedSponsorTicketNames(context: AuthorizedSponsorContext): Promise<string[]> {
  logger.info('resolveExpectedSponsorTicketNames input', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    sponsorTypeId: context.sponsorData.sponsorTypeId,
  });

  const billetwebConfig = await loadBilletwebConfig(context.db, context.conferenceId, 'ALLOCATE_TICKETS');
  const sponsorTypes = Array.isArray((context.conferenceData.sponsoring as any)?.sponsorTypes)
    ? (context.conferenceData.sponsoring as any).sponsorTypes as SponsorType[]
    : [];
  const sponsorType = sponsorTypes.find((item) => String(item.id ?? '').trim() === String(context.sponsorData.sponsorTypeId ?? '').trim());
  if (!sponsorType) {
    throw new HttpError(
      400,
      'Sponsor type not found on conference',
      'ALLOCATE_TICKETS rejected: sponsor type not found on conference',
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        sponsorTypeId: context.sponsorData.sponsorTypeId,
      }
    );
  }

  const sponsorTicketTypes = Array.isArray(billetwebConfig.ticketTypes?.sponsors)
    ? billetwebConfig.ticketTypes.sponsors
    : [];
  const expectedTicketNames: string[] = [];

  for (const quota of sponsorType.conferenceTicketQuotas ?? []) {
    const ticketTypeId = String(quota.conferenceTicketTypeId ?? '').trim();
    const quotaCount = Number(quota.quota ?? 0);
    if (!ticketTypeId || quotaCount <= 0) {
      continue;
    }

    const matchingTicketType = sponsorTicketTypes.find((item) => String(item.ticketTypeId ?? '').trim() === ticketTypeId);
    if (!matchingTicketType?.ticketTypeName) {
      throw new HttpError(
        400,
        'Sponsor ticket type is missing in BilletWeb configuration',
        'ALLOCATE_TICKETS rejected: sponsor quota references unknown BilletWeb ticket type',
        {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
          ticketTypeId,
        }
      );
    }

    for (let index = 0; index < quotaCount; index += 1) {
      expectedTicketNames.push(String(matchingTicketType.ticketTypeName).trim());
    }
  }

  logger.info('resolveExpectedSponsorTicketNames output', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    sponsorTypeId: context.sponsorData.sponsorTypeId,
    expectedTicketNames,
  });

  return expectedTicketNames;
}

/**
 * Creates one empty persistent participant ticket slot for a sponsor allocation.
 *
 * Input:
 * - Firestore database handle
 * - conference identifier
 * - BilletWeb ticket type name to assign to the slot
 *
 * Output:
 * - newly created persisted `ParticipantBilletWebTicket`
 *
 * @param db Firestore database handle.
 * @param conferenceId Conference identifier owning the slot.
 * @param ticketName BilletWeb ticket type name assigned to the slot.
 * @returns Newly created participant ticket slot.
 */
export async function createParticipantTicket(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  ticketName: string
): Promise<ParticipantBilletWebTicket> {
  logger.info('createParticipantTicket input', {
    conferenceId,
    ticketName,
  });

  const ref = db.collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET).doc();
  const ticket: ParticipantBilletWebTicket = {
    id: ref.id,
    lastUpdated: Date.now().toString(),
    conferenceId,
    personId: '',
    ticketName,
    ticketInternalId: '',
    ticketExtenalId: '',
    ticketStatus: 'NON_EXISTING',
    orderId: '',
    orderEmail: '',
    orderDate: '',
    downloadURL: '',
    manageURL: '',
  };
  await ref.set(ticket);

  logger.info('createParticipantTicket output', {
    conferenceId,
    ticketId: ticket.id,
    ticketName: ticket.ticketName,
    ticketStatus: ticket.ticketStatus,
  });

  return ticket;
}

/**
 * Persists one participant ticket document after sanitizing undefined values.
 *
 * Input:
 * - Firestore database handle
 * - full participant ticket payload to persist
 *
 * Output:
 * - no returned payload; the document is written to Firestore
 *
 * @param db Firestore database handle.
 * @param ticket Full participant ticket payload to persist.
 * @returns Promise resolved when the document write completes.
 */
export async function saveParticipantTicket(
  db: FirebaseFirestore.Firestore,
  ticket: ParticipantBilletWebTicket
): Promise<void> {
  logger.info('saveParticipantTicket input', {
    conferenceId: ticket.conferenceId,
    ticketId: ticket.id,
    ticketName: ticket.ticketName,
    ticketStatus: ticket.ticketStatus,
  });

  await db
    .collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET)
    .doc(ticket.id)
    .set(sanitizeFirestorePatch(ticket));

  logger.info('saveParticipantTicket output', {
    conferenceId: ticket.conferenceId,
    ticketId: ticket.id,
  });
}

/**
 * Loads several participant ticket documents by id while preserving only existing documents.
 *
 * Input:
 * - Firestore database handle
 * - ordered list of participant ticket ids
 *
 * Output:
 * - map keyed by ticket id for every existing loaded ticket
 *
 * @param db Firestore database handle.
 * @param ids Ordered participant ticket identifiers to load.
 * @returns Map of loaded participant tickets keyed by id.
 */
export async function loadParticipantTicketsByIds(
  db: FirebaseFirestore.Firestore,
  ids: string[]
): Promise<Map<string, ParticipantBilletWebTicket>> {
  logger.info('loadParticipantTicketsByIds input', {
    requestedIds: ids,
    requestedCount: ids.length,
  });

  const map = new Map<string, ParticipantBilletWebTicket>();
  for (const id of ids) {
    const normalizedId = String(id ?? '').trim();
    if (!normalizedId) {
      continue;
    }
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PARTICIPANT_BILLETWEB_TICKET).doc(normalizedId).get();
    if (!snap.exists) {
      continue;
    }
    map.set(normalizedId, { ...(snap.data() as ParticipantBilletWebTicket), id: snap.id });
  }

  logger.info('loadParticipantTicketsByIds output', {
    requestedCount: ids.length,
    loadedIds: Array.from(map.keys()),
    loadedCount: map.size,
  });

  return map;
}

