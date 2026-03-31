import { SponsorDocumentLocale } from '../documents/sponsor-document-model';

/**
 * Minimal conference shape required by sponsor communication helpers.
 */
export interface SponsorConferenceCommunicationSource {
  edition?: number;
  languages?: string[];
  sponsoring?: {
    counter?: number;
    ccEmail?: string;
  };
}

/**
 * Minimal sponsor shape required by sponsor communication helpers.
 */
export interface SponsorCommunicationSource {
  name?: string;
  adminEmails?: string[];
  communicationLanguage?: SponsorDocumentLocale;
  acceptedNumber?: number;
}

/**
 * Returns the supported locale to use for sponsor emails and documents.
 *
 * @param sponsor Sponsor source data.
 * @param conference Conference source data.
 * @returns Supported locale.
 */
export function resolveSponsorCommunicationLanguage(
  sponsor: SponsorCommunicationSource,
  conference?: SponsorConferenceCommunicationSource
): SponsorDocumentLocale {
  const sponsorLocale = String(sponsor.communicationLanguage ?? '').trim().toLowerCase();
  if (sponsorLocale === 'fr' || sponsorLocale === 'en') {
    return sponsorLocale;
  }

  const conferenceLanguages = Array.isArray(conference?.languages)
    ? conference.languages.map((language) => String(language ?? '').trim().toLowerCase())
    : [];
  if (conferenceLanguages.includes('fr')) {
    return 'fr';
  }
  return 'en';
}

/**
 * Formats one accepted number using at least two digits.
 *
 * @param acceptedNumber Sponsor accepted number.
 * @returns Zero-padded accepted number.
 */
export function formatSponsorAcceptedNumber(acceptedNumber: number | undefined): string | undefined {
  if (!Number.isFinite(acceptedNumber)) {
    return undefined;
  }
  return String(Math.max(0, Math.trunc(Number(acceptedNumber)))).padStart(2, '0');
}

/**
 * Builds the sponsor accounting document number from conference edition and accepted number.
 *
 * @param conference Conference source data.
 * @param sponsor Sponsor source data.
 * @returns Computed document number when enough data is available.
 */
export function buildSponsorAccountingDocumentNumber(
  conference: SponsorConferenceCommunicationSource,
  sponsor: SponsorCommunicationSource
): string | undefined {
  const edition = Number(conference.edition);
  const formattedAcceptedNumber = formatSponsorAcceptedNumber(sponsor.acceptedNumber);
  if (!Number.isFinite(edition) || !formattedAcceptedNumber) {
    return undefined;
  }
  return `${edition}-${formattedAcceptedNumber}`;
}

/**
 * Returns the immutable next accepted number and next persisted counter value.
 *
 * @param currentCounter Current conference counter.
 * @returns Assigned sponsor number and next counter value.
 */
export function allocateNextSponsorAcceptedNumber(currentCounter: number | undefined): {
  acceptedNumber: number;
  nextCounter: number;
} {
  const safeCounter = Number.isFinite(currentCounter) ? Math.max(0, Math.trunc(Number(currentCounter))) : 0;
  const acceptedNumber = safeCounter + 1;
  return {
    acceptedNumber,
    nextCounter: acceptedNumber,
  };
}

/**
 * Builds the main and CC recipients used for sponsor communications.
 *
 * @param sponsor Sponsor source data.
 * @param conference Conference source data.
 * @returns Main recipients and optional CC recipients.
 */
export function buildSponsorCommunicationRecipients(
  sponsor: SponsorCommunicationSource,
  conference?: SponsorConferenceCommunicationSource
): {
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
} {
  const sponsorName = String(sponsor.name ?? '').trim() || undefined;
  /**
   * Converts to.
   * @param Array.isArray(sponsor.adminEmails) ? sponsor.adminEmails Array.is array(sponsor.admin emails) ? sponsor.admin emails.
   * @returns Computed result.
   */
  const to = (Array.isArray(sponsor.adminEmails) ? sponsor.adminEmails : [])
    .map((email) => String(email ?? '').trim())
    .filter((email) => email.length > 0)
    .map((email) => ({
      email,
      name: sponsorName,
    }));

  const ccEmail = String(conference?.sponsoring?.ccEmail ?? '').trim();
  const cc = ccEmail
    ? [{
      email: ccEmail,
    }]
    : [];

  return { to, cc };
}
