import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  loadConference,
  getRequesterEmailFromAuthorization,
  ensureRequesterIsOrganizer,
} from './conference-http-common';
import { computePersonSearchField } from './person-search';

const PROGRESS_LOG_EVERY = 10;
const FIRESTORE_BATCH_SAFE_LIMIT = 430;

/**
 * HTTP endpoint that imports proposals, speakers and tracks from Conference Hall.
 * The flow validates input, loads external config/token, fetches proposals, upserts entities and
 * updates integration metadata (`lastCommunication`).
 */
export const importConferenceHall = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  const requestStartedAt = Date.now();
  const requestBodyConferenceId = String(req?.body?.conferenceId ?? '').trim();
  let debugConferenceId = requestBodyConferenceId;
  try {
    logger.info('importConferenceHall request received', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body ?? {}),
    });

    const db = admin.firestore();
    const context = await buildImportRequestContext(req, db);
    debugConferenceId = context.conferenceId;
    logger.info('importConferenceHall request context ready', {
      conferenceId: context.conferenceId,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const event = await fetchEventWithLogging(context.conferenceId, context.config.conferenceName, context.config.token);
    const report = createEmptyImportReport();
    const workingConference = createWorkingConference(context.conference);
    const proposals = event.proposals ?? [];
    logger.info('importConferenceHall event ready for import', {
      conferenceId: context.conferenceId,
      proposalsCount: proposals.length,
      elapsedMs: Date.now() - requestStartedAt,
    });

    syncTracksFromCategories(workingConference, proposals, report, db);
    logger.info('importConferenceHall tracks synchronized', {
      conferenceId: context.conferenceId,
      tracksCount: Array.isArray(workingConference.tracks) ? workingConference.tracks.length : 0,
      trackAdded: report.trackAdded,
      trackUpdated: report.trackUpdated,
      trackUnchanged: report.trackUnchanged,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const sessionsByChId = await loadSessionsByConferenceHallId(db, context.conferenceId);
    logger.info('importConferenceHall existing sessions loaded', {
      conferenceId: context.conferenceId,
      existingSessionsCount: sessionsByChId.size,
      elapsedMs: Date.now() - requestStartedAt,
    });

    await upsertSessionsFromProposals(
      db,
      proposals,
      workingConference,
      context.conferenceId,
      sessionsByChId,
      context.config.sessionTypeFormatMapping,
      report
    );

    await persistConferenceAfterImport(
      context.conferenceRef,
      context.conferenceHallConfigRef,
      workingConference,
      report
    );
    logger.info('importConferenceHall completed successfully', {
      conferenceId: context.conferenceId,
      report,
      totalElapsedMs: Date.now() - requestStartedAt,
    });

    res.status(200).send({ report });
  } catch (err: any) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    logger.error('importConferenceHall error', {
      conferenceId: debugConferenceId,
      elapsedMs: Date.now() - requestStartedAt,
      error: serializeError(err),
      request: {
        method: req?.method,
        bodyKeys: Object.keys(req?.body ?? {}),
      },
    });
    res.status(500).send({
      error: 'Import failed',
      code: 'IMPORT_ERROR',
      detail: err?.message ?? 'unknown error',
    });
  }
});

/**
 * Validates request and loads conference/config data required for import.
 */
async function buildImportRequestContext(req: any, db: admin.firestore.Firestore): Promise<ImportRequestContext> {
  ensurePostMethod(req.method, 'importConferenceHall');
  const conferenceId = parseConferenceId(req.body, 'importConferenceHall');
  logger.info('importConferenceHall parsed conferenceId', {
    conferenceIdPresent: conferenceId.length > 0,
    conferenceId,
  });

  const requesterEmail = await getRequesterEmailFromAuthorization(
    req.headers.authorization,
    conferenceId,
    'importConferenceHall'
  );
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, 'importConferenceHall');
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'importConferenceHall');
  logger.info('importConferenceHall conference loaded', {
    conferenceId,
    requesterEmail,
    tracksCount: Array.isArray(conferenceData?.tracks) ? conferenceData.tracks.length : 0,
  });

  const { conferenceHallConfigRef, conferenceHallConfig } = await loadConferenceHallConfig(db, conferenceId);
  const config = await resolveImportConfig(db, conferenceId, conferenceHallConfig);
  return {
    conferenceId,
    requesterEmail,
    conferenceRef,
    conferenceHallConfigRef,
    conference: conferenceData,
    config,
  };
}

