import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import { HttpError } from '../../conference/common';
import { upsertPersonWithEmailIndex } from '../../person/upsert';
import type {
  ActivityTicketFieldMapping,
  BilletwebConfig,
  ParticipantBilletWebTicket,
} from '../../../../shared/src/model/billetweb-config';
import type { ActivityParticipation } from '../../../../shared/src/model/activity.model';
import type { Person } from '../../../../shared/src/model/person.model';
import type {
  BilletwebAddOrderResponseItem,
  BilletwebAttendee,
  BilletwebCredentials,
  ParticipantTicketFieldInput,
  SponsorTicketActionOperation,
} from '../common/types';
import { logger } from 'firebase-functions';

const BILLETWEB_KEY_SECRET_NAME = 'BILLETWEB_KEY';

/**
 * Loads BilletWeb config.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @param operation Operation name used for validation and error reporting.
 * @returns Promise resolved with the computed result.
 */
export async function loadBilletwebConfig(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  operation: SponsorTicketActionOperation
): Promise<BilletwebConfig> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.BILLETWEB_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new HttpError(
      400,
      'BilletWeb configuration not found',
      `${operation} rejected: missing BilletWeb configuration`,
      { conferenceId }
    );
  }

  return { ...(snapshot.docs[0].data() as BilletwebConfig), id: snapshot.docs[0].id };
}

/**
 * Loads BilletWeb credentials.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @param billetwebConfig BilletWeb conference configuration.
 * @param operation Operation name used for validation and error reporting.
 * @returns Promise resolved with the computed result.
 */
export async function loadBilletwebCredentials(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  billetwebConfig: BilletwebConfig,
  operation: SponsorTicketActionOperation
): Promise<BilletwebCredentials> {
  const secretSnapshot = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SECRET)
    .where('conferenceId', '==', conferenceId)
    .where('secretName', '==', BILLETWEB_KEY_SECRET_NAME)
    .limit(1)
    .get();

  const secretValue = secretSnapshot.empty
    ? ''
    : String((secretSnapshot.docs[0].data() as { secretValue?: unknown }).secretValue ?? '').trim();

  const apiUrl = normalizeApiUrl(billetwebConfig.apiUrl);
  const userId = String(billetwebConfig.userId ?? '').trim();
  const keyVersion = String(billetwebConfig.keyVersion ?? '').trim();
  const eventId = String(billetwebConfig.eventId ?? '').trim();

  if (!apiUrl || !userId || !keyVersion || !eventId || !secretValue) {
    throw new HttpError(
      400,
      'BilletWeb credentials are incomplete',
      `${operation} rejected: incomplete BilletWeb credentials`,
      {
        conferenceId,
        hasApiUrl: !!apiUrl,
        hasUserId: !!userId,
        hasKeyVersion: !!keyVersion,
        hasEventId: !!eventId,
        hasKey: !!secretValue,
      }
    );
  }

  return { apiUrl, userId, keyVersion, key: secretValue, eventId };
}

/**
 * Finds or create person by email.
 * @param db Firestore instance.
 * @param payload Normalized payload.
 * @returns Promise resolved with the computed result.
 */
export async function findOrCreatePersonByEmail(
  db: FirebaseFirestore.Firestore,
  payload: { email: string; firstName: string; lastName: string; preferredLanguage: string }
): Promise<Person> {
  const emailKey = String(payload.email ?? '').trim().toLowerCase();
  const emailRef = db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(emailKey);
  const emailSnap = await emailRef.get();
  if (emailSnap.exists) {
    const personId = String(emailSnap.data()?.personId ?? '').trim();
    if (personId) {
      const personSnap = await db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(personId).get();
      if (personSnap.exists) {
        return { ...(personSnap.data() as Person), id: personSnap.id };
      }
    }
  }

  return await upsertPersonWithEmailIndex(db as any, {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    hasAccount: false,
    isSpeaker: false,
    preferredLanguage: payload.preferredLanguage || 'fr',
  }) as Person;
}

/**
 * Creates or updates activity participations.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @param personId Person id.
 * @param fieldInputs Ticket field inputs from the caller.
 * @returns Promise resolved when the operation completes.
 */
