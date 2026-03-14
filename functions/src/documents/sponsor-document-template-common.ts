import { SponsorDocumentLocale, SponsorDocumentPayload } from './sponsor-document-model';

/**
 * Runtime labels used by generated sponsor documents.
 */
export interface SponsorDocumentLabels {
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

export const DOCUMENT_LABELS: Record<SponsorDocumentLocale, SponsorDocumentLabels> = {
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

/**
 * Formats one amount in EUR for the requested locale.
 *
 * @param amount Numeric amount to format.
 * @param locale Requested locale.
 * @returns Formatted amount string.
 */
export function formatAmount(amount: number, locale: SponsorDocumentLocale): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}
