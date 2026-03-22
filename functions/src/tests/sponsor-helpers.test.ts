import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SponsorRuleError,
  applySuccessfulSponsorBusinessEvent,
  applySponsorPaymentStatusTransition,
  applySponsorStatusTransition,
  assertAllowedSponsorPaymentStatusTransition,
  assertAllowedSponsorStatusTransition,
} from '../sponsor/sponsor-helpers';
import { SponsorRecord } from '../sponsor/sponsor-model';

function buildSponsorRecord(): SponsorRecord {
  return {
    status: 'CANDIDATE',
    statusDate: '2026-03-01',
    paymentStatus: 'PENDING',
    paymentStatusDate: '2026-03-01',
  };
}

test('assertAllowedSponsorStatusTransition accepts allowed transitions', () => {
  assert.doesNotThrow(() => assertAllowedSponsorStatusTransition('CANDIDATE', 'CONFIRMED'));
  assert.doesNotThrow(() => assertAllowedSponsorStatusTransition('REJECTED', 'CANDIDATE'));
});

test('assertAllowedSponsorStatusTransition rejects forbidden transitions', () => {
  assert.throws(
    () => assertAllowedSponsorStatusTransition('CONFIRMED', 'WAITING_LIST'),
    (error: unknown) =>
      error instanceof SponsorRuleError
      && error.code === 'INVALID_SPONSOR_STATUS_TRANSITION'
  );
});

test('applySponsorStatusTransition updates status and statusDate', () => {
  const next = applySponsorStatusTransition(buildSponsorRecord(), 'CONFIRMED', '2026-03-13');
  assert.equal(next.status, 'CONFIRMED');
  assert.equal(next.statusDate, '2026-03-13');
});

test('assertAllowedSponsorPaymentStatusTransition rejects forbidden transitions', () => {
  assert.throws(
    () => assertAllowedSponsorPaymentStatusTransition('PAID', 'OVERDUE'),
    (error: unknown) =>
      error instanceof SponsorRuleError
      && error.code === 'INVALID_SPONSOR_PAYMENT_STATUS_TRANSITION'
  );
});

test('applySponsorPaymentStatusTransition updates payment status and date', () => {
  const next = applySponsorPaymentStatusTransition(buildSponsorRecord(), 'OVERDUE', '2026-04-01');
  assert.equal(next.paymentStatus, 'OVERDUE');
  assert.equal(next.paymentStatusDate, '2026-04-01');
});

test('applySuccessfulSponsorBusinessEvent updates document projections', () => {
  const next = applySuccessfulSponsorBusinessEvent(buildSponsorRecord(), {
    type: 'INVOICE_SENT',
    at: '2026-03-13T10:00:00.000Z',
    by: 'organizer@example.com',
  });

  assert.equal(next.businessEvents?.length, 1);
  assert.equal(next.documents?.invoiceSentAt, '2026-03-13T10:00:00.000Z');
  assert.equal(next.documents?.orderFormSentAt, undefined);
});

test('applySuccessfulSponsorBusinessEvent updates paid invoice projection', () => {
  const next = applySuccessfulSponsorBusinessEvent(buildSponsorRecord(), {
    type: 'INVOICE_PAID_SENT',
    at: '2026-03-20T10:00:00.000Z',
    by: 'organizer@example.com',
  });

  assert.equal(next.businessEvents?.length, 1);
  assert.equal(next.documents?.invoicePaidSentAt, '2026-03-20T10:00:00.000Z');
});

test('applySuccessfulSponsorBusinessEvent updates booth projection with latest booth change date', () => {
  const assigned = applySuccessfulSponsorBusinessEvent(buildSponsorRecord(), {
    type: 'BOOTH_ASSIGNED',
    at: '2026-03-10T09:00:00.000Z',
    by: 'organizer@example.com',
  });
  const changed = applySuccessfulSponsorBusinessEvent(assigned, {
    type: 'BOOTH_CHANGED',
    at: '2026-03-12T11:30:00.000Z',
    by: 'organizer@example.com',
  });

  assert.equal(changed.logistics?.boothAssignedAt, '2026-03-12T11:30:00.000Z');
  assert.equal(changed.businessEvents?.length, 2);
});

test('applySuccessfulSponsorBusinessEvent updates ticket allocation projection', () => {
  const next = applySuccessfulSponsorBusinessEvent(buildSponsorRecord(), {
    type: 'TICKETS_ALLOCATED',
    at: '2026-03-15T08:00:00.000Z',
    by: 'organizer@example.com',
  });

  assert.equal(next.logistics?.ticketsAllocatedAt, '2026-03-15T08:00:00.000Z');
});
