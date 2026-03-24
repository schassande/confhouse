import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSponsorInvoicePayload, buildSponsorOrderFormPayload, buildSponsorPaidInvoicePayload } from '../documents/sponsor-document-builders';
import { buildSponsorDocumentFilename } from '../documents/sponsor-document-filename';
import { getSponsorDocumentDefinition, renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import { formatAmount } from '../documents/sponsor-document-template-common';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from '../dev/fixtures/sponsor-document-fixtures';

test('buildSponsorOrderFormPayload builds the normalized order form payload from business objects', () => {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: 'en' }
  );

  assert.equal(payload.documentType, 'ORDER_FORM');
  assert.equal(payload.locale, 'en');
  assert.equal(payload.issueDate, '2026-01-10');
  assert.equal(payload.sponsorTypeName, 'Etoile');
  assert.equal(payload.issuer.legalEntity, 'Snowcamp');
  assert.equal(payload.conferenceLogo, 'https://snowcamp.io/img/logo/snowcamp.svg');
  assert.equal(payload.documentNumber, '2026-07');
  assert.equal(payload.recipient.purchaseOrder, 'PO-42');
  assert.equal(payload.recipient.address, '42 Avenue des Sponsors, 75010 Paris, France');
  assert.deepEqual(payload.legalNotes, [
    'Payment due in 30 days.',
    'This document is generated from development fixture data.',
  ]);
  assert.equal(payload.bankDetails?.iban, 'FR76 1234 5678 9012 3456 7890 123');
  assert.equal(payload.lineItems.length, 1);
  assert.equal(
    payload.lineItems[0].label,
    'Conference sponsorship Etoile for Snowcamp 2026 from 01/15/2026 to 01/17/2026'
  );
  assert.equal(payload.lineItems[0].unitPrice, 3000);
  assert.equal(payload.totals.subtotal, 3000);
  assert.equal(payload.totals.vatAmount, 600);
  assert.equal(payload.totals.total, 3600);
});

test('getSponsorOrderFormDefinition exposes the conference logo like the invoice', () => {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: 'en' }
  );

  const definition = getSponsorDocumentDefinition(payload);
  assert.equal(definition.content[0].image, 'https://snowcamp.io/img/logo/snowcamp.svg');
  assert.equal(definition.content[1].text, 'Order Form');
  assert.equal(definition.content[2].columns[1].stack[1].text, '42 Avenue des Sponsors, 75010 Paris, France');
});

test('buildSponsorInvoicePayload keeps due date and localized description fallback from business objects', () => {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR
  );

  assert.equal(payload.documentType, 'INVOICE');
  assert.equal(payload.locale, 'fr');
  assert.equal(payload.issueDate, '2026-01-15');
  assert.equal(payload.dueDate, '2026-02-15');
  assert.equal(payload.documentNumber, '2026-07');
  assert.equal(payload.recipient.address, '42 Avenue des Sponsors, 75010 Paris, France');
  assert.equal(
    payload.lineItems[0].label,
    'Sponsoring Etoile de la conference Snowcamp 2026 du 15/01/2026 au 17/01/2026'
  );
  assert.equal(payload.lineItems[0].description, 'Offre sponsor premium avec stand et visibilité conference.');
});

test('buildSponsorInvoicePayload defaults due date to one month after issue date', () => {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    {
      ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
      invoiceDueDate: undefined,
      documents: {
        ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR.documents,
        invoiceSentAt: '2026-01-31T09:30:00.000Z',
      },
    }
  );

  assert.equal(payload.issueDate, '2026-01-31');
  assert.equal(payload.dueDate, '2026-02-28');
});

test('buildSponsorPaidInvoicePayload uses the paid invoice issue date and invoice layout label', () => {
  const payload = buildSponsorPaidInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR
  );

  assert.equal(payload.documentType, 'INVOICE_PAID');
  assert.equal(payload.issueDate, '2026-02-20');
  assert.equal(payload.dueDate, '2026-02-15');

  const definition = getSponsorDocumentDefinition(payload);
  assert.equal(definition.content[1].text, 'Facture acquittee');
});

test('buildSponsorDocumentFilename uses conference, sponsor, and localized document type labels', () => {
  const frenchFilename = buildSponsorDocumentFilename(
    buildSponsorPaidInvoicePayload(
      SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
      SAMPLE_SPONSOR_DOCUMENT_SPONSOR
    )
  );
  const englishFilename = buildSponsorDocumentFilename(
    buildSponsorOrderFormPayload(
      SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
      { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: 'en' }
    )
  );

  assert.equal(frenchFilename, 'Snowcamp 2026 - Sponsor Example Corp - Facture acquittee.pdf');
  assert.equal(englishFilename, 'Snowcamp 2026 - Sponsor Example Corp - Order Form.pdf');
});

test('buildSponsorDocumentFilename removes invalid filename characters while keeping spaces', () => {
  const filename = buildSponsorDocumentFilename(
    buildSponsorInvoicePayload(
      {
        ...SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
        name: 'Snow/camp: Europe',
      },
      {
        ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
        name: 'Example <Corp> | France',
      }
    )
  );

  assert.equal(filename, 'Snow camp Europe 2026 - Sponsor Example Corp France - Facture.pdf');
});

test('formatAmount normalizes French currency spacing for PDF rendering', () => {
  const formatted = formatAmount(3000, 'fr');

  assert.equal(formatted, '3 000,00 €');
  assert.equal(formatted.includes('\u202f'), false);
  assert.equal(formatted.includes('\u00a0'), false);
});

test('buildSponsorOrderFormPayload rejects missing issuer fields', () => {
  assert.throws(
    () => buildSponsorOrderFormPayload(
      {
        ...SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
        sponsoring: {
          ...SAMPLE_SPONSOR_DOCUMENT_CONFERENCE.sponsoring,
          email: '',
        },
      },
      SAMPLE_SPONSOR_DOCUMENT_SPONSOR
    ),
    /Missing issuer data/
  );
});

test('getSponsorDocumentDefinition exposes expected core sections', () => {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: 'en' }
  );

  const definition = getSponsorDocumentDefinition(payload);
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.content[0].image, 'https://snowcamp.io/img/logo/snowcamp.svg');
  assert.equal(definition.content[1].text, 'Invoice');
  assert.equal(definition.content[2].columns[1].stack[1].text, '42 Avenue des Sponsors, 75010 Paris, France');
  assert.equal(
    definition.content[4].table.body[1][0].stack[0].text,
    'Conference sponsorship Etoile for Snowcamp 2026 from 01/15/2026 to 01/17/2026'
  );
  assert.equal(definition.content[5].columns[1].table.body[2][0].text, 'Total incl. VAT');
});

test('renderSponsorDocumentPdf returns a non-empty PDF buffer', async () => {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: 'en' }
  );
  payload.conferenceLogo = undefined;

  const buffer = await renderSponsorDocumentPdf(payload);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 4).toString('utf8'), '%PDF');
});
