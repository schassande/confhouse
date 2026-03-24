import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSponsorInvoicePayload } from '../documents/sponsor-document-builders';
import {
  buildSponsorMailVariables,
  parseMailjetTemplateId,
  resolveSponsorMailTemplateId,
} from '../sponsor/sponsor-mail-template';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from '../dev/fixtures/sponsor-document-fixtures';

const TEMPLATE_CONFERENCE = {
  ...SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  sponsoring: {
    ...SAMPLE_SPONSOR_DOCUMENT_CONFERENCE.sponsoring,
    sponsorTypes: (SAMPLE_SPONSOR_DOCUMENT_CONFERENCE.sponsoring?.sponsorTypes ?? []).map((sponsorType) =>
      sponsorType.id === 'etoile'
        ? {
          ...sponsorType,
          templateEmail: {
            emailApplicationConfirmationTemplateId: '101',
            emailOrderFormTemplateId: '102',
            emailInvoiceTemplateId: '103',
            emailPaymentReminderTemplateId: '104',
            emailPaidInvoiceTemplateId: '105',
          },
        }
        : sponsorType
    ),
  },
};

test('resolveSponsorMailTemplateId returns the configured provider id for each sponsor email type', () => {
  assert.equal(
    resolveSponsorMailTemplateId('SPONSOR_APPLICATION_CONFIRMATION', TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR),
    '101'
  );
  assert.equal(resolveSponsorMailTemplateId('SPONSOR_ORDER_FORM', TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR), '102');
  assert.equal(resolveSponsorMailTemplateId('SPONSOR_INVOICE', TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR), '103');
  assert.equal(resolveSponsorMailTemplateId('SPONSOR_PAYMENT_REMINDER', TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR), '104');
  assert.equal(resolveSponsorMailTemplateId('SPONSOR_PAID_INVOICE', TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR), '105');
});

test('parseMailjetTemplateId accepts numeric strings and rejects non-numeric values', () => {
  assert.equal(parseMailjetTemplateId('42'), 42);
  assert.equal(parseMailjetTemplateId(' 0042 '), 42);
  assert.equal(parseMailjetTemplateId('mailjet-invoice-template'), undefined);
  assert.equal(parseMailjetTemplateId(undefined), undefined);
});

test('buildSponsorMailVariables exposes the agreed common and document variables', () => {
  const documentPayload = buildSponsorInvoicePayload(TEMPLATE_CONFERENCE, SAMPLE_SPONSOR_DOCUMENT_SPONSOR);
  const variables = buildSponsorMailVariables({
    messageType: 'SPONSOR_INVOICE',
    conference: TEMPLATE_CONFERENCE,
    sponsor: SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    recipients: {
      to: [{ email: 'contact@example-corp.test', name: 'Example Corp' }],
      cc: [{ email: 'orga@snowcamp.io' }],
    },
    sender: {
      email: 'team@snowcamp.io',
      name: 'Snowcamp',
    },
    documentPayload,
  });

  assert.equal(variables.conferenceName, 'Snowcamp');
  assert.equal(variables.conferenceEdition, 2026);
  assert.equal(variables.sponsorName, 'Example Corp');
  assert.equal(variables.sponsorTypeName, 'Etoile');
  assert.equal(variables.communicationLanguage, 'fr');
  assert.equal(variables.documentNumber, '2026-07');
  assert.equal(variables.issueDate, '2026-01-15');
  assert.equal(variables.dueDate, '2026-02-15');
  assert.equal(variables.purchaseOrder, 'PO-42');
  assert.equal(variables.vatRate, 0.2);
  assert.equal(variables.vatAmount, 600);
  assert.equal(variables.totalAmount, 3600);
  assert.equal(variables.currency, 'EUR');
  assert.equal(variables.legalEntity, 'Snowcamp');
  assert.equal(variables.iban, 'FR76 1234 5678 9012 3456 7890 123');
  assert.deepEqual(variables.adminEmails, ['contact@example-corp.test']);
  assert.deepEqual(variables.legalNotes, [
    'Payment due in 30 days.',
    'This document is generated from development fixture data.',
  ]);
  assert.deepEqual(variables.lineItems, [
    {
      label: 'Sponsoring Etoile de la conference Snowcamp 2026 du 15/01/2026 au 17/01/2026',
      description: 'Offre sponsor premium avec stand et visibilité conference.',
      quantity: 1,
      unitPrice: 3000,
      totalPrice: 3000,
    },
  ]);
});
