import {
  LocalizedTextMap,
  SponsorDocumentConferenceSource,
  SponsorDocumentLineItem,
  SponsorDocumentLocale,
  SponsorDocumentPayload,
  SponsorDocumentSponsorSource,
  SponsorDocumentSponsorTypeSource,
} from './sponsor-document-model';
import { buildSponsorAccountingDocumentNumber, resolveSponsorCommunicationLanguage } from '../sponsor/sponsor-communication';

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
 * Formats one ISO date for the target document locale.
 *
 * @param value ISO date string.
 * @param locale Requested locale.
 * @returns Localized human-readable date, or the raw value when invalid.
 */
function formatConferenceDate(value: string, locale: SponsorDocumentLocale): string {
  const trimmedValue = String(value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }

  const date = new Date(`${trimmedValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Adds one month to an ISO date while keeping a valid calendar day.
 *
 * @param value ISO date string.
 * @returns Shifted ISO date.
 */
function addOneMonth(value: string): string {
  const trimmedValue = String(value ?? '').trim();
  if (!trimmedValue) {
    return trimmedValue;
  }

  const [yearRaw, monthRaw, dayRaw] = trimmedValue.split('-').map((part) => Number(part));
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) {
    return trimmedValue;
  }

  const baseDate = new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw));
  if (Number.isNaN(baseDate.getTime())) {
    return trimmedValue;
  }

  const targetMonthIndex = baseDate.getUTCMonth() + 1;
  const targetYear = baseDate.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedTargetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedTargetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(baseDate.getUTCDate(), lastDayOfTargetMonth);
  const nextDate = new Date(Date.UTC(targetYear, normalizedTargetMonth, targetDay));
  return nextDate.toISOString().slice(0, 10);
}

/**
 * Resolves the locale used for generated sponsor documents.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Supported locale.
 */
function resolveDocumentLocale(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentLocale {
  return resolveSponsorCommunicationLanguage(sponsor, conference);
}

/**
 * Returns the first issue date for the requested document type.
 *
 * @param documentType Document type to build.
 * @param sponsor Sponsor source data.
 * @returns ISO issue date.
 */
function resolveIssueDate(
  documentType: 'ORDER_FORM' | 'INVOICE' | 'INVOICE_PAID',
  sponsor: SponsorDocumentSponsorSource
): string {
  const firstSentAt = documentType === 'ORDER_FORM'
    ? sponsor.documents?.orderFormSentAt
    : documentType === 'INVOICE'
      ? sponsor.documents?.invoiceSentAt
      : sponsor.documents?.invoicePaidSentAt;
  const firstIssuedDate = String(firstSentAt ?? '').trim().slice(0, 10);
  return firstIssuedDate || new Date().toISOString().slice(0, 10);
}

/**
 * Resolves the invoice due date from sponsor settings or default business rules.
 *
 * @param sponsor Sponsor source data.
 * @param issueDate Resolved issue date.
 * @returns ISO due date.
 */
function resolveInvoiceDueDate(sponsor: SponsorDocumentSponsorSource, issueDate: string): string {
  const configuredDueDate = String(sponsor.invoiceDueDate ?? '').trim();
  return configuredDueDate || addOneMonth(issueDate);
}

/**
 * Builds the sponsorship line item label shown in sponsor accounting documents.
 *
 * @param conference Conference source data.
 * @param sponsorType Sponsor type source data.
 * @param locale Requested locale.
 * @returns Human-readable line item label.
 */
function buildLineItemLabel(
  conference: SponsorDocumentConferenceSource,
  sponsorType: SponsorDocumentSponsorTypeSource,
  locale: SponsorDocumentLocale
): string {
  const orderedDays = [...(conference.days ?? [])]
    .filter((day) => String(day.date ?? '').trim().length > 0)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const startDate = orderedDays[0]?.date ? formatConferenceDate(orderedDays[0].date, locale) : '';
  const endDate = orderedDays.at(-1)?.date ? formatConferenceDate(orderedDays.at(-1)!.date, locale) : '';
  const conferenceEdition = conference.edition ? ` ${conference.edition}` : '';

  if (locale === 'fr') {
    return `Sponsoring ${sponsorType.name} de la conference ${String(conference.name ?? '').trim()}${conferenceEdition} du ${startDate} au ${endDate}`.trim();
  }

  return `Conference sponsorship ${sponsorType.name} for ${String(conference.name ?? '').trim()}${conferenceEdition} from ${startDate} to ${endDate}`.trim();
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
  const entityId = String(conference.sponsoring?.entityId ?? '').trim();

  if (!legalEntity || !address || !email) {
    throw new Error('Missing issuer data in Conference.sponsoring: legalEntity, address, and email are required');
  }

  return {
    legalEntity,
    address,
    email,
    entityId: entityId || undefined,
  };
}

/**
 * Resolves optional bank details configured for sponsor wire transfers.
 *
 * @param conference Conference source data.
 * @returns Normalized bank details or `undefined` when absent.
 */
function extractBankDetails(conference: SponsorDocumentConferenceSource) {
  const iban = String(conference.sponsoring?.bankDetails?.iban ?? '').trim();
  const bic = String(conference.sponsoring?.bankDetails?.bic ?? '').trim();
  if (!iban && !bic) {
    return undefined;
  }
  return {
    iban: iban || undefined,
    bic: bic || undefined,
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
  /**
   * Sponsor type.
   * @param conference.sponsoring?.sponsorTypes ?? [] Conference.sponsoring?.sponsor types ?? [].
   * @returns Computed result.
   */
  const sponsorType = (conference.sponsoring?.sponsorTypes ?? []).find((item) => item.id === sponsorTypeId);
  if (!sponsorType) {
    throw new Error(`Sponsor type not found for sponsorTypeId=${sponsorTypeId}`);
  }
  return sponsorType;
}

/**
 * Builds the initial single sponsorship line item from the current sponsor type price.
 *
 * @param conference Conference source data.
 * @param sponsorType Sponsor type source data.
 * @param locale Requested locale.
 * @returns One normalized line item.
 */
function buildBaseLineItem(
  conference: SponsorDocumentConferenceSource,
  sponsorType: SponsorDocumentSponsorTypeSource,
  locale: SponsorDocumentLocale
): SponsorDocumentLineItem {
  const localizedDescription = getLocalizedText(sponsorType.description, locale);
  return {
    label: buildLineItemLabel(conference, sponsorType, locale),
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
 * @returns Normalized sponsor document payload.
 */
function buildBaseSponsorDocumentPayload(
  documentType: 'ORDER_FORM' | 'INVOICE' | 'INVOICE_PAID',
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentPayload {
  const locale = resolveDocumentLocale(conference, sponsor);
  const sponsorType = getSponsorType(conference, sponsor);
  const issuer = extractIssuer(conference);
  const lineItems = [buildBaseLineItem(conference, sponsorType, locale)];
  const vatRate = Number(conference.sponsoring?.vatRate ?? 0);
  const issueDate = resolveIssueDate(documentType, sponsor);

  return {
    documentType,
    locale,
    conferenceName: String(conference.name ?? '').trim(),
    conferenceEdition: conference.edition,
    conferenceLogo: String(conference.logo ?? '').trim() || undefined,
    sponsorName: String(sponsor.name ?? '').trim(),
    sponsorTypeName: sponsorType.name,
    issuer,
    recipient: {
      name: String(sponsor.name ?? '').trim(),
      address: String(sponsor.address ?? '').trim() || undefined,
      email: Array.isArray(sponsor.adminEmails) ? String(sponsor.adminEmails[0] ?? '').trim() || undefined : undefined,
      purchaseOrder: String(sponsor.purchaseOrder ?? '').trim() || undefined,
    },
    lineItems,
    totals: computeTotals(lineItems, vatRate),
    issueDate,
    dueDate: documentType === 'ORDER_FORM' ? undefined : resolveInvoiceDueDate(sponsor, issueDate),
    documentNumber: buildSponsorAccountingDocumentNumber(conference, sponsor),
    currency: 'EUR',
    legalNotes: Array.isArray(conference.sponsoring?.legalNotes)
      ? conference.sponsoring!.legalNotes
          .map((note) => String(note ?? '').trim())
          .filter((note) => note.length > 0)
      : [],
    bankDetails: extractBankDetails(conference),
  };
}

/**
 * Builds the normalized payload for a sponsor order form document.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Order form payload.
 */
export function buildSponsorOrderFormPayload(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentPayload {
  return buildBaseSponsorDocumentPayload('ORDER_FORM', conference, sponsor);
}

/**
 * Builds the normalized payload for a sponsor invoice document.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Invoice payload.
 */
export function buildSponsorInvoicePayload(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentPayload {
  return buildBaseSponsorDocumentPayload('INVOICE', conference, sponsor);
}

/**
 * Builds the normalized payload for a paid sponsor invoice document.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Paid invoice payload.
 */
export function buildSponsorPaidInvoicePayload(
  conference: SponsorDocumentConferenceSource,
  sponsor: SponsorDocumentSponsorSource
): SponsorDocumentPayload {
  return buildBaseSponsorDocumentPayload('INVOICE_PAID', conference, sponsor);
}
