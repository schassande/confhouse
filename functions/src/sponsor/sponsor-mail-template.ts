import type { SponsorTypeTemplateEmail } from '../../../shared/src/model/sponsor.model';
import type { MailRecipient } from '../mail/mail-model';
import type { SponsorDocumentLocale, SponsorDocumentPayload } from '../documents/sponsor-document-model';
import {
  buildSponsorAccountingDocumentNumber,
  formatSponsorAcceptedNumber,
  resolveSponsorCommunicationLanguage,
} from './sponsor-communication';

/**
 * Sponsor mail message types that can be backed by configured templates.
 */
export type SponsorTemplateMessageType =
  | 'SPONSOR_ORDER_FORM'
  | 'SPONSOR_INVOICE'
  | 'SPONSOR_PAID_INVOICE'
  | 'SPONSOR_PAYMENT_REMINDER'
  | 'SPONSOR_APPLICATION_CONFIRMATION';

interface SponsorMailTemplateSponsorTypeSource {
  id: string;
  name: string;
  price: number;
  templateEmail?: SponsorTypeTemplateEmail;
}

/**
 * Minimal conference shape required by sponsor mail template helpers.
 */
export interface SponsorMailTemplateConferenceSource {
  name?: string;
  edition?: number;
  logo?: string;
  languages?: string[];
  sponsoring?: {
    email?: string;
    legalEntity?: string;
    address?: string;
    entityId?: string;
    vatRate?: number;
    bankDetails?: {
      iban?: string;
      bic?: string;
    };
    counter?: number;
    ccEmail?: string;
    sponsorTypes?: SponsorMailTemplateSponsorTypeSource[];
  };
}

/**
 * Minimal sponsor shape required by sponsor mail template helpers.
 */
export interface SponsorMailTemplateSponsorSource {
  name?: string;
  sponsorTypeId?: string;
  adminEmails?: string[];
  communicationLanguage?: SponsorDocumentLocale;
  purchaseOrder?: string;
  acceptedNumber?: number;
  status?: string;
  paymentStatus?: string;
  boothName?: string;
  invoiceDueDate?: string;
}

/**
 * Sender block exposed to template variables.
 */
export interface SponsorMailTemplateSender {
  email: string;
  name?: string;
}

/**
 * Input used to build provider-agnostic sponsor template variables.
 */
export interface BuildSponsorMailVariablesOptions {
  messageType: SponsorTemplateMessageType;
  conference: SponsorMailTemplateConferenceSource;
  sponsor: SponsorMailTemplateSponsorSource;
  recipients: { to: MailRecipient[]; cc: MailRecipient[] };
  sender: SponsorMailTemplateSender;
  documentPayload?: SponsorDocumentPayload;
}

/**
 * Resolves the sponsor type referenced by the current sponsor.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Matching sponsor type when found.
 */
export function findSponsorMailTemplateSponsorType(
  conference: SponsorMailTemplateConferenceSource,
  sponsor: SponsorMailTemplateSponsorSource
): SponsorMailTemplateSponsorTypeSource | undefined {
  const sponsorTypeId = String(sponsor.sponsorTypeId ?? '').trim();
  if (!sponsorTypeId) {
    return undefined;
  }

  return (conference.sponsoring?.sponsorTypes ?? []).find((sponsorType) => sponsorType.id === sponsorTypeId);
}

/**
 * Resolves the raw template identifier configured for one sponsor email type.
 *
 * @param messageType Sponsor email message type.
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Raw configured template identifier or `undefined`.
 */
export function resolveSponsorMailTemplateId(
  messageType: SponsorTemplateMessageType,
  conference: SponsorMailTemplateConferenceSource,
  sponsor: SponsorMailTemplateSponsorSource
): string | undefined {
  const templateEmail = findSponsorMailTemplateSponsorType(conference, sponsor)?.templateEmail;
  if (!templateEmail) {
    return undefined;
  }

  const templateId = messageType === 'SPONSOR_APPLICATION_CONFIRMATION'
    ? templateEmail.emailApplicationConfirmationTemplateId
    : messageType === 'SPONSOR_ORDER_FORM'
      ? templateEmail.emailOrderFormTemplateId
      : messageType === 'SPONSOR_INVOICE'
        ? templateEmail.emailInvoiceTemplateId
        : messageType === 'SPONSOR_PAYMENT_REMINDER'
          ? templateEmail.emailPaymentReminderTemplateId
          : templateEmail.emailPaidInvoiceTemplateId;

  const normalized = String(templateId ?? '').trim();
  return normalized || undefined;
}