export async function upsertActivityParticipations(
  db: FirebaseFirestore.Firestore,
  conferenceId: string,
  personId: string,
  fieldInputs: ParticipantTicketFieldInput[]
): Promise<void> {
  const fieldsByActivity = new Map<string, ParticipantTicketFieldInput[]>();
  for (const field of fieldInputs) {
    const activityId = String(field.activityId ?? '').trim();
    if (!activityId) {
      continue;
    }
    const list = fieldsByActivity.get(activityId) ?? [];
    list.push(field);
    fieldsByActivity.set(activityId, list);
  }

  for (const [activityId, fields] of fieldsByActivity.entries()) {
    const existingSnapshot = await db
      .collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION)
      .where('conferenceId', '==', conferenceId)
      .where('activityId', '==', activityId)
      .where('personId', '==', personId)
      .limit(1)
      .get();

    const existing = existingSnapshot.empty
      ? undefined
      : { ...(existingSnapshot.docs[0].data() as ActivityParticipation), id: existingSnapshot.docs[0].id };
    const attributesMap = new Map<string, string>(
      (existing?.attributes ?? []).map((attribute) => [
        String(attribute.name ?? '').trim(),
        String(attribute.value ?? '').trim(),
      ])
    );

    for (const field of fields) {
      const attributeName = String(field.activityAttributeName ?? '').trim();
      if (attributeName) {
        attributesMap.set(attributeName, String(field.value ?? ''));
      }
    }

    const ref = existing?.id
      ? db.collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION).doc(existing.id)
      : db.collection(FIRESTORE_COLLECTIONS.ACTIVITY_PARTICIPATION).doc();

    const payload: ActivityParticipation = {
      id: ref.id,
      lastUpdated: Date.now().toString(),
      conferenceId,
      activityId,
      personId,
      participantType: 'SPONSOR',
      participation: true,
      attributes: Array.from(attributesMap.entries()).map(([name, value]) => ({ name, value })),
    };
    await ref.set(payload);
  }
}

/**
 * Builds BilletWeb custom payload.
 * @param fieldInputs Ticket field inputs from the caller.
 * @param mappings Known activity-to-BilletWeb field mappings.
 * @returns Computed result.
 */
export function buildBilletwebCustomPayload(
  fieldInputs: ParticipantTicketFieldInput[],
  mappings: ActivityTicketFieldMapping[] | undefined
): Record<string, string> {
  const knownMappings = new Set(
    (mappings ?? []).map((mapping) => buildMappingKey(mapping.activityId, mapping.activityAttributeName, mapping.billetwebCustomFieldId))
  );
  const payload: Record<string, string> = {};
  for (const field of fieldInputs) {
    const activityId = String(field.activityId ?? '').trim();
    const activityAttributeName = String(field.activityAttributeName ?? '').trim();
    const billetwebCustomFieldId = String(field.billetwebCustomFieldId ?? '').trim();
    if (!activityId || !activityAttributeName || !billetwebCustomFieldId) {
      continue;
    }
    const mappingKey = buildMappingKey(activityId, activityAttributeName, billetwebCustomFieldId);
    if (!knownMappings.has(mappingKey)) {
      throw new HttpError(
        400,
        'Unknown BilletWeb custom field mapping',
        'UPSERT_PARTICIPANT_TICKET rejected: unknown BilletWeb custom field mapping',
        { activityId, activityAttributeName, billetwebCustomFieldId }
      );
    }
    payload[billetwebCustomFieldId] = String(field.value ?? '');
  }
  return payload;
}

/**
 * Creates BilletWeb ticket.
 * @param credentials Resolved service credentials.
 * @param ticketName BilletWeb ticket name.
 * @param firstName Participant first name.
 * @param lastName Participant last name.
 * @param email Participant email address.
 * @param custom Custom field payload.
 * @returns Promise resolved with the computed result.
 */
