import {
  SponsorBusinessEvent,
  SponsorBusinessEventType,
  SponsorDocuments,
  SponsorLogistics,
  SponsorPaymentStatus,
  SponsorRecord,
  SponsorStatus,
} from './sponsor-model';

/**
 * Error thrown when a sponsor business rule is violated.
 */
export class SponsorRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly meta: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const ALLOWED_STATUS_TRANSITIONS: Record<SponsorStatus, SponsorStatus[]> = {
  POTENTIAL: ['POTENTIAL', 'CANDIDATE', 'CANCELED'],
  CANDIDATE: ['CANDIDATE', 'WAITING_LIST', 'CONFIRMED', 'REJECTED', 'CANCELED'],
  WAITING_LIST: ['WAITING_LIST', 'CONFIRMED', 'REJECTED', 'CANCELED'],
  CONFIRMED: ['CONFIRMED', 'CANCELED'],
  REJECTED: ['REJECTED', 'CANDIDATE'],
  CANCELED: ['CANCELED', 'CANDIDATE'],
};

const ALLOWED_PAYMENT_TRANSITIONS: Record<SponsorPaymentStatus, SponsorPaymentStatus[]> = {
  PENDING: ['PENDING', 'PAID', 'OVERDUE'],
  PAID: ['PAID'],
  OVERDUE: ['OVERDUE', 'PAID', 'PENDING'],
};

/**
 * Returns whether a sponsor status transition is allowed by the specification.
 *
 * @param currentStatus Current sponsor status.
 * @param nextStatus Target sponsor status.
 * @returns `true` when the transition is allowed.
 */
