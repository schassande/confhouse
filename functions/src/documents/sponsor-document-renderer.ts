import * as fs from 'node:fs';
import * as path from 'node:path';
import PdfPrinter from 'pdfmake/js/Printer';
import URLResolver from 'pdfmake/js/URLResolver';
import { SponsorDocumentPayload } from './sponsor-document-model';
import { buildSponsorInvoiceDefinition } from './sponsor-invoice.template';
import { buildSponsorOrderFormDefinition } from './sponsor-order-form.template';

const ROBOTO_FONT_DIR = path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto');

const PRINTER = new PdfPrinter({
  Roboto: {
    normal: path.join(ROBOTO_FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(ROBOTO_FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(ROBOTO_FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(ROBOTO_FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
}, undefined, new URLResolver(fs));

/**
 * Builds the pdfmake document definition for one sponsor document payload.
 *
 * @param payload Normalized sponsor document payload.
 * @returns pdfmake document definition.
 */
function buildDocumentDefinition(payload: SponsorDocumentPayload): any {
  switch (payload.documentType) {
  case 'ORDER_FORM':
    return buildSponsorOrderFormDefinition(payload);
  case 'INVOICE':
  case 'INVOICE_PAID':
    return buildSponsorInvoiceDefinition(payload);
  default:
    throw new Error(`Unsupported sponsor document type: ${String(payload.documentType ?? '')}`);
  }
}

/**
 * Renders one sponsor document payload into a PDF buffer.
 *
 * @param payload Normalized sponsor document payload.
 * @returns Generated PDF buffer.
 */
export async function renderSponsorDocumentPdf(payload: SponsorDocumentPayload): Promise<Buffer> {
  const documentDefinition = await resolveDocumentDefinitionAssets(buildDocumentDefinition(payload));
  const pdfDocument = await PRINTER.createPdfKitDocument(documentDefinition);

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDocument.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
    pdfDocument.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDocument.on('error', reject);
    pdfDocument.end();
  });
}

/**
 * Returns the internal document definition used for rendering.
 * This helper exists for developer preview and structural tests.
 *
 * @param payload Normalized sponsor document payload.
 * @returns pdfmake document definition.
 */
export function getSponsorDocumentDefinition(payload: SponsorDocumentPayload): any {
  return buildDocumentDefinition(payload);
}

/**
 * Resolves remote image URLs in a pdfmake document definition to data URLs.
 *
 * @param value Raw document definition value.
 * @returns Asset-resolved document definition.
 */
async function resolveDocumentDefinitionAssets<T>(value: T): Promise<T> {
  if (Array.isArray(value)) {
    return await Promise.all(value.map(async (item) => await resolveDocumentDefinitionAssets(item))) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const imageUrl = typeof (value as Record<string, unknown>).image === 'string'
    ? String((value as Record<string, unknown>).image ?? '').trim()
    : '';
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return await resolveRemoteImageNode(value as Record<string, unknown>) as T;
  }

  const entries = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, entryValue]) =>
    [key, await resolveDocumentDefinitionAssets(entryValue)] as const
  ));

  return Object.fromEntries(entries) as T;
}

/**
 * Resolves one remote image node to a pdfmake-compatible image or svg node.
 *
 * @param node Raw node containing a remote `image` URL.
 * @returns Node compatible with pdfmake rendering.
 */
async function resolveRemoteImageNode(node: Record<string, unknown>): Promise<Record<string, unknown>> {
  const imageUrl = String(node.image ?? '').trim();
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch remote image: ${imageUrl} (${response.status})`);
  }

  /**
   * Content type.
   * @param response.headers.get('content-type') || 'image/png' Response.headers.get('content-type') || 'image/png'.
   * @returns Computed result.
   */
  const contentType = (response.headers.get('content-type') || 'image/png').toLowerCase();
  if (contentType.includes('image/svg+xml')) {
    const svgMarkup = await response.text();
    const { image, fit, ...rest } = node;
    const width = Array.isArray(fit) && typeof fit[0] === 'number' ? fit[0] : undefined;
    return {
      ...rest,
      svg: svgMarkup,
      ...(width ? { width } : {}),
    };
  }

  if (!contentType.startsWith('image/')) {
    throw new Error(`Remote asset is not an image: ${imageUrl} (${contentType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ...node,
    image: `data:${contentType};base64,${buffer.toString('base64')}`,
  };
}