export async function createBilletwebTicket(
  credentials: BilletwebCredentials,
  ticketName: string,
  firstName: string,
  lastName: string,
  email: string,
  custom: Record<string, string>
): Promise<ParticipantBilletWebTicket> {
  const requestSuffix = `${Date.now()}`;
  const addOrderResponse = await callBilletwebApi(
    buildBilletwebUrl(credentials, 'add_order'),
    {
      data: [{
        name: lastName,
        firstname: firstName,
        email,
        request_id: `order-${requestSuffix}`,
        payment_type: 'other',
        ship: 1, // send the ticket by email.
        products: [{
          ticket: ticketName,
          name: lastName,
          firstname: firstName,
          email,
          request_id: `product-${requestSuffix}`,
          custom,
        }],
      }],
    },
    'POST'
  );

  const orders = normalizeAddOrderResponse(addOrderResponse);
  const firstOrder = orders[0];
  const firstProduct = firstOrder?.products_details?.[0];
  if (!firstOrder?.id || !firstProduct?.id) {
    throw new HttpError(502, 'BilletWeb add_order returned an incomplete payload', 'UPSERT_PARTICIPANT_TICKET rejected: BilletWeb add_order response is incomplete');
  }
  const geturl = buildBilletwebUrl(credentials, 'attendees') + '&product_id='+firstProduct?.id;
  const attendees = normalizeAttendeesResponse(await callBilletwebApi(geturl, undefined, 'GET'));
  const attendee = attendees.find((item) => item.id === firstProduct.id);
  if (!attendee) {
    throw new HttpError(502, 'BilletWeb attendees response does not contain the created ticket', 'UPSERT_PARTICIPANT_TICKET rejected: created ticket missing from attendees response', { productId: firstProduct.id });
  }

  return {
    id: '',
    lastUpdated: '',
    conferenceId: '',
    personId: '',
    ticketName,
    ticketInternalId: attendee.id,
    ticketExtenalId: attendee.ext_id || firstProduct.ext_id,
    ticketStatus: attendee.disabled === '1' ? 'DISABLED' : 'CREATED',
    orderId: attendee.order_id || firstOrder.id,
    orderEmail: attendee.order_email || email,
    orderDate: attendee.order_date || new Date().toISOString(),
    downloadURL: attendee.product_download || firstProduct.product_download,
    manageURL: attendee.product_management || '',
  };
}

/**
 * Updates BilletWeb ticket.
 * @param credentials Resolved service credentials.
 * @param existingTicket Existing participant ticket.
 * @param firstName Participant first name.
 * @param lastName Participant last name.
 * @param email Participant email address.
 * @param custom Custom field payload.
 * @returns Promise resolved with the computed result.
 */
export async function updateBilletwebTicket(
  credentials: BilletwebCredentials,
  existingTicket: ParticipantBilletWebTicket,
  firstName: string,
  lastName: string,
  email: string,
  custom: Record<string, string>
): Promise<ParticipantBilletWebTicket> {
  await callBilletwebApi(buildBilletwebUrl(credentials, 'update_product'), {
    data: [{ id: existingTicket.ticketInternalId, ticket: existingTicket.ticketName, name: lastName, firstname: firstName, email, custom }],
  }, 'POST');

  return { ...existingTicket, orderEmail: email, ticketStatus: 'CREATED' };
}

/**
 * Deletes BilletWeb ticket.
 * @param credentials Resolved service credentials.
 * @param existingTicket Existing participant ticket.
 * @returns Promise resolved when the operation completes.
 */
export async function deleteBilletwebTicket(
  credentials: BilletwebCredentials,
  existingTicket: ParticipantBilletWebTicket
): Promise<void> {
  await callBilletwebApi(buildBilletwebUrl(credentials, 'delete_order'), {
    data: [{ id: existingTicket.orderId }],
  }, 'POST');
}

/**
 * Requests BilletWeb to send or resend the existing order notification email for one ticket.
 *
 * The payload shape is inferred from the BilletWeb `update_order` endpoint usage pattern already
 * established in this feature and must still be validated against the live API.
 *
 * @param credentials Resolved BilletWeb credentials.
 * @param existingTicket Existing created participant ticket.
 * @returns Promise resolved when BilletWeb accepts the notification request.
 */
export async function sendBilletwebTicketEmail(
  credentials: BilletwebCredentials,
  existingTicket: ParticipantBilletWebTicket
): Promise<void> {
  await callBilletwebApi(buildBilletwebUrl(credentials, 'update_order'), {
    data: [{
      id: existingTicket.orderId,
      ship: 1, // send the ticket by email.
    }],
  }, 'POST');
}

