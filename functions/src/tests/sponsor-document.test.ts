import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSponsorInvoicePayload, buildSponsorOrderFormPayload } from '../documents/sponsor-document-builders';
import { getSponsorDocumentDefinition, renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from '../dev/fixtures/sponsor-document-fixtures';

test('buildSponsorOrderFormPayload builds the normalized order form payload', () => {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'en',
      issueDate: '2026-03-13',
      documentNumber: 'OF-2026-001',
      vatRate: 0.2,
      legalNotes: ['Payment due in 30 days.'],
    }
  );

  assert.equal(payload.documentType, 'ORDER_FORM');
  assert.equal(payload.sponsorTypeName, 'Gold Sponsorship');
  assert.equal(payload.issuer.legalEntity, 'Snowcamp Association');
  assert.equal(payload.lineItems.length, 1);
  assert.equal(payload.lineItems[0].unitPrice, 5000);
  assert.equal(payload.totals.subtotal, 5000);
  assert.equal(payload.totals.vatAmount, 1000);
  assert.equal(payload.totals.total, 6000);
});

test('buildSponsorInvoicePayload keeps due date and localized description fallback', () => {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'fr',
      issueDate: '2026-03-13',
      dueDate: '2026-04-13',
      documentNumber: 'INV-2026-001',
      vatRate: 0.2,
      legalNotes: [],
    }
  );

  assert.equal(payload.documentType, 'INVOICE');
  assert.equal(payload.dueDate, '2026-04-13');
  assert.equal(payload.lineItems[0].description, 'Offre sponsor premium avec stand et visibilite conference.');
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
      SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
      {
        locale: 'en',
        issueDate: '2026-03-13',
      }
    ),
    /Missing issuer data/
  );
});

test('getSponsorDocumentDefinition exposes expected core sections', () => {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'en',
      issueDate: '2026-03-13',
      documentNumber: 'INV-2026-001',
      vatRate: 0.2,
      legalNotes: ['Wire transfer only.'],
    }
  );

  const definition = getSponsorDocumentDefinition(payload);
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.content[0].text, 'Invoice');
  assert.equal(definition.content[3].table.body[1][0].stack[0].text, 'Gold Sponsorship');
  assert.equal(definition.content[4].columns[1].table.body[2][0].text, 'Total incl. VAT');
});

test('renderSponsorDocumentPdf returns a non-empty PDF buffer', async () => {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'en',
      issueDate: '2026-03-13',
      vatRate: 0.2,
      legalNotes: [],
    }
  );

  const buffer = await renderSponsorDocumentPdf(payload);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 4).toString('utf8'), '%PDF');
});