/**
 * Loads Conference Hall config persisted in dedicated collection.
 */
async function loadConferenceHallConfig(
  db: admin.firestore.Firestore,
  conferenceId: string
): Promise<{ conferenceHallConfigRef: admin.firestore.DocumentReference; conferenceHallConfig: ConferenceHallConfig }> {
  const configSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG)
    .where('conferenceId', '==', conferenceId)
    .limit(1)
    .get();
  if (!configSnap.empty) {
    const configDoc = configSnap.docs[0];
    return {
      conferenceHallConfigRef: configDoc.ref,
      conferenceHallConfig: configDoc.data() as ConferenceHallConfig,
    };
  }

  const byDocIdSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG).doc(conferenceId).get();
  if (byDocIdSnap.exists) {
    return {
      conferenceHallConfigRef: byDocIdSnap.ref,
      conferenceHallConfig: byDocIdSnap.data() as ConferenceHallConfig,
    };
  }

  throw new HttpError(
    400,
    'Conference Hall config not found',
    'importConferenceHall rejected: conference hall config not found',
    { conferenceId, collection: FIRESTORE_COLLECTIONS.CONFERENCE_HALL_CONFIG }
  );
}

/**
 * Resolves Conference Hall import configuration and token from dedicated settings and secrets.
 */
async function resolveImportConfig(
  db: admin.firestore.Firestore,
  conferenceId: string,
  conferenceHallConfig: ConferenceHallConfig
): Promise<ImportConfigContext> {
  const conferenceName = String(
    conferenceHallConfig?.conferenceName
    ?? conferenceHallConfig?.parameters?.conferenceName
    ?? ''
  ).trim();
  if (!conferenceName) {
    throw new HttpError(
      400,
      'Conference Hall conference name is missing',
      'importConferenceHall rejected: conference name missing',
      { conferenceId }
    );
  }

  const token = await loadConferenceHallToken(db, conferenceId);
  if (!token) {
    throw new HttpError(
      400,
      'Conference Hall token is missing',
      'importConferenceHall rejected: token missing',
      { conferenceId }
    );
  }

  logger.info('importConferenceHall config extracted', {
    conferenceId,
    conferenceNamePresent: conferenceName.length > 0,
    tokenLength: token.length,
  });
  return {
    conferenceName,
    token,
    sessionTypeFormatMapping: normalizeSessionTypeFormatMapping(
      conferenceHallConfig?.sessionTypeMappings ?? conferenceHallConfig?.parameters?.sessionTypeFormatMapping
    ),
  };
}

/**
 * Loads the Conference Hall API token from conference secrets collection.
 */
async function loadConferenceHallToken(db: admin.firestore.Firestore, conferenceId: string): Promise<string> {
  const secretSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE_SECRET)
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
  return String(tokenSecret?.secretValue ?? '').trim();
}

/**
 * Fetches Conference Hall event data and logs request/response context.
 */
async function fetchEventWithLogging(
  conferenceId: string,
  conferenceName: string,
  token: string
): Promise<ConferenceHallEventDto> {
  logger.info('importConferenceHall fetching Conference Hall event', {
    conferenceId,
    conferenceName,
  });
  try {
    const event = await fetchConferenceHallEvent(conferenceName, token);
    logger.info('importConferenceHall Conference Hall event fetched', {
      conferenceId,
      proposalsCount: Array.isArray(event?.proposals) ? event.proposals.length : 0,
    });
    return event;
  } catch (err: any) {
    logger.error('importConferenceHall Conference Hall fetch failed', {
      conferenceId,
      conferenceName,
      error: serializeError(err),
    });
    throw err;
  }
}

/**
 * Creates an empty import report initialized with current import timestamp.
 */
