import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildSponsorOrderFormPayload } from '../documents/sponsor-document-builders';
import { renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from './fixtures/sponsor-document-fixtures';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
console.warn('preview-sponsor-order-form: TLS certificate verification disabled for local preview image fetching');

/**
 * Generates one local sponsor order form PDF for developer preview.
 */
async function main(): Promise<void> {
  const payload = buildSponsorOrderFormPayload(
    SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
    SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
    {
      locale: 'en',
      issueDate: '2026-03-13',
      documentNumber: 'OF-2026-001',
      vatRate: 0.2,
      legalNotes: ['Payment due upon receipt.', 'This document is generated from development fixture data.'],
    }
  );
  const buffer = await renderSponsorDocumentPdf(payload);
  const outputDirectory = path.join(process.cwd(), 'tmp', 'generated-documents');
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'sponsor-order-form-preview.pdf'), buffer);
}

void main();
