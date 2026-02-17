import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';

interface ConferenceHallSpeakerDto {
  id: string;
  name?: string;
  bio?: string | null;
  company?: string | null;
  references?: string | null;
  picture?: string | null;
  email?: string | null;
  socialLinks?: string[];
}

interface ConferenceHallProposalDto {
  id: string;
  title?: string;
  abstract?: string;
  submittedAt?: string;
  deliberationStatus?: string | null;
  confirmationStatus?: string | null;
  level?: string | null;
  references?: string | null;
  formats?: string[];
  categories?: string[];
  tags?: string[];
  languages?: string[];
  speakers?: ConferenceHallSpeakerDto[];
  review?: {
    average?: number;
    positives?: number;
    negatives?: number;
  };
}

interface ConferenceHallEventDto {
  proposals?: ConferenceHallProposalDto[];
}

interface ImportReport {
  sessionAdded: number;
  sessionUpdated: number;
  sessionUnchanged: number;
  speakerAdded: number;
  speakerUpdated: number;
  speakerUnchanged: number;
  trackAdded: number;
  trackUpdated: number;
  trackUnchanged: number;
  importedAt: string;
}

interface ConferenceSecret {
  conferenceId: string;
  secretName: string;
  secretValue: string;
}

interface SessionTypeFormatMapping {
  [sessionTypeId: string]: string;
}

