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

type TimelineSlot = {
  dayId: string;
  localDate: string;
  slotId: string;
  slotTypeId: string;
  roomId: string;
  overflowRoomIds: string[];
  sessionTypeId: string;
  startTime: string;
  endTime: string;
};

const PASTEL_PALETTE = [
  '#A8DADC',
  '#BDE0FE',
  '#FFC8DD',
  '#CDEAC0',
  '#F9E2AE',
  '#D8B4E2',
  '#B8F2E6',
  '#FFD6A5',
  '#C7CEEA',
  '#F1C0E8',
] as const;

const ALLOWED_SOCIAL_TYPES = new Set([
  'website',
  'twitter',
  'x',
  'linkedin',
  'mastodon',
  'instagram',
  'youtube',
  'twitch',
  'github',
  'facebook',
  'flickr',
  'bluesky',
]);

const VOXXRIN_PUBLIC_FOLDER = 'public';
const VOXXRIN_FILENAME = 'voxxrin-full.json';

export interface VoxxrinDescriptorStorageResult {
  objectPath: string;
  publicDownloadUrl: string;
  archivedFilePath?: string;
}

export interface GeneratedVoxxrinDescriptor {
  conferenceData: any;
  voxxrinConfig: any;
  descriptor: any;
  payload: string;
  storageResult: VoxxrinDescriptorStorageResult;
}

export const generateVoxxrinEventDescriptor = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    applyCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    ensurePostMethod(req.method, 'generateVoxxrinEventDescriptor');

    const conferenceId = parseConferenceId(req.body, 'generateVoxxrinEventDescriptor');
    const db = admin.firestore();
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'generateVoxxrinEventDescriptor'
    );

    const { conferenceData } = await loadConference(db, conferenceId, 'generateVoxxrinEventDescriptor');
    ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'generateVoxxrinEventDescriptor');

    const generated = await generateVoxxrinDescriptorForConference(db, conferenceId, conferenceData);
    const { descriptor, payload, storageResult } = generated;

    logger.info('generateVoxxrinEventDescriptor completed', {
      conferenceId,
      requesterEmail,
      hasDescriptor: !!descriptor,
      payloadSize: payload.length,
      storagePath: storageResult.objectPath,
      archivedPreviousFilePath: storageResult.archivedFilePath ?? null,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send({
      message: 'Voxxrin descriptor stored',
      filePath: storageResult.objectPath,
      downloadUrl: storageResult.publicDownloadUrl,
      archivedPreviousFilePath: storageResult.archivedFilePath ?? null,
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('generateVoxxrinEventDescriptor error', { message });
    res.status(500).send({
      error: 'Voxxrin descriptor generation failed',
      code: 'VOXXRIN_DESCRIPTOR_GENERATION_ERROR',
      detail: message,
    });
  }
});

export async function generateVoxxrinDescriptorForConference(
  db: admin.firestore.Firestore,
  conferenceId: string,
  preloadedConferenceData?: any
): Promise<GeneratedVoxxrinDescriptor> {
  const conferenceData = preloadedConferenceData ?? (await loadConference(db, conferenceId, 'generateVoxxrinEventDescriptor')).conferenceData;
  const voxxrinConfig = await loadVoxxrinConfig(db, conferenceId);
  if (!voxxrinConfig) {
    throw new HttpError(
      400,
      'Voxxrin config not found',
      'generateVoxxrinEventDescriptor rejected: voxxrin config not found',
      { conferenceId }
    );
  }

  const programData = await loadProgramData(db, conferenceId);
  const descriptor = buildEventDescriptor(conferenceData, voxxrinConfig, programData);
  const payload = JSON.stringify(descriptor, null, 2);
  const storageResult = await saveVoxxrinDescriptorToStorage(conferenceId, payload);
  return { conferenceData, voxxrinConfig, descriptor, payload, storageResult };
}

async function saveVoxxrinDescriptorToStorage(conferenceId: string, payload: string): Promise<VoxxrinDescriptorStorageResult> {
  const conferenceFolder = `${VOXXRIN_PUBLIC_FOLDER}/${sanitizeStoragePathSegment(conferenceId)}`;
  const targetPath = `${conferenceFolder}/${VOXXRIN_FILENAME}`;
  const bucket = admin.storage().bucket();
  const targetFile = bucket.file(targetPath);

  let archivedFilePath: string | undefined;
  const [alreadyExists] = await targetFile.exists();
  if (alreadyExists) {
    const archivePath = `${conferenceFolder}/voxxrin-full-${buildArchiveSuffix()}.json`;
    await targetFile.move(archivePath);
    archivedFilePath = archivePath;
  }

  await targetFile.save(payload, {
    resumable: false,
    contentType: 'application/json; charset=utf-8',
    metadata: {
      cacheControl: 'public, max-age=60',
    },
  });

  return {
    objectPath: targetPath,
    publicDownloadUrl: buildPublicDownloadUrl(bucket.name, targetPath),
    archivedFilePath,
  };
}

function sanitizeStoragePathSegment(value: string): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\\/]+/g, '-');
  if (!normalized) {
    throw new HttpError(
      400,
      'Invalid conferenceId',
      'generateVoxxrinEventDescriptor rejected: invalid conferenceId for storage path'
    );
  }
  return normalized;
}

