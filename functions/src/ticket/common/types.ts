import { admin } from '../../common/firebase-admin';
import type { ParticipantBilletWebTicket } from '../../../../shared/src/model/billetweb-config';
import type { Sponsor } from '../../../../shared/src/model/sponsor.model';
import type { AuthorizedConferenceOrganizerContext } from '../../conference/common';

export type SponsorTicketActionOperation =
  | 'ALLOCATE_TICKETS'
  | 'UPSERT_PARTICIPANT_TICKET'
  | 'DELETE_PARTICIPANT_TICKET'
  | 'SEND_PARTICIPANT_TICKET';

/**
 * Fully authorized organizer request context reused by sponsor ticket actions.
 */
export interface AuthorizedSponsorContext {
  /** Base authorized organizer conference context. */
  db: AuthorizedConferenceOrganizerContext['db'];
  /** Conference identifier from the request. */
  conferenceId: AuthorizedConferenceOrganizerContext['conferenceId'];
  /** Sponsor identifier from the request. */
  sponsorId: string;
  /** Authenticated organizer email. */
  requesterEmail: AuthorizedConferenceOrganizerContext['requesterEmail'];
  /** Loaded conference document reference. */
  conferenceRef: AuthorizedConferenceOrganizerContext['conferenceRef'];
  /** Loaded conference payload. */
  conferenceData: AuthorizedConferenceOrganizerContext['conferenceData'];
  /** Loaded sponsor document reference. */
  sponsorRef: admin.firestore.DocumentReference;
  /** Loaded sponsor payload. */
  sponsorData: Sponsor;
}

/**
 * Standard response payload returned by sponsor ticket action endpoints.
 */
export interface SponsorTicketActionReport {
  /** Updated sponsor payload returned to the frontend. */
  sponsor: Sponsor;
  /** Updated participant ticket when the action targets a single ticket. */
  participantTicket?: ParticipantBilletWebTicket;
  /** Updated participant tickets when the action synchronizes the whole sponsor allocation. */
  participantTickets?: ParticipantBilletWebTicket[];
}

/**
 * One editable custom field value posted by the frontend for a participant ticket.
 */
export interface ParticipantTicketFieldInput {
  /** Activity identifier owning the source attribute. */
  activityId: string;
  /** Activity attribute name to persist in `ActivityParticipation`. */
  activityAttributeName: string;
  /** BilletWeb custom field identifier receiving the value. */
  billetwebCustomFieldId: string;
  /** Submitted value for the custom field. */
  value: string;
}

/**
 * Resolved BilletWeb credentials required for server-side API calls.
 */
export interface BilletwebCredentials {
  /** BilletWeb API base URL. */
  apiUrl: string;
  /** BilletWeb user identifier. */
  userId: string;
  /** BilletWeb key version. */
  keyVersion: string;
  /** BilletWeb secret key loaded from conference secrets. */
  key: string;
  /** BilletWeb event identifier. */
  eventId: string;
}

/**
 * Minimal `products_details` item returned by BilletWeb `add_order`.
 */
export interface BilletwebAddOrderProductDetail {
  /** Internal BilletWeb product identifier. */
  id: string;
  /** External BilletWeb ticket identifier. */
  ext_id: string;
  /** Download URL returned by BilletWeb. */
  product_download: string;
}

/**
 * Minimal normalized `add_order` response item used by the backend workflow.
 */
export interface BilletwebAddOrderResponseItem {
  /** Internal BilletWeb order identifier. */
  id: string;
  /** Product details created inside the order. */
  products_details: BilletwebAddOrderProductDetail[];
}

/**
 * Minimal normalized attendee payload returned by BilletWeb `attendees`.
 */
export interface BilletwebAttendee {
  /** Internal BilletWeb product identifier. */
  id: string;
  /** External BilletWeb ticket identifier. */
  ext_id: string;
  /** Participant email. */
  email: string;
  /** Participant first name. */
  firstname: string;
  /** Participant last name. */
  name: string;
  /** BilletWeb ticket label. */
  ticket: string;
  /** BilletWeb ticket type identifier. */
  ticket_id: string;
  /** Disabled flag returned by BilletWeb. */
  disabled: string;
  /** BilletWeb management URL for the product. */
  product_management: string;
  /** BilletWeb download URL for the product. */
  product_download: string;
  /** Internal BilletWeb order identifier. */
  order_id: string;
  /** External BilletWeb order identifier. */
  order_ext_id: string;
  /** Order email returned by BilletWeb. */
  order_email: string;
  /** Order date returned by BilletWeb. */
  order_date: string;
}

