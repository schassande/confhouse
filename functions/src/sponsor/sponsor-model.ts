/**
 * Supported sponsor workflow statuses on the backend.
 */
export type SponsorStatus =
  | 'POTENTIAL'
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELED'
  | 'WAITING_LIST';

/**
 * Supported sponsor payment statuses on the backend.
 */
export type SponsorPaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

/**
 * Supported sponsor business event types on the backend.
 */
export type SponsorBusinessEventType =
  | 'ORDER_FORM_SENT'
  | 'INVOICE_SENT'
  | 'PAYMENT_REMINDER_SENT'
  | 'BOOTH_ASSIGNED'
  | 'BOOTH_CHANGED'
  | 'TICKETS_ALLOCATED';

/**
 * Lightweight sponsor document projection derived from business history.
 */
export interface SponsorDocuments {
  orderFormSentAt?: string;
  invoiceSentAt?: string;
  lastReminderSentAt?: string;
}

/**
 * Lightweight sponsor logistics projection derived from business history.
 */
export interface SponsorLogistics {
  boothAssignedAt?: string;
  ticketsAllocatedAt?: string;
}

/**
 * One business event recorded on a sponsor.
 */
export interface SponsorBusinessEvent {
  type: SponsorBusinessEventType;
  at: string;
  by: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Minimal backend sponsor shape required by helper functions.
 */
export interface SponsorRecord {
  status: SponsorStatus;
  statusDate: string;
  paymentStatus: SponsorPaymentStatus;
  paymentStatusDate: string;
  businessEvents?: SponsorBusinessEvent[];
  documents?: SponsorDocuments;
  logistics?: SponsorLogistics;
}
