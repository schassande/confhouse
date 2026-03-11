import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
  ensureRequesterIsOrganizer,
} from './conference-http-common';

const FIRESTORE_BATCH_SAFE_LIMIT = 450;
const PLATFORM_CONFIG_DOC_ID = 'PlatformConfig';

interface DuplicateConferenceRequest {
  /** Source conference identifier to duplicate. */
  conferenceId: string;
  /** Name of the new conference. */
  name: string;
  /** Edition number of the new conference. */
  edition: number;
  /** New conference first day in `YYYY-MM-DD` format. */
  startDate: string;
  /** Whether rooms are copied from source conference. */
  duplicateRooms: boolean;
  /** Whether tracks are copied from source conference. */
  duplicateTracks: boolean;
  /** Whether day slots and disabled rooms are copied. */
  duplicatePlanningStructure: boolean;
  /** Whether activities are duplicated to the new conference. */
  duplicateActivities: boolean;
  /** Whether sponsoring configuration is copied. */
  duplicateSponsors: boolean;
}

/**
 * Duplication result returned to caller.
 */
export interface DuplicateConferenceReport {
  /** Identifier of the newly created conference. */
  conferenceId: string;
  /** Number of activity documents created in target conference. */
  activitiesCreated: number;
  /** ISO timestamp when duplication completed. */
  createdAt: string;
}

/**
 * Internal authorization context resolved from request and source conference.
 */
interface AuthorizedContext {
  /** Source conference identifier. */
  conferenceId: string;
  /** Requester email extracted from auth token. */
  requesterEmail: string;
  /** Firestore reference to source conference document. */
  conferenceRef: admin.firestore.DocumentReference;
  /** Source conference raw data. */
  conferenceData: any;
}

/**
 * HTTP endpoint that duplicates a conference and selected related datasets.
 * Validates organizer authorization, creates the target conference, and optionally
 * clones activities with date shifting based on the new start date.
 */