/**
 * Converts a raw provider-agnostic template identifier to the numeric Mailjet identifier.
 *
 * @param templateId Raw configured template identifier.
 * @returns Numeric Mailjet template identifier or `undefined` when not usable.
 */
export function parseMailjetTemplateId(templateId: string | undefined): number | undefined {
  const normalized = String(templateId ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Builds the variable bag sent alongside one sponsor email template.
 *
 * @param options Sponsor mail variable inputs.
 * @returns Provider-agnostic template variables.
 */
export function buildSponsorMailVariables(options: BuildSponsorMailVariablesOptions): Record<string, unknown> {
  const sponsorType = findSponsorMailTemplateSponsorType(options.conference, options.sponsor);
  const locale = resolveSponsorCommunicationLanguage(options.sponsor, options.conference);
  const sponsorTypePrice = Number(sponsorType?.price ?? 0);
  const vatRate = Number(options.conference.sponsoring?.vatRate ?? 0);
  const subtotal = options.documentPayload?.totals.subtotal ?? sponsorTypePrice;
  const vatAmount = options.documentPayload?.totals.vatAmount ?? (subtotal * vatRate);
  const totalAmount = options.documentPayload?.totals.total ?? (subtotal + vatAmount);

  return removeUndefinedValues({
    conferenceName: String(options.conference.name ?? '').trim() || undefined,
    conferenceEdition: Number.isFinite(Number(options.conference.edition)) ? Number(options.conference.edition) : undefined,
    conferenceLogo: String(options.conference.logo ?? '').trim() || undefined,
    sponsorName: String(options.sponsor.name ?? '').trim() || undefined,
    sponsorTypeName: String(options.documentPayload?.sponsorTypeName ?? sponsorType?.name ?? '').trim() || undefined,
    communicationLanguage: locale,
    recipientEmail: options.recipients.to[0]?.email,
    senderEmail: options.sender.email,
    senderName: String(options.sender.name ?? '').trim() || undefined,
    currentYear: new Date().getUTCFullYear(),
    acceptedNumber: formatSponsorAcceptedNumber(options.sponsor.acceptedNumber),
    status: String(options.sponsor.status ?? '').trim() || undefined,
    paymentStatus: String(options.sponsor.paymentStatus ?? '').trim() || undefined,
    boothName: String(options.sponsor.boothName ?? '').trim() || undefined,
    adminEmails: options.recipients.to.map((recipient) => recipient.email),
    documentNumber: String(
      options.documentPayload?.documentNumber
      ?? buildSponsorAccountingDocumentNumber(options.conference, options.sponsor)
      ?? ''
    ).trim() || undefined,
    issueDate: String(options.documentPayload?.issueDate ?? '').trim() || undefined,
    dueDate: String(options.documentPayload?.dueDate ?? options.sponsor.invoiceDueDate ?? '').trim() || undefined,
    purchaseOrder: String(
      options.documentPayload?.recipient.purchaseOrder
      ?? options.sponsor.purchaseOrder
      ?? ''
    ).trim() || undefined,
    price: options.documentPayload?.lineItems[0]?.unitPrice ?? sponsorTypePrice,
    vatRate,
    vatAmount,
    totalAmount,
    currency: options.documentPayload?.currency ?? 'EUR',
    legalEntity: String(options.documentPayload?.issuer.legalEntity ?? options.conference.sponsoring?.legalEntity ?? '').trim() || undefined,
    legalEntityAddress: String(options.documentPayload?.issuer.address ?? options.conference.sponsoring?.address ?? '').trim() || undefined,
    legalEntityId: String(options.documentPayload?.issuer.entityId ?? options.conference.sponsoring?.entityId ?? '').trim() || undefined,
    iban: String(options.documentPayload?.bankDetails?.iban ?? options.conference.sponsoring?.bankDetails?.iban ?? '').trim() || undefined,
    bic: String(options.documentPayload?.bankDetails?.bic ?? options.conference.sponsoring?.bankDetails?.bic ?? '').trim() || undefined,
    lineItems: options.documentPayload?.lineItems.map((lineItem) => ({
      label: lineItem.label,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitPrice: lineItem.unitPrice,
      totalPrice: lineItem.totalPrice,
    })),
    legalNotes: options.documentPayload?.legalNotes,
    messageType: options.messageType,
  });
}

/**
 * Removes undefined values recursively from one object tree used for template variables.
 *
 * @param value Raw variable payload.
 * @returns Variable payload without undefined values.
 */
function removeUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedValues(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entryValue]) => [key, removeUndefinedValues(entryValue)] as const)
        .filter(([, entryValue]) => entryValue !== undefined)
    ) as T;
  }

  return value;
}