function createEmptyImportReport(): ImportReport {
  return {
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
}

/**
 * Creates a mutable conference copy used during import mutations.
 */
function createWorkingConference(conference: any): any {
  return {
    ...conference,
    tracks: [...(conference.tracks ?? [])],
  };
}

/**
 * Loads existing sessions of the conference indexed by Conference Hall proposal id.
 */
async function loadSessionsByConferenceHallId(
  db: admin.firestore.Firestore,
  conferenceId: string
): Promise<Map<string, any>> {
  const sessionsSnap = await db.collection(FIRESTORE_COLLECTIONS.SESSION)
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
  return sessionsByChId;
}

/**
 * Upserts sessions from Conference Hall proposals and updates report counters.
 */
async function upsertSessionsFromProposals(
  db: admin.firestore.Firestore,
  proposals: ConferenceHallProposalDto[],
  conference: any,
  conferenceId: string,
  sessionsByChId: Map<string, any>,
  sessionTypeFormatMapping: SessionTypeFormatMapping,
  report: ImportReport
): Promise<void> {
  const startedAt = Date.now();
  logger.info('importConferenceHall sessions upsert started', {
    conferenceId,
    proposalsCount: proposals.length,
    existingSessionsCount: sessionsByChId.size,
  });

  const { personByConferenceHallId, personByEmailLower } = await preloadConferenceSpeakers(db, conferenceId);

  const speakerPersonIdByConferenceHallId = await importAllSpeakersBatch(
    db,
    proposals,
    conference,
    conferenceId,
    personByConferenceHallId,
    personByEmailLower,
    report
  );
  await upsertSessionsBatch(
    db,
    proposals,
    conference,
    conferenceId,
    sessionsByChId,
    sessionTypeFormatMapping,
    speakerPersonIdByConferenceHallId,
    report
  );

  logger.info('importConferenceHall sessions upsert completed', {
    conferenceId,
    proposalsCount: proposals.length,
    elapsedMs: Date.now() - startedAt,
    reportSnapshot: { ...report },
  });
}

async function preloadConferenceSpeakers(
  db: admin.firestore.Firestore,
  conferenceId: string
): Promise<{ personByConferenceHallId: Map<string, any>; personByEmailLower: Map<string, any> }> {
  const startedAt = Date.now();
  const snap = await db.collection(FIRESTORE_COLLECTIONS.PERSON)
    .where('speaker.submittedConferenceIds', 'array-contains', conferenceId)
    .get();

  const personByConferenceHallId = new Map<string, any>();
  const personByEmailLower = new Map<string, any>();

  snap.forEach((doc) => {
    const person = { id: doc.id, ...doc.data() } as any;
    const conferenceHallId = String(person?.speaker?.conferenceHallId ?? '').trim();
    if (conferenceHallId) {
      personByConferenceHallId.set(conferenceHallId, person);
    }
    const emailLower = String(person?.email ?? '').trim().toLowerCase();
    if (emailLower) {
      personByEmailLower.set(emailLower, person);
    }
  });

  logger.info('importConferenceHall preload conference speakers completed', {
    conferenceId,
    loadedPersonsCount: snap.size,
    byConferenceHallIdCount: personByConferenceHallId.size,
    byEmailCount: personByEmailLower.size,
    elapsedMs: Date.now() - startedAt,
  });

  return { personByConferenceHallId, personByEmailLower };
}

interface SpeakerBatchPlan {
  conferenceHallSpeakerId: string;
  existing?: any;
  mapped: any;
  emailKey: string;
  previousEmailKey: string;
}

async function importAllSpeakersBatch(
  db: admin.firestore.Firestore,
  proposals: ConferenceHallProposalDto[],
  conference: any,
  conferenceId: string,
  personByConferenceHallId: Map<string, any>,
  personByEmailLower: Map<string, any>,
  report: ImportReport
): Promise<Map<string, string>> {
  const startedAt = Date.now();
  const uniqueSpeakers = collectUniqueSpeakers(proposals);
  const globalPersonsByEmailLower = await loadExistingPersonsByEmailIndex(db, uniqueSpeakers);
  const speakerPersonIdByConferenceHallId = new Map<string, string>();
  const plans: SpeakerBatchPlan[] = [];

  logger.info('importConferenceHall speakers batch preparation started', {
    conferenceId,
    uniqueSpeakersCount: uniqueSpeakers.size,
    globalPersonsByEmailCount: globalPersonsByEmailLower.size,
  });

  for (const speaker of uniqueSpeakers.values()) {
    if (!speaker.id) {
      continue;
    }

    let existing = personByConferenceHallId.get(speaker.id);
    if (!existing && speaker.email) {
      const emailLower = String(speaker.email).trim().toLowerCase();
      if (emailLower) {
        existing = personByEmailLower.get(emailLower) ?? globalPersonsByEmailLower.get(emailLower);
      }
    }

    const mapped = mapPerson(speaker, conference, conferenceId, existing);
    const emailKey = String(mapped.email ?? '').trim().toLowerCase();
    if (!emailKey) {
      logger.warn('importConferenceHall speaker skipped: missing email', {
        conferenceId,
        conferenceHallSpeakerId: speaker.id,
        hasExistingPerson: !!existing,
        speaker: summarizeSpeaker(speaker),
      });
      continue;
    }

    const changed = !existing || !isSameImportedPerson(existing, mapped);
    if (!changed) {
      if (existing?.id) {
        speakerPersonIdByConferenceHallId.set(speaker.id, existing.id);
        personByConferenceHallId.set(speaker.id, existing);
        personByEmailLower.set(emailKey, existing);
        report.speakerUnchanged += 1;
      }
      continue;
    }

    const personId = String(existing?.id ?? '').trim() || db.collection(FIRESTORE_COLLECTIONS.PERSON).doc().id;
    mapped.id = personId;
    mapped.email = String(mapped.email ?? '').trim();
    mapped.lastUpdated = Date.now().toString();
    plans.push({
      conferenceHallSpeakerId: speaker.id,
      existing,
      mapped,
      emailKey,
      previousEmailKey: String(existing?.email ?? '').trim().toLowerCase(),
    });
  }

  if (plans.length === 0) {
    logger.info('importConferenceHall speakers batch completed', {
      conferenceId,
      speakersChanged: 0,
      speakersResolved: speakerPersonIdByConferenceHallId.size,
      elapsedMs: Date.now() - startedAt,
    });
    return speakerPersonIdByConferenceHallId;
  }

  const emailKeysToCheck = new Set<string>();
  for (const plan of plans) {
    emailKeysToCheck.add(plan.emailKey);
    if (plan.previousEmailKey && plan.previousEmailKey !== plan.emailKey) {
      emailKeysToCheck.add(plan.previousEmailKey);
    }
  }

  const emailRefs = Array.from(emailKeysToCheck)
    .map((key) => db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(key));
  const emailSnaps = emailRefs.length > 0 ? await db.getAll(...emailRefs) : [];
  const emailSnapByKey = new Map<string, admin.firestore.DocumentSnapshot>();
  for (const snap of emailSnaps) {
    emailSnapByKey.set(snap.id, snap);
  }

  let batch = db.batch();
  let opCount = 0;
  let commitCount = 0;
  const commitIfNeeded = async (force: boolean): Promise<void> => {
    if (opCount === 0) {
      return;
    }
    if (!force && opCount < FIRESTORE_BATCH_SAFE_LIMIT) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    opCount = 0;
    commitCount += 1;
  };

  for (const plan of plans) {
    const emailSnap = emailSnapByKey.get(plan.emailKey);
    const emailOwnerPersonId = String(emailSnap?.data()?.personId ?? '');
    if (emailSnap?.exists && emailOwnerPersonId && emailOwnerPersonId !== plan.mapped.id) {
      throw new Error(`EMAIL_EXISTS: ${plan.mapped.email}`);
    }

    const personRef = db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(plan.mapped.id);
    batch.set(personRef, plan.mapped);
    opCount += 1;

    const emailRef = db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(plan.emailKey);
    batch.set(emailRef, {
      personId: plan.mapped.id,
      email: plan.mapped.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    opCount += 1;

    if (plan.previousEmailKey && plan.previousEmailKey !== plan.emailKey) {
      const previousEmailSnap = emailSnapByKey.get(plan.previousEmailKey);
      const previousOwner = String(previousEmailSnap?.data()?.personId ?? '');
      if (previousEmailSnap?.exists && previousOwner === plan.mapped.id) {
        batch.delete(db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(plan.previousEmailKey));
        opCount += 1;
      }
    }

    await commitIfNeeded(false);

    speakerPersonIdByConferenceHallId.set(plan.conferenceHallSpeakerId, plan.mapped.id);
    personByConferenceHallId.set(plan.conferenceHallSpeakerId, plan.mapped);
    personByEmailLower.set(plan.emailKey, plan.mapped);
    if (plan.existing) {
      report.speakerUpdated += 1;
    } else {
      report.speakerAdded += 1;
    }
  }

  await commitIfNeeded(true);

  logger.info('importConferenceHall speakers batch completed', {
    conferenceId,
    uniqueSpeakersCount: uniqueSpeakers.size,
    speakersChanged: plans.length,
    speakersResolved: speakerPersonIdByConferenceHallId.size,
    commits: commitCount,
    elapsedMs: Date.now() - startedAt,
  });

  return speakerPersonIdByConferenceHallId;
}

async function loadExistingPersonsByEmailIndex(
  db: admin.firestore.Firestore,
  uniqueSpeakers: Map<string, ConferenceHallSpeakerDto>
): Promise<Map<string, any>> {
  const emailKeys = Array.from(new Set(
    Array.from(uniqueSpeakers.values())
      .map((speaker) => String(speaker?.email ?? '').trim().toLowerCase())
      .filter((email) => email.length > 0)
  ));
  if (emailKeys.length === 0) {
    return new Map<string, any>();
  }

  const emailOwnerByKey = new Map<string, string>();
  for (const keyChunk of chunkArray(emailKeys, 200)) {
    const emailRefs = keyChunk.map((emailKey) => db.collection(FIRESTORE_COLLECTIONS.PERSON_EMAILS).doc(emailKey));
    const emailSnaps = await db.getAll(...emailRefs);
    for (const emailSnap of emailSnaps) {
      const ownerId = String(emailSnap.data()?.personId ?? '').trim();
      if (ownerId) {
        emailOwnerByKey.set(emailSnap.id, ownerId);
      }
    }
  }

  const ownerIds = Array.from(new Set(Array.from(emailOwnerByKey.values())));
  const personById = new Map<string, any>();
  for (const ownerChunk of chunkArray(ownerIds, 200)) {
    const personRefs = ownerChunk.map((id) => db.collection(FIRESTORE_COLLECTIONS.PERSON).doc(id));
    const personSnaps = await db.getAll(...personRefs);
    for (const personSnap of personSnaps) {
      if (!personSnap.exists) {
        continue;
      }
      personById.set(personSnap.id, { id: personSnap.id, ...personSnap.data() });
    }
  }

  const personByEmailLower = new Map<string, any>();
  for (const [emailKey, ownerId] of emailOwnerByKey.entries()) {
    const person = personById.get(ownerId);
    if (person) {
      personByEmailLower.set(emailKey, person);
    }
  }
  return personByEmailLower;
}

async function upsertSessionsBatch(
  db: admin.firestore.Firestore,
  proposals: ConferenceHallProposalDto[],
  conference: any,
  conferenceId: string,
  sessionsByChId: Map<string, any>,
  sessionTypeFormatMapping: SessionTypeFormatMapping,
  speakerPersonIdByConferenceHallId: Map<string, string>,
  report: ImportReport
): Promise<void> {
  const startedAt = Date.now();
  let batch = db.batch();
  let opCount = 0;
  let commitCount = 0;
  const commitIfNeeded = async (force: boolean): Promise<void> => {
    if (opCount === 0) {
      return;
    }
    if (!force && opCount < FIRESTORE_BATCH_SAFE_LIMIT) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    opCount = 0;
    commitCount += 1;
  };

  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index];
    try {
      const existingSession = sessionsByChId.get(proposal.id);
      const existingSessionStatus = String(existingSession?.conference?.status ?? '').trim();
      const speakerIds = (proposal.speakers ?? [])
        .map((speaker) => speakerPersonIdByConferenceHallId.get(String(speaker?.id ?? '').trim()) ?? '')
        .filter((id) => id.length > 0);
      const mappedSession = mapSession(
        proposal,
        conference,
        conferenceId,
        speakerIds,
        sessionTypeFormatMapping,
        existingSessionStatus
      );

      if (!existingSession) {
        const ref = db.collection(FIRESTORE_COLLECTIONS.SESSION).doc();
        mappedSession.id = ref.id;
        mappedSession.lastUpdated = Date.now().toString();
        batch.set(ref, mappedSession);
        opCount += 1;
        report.sessionAdded += 1;
      } else {
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
          batch.set(db.collection(FIRESTORE_COLLECTIONS.SESSION).doc(existingSession.id), mergedSession);
          opCount += 1;
          report.sessionUpdated += 1;
        } else {
          report.sessionUnchanged += 1;
        }
      }
    } catch (err: any) {
      logger.error('importConferenceHall proposal upsert failed', {
        conferenceId,
        proposalIndex: index + 1,
        totalProposals: proposals.length,
        proposal: summarizeProposal(proposal),
        reportSnapshot: { ...report },
        error: serializeError(err),
      });
      throw err;
    }

    await commitIfNeeded(false);

    if ((index + 1) % PROGRESS_LOG_EVERY === 0 || index + 1 === proposals.length) {
      logger.info('importConferenceHall sessions upsert progress', {
        conferenceId,
        processed: index + 1,
        total: proposals.length,
        elapsedMs: Date.now() - startedAt,
        reportSnapshot: { ...report },
      });
    }
  }

  await commitIfNeeded(true);
  logger.info('importConferenceHall sessions batch completed', {
    conferenceId,
    proposalsCount: proposals.length,
    commits: commitCount,
    elapsedMs: Date.now() - startedAt,
  });
}

