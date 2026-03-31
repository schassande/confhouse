import { admin } from '../../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import type {
  ConferenceDashboard,
  DashboardRefreshTrigger,
} from '../../../../shared/src/model/conference-dashboard.model';

const CONFIRMED_STATUSES = new Set(['SPEAKER_CONFIRMED', 'PROGRAMMED']);
const ALLOCATED_STATUSES = new Set(['SCHEDULED', 'PROGRAMMED']);
const SPEAKER_COUNT_STATUSES = new Set(['ACCEPTED', 'SPEAKER_CONFIRMED', 'PROGRAMMED', 'SCHEDULED']);
const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_SESSION_TYPE_ID = '__unknown__';

export interface PersistedConferenceDashboard {
  dashboard: ConferenceDashboard;
  historyId: string;
}

interface RecomputeConferenceDashboardInput {
  conferenceId: string;
  trigger: DashboardRefreshTrigger;
  conferenceData?: any;
}

/**
 * Recomputes and persist conference dashboard.
 * @param db Firestore instance.
 * @param input Input payload.
 * @returns Promise resolved with the computed result.
 */
export async function recomputeAndPersistConferenceDashboard(
  db: admin.firestore.Firestore,
  input: RecomputeConferenceDashboardInput
): Promise<PersistedConferenceDashboard> {
  const conferenceId = String(input.conferenceId ?? '').trim();
  if (!conferenceId) {
    throw new Error('Missing conferenceId');
  }

  const conferenceData = input.conferenceData ?? await loadConferenceData(db, conferenceId);
  const sessionsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SESSION)
    .where('conference.conferenceId', '==', conferenceId)
    .get();
  const slotTypesSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SLOT_TYPE)
    .get();
  const allocationsSnap = await db
    .collection(FIRESTORE_COLLECTIONS.SESSION_ALLOCATION)
    .where('conferenceId', '==', conferenceId)
    .get();
  const conferenceSpeakersSnap = await db
    .collection(FIRESTORE_COLLECTIONS.CONFERENCE_SPEAKER)
    .where('conferenceId', '==', conferenceId)
    .get();
  const lastImportAt = await loadConferenceHallLastImportAt(db, conferenceId);

  const now = new Date();
  const computedAt = now.toISOString();
  const countByTypeInit = createSessionTypeCountMap(conferenceData);
  const submittedByType = { ...countByTypeInit };
  const confirmedByType = { ...countByTypeInit };
  const allocatedByType = { ...countByTypeInit };

  let submittedTotal = 0;
  let confirmedTotal = 0;
  let allocatedTotal = 0;
  let sessionsWith2Speakers = 0;
  let sessionsWith3Speakers = 0;

  sessionsSnap.docs.forEach((docSnap) => {
    const session = docSnap.data() as any;
    const status = String(session?.conference?.status ?? '').trim().toUpperCase();
    const sessionTypeId = normalizeSessionTypeId(session?.conference?.sessionTypeId);
    ensureCountKey(submittedByType, sessionTypeId);
    ensureCountKey(confirmedByType, sessionTypeId);
    ensureCountKey(allocatedByType, sessionTypeId);

    submittedTotal += 1;
    submittedByType[sessionTypeId] += 1;

    if (CONFIRMED_STATUSES.has(status)) {
      confirmedTotal += 1;
      confirmedByType[sessionTypeId] += 1;
    }
    if (ALLOCATED_STATUSES.has(status)) {
      allocatedTotal += 1;
      allocatedByType[sessionTypeId] += 1;
    }

    if (SPEAKER_COUNT_STATUSES.has(status)) {
      const speakerCount = extractSpeakerIds(session).length;
      if (speakerCount === 2) {
        sessionsWith2Speakers += 1;
      } else if (speakerCount === 3) {
        sessionsWith3Speakers += 1;
      }
    }
  });

  const slotTypeIsSessionById = buildSlotTypeIsSessionMap(slotTypesSnap);
  const sessionSlotStats = collectSessionSlotStats(conferenceData, slotTypeIsSessionById);
  const totalSlots = sessionSlotStats.total;
  const allocatedSlots = countAllocatedSessionSlots(allocationsSnap, sessionSlotStats);
  const ratio = totalSlots > 0 ? allocatedSlots / totalSlots : 0;
  const conferenceStartDate = getConferenceStartDate(conferenceData);
  const daysBeforeConference = computeDaysBeforeConference(conferenceStartDate, now);

  const dashboard: ConferenceDashboard = {
    id: conferenceId,
    conferenceId,
    schemaVersion: 1,
    trigger: input.trigger,
    computedAt,
    lastUpdated: Date.now().toString(),
    submitted: {
      total: submittedTotal,
      bySessionTypeId: submittedByType,
    },
    confirmed: {
      total: confirmedTotal,
      bySessionTypeId: confirmedByType,
    },
    allocated: {
      total: allocatedTotal,
      bySessionTypeId: allocatedByType,
    },
    speakers: {
      total: conferenceSpeakersSnap.size,
      sessionsWith2Speakers,
      sessionsWith3Speakers,
    },
    slots: {
      allocated: allocatedSlots,
      total: totalSlots,
      ratio,
    },
    conferenceHall: {
      lastImportAt,
    },
    schedule: {
      conferenceStartDate,
      daysBeforeConference,
    },
  };

  const latestRef = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_DASHBOARD).doc(conferenceId);
  const historyRef = latestRef.collection('history').doc(computedAt);
  const batch = db.batch();
  batch.set(latestRef, dashboard);
  batch.set(historyRef, dashboard);
  await batch.commit();

  return {
    dashboard,
    historyId: historyRef.id,
  };
}

