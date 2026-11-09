// Seeds the local Firebase emulators (Firestore + Auth) with demo data for frontend preview.
// Idempotent: documents are upserted and existing accounts are skipped, so it can be re-run safely.
// Usage: npm run emulators (in one terminal), then npm run emulators:seed. See doc/dev.md.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'demo-confhouse';
const FIRESTORE_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_URL = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`;
// "owner" bearer token bypasses security rules on the emulators.
const ADMIN_HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const PASSWORD = 'password';
const now = String(Date.now());

/** Converts a plain JS value into a Firestore REST `Value`. */
function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: toFields(value) } };
}

/** Converts a plain JS object into Firestore REST `fields`. */
function toFields(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, toValue(value)]));
}

/** Creates or replaces one Firestore document. */
async function upsertDoc(collection, doc) {
  const response = await fetch(`${FIRESTORE_URL}/${collection}/${doc.id}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ fields: toFields(doc) }),
  });
  if (!response.ok) {
    throw new Error(`Firestore upsert ${collection}/${doc.id} failed: ${response.status} ${await response.text()}`);
  }
  console.log(`upserted ${collection}/${doc.id}`);
}

/** Deletes one Firestore document; succeeds when it does not exist. */
async function deleteDoc(collection, id) {
  const response = await fetch(`${FIRESTORE_URL}/${collection}/${id}`, { method: 'DELETE', headers: ADMIN_HEADERS });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore delete ${collection}/${id} failed: ${response.status} ${await response.text()}`);
  }
  console.log(`deleted ${collection}/${id}`);
}

/** Creates one verified email/password account, skipping it when it already exists. */
async function ensureAccount(localId, email) {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ localId, email, password: PASSWORD, emailVerified: true }),
  });
  if (response.ok) {
    console.log(`created account ${email}`);
    return;
  }
  const text = await response.text();
  if (text.includes('EMAIL_EXISTS') || text.includes('DUPLICATE_LOCAL_ID')) {
    console.log(`account ${email} already exists`);
    return;
  }
  throw new Error(`Auth account ${email} failed: ${response.status} ${text}`);
}

/** Builds one conference day without schedule slots. */
function day(id, dayIndex, date) {
  return { id, dayIndex, date, slots: [], disabledRoomIds: [], beginTime: '09:00', endTime: '18:00' };
}

/** Builds one person document. The id must match the Auth uid. */
function person(id, firstName, lastName, email) {
  return {
    id,
    lastUpdated: now,
    firstName,
    lastName,
    email,
    hasAccount: true,
    isPlatformAdmin: false,
    isSpeaker: false,
    preferredLanguage: 'fr',
    search: `${lastName} ${firstName} ${email}`.toLowerCase(),
  };
}

/** Builds one activity open to registrations. */
function activity(id, name, icon, start, end, participantTypes, description) {
  return {
    id,
    lastUpdated: now,
    conferenceId: 'snowcamp-2027',
    name,
    icon,
    registerParticipant: true,
    start,
    end,
    description,
    specificAttributes: [],
    participantTypes,
    limitedParticipationNumber: { total: 0, perParticipantType: {} },
  };
}

const conferences = [
  {
    id: 'snowcamp-2027',
    lastUpdated: now,
    name: 'Snowcamp',
    edition: 2027,
    location: 'Grenoble',
    website: 'https://snowcamp.io',
    logo: 'https://snowcamp.io/img/logo/SnowCampLogo500x500.png',
    languages: ['FR', 'EN'],
    description: {
      FR: 'La conférence grenobloise sur les technologies et les innovations logicielles.',
      EN: "Grenoble's conference on software technologies and innovation.",
    },
    visible: true,
    organizerEmails: ['orga@example.com'],
    tracks: [],
    rooms: [],
    sessionTypes: [],
    days: [day('d1', 0, '2027-01-13'), day('d2', 1, '2027-01-14'), day('d3', 2, '2027-01-15')],
    cfp: {
      startDate: '2026-09-01',
      endDate: '2026-10-31',
      website: 'https://conference-hall.io',
      status: 'closed',
    },
  },
  {
    id: 'demo-2026',
    lastUpdated: now,
    name: 'Demo Conf',
    edition: 2026,
    location: 'Lyon',
    website: '',
    logo: '/assets/logo.png',
    languages: ['FR'],
    description: { FR: 'Conférence de démonstration.' },
    visible: true,
    organizerEmails: ['orga@example.com'],
    tracks: [],
    rooms: [],
    sessionTypes: [],
    days: [day('d1', 0, '2026-06-18')],
    cfp: { startDate: '2026-01-10', endDate: '2026-03-01', website: '', status: 'closed' },
  },
];

const activities = [
  activity('unconference', 'Unconférence', 'fa-solid fa-person-skiing', '2027-01-15T09:00:00', '2027-01-15T17:00:00',
    ['ATTENDEE', 'SPEAKER'], { FR: 'Journée sur la neige.', EN: 'A day in the snow.' }),
  activity('speaker-dinner', 'Speaker dinner', 'pi pi-microphone', '2027-01-13T20:00:00', '2027-01-13T23:00:00',
    [], { FR: 'Dîner des speakers.', EN: 'Speakers dinner.' }),
];
// Activities removed from the demo data, deleted on re-seed.
const obsoleteActivityIds = ['party'];

const persons = [
  person('attendee-uid', 'Alice', 'Attendee', 'attendee@example.com'),
  person('orga-uid', 'Oscar', 'Orga', 'orga@example.com'),
];

await upsertDoc('platform-config', {
  id: 'PlatformConfig',
  lastUpdated: now,
  onlyPlatformAdminCanCreateConference: false,
  singleConferenceId: '',
});
for (const conference of conferences) await upsertDoc('conference', conference);
for (const item of activities) await upsertDoc('activity', item);
for (const id of obsoleteActivityIds) await deleteDoc('activity', id);
for (const item of persons) {
  await ensureAccount(item.id, item.email);
  await upsertDoc('person', item);
}
console.log(`Done. Log in with attendee@example.com or orga@example.com, password "${PASSWORD}".`);
