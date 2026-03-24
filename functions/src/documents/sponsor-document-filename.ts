import { SponsorDocumentPayload } from './sponsor-document-model';
import { DOCUMENT_LABELS } from './sponsor-document-template-common';

const INVALID_FILENAME_CHARACTERS_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
const MULTIPLE_SPACES_PATTERN = /\s+/g;

/**
 * Builds the visible PDF filename for one sponsor document using business labels.
 *
 * @param payload Normalized sponsor document payload.
 * @returns Localized PDF filename safe for download and email attachment usage.
 */
export function buildSponsorDocumentFilename(payload: SponsorDocumentPayload): string {
  const conferenceSegment = [payload.conferenceName, payload.conferenceEdition]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
    .join(' ');
  const sponsorSegment = ['Sponsor', payload.sponsorName]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
    .join(' ');
  const documentTypeSegment = DOCUMENT_LABELS[payload.locale].documentType[payload.documentType];

  return [
    sanitizeFilenameSegment(conferenceSegment),
    sanitizeFilenameSegment(sponsorSegment),
    sanitizeFilenameSegment(documentTypeSegment),
  ]
    .filter((segment) => segment.length > 0)
    .join(' - ')
    .concat('.pdf');
}

/**
 * Removes invalid filename characters while preserving a readable label.
 *
 * @param value Raw filename segment.
 * @returns Sanitized filename segment.
 */
function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(INVALID_FILENAME_CHARACTERS_PATTERN, ' ')
    .replace(MULTIPLE_SPACES_PATTERN, ' ')
    .trim();
}
