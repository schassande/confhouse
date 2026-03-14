import {
  LocalizedTextMap,
  SponsorDocumentBuildOptions,
  SponsorDocumentConferenceSource,
  SponsorDocumentLineItem,
  SponsorDocumentLocale,
  SponsorDocumentPayload,
  SponsorDocumentSponsorSource,
  SponsorDocumentSponsorTypeSource,
} from './sponsor-document-model';

/**
 * Resolves one localized text with locale fallback.
 *
 * @param values Localized text map.
 * @param locale Requested locale.
 * @returns Localized string or an empty string.
 */
function getLocalizedText(values: LocalizedTextMap | undefined, locale: SponsorDocumentLocale): string {
  if (!values) {
    return '';
  }
  return String(
    values[locale]
      ?? values[locale.toUpperCase()]
      ?? values.en
      ?? values.EN
      ?? values.fr
      ?? values.FR
      ?? ''
  ).trim();
}

/**
 * Ensures the conference contains the issuer information required by generated documents.
 *
 * @param conference Conference source data.
 * @returns Normalized issuer information.
 * @throws Error When one required issuer field is missing.
 */
function extractIssuer(conference: SponsorDocumentConferenceSource) {
  const legalEntity = String(conference.sponsoring?.legalEntity ?? '').trim();
  const address = String(conference.sponsoring?.address ?? '').trim();
  const email = String(conference.sponsoring?.email ?? '').trim();
  const vat = String(conference.sponsoring?.vat ?? '').trim();
  const entityId = String(conference.sponsoring?.entityId ?? '').trim();

  if (!legalEntity || !address || !email) {
    throw new Error('Missing issuer data in Conference.sponsoring: legalEntity, address, and email are required');
  }

  return {
    legalEntity,
    address,
    email,
    vat: vat || undefined,
    entityId: entityId || undefined,
  };
}

/**
 * Resolves the sponsor type referenced by one sponsor.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Matching sponsor type.
 * @throws Error When the sponsor type cannot be found.
 */
function getSponsorType(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentSponsorTypeSource {
  const sponsorTypeId = String(sponsor.sponsorTypeId ?? '').trim();
  const sponsorType = (conference.sponsoring?.sponsorTypes ?? []).find((item) => item.id === sponsorTypeId);
  if (!sponsorType) {
    throw new Error(`Sponsor type not found for sponsorTypeId=${sponsorTypeId}`);
  }
  return sponsorType;
}

/**
 * Builds the initial single sponsorship line item from the current sponsor type price.
 *
 * @param sponsorType Sponsor type source data.
 * @param locale Requested locale.
 * @returns One normalized line item.
 */
function buildBaseLineItem(
  sponsorType: SponsorDocumentSponsorTypeSource,
  locale: SponsorDocumentLocale
): SponsorDocumentLineItem {
  const localizedDescription = getLocalizedText(sponsorType.description, locale);
  return {
    label: sponsorType.name,
    description: localizedDescription || undefined,
    quantity: 1,
    unitPrice: Number(sponsorType.price ?? 0),
    totalPrice: Number(sponsorType.price ?? 0),
  };
}

/**
 * Computes totals from line items and VAT rate.
 *
 * @param lineItems Document line items.
 * @param vatRate VAT rate expressed as a ratio, for example `0.2`.
 * @returns Normalized totals.
 */
function computeTotals(lineItems: SponsorDocumentLineItem[], vatRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.totalPrice ?? 0), 0);
  const vatAmount = subtotal * vatRate;
  return {
    subtotal,
    vatRate,
    vatAmount,
    total: subtotal + vatAmount,
  };
}

/**
 * Builds the common payload shared by sponsor accounting documents.
 *
 * @param documentType Document type to build.
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @param options Build options.
 * @returns Normalized sponsor document payload.
 */
function buildBaseSponsorDocumentPayload(
  documentType: 'ORDER_FORM' | 'INVOICE',
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource,
  options: SponsorDocumentBuildOptions
): SponsorDocumentPayload {
  const sponsorType = getSponsorType(conference, sponsor);
  const issuer = extractIssuer(conference);
  const lineItems = [buildBaseLineItem(sponsorType, options.locale)];
  const vatRate = Number(options.vatRate ?? 0);

  return {
    documentType,
    locale: options.locale,
    conferenceName: String(conference.name ?? '').trim(),
    conferenceEdition: conference.edition,
    sponsorName: String(sponsor.name ?? '').trim(),
    sponsorTypeName: sponsorType.name,
    issuer,
    recipient: {
      name: String(sponsor.name ?? '').trim(),
      email: Array.isArray(sponsor.adminEmails) ? String(sponsor.adminEmails[0] ?? '').trim() || undefined : undefined,
    },
    lineItems,
    totals: computeTotals(lineItems, vatRate),
    issueDate: options.issueDate,
    dueDate: options.dueDate,
    documentNumber: options.documentNumber,
    currency: 'EUR',
    legalNotes: options.legalNotes ?? [],
  };
}

/**
 * Builds the normalized payload for a sponsor order form document.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @param options Build options.
 * @returns Order form payload.
 */
export function buildSponsorOrderFormPayload(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource,
  options: SponsorDocumentBuildOptions
): SponsorDocumentPayload {
  return buildBaseSponsorDocumentPayload('ORDER_FORM', conference, sponsor, options);
}

/**
 * Builds the normalized payload for a sponsor invoice document.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @param options Build options.
 * @returns Invoice payload.
 */
export function buildSponsorInvoicePayload(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource,
  options: SponsorDocumentBuildOptions
): SponsorDocumentPayload {
  return buildBaseSponsorDocumentPayload('INVOICE', conference, sponsor, options);
}
