import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import { HttpError } from '../conference/common';
import { resolveCurrentConference } from '../conference/current-conference';
import { Conference } from '../../../shared/src/model/conference.model';
import { Sponsor, SponsorType } from '../../../shared/src/model/sponsor.model';

const OPERATION = 'listPublicSponsors';

/**
 * Public sponsor payload exposed by `GET /api/sponsors`.
 */
export interface PublicSponsorDto {
  /** Public sponsor name. */
  name: string;
  /** Display name of the sponsor level configured on the conference. */
  sponsorTypeName: string;
  /** Sponsor registration date, when available. */
  registrationDate?: string;
  /** Public localized sponsor description. */
  description: {
    en: string;
    fr: string;
  };
  /** Public localized sponsor website URLs. */
  website: {
    en: string;
    fr: string;
  };
  /** Public logo URL. */
  logo: string;
  /** Assigned booth name, when available. */
  boothName?: string;
}

/**
 * Lists confirmed sponsors for the current conference through a public HTTP endpoint.
 */
export const listPublicSponsors = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  const startedAt = Date.now();
  try {
    ensureGetMethod(req.method);
    const db = admin.firestore();
    const currentConference = await resolveCurrentConference(db);
    const sponsors = await loadConfirmedSponsors(db, currentConference.conferenceId);
    const payload = buildPublicSponsorsPayload(
      currentConference.conferenceData,
      sponsors,
      currentConference.conferenceId
    );
    logger.info('public sponsors listed', {
      conferenceId: currentConference.conferenceId,
      count: payload.length,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(200).send(payload);
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('public sponsors list failed', {
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({ error: 'Public sponsors list failed' });
  }
});

/**
 * Ensures an HTTP request uses GET.
 *
 * @param method HTTP method.
 * @throws HttpError when method is invalid.
 */
export function ensureGetMethod(method: string): void {
  if (method !== 'GET') {
    throw new HttpError(
      405,
      'Method Not Allowed, use GET',
      `${OPERATION} rejected: invalid method`,
      { method }
    );
  }
}

/**
 * Builds the public sponsors response from persisted sponsor data.
 *
 * @param conference Current conference payload.
 * @param sponsors Sponsors to filter, sort, and expose.
 * @param conferenceId Current conference identifier used for filtering and logs.
 * @returns Public sponsor DTOs.
 */
export function buildPublicSponsorsPayload(
  conference: Conference,
  sponsors: Sponsor[],
  conferenceId: string
): PublicSponsorDto[] {
  const sponsorTypes = conference.sponsoring?.sponsorTypes ?? [];
  const sponsorTypeById = new Map(sponsorTypes.map((sponsorType) => [sponsorType.id, sponsorType]));
  const sponsorTypeOrderById = new Map(sponsorTypes.map((sponsorType, index) => [sponsorType.id, index]));

  return sponsors
    .filter((sponsor) =>
      String(sponsor.conferenceId ?? '').trim() === conferenceId
      && sponsor.status === 'CONFIRMED'
    )
    .sort((left, right) => comparePublicSponsors(left, right, sponsorTypeOrderById))
    .map((sponsor) => toPublicSponsorDto(sponsor, sponsorTypeById.get(sponsor.sponsorTypeId), conferenceId));
}

/**
 * Maps one persisted sponsor to its public DTO.
 *
 * @param sponsor Persisted sponsor.
 * @param sponsorType Matching conference sponsor type, if configured.
 * @param conferenceId Current conference identifier used for operational logs.
 * @returns Public sponsor DTO.
 */
export function toPublicSponsorDto(
  sponsor: Sponsor,
  sponsorType: SponsorType | undefined,
  conferenceId: string
): PublicSponsorDto {
  if (!sponsorType) {
    logger.warn('public sponsor type not found', {
      conferenceId,
      sponsorId: sponsor.id,
      sponsorTypeId: sponsor.sponsorTypeId,
    });
  }

  const registrationDate = cleanOptionalString(sponsor.registrationDate);
  const boothName = cleanOptionalString(sponsor.boothName);
  return removeUndefinedProperties({
    name: String(sponsor.name ?? ''),
    sponsorTypeName: String(sponsorType?.name ?? ''),
    registrationDate,
    description: {
      en: String(sponsor.description?.en ?? ''),
      fr: String(sponsor.description?.fr ?? ''),
    },
    website: {
      en: String(sponsor.website?.en ?? ''),
      fr: String(sponsor.website?.fr ?? ''),
    },
    logo: String(sponsor.logo ?? ''),
    boothName,
  });
}

/**
 * Loads confirmed sponsors for one conference from Firestore.
 *
 * @param db Firestore handle.
 * @param conferenceId Conference identifier.
 * @returns Confirmed sponsor documents with their document ids.
 */
async function loadConfirmedSponsors(
  db: admin.firestore.Firestore,
  conferenceId: string
): Promise<Sponsor[]> {
  const snap = await db
    .collection(FIRESTORE_COLLECTIONS.SPONSOR)
    .where('conferenceId', '==', conferenceId)
    .where('status', '==', 'CONFIRMED')
    .get();

  return snap.docs.map((doc) => ({
    ...(doc.data() as Sponsor),
    id: doc.id,
  }));
}

/**
 * Compares sponsors according to the public response ordering contract.
 *
 * @param left First sponsor.
 * @param right Second sponsor.
 * @param sponsorTypeOrderById Sponsor type order lookup.
 * @returns Sort comparison result.
 */
function comparePublicSponsors(
  left: Sponsor,
  right: Sponsor,
  sponsorTypeOrderById: Map<string, number>
): number {
  const fallbackOrder = Number.MAX_SAFE_INTEGER;
  const leftTypeOrder = sponsorTypeOrderById.get(left.sponsorTypeId) ?? fallbackOrder;
  const rightTypeOrder = sponsorTypeOrderById.get(right.sponsorTypeId) ?? fallbackOrder;
  if (leftTypeOrder !== rightTypeOrder) {
    return leftTypeOrder - rightTypeOrder;
  }

  const registrationDiff = String(left.registrationDate ?? '').localeCompare(String(right.registrationDate ?? ''));
  if (registrationDiff !== 0) {
    return registrationDiff;
  }

  return String(left.name ?? '').localeCompare(String(right.name ?? ''));
}

/**
 * Normalizes a string value that should be omitted when blank.
 *
 * @param value Raw string-like value.
 * @returns Trimmed string or undefined.
 */
function cleanOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

/**
 * Removes top-level undefined fields from one object.
 *
 * @param value Object to sanitize.
 * @returns Object without undefined fields.
 */
function removeUndefinedProperties<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