export const duplicateConference = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  try {
    // Entry log: enough metadata to trace request shape without logging sensitive payload values.
    logger.info('duplicateConference request received', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body ?? {}),
    });

    const db = admin.firestore();
    const context = await authorizeRequest(req, db);
    const payload = parsePayload(req.body);
    await ensureConferenceNameEditionAvailable(db, payload.name, payload.edition);

    // Operational log: keeps track of selected duplication options.
    logger.info('duplicateConference payload parsed', {
      conferenceId: context.conferenceId,
      requesterEmail: context.requesterEmail,
      targetName: payload.name,
      targetEdition: payload.edition,
      options: {
        duplicateRooms: payload.duplicateRooms,
        duplicateTracks: payload.duplicateTracks,
        duplicatePlanningStructure: payload.duplicatePlanningStructure,
        duplicateActivities: payload.duplicateActivities,
        duplicateSponsors: payload.duplicateSponsors,
      },
    });

    if (payload.duplicatePlanningStructure && !payload.duplicateRooms) {
      throw new HttpError(
        400,
        'Planning structure requires rooms to be duplicated',
        'duplicateConference rejected: planning structure without rooms',
        { conferenceId: context.conferenceId }
      );
    }

    const source = context.conferenceData ?? {};
    const sourceDays: any[] = Array.isArray(source.days) ? source.days : [];
    const sourceDayCount = sourceDays.length;
    const sourceRoomCount = Array.isArray(source.rooms) ? source.rooms.length : 0;
    const sourceTrackCount = Array.isArray(source.tracks) ? source.tracks.length : 0;

    logger.info('duplicateConference source summary', {
      conferenceId: context.conferenceId,
      sourceDayCount,
      sourceRoomCount,
      sourceTrackCount,
      hasSponsors: !!source.sponsoring,
    });

    const newConferenceRef = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).doc();
    const newConferenceId = newConferenceRef.id;

    const normalizedStartDate = normalizeDate(payload.startDate, 'duplicateConference');
    const baseDayTemplate = sourceDays[0] ?? {};

    const newDays = buildDays({
      sourceDays,
      dayCount: sourceDayCount,
      startDate: normalizedStartDate,
      duplicatePlanningStructure: payload.duplicatePlanningStructure,
      fallbackBeginTime: baseDayTemplate.beginTime,
      fallbackEndTime: baseDayTemplate.endTime,
    });

    const newConference = {
      ...source,
      id: newConferenceId,
      lastUpdated: new Date().getTime().toString(),
      name: payload.name.trim(),
      edition: payload.edition,
      rooms: payload.duplicateRooms ? (source.rooms ?? []) : [],
      tracks: payload.duplicateTracks ? (source.tracks ?? []) : [],
      days: newDays,
      sponsoring: payload.duplicateSponsors ? source.sponsoring ?? undefined : undefined,
    };

    // First persist conference shell to make target id available for dependent collections.
    await newConferenceRef.set(sanitizeUndefined(newConference));
    logger.info('duplicateConference conference document created', {
      sourceConferenceId: context.conferenceId,
      newConferenceId,
      dayCount: newDays.length,
      roomCount: Array.isArray(newConference.rooms) ? newConference.rooms.length : 0,
      trackCount: Array.isArray(newConference.tracks) ? newConference.tracks.length : 0,
    });

    await duplicateConferenceHallConfig(db, context.conferenceId, newConferenceId);
    await duplicateVoxxrinConfig(db, context.conferenceId, newConferenceId);
    await duplicateSponsors(db, context.conferenceId, newConferenceId, payload.duplicateSponsors);
    await switchSingleConferenceIdIfNeeded(db, context.conferenceId, newConferenceId);

    let activitiesCreated = 0;
    if (payload.duplicateActivities) {
      const activitySnap = await db
        .collection(FIRESTORE_COLLECTIONS.ACTIVITY)
        .where('conferenceId', '==', context.conferenceId)
        .get();

      logger.info('duplicateConference activities lookup completed', {
        sourceConferenceId: context.conferenceId,
        activityCount: activitySnap.size,
      });

      if (!activitySnap.empty) {
        const sourceStartDate = getConferenceStartDate(sourceDays);
        const dayOffset = sourceStartDate
          ? diffDays(normalizedStartDate, sourceStartDate)
          : 0;

        logger.info('duplicateConference activities date shift computed', {
          sourceConferenceId: context.conferenceId,
          newConferenceId,
          sourceStartDate,
          targetStartDate: normalizedStartDate,
          dayOffset,
          keepSlotId: payload.duplicatePlanningStructure,
        });

        const activities = activitySnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        activitiesCreated = await createActivitiesInBatches(db, activities, {
          conferenceId: newConferenceId,
          dayOffset,
          keepSlotId: payload.duplicatePlanningStructure,
        });
      } else {
        logger.info('duplicateConference no activities to duplicate', {
          sourceConferenceId: context.conferenceId,
        });
      }
    } else {
      logger.info('duplicateConference activities duplication disabled', {
        sourceConferenceId: context.conferenceId,
      });
    }

    const report: DuplicateConferenceReport = {
      conferenceId: newConferenceId,
      activitiesCreated,
      createdAt: new Date().toISOString(),
    };

    logger.info('duplicateConference completed', {
      sourceConferenceId: context.conferenceId,
      newConferenceId,
      requesterEmail: context.requesterEmail,
      report,
    });

    res.status(200).send({ report });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('duplicateConference error', { message });
    res.status(500).send({
      error: 'Conference duplication failed',
      code: 'CONFERENCE_DUPLICATE_ERROR',
      detail: message,
    });
  }
});

/**
 * Validates the requester and ensures organizer permissions on the source conference.
 * @param req Incoming HTTP request.
 * @param db Firestore database instance.
 * @returns Authorized context with source conference metadata.
 */
async function authorizeRequest(req: any, db: admin.firestore.Firestore): Promise<AuthorizedContext> {
  ensurePostMethod(req.method, 'duplicateConference');
  const conferenceId = parseConferenceId(req.body, 'duplicateConference');
  const requesterEmail = await getRequesterEmailFromAuthorization(
    req.headers.authorization,
    conferenceId,
    'duplicateConference'
  );
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, 'duplicateConference');
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'duplicateConference');
  logger.info('duplicateConference requester authorized', {
    conferenceId,
    requesterEmail,
  });
  return { conferenceId, requesterEmail, conferenceRef, conferenceData };
}