/**
 * Returns whether conference start in future is satisfied.
 * @param conferenceData Conference payload.
 * @param now Reference date.
 * @returns Computed result.
 */
export function isConferenceStartInFuture(conferenceData: any, now: Date = new Date()): boolean {
  const conferenceStartDate = getConferenceStartDate(conferenceData);
  const startDate = parseIsoDay(conferenceStartDate);
  if (!startDate) {
    return false;
  }
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return startDate.getTime() > todayUtcMidnight;
}

/**
 * Creates session type count map.
 * @param conferenceData Conference payload.
 * @returns Computed result.
 */
function createSessionTypeCountMap(conferenceData: any): Record<string, number> {
  const result: Record<string, number> = {};
  const sessionTypes = Array.isArray(conferenceData?.sessionTypes) ? conferenceData.sessionTypes : [];
  sessionTypes.forEach((sessionType: any) => {
    const sessionTypeId = normalizeSessionTypeId(sessionType?.id);
    ensureCountKey(result, sessionTypeId);
  });
  return result;
}

/**
 * Ensures count key.
 * @param map Target map.
 * @param key Lookup key.
 * @returns Promise resolved when the operation completes.
 */
function ensureCountKey(map: Record<string, number>, key: string): void {
  if (!(key in map)) {
    map[key] = 0;
  }
}

/**
 * Normalizes session type id.
 * @param value Raw input value.
 * @returns Computed result.
 */
function normalizeSessionTypeId(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || UNKNOWN_SESSION_TYPE_ID;
}

/**
 * Extracts speaker ids.
 * @param session Session.
 * @returns Computed result.
 */
function extractSpeakerIds(session: any): string[] {
  const ids = [
    String(session?.speaker1Id ?? '').trim(),
    String(session?.speaker2Id ?? '').trim(),
    String(session?.speaker3Id ?? '').trim(),
  ].filter((id) => id.length > 0);
  return Array.from(new Set(ids));
}

interface SessionSlotStats {
  total: number;
  slotIds: Set<string>;
  slotKeys: Set<string>;
}

/**
 * Builds slot type is session map.
 * @param slotTypesSnap Slot types snap.
 * @returns Computed result.
 */
function buildSlotTypeIsSessionMap(
  slotTypesSnap: admin.firestore.QuerySnapshot<admin.firestore.DocumentData>
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  slotTypesSnap.docs.forEach((docSnap) => {
    const slotType = docSnap.data() as any;
    const slotTypeId = String(slotType?.id ?? docSnap.id ?? '').trim();
    if (!slotTypeId) {
      return;
    }
    map.set(slotTypeId, !!slotType?.isSession);
  });
  return map;
}

/**
 * Collects session slot stats.
 * @param conferenceData Conference payload.
 * @param slotTypeIsSessionById Slot type is session by id.
 * @returns Computed result.
 */
