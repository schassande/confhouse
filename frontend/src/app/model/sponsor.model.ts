import { PersistentData, WithId } from './persistant.model';

/**
 * Supported sponsor workflow statuses.
 */
export type SponsorStatus = 'POTENTIAL' | 'CANDIDATE' | 'CONFIRMED' | 'REJECTED' | 'CANCELED' | 'WAITING_LIST';

/**
 * Supported sponsor payment statuses.
 */
export type SponsorPaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

/**
 * Supported sponsor ticket lifecycle statuses.
 */
export type ConferenceTicketStatus = 'REQUESTED' | 'CREATED' | 'SENT' | 'CANCELED';

/**
 * Supported sponsor business event types.
 */
export type SponsorBusinessEventType =
  | 'ORDER_FORM_SENT'
  | 'INVOICE_SENT'
  | 'PAYMENT_REMINDER_SENT'
  | 'BOOTH_ASSIGNED'
  | 'BOOTH_CHANGED'
  | 'TICKETS_ALLOCATED';

/**
 * Definition of one conference ticket quota for a sponsor type.
 */
export interface SponsorConferenceTicketQuota {
  /** ID of the conference ticket type. */
  conferenceTicketTypeId: string;
  /** Maximum number of tickets available for this quota. */
  quota: number;
}

/**
 * Sponsor offer definition configured on a conference.
 */
export interface SponsorType extends WithId {
  /** Name of the sponsor type, for example Gold or Silver. */
  name: string;
  /** Description in several languages. */
  description: { [lang: string]: string };
  /** Maximum number of sponsors allowed for this type. */
  maxNumber: number;
  /** Price of the sponsor type. */
  price: number;
  /** Color associated with this sponsor type. */
  color: string;
  /** Font color associated with this sponsor type. */
  fontColor: string;
  /** List of possible booth names for this sponsor type. */
  boothNames: string[];
  /** List of conference ticket quotas for this sponsor type. */
  conferenceTicketQuotas: SponsorConferenceTicketQuota[];
}

/**
 * One conference ticket allocated to a sponsor.
 */
export interface ConferenceTicket {
  conferenceTicketTypeId: string;
  email: string;
  ticketId: string;
  status: ConferenceTicketStatus;
}

/**
 * One significant business event recorded on a sponsor.
 */
export interface SponsorBusinessEvent {
  type: SponsorBusinessEventType;
  at: string;
  by: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Lightweight document summary fields derived from sponsor history.
 */
export interface SponsorDocuments {
  orderFormSentAt?: string;
  invoiceSentAt?: string;
  lastReminderSentAt?: string;
}

/**
 * Lightweight logistics summary fields derived from sponsor history.
 */
export interface SponsorLogistics {
  boothAssignedAt?: string;
  ticketsAllocatedAt?: string;
}

/**
 * Persistent sponsor entity linked to one conference.
 */
export interface Sponsor extends PersistentData {
  conferenceId: string;
  /** Name of the sponsor. */
  name: string;
  /** Current business status of the sponsor. */
  status: SponsorStatus;
  /** Date when the business status was last updated, ISO 8601. */
  statusDate: string;
  /** Current payment status. */
  paymentStatus: SponsorPaymentStatus;
  /** Date when the payment status was last updated, ISO 8601. */
  paymentStatusDate: string;
  /** Description in several languages. */
  description: { [lang: string]: string };
  /** ID of the sponsor type configured on the conference. */
  sponsorTypeId: string;
  /** URL to the sponsor logo. */
  logo: string;
  /** Website URLs in different languages. */
  website: { [lang: string]: string };
  /** Name of the booth allocated to the sponsor. */
  boothName: string;
  /** Ordered booth preferences submitted by the sponsor. */
  boothWishes: string[];
  /** Date when the booth wishes were last updated, ISO 8601. */
  boothWishesDate: string;
  /** List of sponsor administrator emails. */
  adminEmails: string[];
  /** Business history of significant sponsor actions. */
  businessEvents?: SponsorBusinessEvent[];
  /** Summary document projection derived from business history. */
  documents?: SponsorDocuments;
  /** Summary logistics projection derived from business history. */
  logistics?: SponsorLogistics;
  /** Conference tickets allocated to the sponsor. */
  conferenceTickets?: ConferenceTicket[];
}