/**
 * Parses and validates duplication payload fields from request body.
 * @param body Raw request body.
 * @returns Normalized payload for duplication.
 * @throws {HttpError} If required fields are missing or invalid.
 */
function parsePayload(body: any): DuplicateConferenceRequest {
  // Only validate fields that are user-input driven; optional switches are normalized to booleans below.
  const name = String(body?.name ?? '').trim();
  if (!name) {
    throw new HttpError(400, 'Missing conference name', 'duplicateConference rejected: missing name');
  }

  const editionValue = Number(body?.edition);
  if (!Number.isFinite(editionValue)) {
    throw new HttpError(400, 'Missing conference edition', 'duplicateConference rejected: missing edition');
  }

  const startDate = String(body?.startDate ?? '').trim();
  if (!startDate) {
    throw new HttpError(400, 'Missing conference startDate', 'duplicateConference rejected: missing startDate');
  }

  return {
    conferenceId: String(body?.conferenceId ?? '').trim(),
    name,
    edition: editionValue,
    startDate,
    duplicateRooms: Boolean(body?.duplicateRooms),
    duplicateTracks: Boolean(body?.duplicateTracks),
    duplicatePlanningStructure: Boolean(body?.duplicatePlanningStructure),
    duplicateActivities: Boolean(body?.duplicateActivities),
    duplicateSponsors: Boolean(body?.duplicateSponsors),
  };
}

/**
 * Normalizes a date input to `YYYY-MM-DD`.
 * @param value Raw date value.
 * @param operationName Operation label used in error logs.
 * @returns Date string in `YYYY-MM-DD` format.
 * @throws {HttpError} If the input does not contain a valid date prefix.
 */
function normalizeDate(value: string, operationName: string): string {
  const normalized = String(value ?? '').trim();
  // Accepts full ISO as input but only keeps YYYY-MM-DD for date-only operations.
  if (!/\d{4}-\d{2}-\d{2}/.test(normalized)) {
    throw new HttpError(
      400,
      'Invalid startDate format (expected YYYY-MM-DD)',
      `${operationName} rejected: invalid startDate format`,
      { value: normalized }
    );
  }
  return normalized.slice(0, 10);
}

/**
 * Builds target conference days from source day count and a new start date.
 * Optionally copies slots and disabled rooms depending on duplication options.
 * @param params Day generation parameters.
 * @returns Generated day array for the duplicated conference.
 * @throws {HttpError} If the start date cannot be parsed.
 */
function buildDays(params: {
  sourceDays: any[];
  dayCount: number;
  startDate: string;
  duplicatePlanningStructure: boolean;
  fallbackBeginTime?: string;
  fallbackEndTime?: string;
}): any[] {
  // Business rule: we preserve the number of conference days from source.
  const { sourceDays, dayCount, startDate, duplicatePlanningStructure, fallbackBeginTime, fallbackEndTime } = params;
  if (dayCount <= 0) {
    return [];
  }

  const baseDate = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new HttpError(400, 'Invalid startDate', 'duplicateConference rejected: invalid startDate');
  }

  const sortedDays = [...sourceDays].sort((a, b) => {
    const aIndex = Number(a?.dayIndex ?? 0);
    const bIndex = Number(b?.dayIndex ?? 0);
    return aIndex - bIndex;
  });

  const days: any[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    // Day i is shifted from requested startDate while keeping source daily time boundaries.
    const template = sortedDays[i] ?? {};
    const date = addDays(baseDate, i);
    const beginTime = String(template.beginTime ?? fallbackBeginTime ?? '09:00');
    const endTime = String(template.endTime ?? fallbackEndTime ?? '18:00');

    days.push({
      id: template.id ?? `d${i + 1}`,
      dayIndex: i,
      date: formatDate(date),
      beginTime,
      endTime,
      slots: duplicatePlanningStructure ? (template.slots ?? []) : [],
      disabledRoomIds: duplicatePlanningStructure ? (template.disabledRoomIds ?? []) : [],
    });
  }
  return days;
}

