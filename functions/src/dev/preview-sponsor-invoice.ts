import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildSponsorInvoicePayload } from '../documents/sponsor-document-builders';
import { renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from './fixtures/sponsor-document-fixtures';

/**
 * Generates one local sponsor invoice PDF for developer preview.
 */
async function main(): Promise<void> {
  const payload = buildSponsorInvoicePayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'en',
      issueDate: '2026-03-13',
      dueDate: '2026-04-12',
      documentNumber: 'INV-2026-001',
      vatRate: 0.2,
      legalNotes: ['Thank you for supporting the conference.', 'This document is generated from development fixture data.'],
    }
  );
  const buffer = await renderSponsorDocumentPdf(payload);
  const outputDirectory = path.join(process.cwd(), 'tmp', 'generated-documents');
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'sponsor-invoice-preview.pdf'), buffer);
}

void main();