function collectSessionSlotStats(
  conferenceData: any,
  slotTypeIsSessionById: Map<string, boolean>
): SessionSlotStats {
  const slotIds = new Set<string>();
  const slotKeys = new Set<string>();
  let total = 0;

  const days = Array.isArray(conferenceData?.days) ? conferenceData.days : [];
  days.forEach((day: any) => {
    const dayId = String(day?.id ?? '').trim();
    const slots = Array.isArray(day?.slots) ? day.slots : [];
    slots.forEach((slot: any) => {
      if (!isSessionSlot(slot, slotTypeIsSessionById)) {
        return;
      }

      total += 1;
      const slotId = String(slot?.id ?? '').trim();
      if (!slotId) {
        return;
      }
      slotIds.add(slotId);
      if (dayId) {
        slotKeys.add(buildDaySlotKey(dayId, slotId));
      }
    });
  });

  return { total, slotIds, slotKeys };
}

/**
 * Returns whether session slot is satisfied.
 * @param slot Slot.
 * @param slotTypeIsSessionById Slot type is session by id.
 * @returns Computed result.
 */
function isSessionSlot(slot: any, slotTypeIsSessionById: Map<string, boolean>): boolean {
  const slotTypeId = String(slot?.slotTypeId ?? '').trim();
  if (slotTypeIsSessionById.has(slotTypeId)) {
    return !!slotTypeIsSessionById.get(slotTypeId);
  }
  return !!String(slot?.sessionTypeId ?? '').trim();
}

/**
 * Counts allocated session slots.
 * @param allocationsSnap Allocations snap.
 * @param sessionSlotStats Session slot stats.
 * @returns Computed result.
 */
function countAllocatedSessionSlots(
  allocationsSnap: admin.firestore.QuerySnapshot<admin.firestore.DocumentData>,
  sessionSlotStats: SessionSlotStats
): number {
  let allocated = 0;
  allocationsSnap.docs.forEach((docSnap) => {
    const allocation = docSnap.data() as any;
    const slotId = String(allocation?.slotId ?? '').trim();
    if (!slotId) {
      return;
    }

    const dayId = String(allocation?.dayId ?? '').trim();
    if (dayId && sessionSlotStats.slotKeys.size > 0) {
      if (sessionSlotStats.slotKeys.has(buildDaySlotKey(dayId, slotId))) {
        allocated += 1;
      }
      return;
    }

    if (sessionSlotStats.slotIds.has(slotId)) {
      allocated += 1;
    }
  });
  return allocated;
}

/**
 * Builds day slot key.
 * @param dayId Day id.
 * @param slotId Slot id.
 * @returns Computed result.
 */
function buildDaySlotKey(dayId: string, slotId: string): string {
  return `${dayId}::${slotId}`;
}

/**
 * Returns conference start date.
 * @param conferenceData Conference payload.
 * @returns Computed result.
 */
function getConferenceStartDate(conferenceData: any): string {
  const days = Array.isArray(conferenceData?.days) ? conferenceData.days : [];
  const validDates = days
    .map((day: any) => String(day?.date ?? '').trim())
    .filter((date: string) => !!parseIsoDay(date));
  if (validDates.length === 0) {
    return '';
  }
  validDates.sort();
  return validDates[0];
}

/**
 * Computes days before conference.
 * @param conferenceStartDate Conference start date.
 * @param now Reference date.
 * @returns Computed result.
 */
function computeDaysBeforeConference(conferenceStartDate: string, now: Date): number {
  const startDate = parseIsoDay(conferenceStartDate);
  if (!startDate) {
    return 0;
  }
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((startDate.getTime() - todayUtcMidnight) / DAY_MS);
  return Math.max(diff, 0);
}

/**
 * Parses ISO day.
 * @param value Raw input value.
 * @returns Computed result.
 */
function parseIsoDay(value: string): Date | null {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Loads conference data.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @returns Promise resolved with the computed result.
 */
async function loadConferenceData(db: admin.firestore.Firestore, conferenceId: string): Promise<any> {
  const conferenceRef = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).doc(conferenceId);
  const conferenceSnap = await conferenceRef.get();
  if (!conferenceSnap.exists) {
    throw new Error(`Conference not found (${conferenceId})`);
  }
  return conferenceSnap.data() as any;
}

/**
 * Loads conference hall last import at.
 * @param db Firestore instance.
 * @param conferenceId Conference identifier.
 * @returns Promise resolved with the computed result.
 */
async function loadConferenceHallLastImportAt(db: admin.firestore.Firestore, conferenceId: string): Promise<string> {
  const querySnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();
  if (!querySnap.empty) {
    return String((querySnap.docs[0].data() as any)?.lastCommunication ?? '').trim();
  }

  const directDocSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG).doc(conferenceId).get();
  if (!directDocSnap.exists) {
    return '';
  }
  return String((directDocSnap.data() as any)?.lastCommunication ?? '').trim();
}