/**
 * Returns a new date shifted by a given number of calendar days.
 * @param base Base date.
 * @param days Number of days to add (can be negative).
 * @returns Shifted date instance.
 */
function addDays(base: Date, days: number): Date {
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Formats a date into `YYYY-MM-DD`.
 * @param date Date to format.
 * @returns Formatted date string.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the earliest valid day date from source conference days.
 * @param sourceDays Source day list.
 * @returns Earliest date in `YYYY-MM-DD` or `null` when unavailable.
 */
function getConferenceStartDate(sourceDays: any[]): string | null {
  const dates = sourceDays
    .map((day) => String(day?.date ?? '').trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates.length > 0 ? dates[0] : null;
}

/**
 * Computes whole-day difference between two date-only strings.
 * @param targetDate Target `YYYY-MM-DD`.
 * @param sourceDate Source `YYYY-MM-DD`.
 * @returns Day delta from source to target.
 */
function diffDays(targetDate: string, sourceDate: string): number {
  const target = new Date(`${targetDate}T00:00:00`).getTime();
  const source = new Date(`${sourceDate}T00:00:00`).getTime();
  return Math.round((target - source) / (24 * 60 * 60 * 1000));
}

/**
 * Duplicates activities into the target conference using batched writes.
 * Optionally clears slot links and shifts date parts in start/end timestamps.
 * @param db Firestore database instance.
 * @param activities Source activities.
 * @param options Duplication options for activities.
 * @returns Number of created activity documents.
 */
async function createActivitiesInBatches(
  db: admin.firestore.Firestore,
  activities: any[],
  options: { conferenceId: string; dayOffset: number; keepSlotId: boolean }
): Promise<number> {
  const { conferenceId, dayOffset, keepSlotId } = options;
  let created = 0;
  const chunkSize = Math.floor(FIRESTORE_BATCH_SAFE_LIMIT / 2);

  for (let i = 0; i < activities.length; i += chunkSize) {
    const chunk = activities.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const activity of chunk) {
      const ref = db.collection(FIRESTORE_COLLECTIONS.ACTIVITY).doc();
      // Shift activity calendar dates but keep local time-of-day and timezone suffix untouched.
      const start = shiftLocalDateTime(String(activity.start ?? ''), dayOffset);
      const end = shiftLocalDateTime(String(activity.end ?? ''), dayOffset);
      const nextActivity = {
        ...activity,
        id: ref.id,
        conferenceId,
        start,
        end,
        slotId: keepSlotId ? activity.slotId : undefined,
        lastUpdated: new Date().getTime().toString(),
      };

      batch.set(ref, sanitizeUndefined(nextActivity));
      created += 1;
    }

    await batch.commit();
    logger.info('duplicateConference activities batch committed', {
      targetConferenceId: conferenceId,
      batchSize: chunk.length,
      totalCreated: created,
    });
  }

  return created;
}

/**
 * Shifts only the calendar date portion of a local datetime string.
 * Preserves the `T...` suffix (time, milliseconds, timezone marker).
 * @param value Datetime string expected as `YYYY-MM-DDT...`.
 * @param dayOffset Day shift to apply.
 * @returns Shifted datetime string or original value when parsing fails.
 */
function shiftLocalDateTime(value: string, dayOffset: number): string {
  if (!value || dayOffset === 0) {
    return value;
  }

  // Preserves any suffix after `T` (time, ms, timezone marker) and only shifts calendar date.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(T.*)$/);
  if (!match) {
    logger.warn('duplicateConference shiftLocalDateTime skipped: unexpected format', { value });
    return value;
  }

  const baseDate = new Date(`${match[1]}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    logger.warn('duplicateConference shiftLocalDateTime skipped: invalid date', { value });
    return value;
  }

  const shifted = addDays(baseDate, dayOffset);
  return `${formatDate(shifted)}${match[2]}`;
}

/**
 * Recursively removes `undefined` values from objects/arrays for Firestore writes.
 * @param value Input value.
 * @returns Sanitized value compatible with Firestore serialization.
 */
function sanitizeUndefined(value: any): any {
  // Firestore rejects undefined fields; recursively remove them before write.
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUndefined(item)).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, sanitizeUndefined(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Ensures that no conference already exists with the same `name + edition`.
 * @param db Firestore database instance.
 * @param name Target conference name.
 * @param edition Target conference edition.
 * @throws {HttpError} If the pair already exists.
 */
async function ensureConferenceNameEditionAvailable(
  db: admin.firestore.Firestore,
  name: string,
  edition: number
): Promise<void> {
  const normalizedName = String(name ?? '').trim();
  const normalizedEdition = Number(edition);
  if (!normalizedName || !Number.isFinite(normalizedEdition)) {
    return;
  }

  const snap = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE)
    .where('name', '==', normalizedName)
    .get();

  const conflict = snap.docs.some((docSnap) => Number(docSnap.data()?.edition) === normalizedEdition);
  if (!conflict) {
    return;
  }

  logger.warn('duplicateConference rejected: name+edition already exists', {
    name: normalizedName,
    edition: normalizedEdition,
  });
  throw new HttpError(
    409,
    'Conference name and edition already exist',
    'duplicateConference rejected: name+edition already exists',
    { name: normalizedName, edition: normalizedEdition }
  );
}

/**
 * Duplicates Conference Hall config when present for source conference.
 * Accepts both "query by conferenceId" and "doc id equals conferenceId" storage patterns.
 * @param db Firestore database instance.
 * @param sourceConferenceId Source conference id.
 * @param targetConferenceId Target conference id.
 */
async function duplicateConferenceHallConfig(
  db: admin.firestore.Firestore,
  sourceConferenceId: string,
  targetConferenceId: string
): Promise<void> {
  const sourceDoc = await loadConfigByConferenceIdOrDocId(
    db,
    FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG,
    sourceConferenceId
  );
  if (!sourceDoc) {
    logger.info('duplicateConference conference-hall-config not found on source', {
      sourceConferenceId,
      targetConferenceId,
    });
    return;
  }

  const targetRef = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG).doc(targetConferenceId);
  const nextData = {
    ...sourceDoc.data,
    id: targetConferenceId,
    conferenceId: targetConferenceId,
    lastUpdated: new Date().getTime().toString(),
  };
  await targetRef.set(sanitizeUndefined(nextData));
  logger.info('duplicateConference conference-hall-config duplicated', {
    sourceConferenceId,
    targetConferenceId,
    sourceDocId: sourceDoc.id,
    targetDocId: targetConferenceId,
  });
}

/**
 * Duplicates Voxxrin config when present for source conference.
 * Accepts both "query by conferenceId" and "doc id equals conferenceId" storage patterns.
 * @param db Firestore database instance.
 * @param sourceConferenceId Source conference id.
 * @param targetConferenceId Target conference id.
 */
async function duplicateVoxxrinConfig(
  db: admin.firestore.Firestore,
  sourceConferenceId: string,
  targetConferenceId: string
): Promise<void> {
  const sourceDoc = await loadConfigByConferenceIdOrDocId(
    db,
    FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG,
    sourceConferenceId
  );
  if (!sourceDoc) {
    logger.info('duplicateConference voxxrin-config not found on source', {
      sourceConferenceId,
      targetConferenceId,
    });
    return;
  }

  const targetRef = db.collection(FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG).doc(targetConferenceId);
  const nextData = {
    ...sourceDoc.data,
    id: targetConferenceId,
    conferenceId: targetConferenceId,
    lastUpdated: new Date().getTime().toString(),
  };
  await targetRef.set(sanitizeUndefined(nextData));
  logger.info('duplicateConference voxxrin-config duplicated', {
    sourceConferenceId,
    targetConferenceId,
    sourceDocId: sourceDoc.id,
    targetDocId: targetConferenceId,
  });
}

async function duplicateSponsors(
  db: admin.firestore.Firestore,
  sourceConferenceId: string,
  targetConferenceId: string,
  shouldDuplicate: boolean
): Promise<void> {
  if (!shouldDuplicate) {
    logger.info('duplicateConference sponsors duplication disabled', {
      sourceConferenceId,
      targetConferenceId,
    });
    return;
  }

  const sponsorsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SPONSOR)
    .where('conferenceId', '==', sourceConferenceId)
    .get();

  if (sponsorsSnap.empty) {
    logger.info('duplicateConference no sponsors to duplicate', {
      sourceConferenceId,
      targetConferenceId,
    });
    return;
  }

  let duplicated = 0;
  for (let i = 0; i < sponsorsSnap.docs.length; i += FIRESTORE_BATCH_SAFE_LIMIT) {
    const chunk = sponsorsSnap.docs.slice(i, i + FIRESTORE_BATCH_SAFE_LIMIT);
    const batch = db.batch();

    for (const sponsorDoc of chunk) {
      const targetRef = db.collection(FIRESTORE_COLLECTIONS.SPONSOR).doc();
      batch.set(
        targetRef,
        sanitizeUndefined({
          ...sponsorDoc.data(),
          id: targetRef.id,
          conferenceId: targetConferenceId,
          lastUpdated: new Date().getTime().toString(),
        })
      );
      duplicated += 1;
    }

    await batch.commit();
  }

  logger.info('duplicateConference sponsors duplicated', {
    sourceConferenceId,
    targetConferenceId,
    duplicated,
  });
}

/**
 * Loads a config document by `conferenceId` field first, then by document id fallback.
 * @param db Firestore database instance.
 * @param collectionName Firestore collection name.
 * @param conferenceId Conference id used to locate config.
 * @returns Source document metadata or null when not found.
 */
async function loadConfigByConferenceIdOrDocId(
  db: admin.firestore.Firestore,
  collectionName: string,
  conferenceId: string
): Promise<{ id: string; data: any } | null> {
  const byConferenceId = await db
    .collection(collectionName)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();
  if (!byConferenceId.empty) {
    const docSnap = byConferenceId.docs[0];
    return { id: docSnap.id, data: docSnap.data() as any };
  }

  const byDocId = await db.collection(collectionName).doc(conferenceId).get();
  if (byDocId.exists) {
    return { id: byDocId.id, data: byDocId.data() as any };
  }

  return null;
}

/**
 * Updates platform single conference pointer after duplication when policy is enabled.
 * Rule: if `onlyPlatformAdminCanCreateConference=true` and `singleConferenceId` equals source conference,
 * then `singleConferenceId` is switched to target conference.
 * @param db Firestore database instance.
 * @param sourceConferenceId Source conference id.
 * @param targetConferenceId Target conference id.
 */
async function switchSingleConferenceIdIfNeeded(
  db: admin.firestore.Firestore,
  sourceConferenceId: string,
  targetConferenceId: string
): Promise<void> {
  const configRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_CONFIG).doc(PLATFORM_CONFIG_DOC_ID);
  const configSnap = await configRef.get();
  if (!configSnap.exists) {
    logger.info('duplicateConference platform-config not found, skip singleConference switch', {
      sourceConferenceId,
      targetConferenceId,
    });
    return;
  }

  const config = configSnap.data() as any;
  const onlyPlatformAdminCanCreateConference = !!config?.onlyPlatformAdminCanCreateConference;
  const singleConferenceId = String(config?.singleConferenceId ?? '').trim();
  const shouldSwitch = onlyPlatformAdminCanCreateConference && singleConferenceId === sourceConferenceId;
  if (!shouldSwitch) {
    logger.info('duplicateConference singleConference switch not needed', {
      sourceConferenceId,
      targetConferenceId,
      onlyPlatformAdminCanCreateConference,
      singleConferenceId,
    });
    return;
  }

  await configRef.set(
    {
      ...config,
      id: PLATFORM_CONFIG_DOC_ID,
      singleConferenceId: targetConferenceId,
      lastUpdated: new Date().getTime().toString(),
    },
    { merge: true }
  );
  logger.info('duplicateConference singleConference switched to duplicate', {
    sourceConferenceId,
    targetConferenceId,
    onlyPlatformAdminCanCreateConference,
  });
}
