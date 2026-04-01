import { onRequest } from 'firebase-functions/https';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import { loadBilletwebConfig } from '../billetweb/client';
import { handleSponsorTicketAction, normalizeStringArray } from './common';
import { loadParticipantTicketsByIds } from './sync';
import type {
  AuthorizedSponsorContext,
  SponsorParticipantTicketFieldView,
  SponsorParticipantTicketListReport,
  SponsorParticipantTicketView,
} from '../common/types';
import type { Activity, ActivityAttribute, ActivityParticipation } from '../../../../shared/src/model/activity.model';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type { Person } from '../../../../shared/src/model/person.model';

/**
 * Loads sponsor participant tickets with participant identity and mapped custom fields.
 */
export const listSponsorParticipantTickets = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorTicketAction(req, res, 'LIST_PARTICIPANT_TICKETS', async (context) =>
    await listSponsorParticipantTicketsAction(context)
  );
});

/**
 * Resolves the ordered sponsor ticket view models returned to sponsor self-service screens.
 *
 * @param context Authorized sponsor context.
 * @returns Current sponsor payload plus ordered ticket card view models.
 */
async function listSponsorParticipantTicketsAction(
  context: AuthorizedSponsorContext
): Promise<SponsorParticipantTicketListReport> {
  const orderedIds = normalizeStringArray(context.sponsorData.participantTicketIds);
  const ticketMap = await loadParticipantTicketsByIds(context.db, orderedIds);
  const participantTickets = orderedIds
    .map((id) => ticketMap.get(id))
    .filter((ticket): ticket is ParticipantBilletWebTicket => !!ticket);

  const billetwebConfig = await loadBilletwebConfig(context.db, context.conferenceId, 'LIST_PARTICIPANT_TICKETS');
  const activities = await loadConferenceActivities(context.db, context.conferenceId);
  const ticketViews = await Promise.all(
    participantTickets.map(async (ticket) =>
      await buildSponsorParticipantTicketView(
        context.db,
        context.conferenceId,
        ticket,
        activities,
        billetwebConfig.customFieldMappings ?? []
      )
    )
  );

  return {
    sponsor: context.sponsorData,
    participantTicketViews: ticketViews,
  };
}

/**
 * Loads the activities of one conference for custom field resolution.
 */
async function loadConferenceActivities(db: FirebaseFirestore.Firestore, conferenceId: string): Promise<Activity[]> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.ACTIVITY)
    .where('conferenceId', '==', conferenceId)
    .get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as Activity), id: doc.id }));
}

/**
 * Builds one backend ticket card view including identity and custom fields.
 */
async function buildSponsorParticipantTicketView(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  ticket: ParticipantBilletWebTicket,
  activities: Activity[],
  customFieldMappings: Array<{
    activityId?: string;
    activityAttributeName?: string;
    billetwebCustomFieldId?: string;
  }>
): Promise<SponsorParticipantTicketView> {
  const personId = String(ticket.personId ?? '').trim();
  const person = personId ? await loadPersonById(db, personId) : undefined;
  const participations = personId ? await loadActivityParticipations(db, conferenceId, personId) : [];

  return {
    ticket,
    firstName: String(person?.firstName ?? '').trim(),
    lastName: String(person?.lastName ?? '').trim(),
    email: String(person?.email ?? '').trim(),
    customFields: buildSponsorParticipantTicketCustomFields(activities, participations, customFieldMappings),
  };
}

/**
 * Loads one person by identifier when it exists.
 */
async function loadPersonById(db: FirebaseFirestore.Firestore, personId: string): Promise<Person | undefined> {
  const snapshot = await db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(personId).get();
  return snapshot.exists ? { ...(snapshot.data() as Person), id: snapshot.id } : undefined;
}

/**
 * Loads all activity participations of one person for one conference.
 */
async function loadActivityParticipations(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  personId: string
): Promise<ActivityParticipation[]> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION)
    .where('conferenceId', '==', conferenceId)
    .where('personId', '==', personId)
    .get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as ActivityParticipation), id: doc.id }));
}

/**
 * Builds the editable custom fields for one sponsor ticket card.
 */
function buildSponsorParticipantTicketCustomFields(
  activities: Activity[],
  participations: ActivityParticipation[],
  customFieldMappings: Array<{
    activityId?: string;
    activityAttributeName?: string;
    billetwebCustomFieldId?: string;
  }>
): SponsorParticipantTicketFieldView[] {
  const participationsByActivity = new Map(
    participations.map((participation) => [String(participation.activityId ?? '').trim(), participation] as const)
  );
  const attributesByActivity = new Map<string, Map<string, ActivityAttribute>>();
  for (const activity of activities) {
    attributesByActivity.set(
      String(activity.id ?? '').trim(),
      new Map(
        (activity.specificAttributes ?? []).map((attribute) => [
          String(attribute.attributeName ?? '').trim(),
          attribute,
        ])
      )
    );
  }

  return customFieldMappings.map((mapping) => {
    const activityId = String(mapping.activityId ?? '').trim();
    const activityAttributeName = String(mapping.activityAttributeName ?? '').trim();
    const billetwebCustomFieldId = String(mapping.billetwebCustomFieldId ?? '').trim();
    const attribute = attributesByActivity.get(activityId)?.get(activityAttributeName);
    const participation = participationsByActivity.get(activityId);
    const value = participation?.attributes?.find(
      (entry) => String(entry.name ?? '').trim() === activityAttributeName
    )?.value;

    return {
      activityId,
      activityAttributeName,
      billetwebCustomFieldId,
      attributeType: attribute?.attributeType ?? 'TEXT',
      attributeRequired: !!attribute?.attributeRequired,
      attributeAllowedValues: attribute?.attributeAllowedValues ?? [],
      value: String(value ?? ''),
    };
  });
}