export const importConferenceHall = onRequest({ cors: true }, async (req, res) => {
  try {
    logger.info('importConferenceHall request received', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body ?? {}),
    });

    if (req.method !== 'POST') {
      logger.warn('importConferenceHall rejected: invalid method', { method: req.method });
      res.status(405).send({ error: 'Method Not Allowed, use POST' });
      return;
    }

    const conferenceId = String(req.body?.conferenceId ?? '').trim();
    logger.info('importConferenceHall parsed conferenceId', {
      conferenceIdPresent: conferenceId.length > 0,
      conferenceId,
    });
    if (!conferenceId) {
      logger.warn('importConferenceHall rejected: missing conferenceId');
      res.status(400).send({ error: 'Missing conferenceId' });
      return;
    }

    const db = admin.firestore();
    const conferenceRef = db.collection('conference').doc(conferenceId);
    const conferenceSnap = await conferenceRef.get();
    if (!conferenceSnap.exists) {
      logger.warn('importConferenceHall rejected: conference not found', { conferenceId });
      res.status(404).send({ error: 'Conference not found' });
      return;
    }
    const conference = conferenceSnap.data() as any;
    logger.info('importConferenceHall conference loaded', {
      conferenceId,
      externalSystemConfigsCount: Array.isArray(conference?.externalSystemConfigs)
        ? conference.externalSystemConfigs.length
        : 0,
      tracksCount: Array.isArray(conference?.tracks) ? conference.tracks.length : 0,
    });

    const config = (conference.externalSystemConfigs ?? []).find(
      (item: any) => item?.systemName === 'CONFERENCE_HALL' && item?.env === 'PROD'
    );
    if (!config) {
      logger.warn('importConferenceHall rejected: CONFERENCE_HALL PROD config not found', { conferenceId });
      res.status(400).send({ error: 'Conference Hall PROD config not found' });
      return;
    }
    const conferenceName = String(config?.parameters?.conferenceName ?? '').trim();
    const sessionTypeFormatMapping = normalizeSessionTypeFormatMapping(
      config?.parameters?.sessionTypeFormatMapping
    );
    const secretSnap = await db.collection('conferenceSecret')
      .where('conferenceId', '==', conferenceId)
      .get();
    logger.info('importConferenceHall secrets loaded', {
      conferenceId,
      secretsCount: secretSnap.size,
    });
    const tokenSecretDoc = secretSnap.docs.find((doc) => {
      const data = doc.data() as ConferenceSecret;
      return data.secretName === 'CONFERENCE_HALL_TOKEN';
    });
    const tokenSecret = (tokenSecretDoc ? tokenSecretDoc.data() : null) as ConferenceSecret | null;
    const token = String(tokenSecret?.secretValue ?? '').trim();
    logger.info('importConferenceHall config extracted', {
      conferenceId,
      conferenceNamePresent: conferenceName.length > 0,
      tokenSecretFound: !!tokenSecretDoc,
      tokenLength: token.length,
    });
    if (!conferenceName) {
      logger.warn('importConferenceHall rejected: conference name missing', { conferenceId });
      res.status(400).send({ error: 'Conference Hall conference name is missing' });
      return;
    }
    if (!token) {
      logger.warn('importConferenceHall rejected: token missing', {
        conferenceId,
        tokenSecretFound: !!tokenSecretDoc,
      });
      res.status(400).send({ error: 'Conference Hall token is missing' });
      return;
    }

    logger.info('importConferenceHall fetching Conference Hall event', {
      conferenceId,
      conferenceName,
    });
    const event = await fetchConferenceHallEvent(conferenceName, token);
    logger.info('importConferenceHall Conference Hall event fetched', {
      conferenceId,
      proposalsCount: Array.isArray(event?.proposals) ? event.proposals.length : 0,
    });
    const report: ImportReport = {
      sessionAdded: 0,
      sessionUpdated: 0,
      sessionUnchanged: 0,
      speakerAdded: 0,
      speakerUpdated: 0,
      speakerUnchanged: 0,
      trackAdded: 0,
      trackUpdated: 0,
      trackUnchanged: 0,
      importedAt: new Date().toISOString(),
    };

    const workingConference = {
      ...conference,
      tracks: [...(conference.tracks ?? [])],
    };
    syncTracksFromCategories(workingConference, event.proposals ?? [], report, db);

    const sessionsSnap = await db.collection('session')
      .where('conference.conferenceId', '==', conferenceId)
      .get();
    const sessionsByChId = new Map<string, any>();
    sessionsSnap.forEach((doc) => {
      const data = doc.data();
      const chId = data?.conference?.conferenceHallId;
      if (chId) {
        sessionsByChId.set(chId, { id: doc.id, ...data });
      }
    });

    const personCache = new Map<string, any>();
    for (const proposal of event.proposals ?? []) {
      const speakerIds = await importSpeakers(db, proposal.speakers ?? [], workingConference, personCache, report);
      const mappedSession = mapSession(
        proposal,
        workingConference,
        conferenceId,
        speakerIds,
        sessionTypeFormatMapping
      );
      const existingSession = sessionsByChId.get(proposal.id);

      if (!existingSession) {
        const ref = db.collection('session').doc();
        mappedSession.id = ref.id;
        mappedSession.lastUpdated = Date.now().toString();
        await ref.set(mappedSession);
        report.sessionAdded += 1;
        continue;
      }

      const mergedSession = {
        ...existingSession,
        title: mappedSession.title,
        abstract: mappedSession.abstract,
        references: mappedSession.references,
        sessionType: mappedSession.sessionType,
        speaker1Id: mappedSession.speaker1Id,
        speaker2Id: mappedSession.speaker2Id,
        speaker3Id: mappedSession.speaker3Id,
        lastChangeDate: mappedSession.lastChangeDate,
        search: mappedSession.search,
        conference: mappedSession.conference,
        lastUpdated: Date.now().toString(),
      };
      if (!isSameImportedSession(existingSession, mergedSession)) {
        await db.collection('session').doc(existingSession.id).set(mergedSession);
        report.sessionUpdated += 1;
      } else {
        report.sessionUnchanged += 1;
      }
    }

    const updatedConfigs = (workingConference.externalSystemConfigs ?? []).map((item: any) => {
      if (item?.systemName === 'CONFERENCE_HALL' && item?.env === 'PROD') {
        return {
          ...item,
          lastCommunication: report.importedAt,
        };
      }
      return item;
    });
    await conferenceRef.set({
      ...workingConference,
      externalSystemConfigs: updatedConfigs,
      lastUpdated: Date.now().toString(),
    });
    logger.info('importConferenceHall completed successfully', {
      conferenceId,
      report,
    });

    res.status(200).send({ report });
  } catch (err: any) {
    logger.error('importConferenceHall error', err);
    res.status(500).send({
      error: 'Import failed',
      code: 'IMPORT_ERROR',
      detail: err?.message ?? 'unknown error',
    });
  }
});

