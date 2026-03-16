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
  ['en', 'fr'].forEach(async (locale) => {
    const payload = buildSponsorOrderFormPayload(
      SAMPLE_SPONSOR_DOCUMENT_CONFERENCE,
      { ...SAMPLE_SPONSOR_DOCUMENT_SPONSOR, communicationLanguage: locale as 'en' | 'fr' }
    );
    const buffer = await renderSponsorDocumentPdf(payload);
    const outputDirectory = path.join(process.cwd(), 'tmp', 'generated-documents');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(path.join(outputDirectory, `sponsor-order-form-preview-${locale}-${timestamp}.pdf`), buffer);
    console.log(`Preview sponsor order form PDF generated at: ${outputDirectory}`);
  });
}

void main();
