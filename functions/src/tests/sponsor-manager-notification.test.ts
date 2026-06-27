import test from 'node:test';
import assert from 'node:assert/strict';
import { Conference } from '../../../shared/src/model/conference.model';
import { Sponsor, SponsorType } from '../../../shared/src/model/sponsor.model';
import {
  buildSponsorAdminUrl,
  buildSponsorManagerNotificationPayload,
} from '../sponsor/communication/notify-manager-on-sponsor-create';

const SAMPLE_SPONSOR_TYPE: SponsorType = {
  id: 'etoile',
  name: 'Etoile',
  description: { en: 'Premium sponsor package', fr: 'Offre sponsor premium' },
  maxNumber: 10,
  price: 3000,
  color: '#000000',
  fontColor: '#ffffff',
  boothNames: [],
  boothAllocationMode: 'MANUAL',
  conferenceTicketQuotas: [],
};

const SAMPLE_CONFERENCE: Conference = {
  id: 'conference-id',
  lastUpdated: '2026-01-10T09:30:00.000Z',
  name: 'Snowcamp',
  edition: 2026,
  location: 'Grenoble',
  website: 'https://snowcamp.io',
  logo: 'https://snowcamp.io/logo.svg',
  languages: ['fr', 'en'],
  description: { fr: 'Conference', en: 'Conference' },
  visible: true,
  organizerEmails: ['orga@snowcamp.io'],
  tracks: [],
  rooms: [],
  sessionTypes: [],
  days: [],
  cfp: {
    startDate: '2025-09-01T00:00:00.000Z',
    endDate: '2025-10-01T00:00:00.000Z',
    website: 'https://cfp.snowcamp.io',
    status: 'CLOSED',
  },
  sponsoring: {
    sponsorTypes: [SAMPLE_SPONSOR_TYPE],
    sponsorBoothMaps: [],
    startDate: '2025-11-01T00:00:00.000Z',
    endDate: '2026-01-01T00:00:00.000Z',
    email: 'sponsors@snowcamp.io',
  },
};

const SAMPLE_SPONSOR: Sponsor = {
  id: 'sponsor-id',
  lastUpdated: '2026-01-10T09:30:00.000Z',
  conferenceId: 'conference-id',
  name: 'Example Corp',
  status: 'CANDIDATE',
  statusDate: '2026-01-10T09:30:00.000Z',
  paymentStatus: 'PENDING',
  paymentStatusDate: '2026-01-10T09:30:00.000Z',
  description: { fr: 'Sponsor', en: 'Sponsor' },
  sponsorTypeId: 'etoile',
  logo: 'https://example.test/logo.svg',
  website: { fr: 'https://example.test', en: 'https://example.test/en' },
  boothName: '',
  boothWishes: [],
  boothWishesDate: '2026-01-10T09:30:00.000Z',
  communicationLanguage: 'fr',
  registrationDate: '2026-01-10T09:30:00.000Z',
  adminEmails: ['contact@example-corp.test'],
  participantTicketIds: [],
};

test('buildSponsorAdminUrl normalizes the admin base URL and encodes route parameters', () => {
  assert.equal(
    buildSponsorAdminUrl('https://admin.example.test/', 'conf 2026', 'sponsor/42'),
    'https://admin.example.test/conference/conf%202026/sponsors/manage/sponsor%2F42'
  );
  assert.equal(buildSponsorAdminUrl('', 'conf', 'sponsor'), '');
});

test('buildSponsorManagerNotificationPayload exposes manager notification variables', () => {
  const payload = buildSponsorManagerNotificationPayload({
    conference: SAMPLE_CONFERENCE,
    sponsor: SAMPLE_SPONSOR,
    sponsorId: 'sponsor-id',
    sponsorType: SAMPLE_SPONSOR_TYPE,
    managerEmail: 'sponsors@snowcamp.io',
    templateId: 123,
    sponsorAdminUrl: 'https://admin.example.test/conference/snowcamp/sponsors/manage/sponsor-id',
  });

  assert.equal(payload.messageType, 'SPONSOR_MANAGER_NOTIFICATION');
  assert.equal(payload.recipients[0].email, 'sponsors@snowcamp.io');
  assert.equal(payload.templateId, 123);
  assert.equal(payload.variables?.conferenceName, 'Snowcamp');
  assert.equal(payload.variables?.conferenceEdition, 2026);
  assert.equal(payload.variables?.sponsorId, 'sponsor-id');
  assert.equal(payload.variables?.sponsorName, 'Example Corp');
  assert.equal(payload.variables?.sponsorTypeId, SAMPLE_SPONSOR_TYPE.id);
  assert.equal(payload.variables?.sponsorTypeName, SAMPLE_SPONSOR_TYPE.name);
  assert.equal(payload.variables?.submissionDate, SAMPLE_SPONSOR.registrationDate);
  assert.equal(
    payload.variables?.sponsorAdminUrl,
    'https://admin.example.test/conference/snowcamp/sponsors/manage/sponsor-id'
  );
});
