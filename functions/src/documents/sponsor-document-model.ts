/**
 * Supported locales for generated sponsor documents.
 */
export type SponsorDocumentLocale = 'en' | 'fr';

/**
 * Supported sponsor document types.
 */
export type SponsorDocumentType = 'ORDER_FORM' | 'INVOICE';

/**
 * Localized text map used by source business records.
 */
export interface LocalizedTextMap {
  [lang: string]: string | undefined;
}

/**
 * Minimal sponsor type source needed to build sponsor documents.
 */
export interface SponsorDocumentSponsorTypeSource {
  id: string;
  name: string;
  description?: LocalizedTextMap;
  price: number;
}

/**
 * Minimal conference source needed to build sponsor documents.
 */
export interface SponsorDocumentConferenceSource {
  name: string;
  edition?: number;
  logo: string;
  days: Day[];
  sponsoring?: {
    counter?: number;
    legalEntity?: string;
    address?: string;
    email?: string;
    ccEmail?: string;
    vat?: string;
    entityId?: string;
    bankDetails?: {
      iban?: string;
      bic?: string;
    };
    sponsorTypes?: SponsorDocumentSponsorTypeSource[];
  };
}
/** A day in the conference schedule. */
export interface Day  {
  dayIndex: number;
  date: string; // ISO 8601
}

/**
 * Minimal sponsor source needed to build sponsor documents.
 */
export interface SponsorDocumentSponsorSource {
  name: string;
  sponsorTypeId: string;
  adminEmails?: string[];
  communicationLanguage?: SponsorDocumentLocale;
  purchaseOrder?: string;
  acceptedNumber?: number;
}

/**
 * Issuer block rendered in sponsor documents.
 */
export interface SponsorDocumentIssuer {
  legalEntity: string;
  address: string;
  email: string;
  vat?: string;
  entityId?: string;
}

/**
 * Recipient block rendered in sponsor documents.
 */
export interface SponsorDocumentRecipient {
  name: string;
  email?: string;
  purchaseOrder?: string;
}

/**
 * Optional bank details rendered on generated documents when configured.
 */
export interface SponsorDocumentBankDetails {
  iban?: string;
  bic?: string;
}

/**
 * One line item rendered in sponsor accounting documents.
 */
export interface SponsorDocumentLineItem {
  label: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/**
 * Totals block rendered in sponsor documents.
 */
export interface SponsorDocumentTotals {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

/**
 * Final normalized payload used by sponsor document renderers.
 */
export interface SponsorDocumentPayload {
  documentType: SponsorDocumentType;
  locale: SponsorDocumentLocale;
  conferenceName: string;
  conferenceEdition?: number;
  conferenceLogo?: string;
  sponsorName: string;
  sponsorTypeName: string;
  issuer: SponsorDocumentIssuer;
  recipient: SponsorDocumentRecipient;
  lineItems: SponsorDocumentLineItem[];
  totals: SponsorDocumentTotals;
  issueDate: string;
  dueDate?: string;
  documentNumber?: string;
  currency: 'EUR';
  legalNotes: string[];
  bankDetails?: SponsorDocumentBankDetails;
}

/**
 * Common options accepted by sponsor document payload builders.
 */
export interface SponsorDocumentBuildOptions {
  locale: SponsorDocumentLocale;
  issueDate: string;
  dueDate?: string;
  documentNumber?: string;
  vatRate?: number;
  legalNotes?: string[];
}
