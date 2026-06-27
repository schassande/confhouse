import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import { Conference } from '../../../shared/src/model/conference.model';
import {
  buildDefaultPlatformConfig,
  PlatformConfig,
  PLATFORM_CONFIG_DOC_ID,
} from '../../../shared/src/model/platform-config.model';
import { HttpError, loadConference } from './common';

const OPERATION = 'resolveCurrentConference';

/**
 * Loaded current conference context.
 */
export interface CurrentConferenceContext {
  /** Current conference identifier. */
  conferenceId: string;
  /** Current conference persisted payload. */
  conferenceData: Conference;
}

/**
 * Resolves the conference used by public current-conference endpoints.
 *
 * @param db Firestore handle.
 * @returns Current conference context.
 * @throws HttpError when no current conference can be resolved.
 */
export async function resolveCurrentConference(
  db: admin.firestore.Firestore
): Promise<CurrentConferenceContext> {
  const config = await loadPlatformConfig(db);
  const configuredConferenceId = config.onlyPlatformAdminCanCreateConference
    ? String(config.singleConferenceId ?? '').trim()
    : '';

  if (configuredConferenceId) {
    const { conferenceData } = await loadConference(db, configuredConferenceId, OPERATION);
    return {
      conferenceId: configuredConferenceId,
      conferenceData: conferenceData as Conference,
    };
  }

  return await resolveLatestVisibleConference(db);
}

/**
 * Loads platform configuration with default values for missing fields.
 *
 * @param db Firestore handle.
 * @returns Platform configuration.
 */
async function loadPlatformConfig(db: admin.firestore.Firestore): Promise<PlatformConfig> {
  const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_CONFIG).doc(PLATFORM_CONFIG_DOC_ID).get();
  if (!snap.exists) {
    return buildDefaultPlatformConfig();
  }
  return {
    ...buildDefaultPlatformConfig(),
    ...(snap.data() as Partial<PlatformConfig>),
    id: PLATFORM_CONFIG_DOC_ID,
  };
}

/**
 * Resolves the latest visible conference when no explicit current conference is configured.
 *
 * @param db Firestore handle.
 * @returns Current conference context.
 * @throws HttpError when no visible conference exists.
 */
async function resolveLatestVisibleConference(
  db: admin.firestore.Firestore
): Promise<CurrentConferenceContext> {
  const snap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).where('visible', '==', true).get();
  const candidates = snap.docs
    .map((doc) => ({ conferenceId: doc.id, conferenceData: doc.data() as Conference }))
    .sort((a, b) => {
      const editionDiff = Number(b.conferenceData.edition ?? 0) - Number(a.conferenceData.edition ?? 0);
      if (editionDiff !== 0) {
        return editionDiff;
      }
      return String(a.conferenceData.name ?? '').localeCompare(String(b.conferenceData.name ?? ''));
    });

  const current = candidates[0];
  if (!current) {
    throw new HttpError(
      404,
      'Current conference not found',
      `${OPERATION} rejected: no visible conference found`
    );
  }

  return current;
}