export function isAllowedSponsorStatusTransition(
  currentStatus: SponsorStatus,
  nextStatus: SponsorStatus
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

/**
 * Returns whether a sponsor payment status transition is allowed by the specification.
 *
 * @param currentStatus Current payment status.
 * @param nextStatus Target payment status.
 * @returns `true` when the transition is allowed.
 */
export function isAllowedSponsorPaymentStatusTransition(
  currentStatus: SponsorPaymentStatus,
  nextStatus: SponsorPaymentStatus
): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

/**
 * Ensures a sponsor status transition is allowed.
 *
 * @param currentStatus Current sponsor status.
 * @param nextStatus Target sponsor status.
 * @throws SponsorRuleError When the transition is not allowed.
 */
export function assertAllowedSponsorStatusTransition(
  currentStatus: SponsorStatus,
  nextStatus: SponsorStatus
): void {
  if (isAllowedSponsorStatusTransition(currentStatus, nextStatus)) {
    return;
  }

  throw new SponsorRuleError(
    'INVALID_SPONSOR_STATUS_TRANSITION',
    `Invalid sponsor status transition: ${currentStatus} -> ${nextStatus}`,
    { currentStatus, nextStatus }
  );
}

/**
 * Ensures a sponsor payment status transition is allowed.
 *
 * @param currentStatus Current sponsor payment status.
 * @param nextStatus Target sponsor payment status.
 * @throws SponsorRuleError When the transition is not allowed.
 */
export function assertAllowedSponsorPaymentStatusTransition(
  currentStatus: SponsorPaymentStatus,
  nextStatus: SponsorPaymentStatus
): void {
  if (isAllowedSponsorPaymentStatusTransition(currentStatus, nextStatus)) {
    return;
  }

  throw new SponsorRuleError(
    'INVALID_SPONSOR_PAYMENT_STATUS_TRANSITION',
    `Invalid sponsor payment status transition: ${currentStatus} -> ${nextStatus}`,
    { currentStatus, nextStatus }
  );
}

/**
 * Returns a sponsor copy with an appended business event.
 *
 * @param sponsor Sponsor record to update.
 * @param event Business event to append.
 * @returns Sponsor record with updated business history.
 */
export function appendSponsorBusinessEvent<T extends SponsorRecord>(
  sponsor: T,
  event: SponsorBusinessEvent
): T {
  return {
    ...sponsor,
    businessEvents: [...(sponsor.businessEvents ?? []), event],
  };
}

/**
 * Applies one document-related projection update derived from a successful event.
 *
 * @param documents Current document projection.
 * @param eventType Successful business event type.
 * @param eventAt Event timestamp.
 * @returns Updated document projection.
 */
export function applySponsorDocumentProjection(
  documents: SponsorDocuments | undefined,
  eventType: SponsorBusinessEventType,
  eventAt: string
): SponsorDocuments | undefined {
  const nextDocuments: SponsorDocuments = { ...(documents ?? {}) };

  switch (eventType) {
  case 'ORDER_FORM_SENT':
    nextDocuments.orderFormSentAt = eventAt;
    return nextDocuments;
  case 'INVOICE_SENT':
    nextDocuments.invoiceSentAt = eventAt;
    return nextDocuments;
  case 'PAYMENT_REMINDER_SENT':
    nextDocuments.lastReminderSentAt = eventAt;
    return nextDocuments;
  default:
    return documents;
  }
}

/**
 * Applies one logistics-related projection update derived from a successful event.
 *
 * Booth assignment is intentionally updated to the latest booth change date,
 * including `BOOTH_CHANGED`, as decided in the specification workflow.
 *
 * @param logistics Current logistics projection.
 * @param eventType Successful business event type.
 * @param eventAt Event timestamp.
 * @returns Updated logistics projection.
 */
export function applySponsorLogisticsProjection(
  logistics: SponsorLogistics | undefined,
  eventType: SponsorBusinessEventType,
  eventAt: string
): SponsorLogistics | undefined {
  const nextLogistics: SponsorLogistics = { ...(logistics ?? {}) };

  switch (eventType) {
  case 'BOOTH_ASSIGNED':
  case 'BOOTH_CHANGED':
    nextLogistics.boothAssignedAt = eventAt;
    return nextLogistics;
  case 'TICKETS_ALLOCATED':
    nextLogistics.ticketsAllocatedAt = eventAt;
    return nextLogistics;
  default:
    return logistics;
  }
}

/**
 * Returns a sponsor copy with updated status and status date.
 *
 * @param sponsor Sponsor record to update.
 * @param nextStatus Target sponsor status.
 * @param nextStatusDate Date associated with the status change.
 * @returns Updated sponsor record.
 */
export function applySponsorStatusTransition<T extends SponsorRecord>(
  sponsor: T,
  nextStatus: SponsorStatus,
  nextStatusDate: string
): T {
  assertAllowedSponsorStatusTransition(sponsor.status, nextStatus);
  return {
    ...sponsor,
    status: nextStatus,
    statusDate: nextStatusDate,
  };
}

/**
 * Returns a sponsor copy with updated payment status and payment status date.
 *
 * @param sponsor Sponsor record to update.
 * @param nextPaymentStatus Target sponsor payment status.
 * @param nextPaymentStatusDate Date associated with the payment status change.
 * @returns Updated sponsor record.
 */
export function applySponsorPaymentStatusTransition<T extends SponsorRecord>(
  sponsor: T,
  nextPaymentStatus: SponsorPaymentStatus,
  nextPaymentStatusDate: string
): T {
  assertAllowedSponsorPaymentStatusTransition(sponsor.paymentStatus, nextPaymentStatus);
  return {
    ...sponsor,
    paymentStatus: nextPaymentStatus,
    paymentStatusDate: nextPaymentStatusDate,
  };
}

/**
 * Applies a successful sponsor business event to both history and derived projections.
 *
 * @param sponsor Sponsor record to update.
 * @param event Successful business event.
 * @returns Updated sponsor record with history and projections synchronized.
 */
export function applySuccessfulSponsorBusinessEvent<T extends SponsorRecord>(
  sponsor: T,
  event: SponsorBusinessEvent
): T {
  const withEvent = appendSponsorBusinessEvent(sponsor, event);
  return {
    ...withEvent,
    documents: applySponsorDocumentProjection(withEvent.documents, event.type, event.at),
    logistics: applySponsorLogisticsProjection(withEvent.logistics, event.type, event.at),
  };
}