async function fetchConferenceHallEvent(conferenceName: string, token: string): Promise<ConferenceHallEventDto> {
  const url = `https://conference-hall.io/api/v1/event/${encodeURIComponent(conferenceName)}/`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': token,
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Conference Hall API error: ${response.status}`);
  }
  return await response.json() as ConferenceHallEventDto;
}

async function importSpeakers(
  db: admin.firestore.Firestore,
  speakers: ConferenceHallSpeakerDto[],
  conference: any,
  personCache: Map<string, any>,
  report: ImportReport
): Promise<string[]> {
  const ids: string[] = [];
  for (const speaker of speakers) {
    if (!speaker.id) {
      continue;
    }

    let existing = personCache.get(speaker.id);
    if (!existing) {
      const byConferenceHall = await db.collection('person')
        .where('speaker.conferenceHallId', '==', speaker.id)
        .limit(1)
        .get();
      if (!byConferenceHall.empty) {
        const doc = byConferenceHall.docs[0];
        existing = { id: doc.id, ...doc.data() };
      }
    }
    if (!existing && speaker.email) {
      const byEmail = await db.collection('person')
        .where('email', '==', speaker.email)
        .limit(1)
        .get();
      if (!byEmail.empty) {
        const doc = byEmail.docs[0];
        existing = { id: doc.id, ...doc.data() };
      }
    }

    const mapped = mapPerson(speaker, conference, existing);
    const changed = !existing || !isSameImportedPerson(existing, mapped);

    if (changed) {
      const ref = existing?.id ? db.collection('person').doc(existing.id) : db.collection('person').doc();
      mapped.id = ref.id;
      mapped.lastUpdated = Date.now().toString();
      await ref.set(mapped);
      personCache.set(speaker.id, mapped);
      ids.push(mapped.id);
      if (existing) {
        report.speakerUpdated += 1;
      } else {
        report.speakerAdded += 1;
      }
    } else if (existing?.id) {
      personCache.set(speaker.id, existing);
      ids.push(existing.id);
      report.speakerUnchanged += 1;
    }
  }
  return ids;
}

function syncTracksFromCategories(
  conference: any,
  proposals: ConferenceHallProposalDto[],
  report: ImportReport,
  db: admin.firestore.Firestore
): void {
  const tracks = conference.tracks ?? [];
  const normalizedCategoryMap = new Map<string, string>();

  for (const proposal of proposals) {
    for (const category of proposal.categories ?? []) {
      const rawCategory = String(category ?? '').trim();
      if (!rawCategory) {
        continue;
      }
      const normalized = normalizeLabel(rawCategory);
      if (!normalizedCategoryMap.has(normalized)) {
        normalizedCategoryMap.set(normalized, rawCategory);
      }
    }
  }

  for (const [normalized, rawCategory] of normalizedCategoryMap.entries()) {
    const existingTrack = tracks.find(
      (track: any) => normalizeLabel(String(track.name ?? '')) === normalized
    );
    if (!existingTrack) {
      tracks.push({
        id: db.collection('conference').doc().id,
        name: rawCategory,
        description: {},
        color: '#808080',
        icon: 'pi pi-tag',
      });
      report.trackAdded += 1;
      continue;
    }

    if (String(existingTrack.name ?? '') !== rawCategory) {
      existingTrack.name = rawCategory;
      report.trackUpdated += 1;
    } else {
      report.trackUnchanged += 1;
    }
  }

  conference.tracks = tracks;
}

function mapPerson(speaker: ConferenceHallSpeakerDto, conference: any, existing?: any): any {
  const names = String(speaker.name ?? '').trim().split(/\s+/).filter((v) => v.length > 0);
  const firstName = names[0] ?? '';
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
  const preferredLanguage = String(conference.languages?.[0] ?? 'en').toLowerCase();
  const socialLinks = (speaker.socialLinks ?? []).map((url) => ({
    network: detectNetwork(url),
    url,
  }));

  return {
    id: existing?.id ?? '',
    lastUpdated: existing?.lastUpdated ?? Date.now().toString(),
    firstName,
    lastName,
    email: speaker.email ?? existing?.email ?? '',
    hasAccount: existing?.hasAccount ?? false,
    isPlatformAdmin: existing?.isPlatformAdmin ?? false,
    preferredLanguage: existing?.preferredLanguage ?? preferredLanguage,
    search: '',
    speaker: {
      company: speaker.company ?? '',
      bio: speaker.bio ?? '',
      reference: speaker.references ?? '',
      photoUrl: speaker.picture ?? '',
      socialLinks,
      conferenceHallId: speaker.id,
    },
  };
}

function mapSession(
  proposal: ConferenceHallProposalDto,
  conference: any,
  conferenceId: string,
  speakerIds: string[],
  sessionTypeFormatMapping: SessionTypeFormatMapping
): any {
  const status = mapStatus(proposal.deliberationStatus, proposal.confirmationStatus);
  const level = mapLevel(proposal.level);
  const sessionTypeId = findSessionId(conference, proposal.formats ?? [], sessionTypeFormatMapping);
  const mappedSessionType = (conference.sessionTypes ?? []).find((item: any) => item.id === sessionTypeId);
  const trackId = findTrackId(conference, proposal.categories ?? []);
  const lang = String((proposal.languages?.[0] ?? conference.languages?.[0] ?? 'en')).toLowerCase();
  const submitDate = proposal.submittedAt || new Date().toISOString();
  return {
    id: '',
    lastUpdated: Date.now().toString(),
    title: proposal.title ?? '',
    abstract: { [lang]: proposal.abstract ?? '' },
    references: proposal.references ?? '',
    sessionType: String(mappedSessionType?.name ?? proposal.formats?.[0] ?? ''),
    speaker1Id: speakerIds[0] ?? '',
    speaker2Id: speakerIds[1] ?? '',
    speaker3Id: speakerIds[2] ?? '',
    lastChangeDate: new Date().toISOString(),
    search: computeSessionSearch(proposal),
    conference: {
      conferenceId,
      status,
      sourceSessionUuid: proposal.id,
      sessionTypeId,
      trackId,
      overriddenFields: [],
      submitDate,
      level,
      conferenceHallId: proposal.id,
      review: {
        average: proposal.review?.average ?? 0,
        votes: (proposal.review?.positives ?? 0) + (proposal.review?.negatives ?? 0),
      },
    },
  };
}

function mapStatus(deliberationStatus?: string | null, confirmationStatus?: string | null): string {
  if (deliberationStatus === 'ACCEPTED') return 'ACCEPTED';
  if (confirmationStatus === 'CONFIRMED') return 'CONFIRMED';
  if (deliberationStatus === 'REJECTED') return 'REJECTED';
  return 'SUBMITTED';
}

function mapLevel(level?: string | null): string {
  if (level === 'ADVANCED' || level === 'INTERMEDIATE' || level === 'BEGINNER') {
    return level;
  }
  return 'BEGINNER';
}

function findSessionId(conference: any, formats: string[], mapping: SessionTypeFormatMapping): string {
  const normalizedFormats = formats.map((v) => normalizeLabel(v));

  for (const [sessionTypeId, conferenceHallFormat] of Object.entries(mapping ?? {})) {
    const normalizedMappedFormat = normalizeLabel(conferenceHallFormat);
    if (!normalizedMappedFormat) {
      continue;
    }
    if (normalizedFormats.some((format) =>
      format === normalizedMappedFormat ||
      format.includes(normalizedMappedFormat) ||
      normalizedMappedFormat.includes(format)
    )) {
      const existingSessionType = (conference.sessionTypes ?? []).find((item: any) => item.id === sessionTypeId);
      if (existingSessionType) {
        return existingSessionType.id;
      }
    }
  }

  const found = (conference.sessionTypes ?? []).find((item: any) => {
    const normalizedName = normalizeLabel(String(item.name ?? ''));
    return normalizedFormats.some((format) =>
      format === normalizedName ||
      format.includes(normalizedName) ||
      normalizedName.includes(format)
    );
  });
  return found?.id ?? '';
}

function normalizeSessionTypeFormatMapping(rawMapping: any): SessionTypeFormatMapping {
  if (!rawMapping || typeof rawMapping !== 'object') {
    return {};
  }
  const normalized: SessionTypeFormatMapping = {};
  for (const [sessionTypeId, value] of Object.entries(rawMapping)) {
    if (!sessionTypeId) {
      continue;
    }
    const mappedFormat = String(value ?? '').trim();
    if (mappedFormat) {
      normalized[sessionTypeId] = mappedFormat;
    }
  }
  return normalized;
}

function findTrackId(conference: any, categories: string[]): string {
  const normalizedCategories = categories.map((v) => normalizeLabel(v));
  const found = (conference.tracks ?? []).find((item: any) => {
    const normalizedName = normalizeLabel(String(item.name ?? ''));
    return normalizedCategories.some((category) =>
      category === normalizedName ||
      category.includes(normalizedName) ||
      normalizedName.includes(category)
    );
  });
  return found?.id ?? '';
}

function normalizeLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeSessionSearch(proposal: ConferenceHallProposalDto): string {
  const values = [
    proposal.title ?? '',
    proposal.abstract ?? '',
    proposal.references ?? '',
    ...(proposal.categories ?? []),
    ...(proposal.tags ?? []),
    ...(proposal.speakers ?? []).map((speaker) => speaker.name ?? ''),
  ];
  return values.join(' ').toLowerCase();
}

function detectNetwork(url: string): string {
  const value = String(url ?? '').toLowerCase();
  if (value.includes('linkedin.com')) return 'LinkedIn';
  if (value.includes('github.com')) return 'GitHub';
  if (value.includes('x.com') || value.includes('twitter.com')) return 'X';
  if (value.includes('bsky.app')) return 'Bluesky';
  if (value.includes('mastodon')) return 'Mastodon';
  return 'Website';
}

function isSameImportedPerson(a: any, b: any): boolean {
  return JSON.stringify({
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    speaker: a.speaker,
    preferredLanguage: a.preferredLanguage,
    hasAccount: a.hasAccount,
    isPlatformAdmin: a.isPlatformAdmin ?? false,
  }) === JSON.stringify({
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    speaker: b.speaker,
    preferredLanguage: b.preferredLanguage,
    hasAccount: b.hasAccount,
    isPlatformAdmin: b.isPlatformAdmin ?? false,
  });
}

function isSameImportedSession(a: any, b: any): boolean {
  return JSON.stringify({
    title: a.title,
    abstract: a.abstract,
    references: a.references,
    sessionType: a.sessionType,
    speaker1Id: a.speaker1Id,
    speaker2Id: a.speaker2Id ?? '',
    speaker3Id: a.speaker3Id ?? '',
    search: a.search,
    conference: a.conference,
  }) === JSON.stringify({
    title: b.title,
    abstract: b.abstract,
    references: b.references,
    sessionType: b.sessionType,
    speaker1Id: b.speaker1Id,
    speaker2Id: b.speaker2Id ?? '',
    speaker3Id: b.speaker3Id ?? '',
    search: b.search,
    conference: b.conference,
  });
}