/**
 * Builds BilletWeb URL.
 * @param credentials Resolved service credentials.
 * @param action API action name.
 * @returns Computed result.
 */
function buildBilletwebUrl(credentials: BilletwebCredentials, action: string): string {
  return `${credentials.apiUrl}/event/${encodeURIComponent(credentials.eventId)}/${action}?user=${encodeURIComponent(credentials.userId)}&key=${encodeURIComponent(credentials.key)}&version=${encodeURIComponent(credentials.keyVersion)}`;
}

/**
 * Call BilletWeb API.
 * @param url Target URL.
 * @param body Raw request body.
 * @param method Method.
 * @returns Promise resolved with the computed result.
 */
async function callBilletwebApi(
  url: string,
  body: Record<string, unknown> | undefined,
  method: 'GET' | 'POST'
): Promise<unknown> {
  let response: Response;
  let body_encoded = method === 'POST' ? JSON.stringify(body ?? {}) : undefined;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: body_encoded,
    });
  } catch (error: unknown) {
    logger.debug('Billetweb api called with error', {url, method, body: body_encoded, error});
    const detail = error instanceof Error ? error.message : String(error);
    throw new HttpError(502, `Failed to call BilletWeb API: ${detail}`, 'BilletWeb API call failed', { detail });
  }

  const rawBody = await response.text();
  logger.debug('Billetweb api called', {url, method, body: body_encoded, response: rawBody});
  const parsedBody = parseJsonOrText(rawBody);
  if (!response.ok) {
    throw new HttpError(502, `BilletWeb API error (${response.status})`, 'BilletWeb API returned non-2xx', { status: response.status, body: parsedBody });
  }
  return parsedBody;
}

/**
 * Normalizes API URL.
 * @param value Raw input value.
 * @returns Computed result.
 */
function normalizeApiUrl(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/\/+$/g, '');
  if (!raw) {
    return '';
  }
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Parses JSON or text.
 * @param value Raw input value.
 * @returns Computed result.
 */
function parseJsonOrText(value: string): unknown {
  const text = String(value ?? '').trim();
  if (!text) {
    return [];
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Normalizes add order response.
 * @param payload Normalized payload.
 * @returns Computed result.
 */
function normalizeAddOrderResponse(payload: unknown): BilletwebAddOrderResponseItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => ({
    id: String((item as any)?.id ?? '').trim(),
    products_details: Array.isArray((item as any)?.products_details)
      ? (item as any).products_details.map((detail: any) => ({
        id: String(detail?.id ?? '').trim(),
        ext_id: String(detail?.ext_id ?? '').trim(),
        product_download: String(detail?.product_download ?? '').trim(),
      }))
      : [],
  }));
}

/**
 * Normalizes attendees response.
 * @param payload Normalized payload.
 * @returns Computed result.
 */
function normalizeAttendeesResponse(payload: unknown): BilletwebAttendee[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => ({
    id: String((item as any)?.id ?? '').trim(),
    ext_id: String((item as any)?.ext_id ?? '').trim(),
    email: String((item as any)?.email ?? '').trim(),
    firstname: String((item as any)?.firstname ?? '').trim(),
    name: String((item as any)?.name ?? '').trim(),
    ticket: String((item as any)?.ticket ?? '').trim(),
    ticket_id: String((item as any)?.ticket_id ?? '').trim(),
    disabled: String((item as any)?.disabled ?? '').trim(),
    product_management: String((item as any)?.product_management ?? '').trim(),
    product_download: String((item as any)?.product_download ?? '').trim(),
    order_id: String((item as any)?.order_id ?? '').trim(),
    order_ext_id: String((item as any)?.order_ext_id ?? '').trim(),
    order_email: String((item as any)?.order_email ?? '').trim(),
    order_date: String((item as any)?.order_date ?? '').trim(),
  }));
}

/**
 * Builds mapping key.
 * @param activityId Activity id.
 * @param activityAttributeName Activity attribute name.
 * @param billetwebCustomFieldId BilletWeb custom field id.
 * @returns Computed result.
 */
function buildMappingKey(activityId: string, activityAttributeName: string, billetwebCustomFieldId: string): string {
  return [String(activityId ?? '').trim(), String(activityAttributeName ?? '').trim(), String(billetwebCustomFieldId ?? '').trim()].join('::');
}

