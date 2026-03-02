export const FIRESTORE_COLLECTIONS = {
  CONFERENCE: 'conference',
  CONFERENCE_DASHBOARD: 'conference-dashboard',
  PLATFORM_CONFIG: 'platform-config',
  CONFERENCE_HALL_CONFIG: 'conference-hall-config',
  VOXXRIN_CONFIG: 'voxxrin-config',
  BILLETWEB_CONFIG: 'billetweb-config',
  CONFERENCE_SECRET: 'conferenceSecret',
  SESSION: 'session',
  PERSON: 'person',
  PERSON_EMAILS: 'person_emails',
  CONFERENCE_SPEAKER: 'conference-speaker',
  ACTIVITY: 'activity',
  ACTIVITY_PARTICIPATION: 'activityParticipation',
  SESSION_ALLOCATION: 'session-allocation',
  SLOT_TYPE: 'slot-type',
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];
