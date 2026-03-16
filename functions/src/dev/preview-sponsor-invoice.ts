import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildSponsorInvoicePayload } from '../documents/sponsor-document-builders';
import { renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import {
  SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
  SAMPLE_SPONSOR_DOCUMENT_SPONSOR,
} from './fixtures/sponsor-document-fixtures';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// console.warn('preview-sponsor-invoice: TLS certificate verification disabled for local preview image fetching');

/**
 * Generates one local sponsor invoice PDF for developer preview.
 */
async function main(): Promise<void> {
  ['en', 'fr'].forEach(async (locale) => {
    const payload = buildSponsorInvoicePayload(
      SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
      { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: locale as 'en' | 'fr' }
    );
    payload.conferenceLogo = SAMPLE_SPONSOR_DOCUMENT_CONFERENCE.logo;
    const buffer = await renderSponsorDocumentPdf(payload);
    const outputDirectory = path.join(process.cwd(), 'tmp', 'generated-documents');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDirectory, `sponsor-invoice-preview-${locale}-${timestamp}.pdf`);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, buffer);
    console.log(`Preview sponsor invoice PDF generated at: ${outputPath}`);
  });
}

void main();
