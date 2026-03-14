import * as fs from 'node:fs';
import * as path from 'node:path';
import PdfPrinter from 'pdfmake/js/Printer';
import URLResolver from 'pdfmake/js/URLResolver';
import { SponsorDocumentLocale, SponsorDocumentPayload } from './sponsor-document-model';

/**
 * Runtime labels used by generated sponsor documents.
 */
interface SponsorDocumentLabels {
  documentType: Record<SponsorDocumentPayload['documentType'], string>;
  issuer: string;
  recipient: string;
  issueDate: string;
  dueDate: string;
  documentNumber: string;
  lineItem: string;
  quantity: string;
  unitPrice: string;
  total: string;
  subtotal: string;
  vat: string;
  grandTotal: string;
  conference: string;
  sponsorType: string;
  notes: string;
}

const DOCUMENT_LABELS: Record<SponsorDocumentLocale, SponsorDocumentLabels> = {
  en: {
    documentType: {
      ORDER_FORM: 'Order Form',
      INVOICE: 'Invoice',
    },
    issuer: 'Issuer',
    recipient: 'Recipient',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    documentNumber: 'Document number',
    lineItem: 'Item',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    total: 'Total',
    subtotal: 'Subtotal',
    vat: 'VAT',
    grandTotal: 'Total incl. VAT',
    conference: 'Conference',
    sponsorType: 'Sponsor type',
    notes: 'Notes',
  },
  fr: {
    documentType: {
      ORDER_FORM: 'Bon de commande',
      INVOICE: 'Facture',
    },
    issuer: 'Emetteur',
    recipient: 'Destinataire',
    issueDate: "Date d'emission",
    dueDate: "Date d'echeance",
    documentNumber: 'Numero de document',
    lineItem: 'Ligne',
    quantity: 'Qte',
    unitPrice: 'Prix unitaire',
    total: 'Total',
    subtotal: 'Sous-total',
    vat: 'TVA',
    grandTotal: 'Total TTC',
    conference: 'Conference',
    sponsorType: 'Type de sponsoring',
    notes: 'Notes',
  },
};

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
 * Formats one amount in EUR for the requested locale.
 *
 * @param amount Numeric amount to format.
 * @param locale Requested locale.
 * @returns Formatted amount string.
 */
function formatAmount(amount: number, locale: SponsorDocumentLocale): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Builds the pdfmake document definition for one sponsor document payload.
 *
 * @param payload Normalized sponsor document payload.
 * @returns pdfmake document definition.
 */
function buildDocumentDefinition(payload: SponsorDocumentPayload): any {
  const labels = DOCUMENT_LABELS[payload.locale];
  const legalLines = [
    payload.issuer.vat ? `VAT: ${payload.issuer.vat}` : '',
    payload.issuer.entityId ? `ID: ${payload.issuer.entityId}` : '',
  ].filter((value) => value.length > 0);

  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
    content: [
      {
        text: labels.documentType[payload.documentType],
        fontSize: 20,
        bold: true,
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: labels.issuer, bold: true, margin: [0, 0, 0, 6] },
              { text: payload.issuer.legalEntity },
              { text: payload.issuer.address },
              { text: payload.issuer.email },
              ...legalLines.map((line) => ({ text: line })),
            ],
          },
          {
            width: '*',
            stack: [
              { text: labels.recipient, bold: true, margin: [0, 0, 0, 6] },
              { text: payload.recipient.name },
              ...(payload.recipient.email ? [{ text: payload.recipient.email }] : []),
            ],
          },
        ],
        columnGap: 24,
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: `${labels.conference}: ${payload.conferenceName}`, margin: [0, 0, 0, 4] },
              { text: `${labels.sponsorType}: ${payload.sponsorTypeName}` },
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: `${labels.issueDate}: ${payload.issueDate}`, alignment: 'right', margin: [0, 0, 0, 4] },
              ...(payload.dueDate
                ? [{ text: `${labels.dueDate}: ${payload.dueDate}`, alignment: 'right', margin: [0, 0, 0, 4] }]
                : []),
              ...(payload.documentNumber
                ? [{ text: `${labels.documentNumber}: ${payload.documentNumber}`, alignment: 'right' }]
                : []),
            ],
          },
        ],
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 50, 90, 90],
          body: [
            [
              { text: labels.lineItem, bold: true },
              { text: labels.quantity, bold: true, alignment: 'right' },
              { text: labels.unitPrice, bold: true, alignment: 'right' },
              { text: labels.total, bold: true, alignment: 'right' },
            ],
            ...payload.lineItems.map((item) => [
              {
                stack: [
                  { text: item.label },
                  ...(item.description ? [{ text: item.description, italics: true, color: '#555555' }] : []),
                ],
              },
              { text: String(item.quantity), alignment: 'right' },
              { text: formatAmount(item.unitPrice, payload.locale), alignment: 'right' },
              { text: formatAmount(item.totalPrice, payload.locale), alignment: 'right' },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            table: {
              widths: ['*', 90],
              body: [
                [
                  { text: labels.subtotal },
                  { text: formatAmount(payload.totals.subtotal, payload.locale), alignment: 'right' },
                ],
                [
                  { text: `${labels.vat} (${Math.round(payload.totals.vatRate * 100)}%)` },
                  { text: formatAmount(payload.totals.vatAmount, payload.locale), alignment: 'right' },
                ],
                [
                  { text: labels.grandTotal, bold: true },
                  { text: formatAmount(payload.totals.total, payload.locale), alignment: 'right', bold: true },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
        margin: [0, 0, 0, 20],
      },
      ...(payload.legalNotes.length > 0
        ? [
          { text: labels.notes, bold: true, margin: [0, 0, 0, 6] },
          ...payload.legalNotes.map((note) => ({ text: `- ${note}`, margin: [0, 0, 0, 4] })),
        ]
        : []),
    ],
  };
}

/**
 * Renders one sponsor document payload into a PDF buffer.
 *
 * @param payload Normalized sponsor document payload.
 * @returns Generated PDF buffer.
 */
export async function renderSponsorDocumentPdf(payload: SponsorDocumentPayload): Promise<Buffer> {
  const documentDefinition = buildDocumentDefinition(payload);
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