function buildArchiveSuffix(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}Z`;
}

function buildPublicDownloadUrl(bucketName: string, objectPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function applyCorsHeaders(req: any, res: any): void {
  const origin = String(req?.headers?.origin ?? '*');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function loadVoxxrinConfig(db: admin.firestore.Firestore, conferenceId: string): Promise<any | null> {
  const querySnap = await db
    .collection(FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();

  if (!querySnap.empty) {
    return querySnap.docs[0].data() as any;
  }

  const byDocId = await db.collection(FIRESTORE_COLLECTIONS.VOXXRIN_CONFIG).doc(conferenceId).get();
  if (byDocId.exists) {
    return byDocId.data() as any;
  }

  return null;
}

async function loadProgramData(db: admin.firestore.Firestore, conferenceId: string): Promise<{
  slotTypeById: Map<string, any>;
  sessionById: Map<string, any>;
  personById: Map<string, any>;
  allocations: any[];
}> {
  const [slotTypesSnap, sessionsSnap, allocationsSnap] = await Promise.all([
    db.collection(FIRESTORE_COLLECTIONS.SLOT_TYPE).get(),
    db.collection(FIRESTORE_COLLECTIONS.SESSION).where('conference.conferenceId', '==', conferenceId).get(),
    db.collection(FIRESTORE_COLLECTIONS.SESSION_ALLOCATION).where('conferenceId', '==', conferenceId).get(),
  ]);

  const slotTypeById = new Map<string, any>();
  for (const doc of slotTypesSnap.docs) {
    const data = doc.data() as any;
    const id = cleanString(data?.id) ?? cleanString(doc.id);
    if (id) {
      slotTypeById.set(id, data);
    }
  }

  const sessionById = new Map<string, any>();
  const speakerIds = new Set<string>();
  for (const doc of sessionsSnap.docs) {
    const data = doc.data() as any;
    const id = cleanString(data?.id) ?? cleanString(doc.id);
    if (!id) {
      continue;
    }
    data.id = id;
    sessionById.set(id, data);
    for (const speakerId of extractSpeakerIds(data)) {
      speakerIds.add(speakerId);
    }
  }

  const personById = await loadPersonsByIds(db, Array.from(speakerIds));
  const allocations = allocationsSnap.docs.map((doc) => doc.data() as any);
  return { slotTypeById, sessionById, personById, allocations };
}

async function loadPersonsByIds(db: admin.firestore.Firestore, ids: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  const normalized = Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0)));
  if (!normalized.length) {
    return result;
  }

  const refs = normalized.map((id) => db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(id));
  const docs = await db.getAll(...refs);
  for (const doc of docs) {
    if (doc.exists) {
      result.set(doc.id, doc.data() as any);
    }
  }

  return result;
}

function buildEventDescriptor(conference: any, config: any, programData: {
  slotTypeById: Map<string, any>;
  sessionById: Map<string, any>;
  personById: Map<string, any>;
  allocations: any[];
}): any {
  const title = buildConferenceTitle(conference);
  const description = pickLocalizedText(conference?.description, conference?.languages) ?? null;
  const days = mapDays(conference?.days ?? []);
  const timezone = cleanString(config?.timezone) ?? 'UTC';
  const timelineSlots = buildTimelineSlots(conference?.days ?? []);
  const talks = mapTalks(programData.allocations, programData.sessionById, programData.personById, timelineSlots, timezone, conference);
  const breaks = mapBreaks(timelineSlots, programData.slotTypeById, timezone, conference?.languages);

  return {
    title,
    headingTitle: title,
    headingSubTitle: cleanString(config?.headingSubTitle) ?? null,
    headingBackground: cleanString(config?.headingBackground) ?? null,
    description,
    timezone,
    peopleDescription: cleanString(config?.peopleDescription) ?? null,
    location: mapLocation(config?.location),
    keywords: normalizeStringArray(config?.keywords) ?? [],
    days,
    infos: {
      floorPlans: mapFloorPlans(config?.infos?.floorPlans) ?? [],
      socialMedias: mapSocialMedias(config?.infos?.socialMedias) ?? [],
      sponsors: mapSponsors(conference?.sponsoring) ?? [],
    },
    features: mapFeatures(config?.features),
    formattings: mapFormattings(config?.formattings),
    logoUrl: cleanString(conference?.logo) ?? '',
    backgroundUrl: cleanString(config?.backgroundUrl) ?? '',
    theming: mapTheming(config?.theming),
    supportedTalkLanguages: mapSupportedTalkLanguages(conference?.languages ?? []),
    rooms: mapRooms(conference?.rooms ?? []),
    talkTracks: mapTracks(conference?.tracks ?? []),
    talkFormats: mapTalkFormats(conference?.sessionTypes ?? []),
    talks,
    breaks,
  };
}

function buildConferenceTitle(conference: any): string {
  const name = cleanString(conference?.name) ?? '';
  const edition = String(conference?.edition ?? '').trim();
  return `${name} ${edition}`.trim();
}

function pickLocalizedText(values: any, languages: any): string | undefined {
  if (!values || typeof values !== 'object') {
    return undefined;
  }

  const langCodes = Array.isArray(languages)
    ? languages.map((lang) => String(lang ?? '').trim().toLowerCase()).filter((lang) => lang.length > 0)
    : [];

  for (const lang of langCodes) {
    const byLower = cleanString(values?.[lang]);
    if (byLower) {
      return byLower;
    }
    const byUpper = cleanString(values?.[lang.toUpperCase()]);
    if (byUpper) {
      return byUpper;
    }
  }

  for (const key of Object.keys(values)) {
    const value = cleanString(values[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function mapDays(days: any[]): Array<{ id: string; localDate: string }> {
  if (!Array.isArray(days)) {
    return [];
  }

  return days
    .map((day) => {
      const localDate = toLocalDate(day?.date);
      if (!localDate) {
        return null;
      }

      return {
        id: cleanString(day?.id) ?? dayIdFromDate(localDate),
        localDate,
      };
    })
    .filter((day): day is { id: string; localDate: string } => !!day)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

function dayIdFromDate(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return weekday.toLowerCase();
}

function toLocalDate(value: any): string | undefined {
  const source = cleanString(value);
  if (!source) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    return source;
  }

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function mapLocation(locationConfig: any): any {
  const country = cleanString(locationConfig?.country) ?? '';
  const city = cleanString(locationConfig?.city) ?? '';
  const address = cleanString(locationConfig?.address);
  const latitude = toOptionalNumber(locationConfig?.latitude);
  const longitude = toOptionalNumber(locationConfig?.longitude);

  const mapped: any = { country, city };
  if (address) {
    mapped.address = address;
  }
  if (latitude !== undefined && longitude !== undefined) {
    mapped.coords = { latitude, longitude };
  }
  return mapped;
}

function buildTimelineSlots(days: any[]): Map<string, TimelineSlot> {
  const map = new Map<string, TimelineSlot>();
  if (!Array.isArray(days)) {
    return map;
  }

  for (const day of days) {
    const dayId = cleanString(day?.id);
    const localDate = toLocalDate(day?.date);
    if (!dayId || !localDate) {
      continue;
    }

    const slots = Array.isArray(day?.slots) ? day.slots : [];
    for (const slot of slots) {
      const slotId = cleanString(slot?.id);
      const roomId = cleanString(slot?.roomId);
      const startTime = normalizeIsoTime(slot?.startTime);
      const endTime = normalizeIsoTime(slot?.endTime);
      if (!slotId || !roomId || !startTime || !endTime) {
        continue;
      }

      map.set(toTimelineKey(dayId, slotId, roomId), {
        dayId,
        localDate,
        slotId,
        slotTypeId: cleanString(slot?.slotTypeId) ?? '',
        roomId,
        overflowRoomIds: normalizeStringArray(slot?.overflowRoomIds) ?? [],
        sessionTypeId: cleanString(slot?.sessionTypeId) ?? '',
        startTime,
        endTime,
      });
    }
  }

  return map;
}

function toTimelineKey(dayId: string, slotId: string, roomId: string): string {
  return `${dayId}::${slotId}::${roomId}`;
}

function normalizeIsoTime(value: any): string | undefined {
  const raw = cleanString(value);
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (!match) {
    return undefined;
  }

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return undefined;
  }

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function mapSocialMedias(values: any): Array<{ type: string; href: string }> | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const socials = values
    .map((entry) => {
      const type = normalizeSocialType(entry?.type);
      const href = cleanString(entry?.href);
      if (!type || !href) {
        return null;
      }
      return { type, href };
    })
    .filter((entry): entry is { type: string; href: string } => !!entry);

  return socials.length ? socials : undefined;
}

function normalizeSocialType(value: any): string | undefined {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return ALLOWED_SOCIAL_TYPES.has(normalized) ? normalized : undefined;
}

function mapFloorPlans(values: any): Array<{ label: string; pictureUrl: string }> | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const floorPlans = values
    .map((entry) => {
      const label = cleanString(entry?.label);
      const pictureUrl = cleanString(entry?.pictureUrl);
      if (!label || !pictureUrl) {
        return null;
      }
      return { label, pictureUrl };
    })
    .filter((entry): entry is { label: string; pictureUrl: string } => !!entry);

  return floorPlans.length ? floorPlans : undefined;
}

function mapTalks(
  allocations: any[],
  sessionById: Map<string, any>,
  personById: Map<string, any>,
  timelineSlots: Map<string, TimelineSlot>,
  timezone: string,
  conference: any
): any[] {
  if (!Array.isArray(allocations)) {
    return [];
  }

  const talks = allocations
    .map((allocation) => {
      const dayId = cleanString(allocation?.dayId);
      const slotId = cleanString(allocation?.slotId);
      const roomId = cleanString(allocation?.roomId);
      const sessionId = cleanString(allocation?.sessionId);
      if (!dayId || !slotId || !roomId || !sessionId) {
        return null;
      }

      const slot = timelineSlots.get(toTimelineKey(dayId, slotId, roomId));
      const session = sessionById.get(sessionId);
      if (!slot || !session) {
        return null;
      }

      return {
        speakers: mapTalkSpeakers(session, personById),
        id: sessionId,
        title: cleanString(session?.title) ?? '',
        isOverflow: slot.overflowRoomIds.includes(roomId),
        start: buildZonedDateTime(slot.localDate, slot.startTime, timezone),
        end: buildZonedDateTime(slot.localDate, slot.endTime, timezone),
        summary: cleanString(session?.abstract) ?? '',
        tags: [],
        assets: [],
        trackId: cleanString(session?.conference?.trackId) ?? '',
        roomId,
        formatId: cleanString(session?.conference?.sessionTypeId) ?? cleanString(slot.sessionTypeId) ?? '',
        langId: normalizeTalkLanguageId(session, conference),
      };
    })
    .filter((talk): talk is any => !!talk)
    .sort((a, b) => {
      const byStart = a.start.localeCompare(b.start);
      if (byStart !== 0) {
        return byStart;
      }
      return a.id.localeCompare(b.id);
    });

  return talks;
}

function mapBreaks(
  timelineSlots: Map<string, TimelineSlot>,
  slotTypeById: Map<string, any>,
  timezone: string,
  conferenceLanguages: any
): any[] {
  const breaks: any[] = [];
  for (const slot of timelineSlots.values()) {
    const slotType = slotTypeById.get(slot.slotTypeId);
    const isSession = toOptionalBoolean(slotType?.isSession) ?? !!cleanString(slot.sessionTypeId);
    if (isSession) {
      continue;
    }

    breaks.push({
      icon: mapBreakIcon(slotType),
      title: pickLocalizedText(slotType?.name, conferenceLanguages) ?? cleanString(slot.slotTypeId) ?? 'Break',
      roomId: slot.roomId,
      start: buildZonedDateTime(slot.localDate, slot.startTime, timezone),
      end: buildZonedDateTime(slot.localDate, slot.endTime, timezone),
    });
  }

  breaks.sort((a, b) => {
    const byStart = a.start.localeCompare(b.start);
    if (byStart !== 0) {
      return byStart;
    }
    return a.roomId.localeCompare(b.roomId);
  });

  return breaks;
}

function mapBreakIcon(slotType: any): 'ticket' | 'restaurant' | 'cafe' | 'beer' | 'movie' | 'wallet' {
  const raw = [
    cleanString(slotType?.id)?.toLowerCase(),
    cleanString(slotType?.icon)?.toLowerCase(),
    cleanString(slotType?.name?.EN)?.toLowerCase(),
    cleanString(slotType?.name?.FR)?.toLowerCase(),
  ].filter((entry): entry is string => !!entry).join(' ');

  if (raw.includes('lunch') || raw.includes('dejeuner') || raw.includes('restaurant') || raw.includes('utensils')) {
    return 'restaurant';
  }
  if (raw.includes('beer') || raw.includes('drink')) {
    return 'beer';
  }
  if (raw.includes('movie') || raw.includes('video')) {
    return 'movie';
  }
  if (raw.includes('wallet') || raw.includes('sponsor')) {
    return 'wallet';
  }
  if (raw.includes('ticket') || raw.includes('welcome') || raw.includes('home')) {
    return 'ticket';
  }
  return 'cafe';
}

function mapSponsors(sponsoring: any): any[] | undefined {
  const sponsors = Array.isArray(sponsoring?.sponsors) ? sponsoring.sponsors : [];
  if (!sponsors.length) {
    return undefined;
  }

  const grouped = new Map<string, {
    type: string;
    typeColor: string;
    typeFontColor?: string;
    sponsorships: Array<{ name: string; logoUrl: string; href: string }>;
  }>();

  for (const sponsor of sponsors) {
    const typeName = cleanString(sponsor?.type?.name) ?? 'Sponsors';
    const typeColor = normalizeHexColor(sponsor?.type?.color) ?? '#D1D5DB';
    const typeFontColor = normalizeHexColor(sponsor?.type?.fontColor);
    const sponsorship = {
      name: cleanString(sponsor?.name) ?? '',
      logoUrl: cleanString(sponsor?.logo) ?? '',
      href: cleanString(sponsor?.website) ?? '',
    };

    if (!grouped.has(typeName)) {
      grouped.set(typeName, {
        type: typeName,
        typeColor,
        typeFontColor,
        sponsorships: [],
      });
    }
    grouped.get(typeName)?.sponsorships.push(sponsorship);
  }

  const result = Array.from(grouped.values()).map((group) => {
    const mapped: any = {
      type: group.type,
      typeColor: group.typeColor,
      sponsorships: group.sponsorships,
    };
    if (group.typeFontColor) {
      mapped.typeFontColor = group.typeFontColor;
    }
    return mapped;
  });

  return result.length ? result : undefined;
}

function mapTalkSpeakers(session: any, personById: Map<string, any>): any[] {
  return extractSpeakerIds(session).map((speakerId) => {
    const person = personById.get(speakerId);
    const firstName = cleanString(person?.firstName);
    const lastName = cleanString(person?.lastName);
    const fullName = [firstName, lastName].filter((entry): entry is string => !!entry).join(' ').trim() || speakerId;

    return {
      photoUrl: cleanString(person?.speaker?.photoUrl) ?? null,
      companyName: cleanString(person?.speaker?.company) ?? null,
      fullName,
      id: speakerId,
      bio: cleanString(person?.speaker?.bio) ?? null,
      social: mapSpeakerSocial(person?.speaker?.socialLinks),
    };
  });
}

function mapSpeakerSocial(values: any): Array<{ type: string; url: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => {
      const type = normalizeSocialType(entry?.network);
      const url = cleanString(entry?.url);
      if (!type || !url) {
        return null;
      }
      return { type, url };
    })
    .filter((entry): entry is { type: string; url: string } => !!entry);
}

function extractSpeakerIds(session: any): string[] {
  const speakerIds = [
    cleanString(session?.speaker1Id),
    cleanString(session?.speaker2Id),
    cleanString(session?.speaker3Id),
  ].filter((speakerId): speakerId is string => !!speakerId);
  return Array.from(new Set(speakerIds));
}

function normalizeTalkLanguageId(session: any, conference: any): string {
  const sessionLang = cleanString(Array.isArray(session?.conference?.langs) ? session.conference.langs[0] : undefined);
  if (sessionLang) {
    return sessionLang.toLowerCase();
  }
  const confLang = cleanString(Array.isArray(conference?.languages) ? conference.languages[0] : undefined);
  return (confLang ?? 'en').toLowerCase();
}

function buildZonedDateTime(localDate: string, time: string, timezone: string): string {
  const normalizedDate = toLocalDate(localDate) ?? '1970-01-01';
  const normalizedTime = normalizeIsoTime(time) ?? '00:00';
  const offset = offsetForTimeZone(normalizedDate, normalizedTime, timezone);
  return `${normalizedDate}T${normalizedTime}:00${offset}`;
}

function offsetForTimeZone(localDate: string, time: string, timezone: string): string {
  try {
    const probe = new Date(`${localDate}T${time}:00Z`);
    if (Number.isNaN(probe.getTime())) {
      return 'Z';
    }

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(probe);
    const tzName = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = tzName.match(/GMT([+-]\d{2}:\d{2})/);
    return match?.[1] ?? 'Z';
  } catch {
    return 'Z';
  }
}

function mapFeatures(features: any): any {
  const ratingScaleIcon = cleanString(features?.ratings?.scale?.icon);
  const ratingScaleNormalized = ratingScaleIcon === 'thumbs-up' ? 'thumbs-up' : 'star';

  const result: any = {
    favoritesEnabled: toOptionalBoolean(features?.favoritesEnabled) ?? true,
    roomsDisplayed: toOptionalBoolean(features?.roomsDisplayed) ?? true,
    remindMeOnceVideosAreAvailableEnabled: toOptionalBoolean(features?.remindMeOnceVideosAreAvailableEnabled) ?? false,
    showInfosTab: toOptionalBoolean(features?.showInfosTab) ?? true,
    hideLanguages: normalizeStringArray(features?.hideLanguages) ?? [],
    showRoomCapacityIndicator: toOptionalBoolean(features?.showRoomCapacityIndicator) ?? false,
    ratings: {
      scale: {
        enabled: toOptionalBoolean(features?.ratings?.scale?.enabled) ?? true,
        icon: ratingScaleNormalized,
        labels: normalizeStringArray(features?.ratings?.scale?.labels) ?? [],
      },
      bingo: {
        enabled: toOptionalBoolean(features?.ratings?.bingo?.enabled) ?? false,
        choices: mapLabelChoices(features?.ratings?.bingo?.choices) ?? [],
      },
      'free-text': {
        enabled: toOptionalBoolean(features?.ratings?.['free-text']?.enabled) ?? false,
        maxLength: toOptionalNumber(features?.ratings?.['free-text']?.maxLength) ?? -1,
      },
      'custom-scale': {
        enabled: false,
        choices: [],
      },
    },
  };

  const minRatings = toOptionalNumber(features?.topRatedTalks?.minimumNumberOfRatingsToBeConsidered);
  const dailyTop = toOptionalNumber(features?.topRatedTalks?.numberOfDailyTopTalksConsidered);
  const minAverage = toOptionalNumber(features?.topRatedTalks?.minimumAverageScoreToBeConsidered);
  if (minRatings !== undefined && dailyTop !== undefined) {
    result.topRatedTalks = {
      minimumNumberOfRatingsToBeConsidered: minRatings,
      minimumAverageScoreToBeConsidered: minAverage,
      numberOfDailyTopTalksConsidered: dailyTop,
    };
  }

  const platform = cleanString(features?.recording?.platform);
  const youtubeHandle = cleanString(features?.recording?.youtubeHandle);
  if (platform === 'youtube' && youtubeHandle) {
    result.recording = {
      platform: 'youtube',
      youtubeHandle,
      ignoreVideosPublishedAfter: toLocalDate(features?.recording?.ignoreVideosPublishedAfter),
      recordedFormatIds: normalizeStringArray(features?.recording?.recordedFormatIds) ?? [],
      notRecordedFormatIds: normalizeStringArray(features?.recording?.notRecordedFormatIds) ?? [],
      recordedRoomIds: normalizeStringArray(features?.recording?.recordedRoomIds) ?? [],
      notRecordedRoomIds: normalizeStringArray(features?.recording?.notRecordedRoomIds) ?? [],
      excludeTitleWordsFromMatching: normalizeStringArray(features?.recording?.excludeTitleWordsFromMatching) ?? [],
    };
  }

  return result;
}

function mapFormattings(formattings: any): any {
  const mode = cleanString(formattings?.talkFormatTitle);
  return {
    talkFormatTitle: mode === 'without-duration' ? 'without-duration' : 'with-duration',
    parseMarkdownOn: (normalizeStringArray(formattings?.parseMarkdownOn) ?? [])
      .filter((entry) => entry === 'speaker-bio' || entry === 'talk-summary'),
  };
}

function mapTheming(theming: any): any {
  return {
    colors: {
      primaryHex: normalizeHexColor(theming?.colors?.primaryHex) ?? PASTEL_PALETTE[0],
      primaryContrastHex: normalizeHexColor(theming?.colors?.primaryContrastHex) ?? '#1F2937',
      secondaryHex: normalizeHexColor(theming?.colors?.secondaryHex) ?? PASTEL_PALETTE[1],
      secondaryContrastHex: normalizeHexColor(theming?.colors?.secondaryContrastHex) ?? '#1F2937',
      tertiaryHex: normalizeHexColor(theming?.colors?.tertiaryHex) ?? PASTEL_PALETTE[2],
      tertiaryContrastHex: normalizeHexColor(theming?.colors?.tertiaryContrastHex) ?? '#1F2937',
    },
    headingSrcSet: mapHeadingSrcSet(theming?.headingSrcSet) ?? null,
    headingCustomStyles: mapHeadingCustomStyles(theming?.headingCustomStyles),
    customImportedFonts: mapImportedFonts(theming?.customImportedFonts) ?? null,
  };
}

function mapHeadingSrcSet(values: any): Array<{ url: string; descriptor: string }> | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const srcSet = values
    .map((entry) => {
      const url = cleanString(entry?.url);
      const descriptor = cleanString(entry?.descriptor);
      if (!url || !descriptor || !/^\d(?:w|x)$/.test(descriptor)) {
        return null;
      }
      return { url, descriptor };
    })
    .filter((entry): entry is { url: string; descriptor: string } => !!entry);

  return srcSet.length ? srcSet : undefined;
}

function mapHeadingCustomStyles(value: any): { title: string | null; subTitle: string | null; banner: string | null } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    title: cleanString(value?.title) ?? null,
    subTitle: cleanString(value?.subTitle) ?? null,
    banner: cleanString(value?.banner) ?? null,
  };
}

function mapImportedFonts(values: any): Array<{ provider: string; family: string }> | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const fonts = values
    .map((entry) => {
      const provider = cleanString(entry?.provider);
      const family = cleanString(entry?.family);
      if (provider !== 'google-fonts' || !family) {
        return null;
      }
      return { provider, family };
    })
    .filter((entry): entry is { provider: string; family: string } => !!entry);

  return fonts.length ? fonts : undefined;
}

function mapLabelChoices(values: any): Array<{ id: string; label: string }> | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const choices = values
    .map((entry) => {
      const id = cleanString(entry?.id);
      const label = cleanString(entry?.label);
      if (!id || !label) {
        return null;
      }
      return { id, label };
    })
    .filter((entry): entry is { id: string; label: string } => !!entry);

  return choices.length ? choices : undefined;
}

function mapSupportedTalkLanguages(values: any[]): Array<{ id: string; label: string; themeColor: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  const languages = values
    .map((language, index) => {
      const raw = cleanString(language);
      if (!raw) {
        return null;
      }

      return {
        id: raw.toLowerCase(),
        label: raw.toUpperCase(),
        themeColor: String(PASTEL_PALETTE[index % PASTEL_PALETTE.length]),
      };
    })
    .filter((language) => !!language) as Array<{ id: string; label: string; themeColor: string }>;

  return languages;
}

function mapRooms(values: any[]): Array<{ id: string; title: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  const rooms = values
    .map((room) => {
      const id = cleanString(room?.id);
      const title = cleanString(room?.name);
      if (!id || !title) {
        return null;
      }

      return { id, title };
    })
    .filter((room): room is { id: string; title: string } => !!room);

  return rooms;
}

function mapTracks(values: any[]): Array<{ id: string; title: string; themeColor: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  const tracks: Array<{ id: string; title: string; themeColor: string }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const track = values[index];
    const id = cleanString(track?.id);
    const title = cleanString(track?.name);
    if (!id || !title) {
      continue;
    }

    const mapped = {
      id,
      title,
      themeColor: normalizeHexColor(track?.color) ?? PASTEL_PALETTE[index % PASTEL_PALETTE.length],
    };
    tracks.push(mapped);
  }

  return tracks;
}

function mapTalkFormats(values: any[]): Array<{ id: string; title: string; duration: string; themeColor: string }> {
  if (!Array.isArray(values)) {
    return [];
  }

  const formats: Array<{ id: string; title: string; duration: string; themeColor: string }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const format = values[index];
    const id = cleanString(format?.id);
    const title = cleanString(format?.name);
    if (!id || !title) {
      continue;
    }

    const mapped = {
      id,
      title,
      duration: toIsoDurationMinutes(format?.duration) ?? 'PT30m',
      themeColor: normalizeHexColor(format?.color) ?? PASTEL_PALETTE[index % PASTEL_PALETTE.length],
    };
    formats.push(mapped);
  }

  return formats;
}

function toIsoDurationMinutes(value: any): string | undefined {
  const duration = toOptionalNumber(value);
  if (duration === undefined || duration <= 0) {
    return undefined;
  }
  return `PT${Math.round(duration)}m`;
}

function normalizeStringArray(value: any): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value
    .map((item) => cleanString(item))
    .filter((item): item is string => !!item);

  return entries.length ? entries : undefined;
}

function normalizeHexColor(value: any): string | undefined {
  const text = cleanString(value);
  if (!text) {
    return undefined;
  }

  const raw = text.startsWith('#') ? text.slice(1) : text;
  if (/^[0-9a-fA-F]{3}$/.test(raw) || /^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return undefined;
}

function cleanString(value: any): string | undefined {
  const text = String(value ?? '').trim();
  return text.length ? text : undefined;
}

function toOptionalNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalBoolean(value: any): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}
