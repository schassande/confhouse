import { SponsorDocumentPayload } from './sponsor-document-model';
import { DOCUMENT_LABELS, formatAmount } from './sponsor-document-template-common';

/**
 * Builds the pdfmake template definition for one sponsor order form.
 *
 * @param payload Normalized order form payload.
 * @returns pdfmake document definition.
 */
export function buildSponsorOrderFormDefinition(payload: SponsorDocumentPayload): any {
  const labels = DOCUMENT_LABELS[payload.locale];
  const legalLines = [
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
      ...(payload.conferenceLogo
        ? [{
          image: payload.conferenceLogo,
          fit: [150, 70],
          alignment: 'center',
          margin: [0, 0, 0, 20],
        }]
        : []),
      {
        text: labels.documentType.ORDER_FORM,
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
              ...(payload.recipient.address ? [{ text: payload.recipient.address }] : []),
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
              { text: `${labels.conference}: ${payload.conferenceName} ${payload.conferenceEdition}`, margin: [0, 0, 0, 4] },
              { text: `${labels.sponsorType}: ${payload.sponsorTypeName}` },
              ...(payload.recipient.purchaseOrder
                ? [{ text: `${labels.purchaseOrder}: ${payload.recipient.purchaseOrder}`, margin: [0, 4, 0, 0] }]
                : []),
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: `${labels.issueDate}: ${payload.issueDate}`, alignment: 'right', margin: [0, 0, 0, 4] },
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
      ...(payload.bankDetails?.iban || payload.bankDetails?.bic
        ? [
          { text: labels.bankDetails, bold: true, margin: [0, 20, 0, 6] },
          ...(payload.bankDetails.iban ? [{ text: `${labels.iban}: ${payload.bankDetails.iban}` }] : []),
          ...(payload.bankDetails.bic ? [{ text: `${labels.bic}: ${payload.bankDetails.bic}` }] : []),
        ]
        : []),
    ],
  };
}