function collectUniqueSpeakers(proposals: ConferenceHallProposalDto[]): Map<string, ConferenceHallSpeakerDto> {
  const uniqueSpeakers = new Map<string, ConferenceHallSpeakerDto>();
  for (const proposal of proposals) {
    for (const speaker of proposal.speakers ?? []) {
      const speakerId = String(speaker?.id ?? '').trim();
      if (!speakerId) {
        continue;
      }
      const current = uniqueSpeakers.get(speakerId);
      if (!current) {
        uniqueSpeakers.set(speakerId, { ...speaker, id: speakerId });
        continue;
      }

      uniqueSpeakers.set(speakerId, {
        ...current,
        name: current.name ?? speaker.name,
        email: current.email ?? speaker.email,
        bio: current.bio ?? speaker.bio,
        company: current.company ?? speaker.company,
        references: current.references ?? speaker.references,
        picture: current.picture ?? speaker.picture,
        socialLinks: (current.socialLinks && current.socialLinks.length > 0)
          ? current.socialLinks
          : speaker.socialLinks,
      });
    }
  }
  return uniqueSpeakers;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0 || items.length === 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Persists conference metadata updates after successful import.
 */
async function persistConferenceAfterImport(
  conferenceRef: admin.firestore.DocumentReference,
  conferenceHallConfigRef: admin.firestore.DocumentReference,
  workingConference: any,
  report: ImportReport
): Promise<void> {
  await conferenceRef.set({
    ...workingConference,
    lastUpdated: Date.now().toString(),
  });
  await conferenceHallConfigRef.set({
    lastCommunication: report.importedAt,
    lastUpdated: Date.now().toString(),
  }, { merge: true });
}

/**
 * Calls Conference Hall public API and returns event payload.
 */
async function fetchConferenceHallEvent(conferenceName: string, token: string): Promise<ConferenceHallEventDto> {
  const url = `https://conference-hall.io/api/v1/event/${encodeURIComponent(conferenceName)}/`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': token,
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Conference Hall API error: status=${response.status}, statusText=${response.statusText}, body=${safeString(responseBody, 800)}`
      );
    }
    return await response.json() as ConferenceHallEventDto;
  } catch (err: any) {
    throw new Error(`Conference Hall request failed: url=${url}; detail=${err?.message ?? 'unknown error'}`);
  }
}

function summarizeProposal(proposal: ConferenceHallProposalDto): any {
  return {
    id: proposal?.id ?? '',
    title: safeString(proposal?.title ?? '', 180),
    formats: proposal?.formats ?? [],
    categories: proposal?.categories ?? [],
    languages: proposal?.languages ?? [],
    speakersCount: Array.isArray(proposal?.speakers) ? proposal.speakers.length : 0,
    speakerIds: (proposal?.speakers ?? []).map((speaker) => speaker?.id ?? '').slice(0, 10),
    deliberationStatus: proposal?.deliberationStatus ?? null,
    confirmationStatus: proposal?.confirmationStatus ?? null,
  };
}

function summarizeSpeaker(speaker: ConferenceHallSpeakerDto | undefined | null): any {
  return {
    id: speaker?.id ?? '',
    email: safeString(String(speaker?.email ?? ''), 120),
    name: safeString(String(speaker?.name ?? ''), 120),
    company: safeString(String(speaker?.company ?? ''), 120),
    socialLinksCount: Array.isArray(speaker?.socialLinks) ? speaker.socialLinks.length : 0,
  };
}

function safeString(value: string, maxLength: number): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function serializeError(err: any): any {
  if (!err) {
    return { message: 'unknown error' };
  }
  return {
    name: err?.name ?? 'Error',
    message: err?.message ?? String(err),
    stack: err?.stack ?? '',
    code: err?.code ?? undefined,
    cause: err?.cause ? serializeError(err.cause) : undefined,
  };
}

/**
 * Synchronizes conference tracks from imported proposal categories.
 */
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
        id: db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).doc().id,
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

/**
 * Maps a Conference Hall speaker payload to local person schema.
 */
function mapPerson(speaker: ConferenceHallSpeakerDto, conference: any, conferenceId: string, existing?: any): any {
  const names = String(speaker.name ?? '').trim().split(/\s+/).filter((v) => v.length > 0);
  const firstName = names[0] ?? '';
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
  const preferredLanguage = String(conference.languages?.[0] ?? 'en').toLowerCase();
  const socialLinks = (speaker.socialLinks ?? []).map((url) => ({
    network: detectNetwork(url),
    url,
  }));

  const mapped = {
    id: existing?.id ?? '',
    lastUpdated: existing?.lastUpdated ?? Date.now().toString(),
    firstName,
    lastName,
    email: speaker.email ?? existing?.email ?? '',
    hasAccount: existing?.hasAccount ?? false,
    isPlatformAdmin: existing?.isPlatformAdmin ?? false,
    isSpeaker: true,
    preferredLanguage: existing?.preferredLanguage ?? preferredLanguage,
    search: '',
    speaker: {
      company: speaker.company ?? '',
      bio: speaker.bio ?? '',
      reference: speaker.references ?? '',
      photoUrl: speaker.picture ?? '',
      socialLinks,
      conferenceHallId: speaker.id,
      submittedConferenceIds: mergeSubmittedConferenceIds(existing?.speaker?.submittedConferenceIds, conferenceId),
    },
  };
  mapped.search = computePersonSearchField(mapped);
  return mapped;
}

function mergeSubmittedConferenceIds(existingIds: any, conferenceId: string): string[] {
  const ids = Array.isArray(existingIds) ? existingIds : [];
  return Array.from(
    new Set(
      [...ids, conferenceId]
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  );
}

/**
 * Maps one Conference Hall proposal to local session schema.
 */
function mapSession(
  proposal: ConferenceHallProposalDto,
  conference: any,
  conferenceId: string,
  speakerIds: string[],
  sessionTypeFormatMapping: SessionTypeFormatMapping,
  currentStatus?: string | null
): any {
  const status = mapStatus(proposal.deliberationStatus, proposal.confirmationStatus, currentStatus);
  const level = mapLevel(proposal.level);
  const sessionTypeId = findSessionId(conference, proposal.formats ?? [], sessionTypeFormatMapping);
  const mappedSessionType = (conference.sessionTypes ?? []).find((item: any) => item.id === sessionTypeId);
  const trackId = findTrackId(conference, proposal.categories ?? []);
  const langs = (proposal.languages ?? ['FR']).map(l=>l.toUpperCase());
  const submitDate = proposal.submittedAt || new Date().toISOString();
  const abstract = proposal.abstract ?? '';
  
  return {
    id: '',
    lastUpdated: Date.now().toString(),
    title: proposal.title ?? '',
    abstract,
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
      langs,
      conferenceHallId: proposal.id,
      review: {
        average: proposal.review?.average ?? 0,
        votes: (proposal.review?.positives ?? 0) + (proposal.review?.negatives ?? 0),
      },
    },
  };
}

/**
 * Maps Conference Hall statuses to local session status.
 */
function mapStatus(
  deliberationStatus?: string | null,
  confirmationStatus?: string | null,
  currentStatus?: string | null
): string {

  if (deliberationStatus === 'REJECTED') {
    return 'REJECTED';

  } else if (deliberationStatus === 'PENDING') {
    return currentStatus === 'WAITLISTED' ?  'WAITLISTED' : 'SUBMITTED';

  } else if (deliberationStatus == 'ACCEPTED') {
    const isSpeakerConfirmed = confirmationStatus === 'CONFIRMED';
    const isSpeakerDeclined = confirmationStatus === 'DECLINED';
    const isAlreadyScheduled = currentStatus && ['SCHEDULED', 'PROGRAMMED'].includes(currentStatus);

    if (isSpeakerDeclined) {
      return 'PROGRAMMED' == currentStatus  ? 'CANCELLED' : 'DECLINED_BY_SPEAKER';

    } else if (isSpeakerConfirmed) {
      return isAlreadyScheduled ? 'PROGRAMMED' : 'SPEAKER_CONFIRMED';

    } else {
      return isAlreadyScheduled ? 'SCHEDULED' : 'ACCEPTED';
    }

  } else {
    // deliberation === null
    return 'SUBMITTED';
  }
}

/**
 * Maps Conference Hall level to local session level with safe default.
 */
function mapLevel(level?: string | null): string {
  if (level === 'ADVANCED' || level === 'INTERMEDIATE' || level === 'BEGINNER') {
    return level;
  }
  return 'BEGINNER';
}

/**
 * Finds the local session type id from imported formats and optional explicit mapping.
 */
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

/**
 * Normalizes raw mapping object to a clean `sessionTypeId -> format` dictionary.
 */
function normalizeSessionTypeFormatMapping(rawMapping: any): SessionTypeFormatMapping {
  if (!rawMapping || typeof rawMapping !== 'object') {
    return {};
  }
  const normalized: SessionTypeFormatMapping = {};
  if (Array.isArray(rawMapping)) {
    for (const entry of rawMapping) {
      const sessionTypeId = String(entry?.sessionTypeId ?? '').trim();
      if (!sessionTypeId) {
        continue;
      }
      const mappedFormat = String(entry?.conferenceHallFormat ?? '').trim();
      if (mappedFormat) {
        normalized[sessionTypeId] = mappedFormat;
      }
    }
    return normalized;
  }
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

/**
 * Finds the local track id from imported category labels.
 */
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

/**
 * Normalizes text for fuzzy matching (lowercase, no accent/punctuation noise).
 */
function normalizeLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Builds full-text search content for imported sessions.
 */
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

/**
 * Detects social network name from a URL.
 */
function detectNetwork(url: string): string {
  const value = String(url ?? '').toLowerCase();
  if (value.includes('linkedin.com')) return 'LinkedIn';
  if (value.includes('github.com')) return 'GitHub';
  if (value.includes('x.com') || value.includes('twitter.com')) return 'X';
  if (value.includes('bsky.app')) return 'Bluesky';
  if (value.includes('mastodon')) return 'Mastodon';
  return 'Website';
}

/**
 * Compares imported person payload-relevant fields to decide whether update is needed.
 */
function isSameImportedPerson(a: any, b: any): boolean {
  return JSON.stringify({
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    speaker: a.speaker,
    preferredLanguage: a.preferredLanguage,
    hasAccount: a.hasAccount,
    isPlatformAdmin: a.isPlatformAdmin ?? false,
    isSpeaker: a.isSpeaker ?? false,
  }) === JSON.stringify({
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    speaker: b.speaker,
    preferredLanguage: b.preferredLanguage,
    hasAccount: b.hasAccount,
    isPlatformAdmin: b.isPlatformAdmin ?? false,
    isSpeaker: b.isSpeaker ?? false,
  });
}

/**
 * Compares imported session payload-relevant fields to decide whether update is needed.
 */
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

interface ConferenceHallConfig {
  id?: string;
  conferenceId: string;
  conferenceName: string;
  sessionTypeMappings?: SessionTypeMapping[];
  lastCommunication?: string;
  parameters?: {
    conferenceName?: string;
    sessionTypeFormatMapping?: any;
  };
}

interface SessionTypeMapping {
  sessionTypeId: string;
  conferenceHallFormat: string;
}

interface ImportConfigContext {
  conferenceName: string;
  token: string;
  sessionTypeFormatMapping: SessionTypeFormatMapping;
}

interface ImportRequestContext {
  conferenceId: string;
  requesterEmail: string;
  conferenceRef: admin.firestore.DocumentReference;
  conferenceHallConfigRef: admin.firestore.DocumentReference;
  conference: any;
  config: ImportConfigContext;
}
