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
 * Supported sponsor communication languages.
 */
export type SponsorCommunicationLanguage = 'fr' | 'en';

/**
 * Supported sponsor business event types.
 */
export type SponsorBusinessEventType =
  | 'ORDER_FORM_SENT'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID_SENT'
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
 * Optional email template identifiers configured for one sponsor type.
 */
export interface SponsorTypeTemplateEmail {
  /** Template identifier used for sponsor application confirmation emails. */
  emailApplicationConfirmationTemplateId?: string;
  /** Template identifier used for sponsor order form emails. */
  emailOrderFormTemplateId?: string;
  /** Template identifier used for sponsor invoice emails. */
  emailInvoiceTemplateId?: string;
  /** Template identifier used for sponsor payment reminder emails. */
  emailPaymentReminderTemplateId?: string;
  /** Template identifier used for sponsor paid invoice emails. */
  emailPaidInvoiceTemplateId?: string;
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
  boothAllocationMode: BoothAllocationMode;
  /** List of conference ticket quotas for this sponsor type. */
  conferenceTicketQuotas: SponsorConferenceTicketQuota[];
  /** Optional email template identifiers used for sponsor communications. */
  templateEmail?: SponsorTypeTemplateEmail;
}

/**
 * define the way the booths are allocated to the sponsor
 */
export type BoothAllocationMode = 
  'RANDOM' // Random allocation of the booth not based on the wishes
  | 'MANUAL' // Organizer allocates manually the stand
  | 'REGISTRATION_DATE' // Automatic allocation based on the registration date and the wishes
  | 'WISHES_DATE'  // Automatic allocation based on the last whises date and the wishes
  | 'CONFIRMATION_DATE'  // Automatic allocation based on the confirmation date and the wishes
  | 'PAYMENT_DATE' // Automatic allocation based on the payment date and the wishes
;

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
  invoicePaidSentAt?: string;
  lastReminderSentAt?: string;
}

/**
 * Lightweight logistics summary fields derived from sponsor history.
 */
export interface SponsorLogistics {
  boothAssignedAt?: string;
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
  /** Date Time when the business status was last updated, ISO 8601. */
  statusDate: string;
  /** Current payment status. */
  paymentStatus: SponsorPaymentStatus;
  /** Date Time when the payment status was last updated, ISO 8601. */
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
  /** Date Time when the booth wishes were last updated, ISO 8601. */
  boothWishesDate: string;
  /** Preferred communication language used for emails and generated documents. */
  communicationLanguage?: SponsorCommunicationLanguage;
  /** Sponsor-side purchase order reference. */
  purchaseOrder?: string;
  /** Postal address of the sponsor. */
  address?: string;
  /** Date Time when the sponsor registration was first created, ISO 8601. */
  registrationDate?: string;
  /** Immutable acceptance number assigned when the sponsor is first confirmed. */
  acceptedNumber?: number;
  /** Optional invoice due date overridden by the organizer. */
  invoiceDueDate?: string;
  /** List of sponsor administrator emails. */
  adminEmails: string[];
  /** Business history of significant sponsor actions. */
  businessEvents?: SponsorBusinessEvent[];
  /** Summary document projection derived from business history. */
  documents?: SponsorDocuments;
  /** Summary logistics projection derived from business history. */
  logistics?: SponsorLogistics;
  /** List of identifier of ParticipantBilletWebTicket. It is the list of all ticket allowed for this sponsor. */
  participantTicketIds: string[];
}
