import test from 'node:test';
import assert from 'node:assert/strict';
import { Conference } from '../../../shared/src/model/conference.model';
import { Sponsor, SponsorType } from '../../../shared/src/model/sponsor.model';
import { HttpError } from '../conference/common';
import {
  buildPublicSponsorsPayload,
  ensureGetMethod,
  toPublicSponsorDto,
} from '../sponsor/public-list';

const GOLD_SPONSOR_TYPE: SponsorType = {
  id: 'gold',
  name: 'Gold',
  description: { en: 'Gold offer', fr: 'Offre gold' },
  maxNumber: 10,
  price: 4000,
  color: '#d4af37',
  fontColor: '#000000',
  boothNames: [],
  boothAllocationMode: 'MANUAL',
  conferenceTicketQuotas: [],
};

const SILVER_SPONSOR_TYPE: SponsorType = {
  id: 'silver',
  name: 'Silver',
  description: { en: 'Silver offer', fr: 'Offre silver' },
  maxNumber: 10,
  price: 2000,
  color: '#c0c0c0',
  fontColor: '#000000',
  boothNames: [],
  boothAllocationMode: 'MANUAL',
  conferenceTicketQuotas: [],
};

const CONFERENCE: Conference = {
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
    sponsorTypes: [GOLD_SPONSOR_TYPE, SILVER_SPONSOR_TYPE],
    sponsorBoothMaps: [],
    startDate: '2025-11-01T00:00:00.000Z',
    endDate: '2026-01-01T00:00:00.000Z',
  },
};

function buildSponsor(overrides: Partial<Sponsor> = {}): Sponsor {
  return {
    id: 'sponsor-id',
    lastUpdated: '2026-01-10T09:30:00.000Z',
    conferenceId: 'conference-id',
    name: 'Example Corp',
    status: 'CONFIRMED',
    statusDate: '2026-01-10T09:30:00.000Z',
    paymentStatus: 'PENDING',
    paymentStatusDate: '2026-01-10T09:30:00.000Z',
    description: { fr: 'Sponsor FR', en: 'Sponsor EN' },
    sponsorTypeId: 'gold',
    logo: 'https://example.test/logo.svg',
    website: { fr: 'https://example.test/fr', en: 'https://example.test/en' },
    boothName: 'A12',
    boothWishes: [],
    boothWishesDate: '2026-01-10T09:30:00.000Z',
    communicationLanguage: 'fr',
    registrationDate: '2026-01-10T09:30:00.000Z',
    adminEmails: ['admin@example.test'],
    participantTicketIds: ['ticket-id'],
    businessEvents: [{
      type: 'ORDER_FORM_SENT',
      at: '2026-01-11T09:30:00.000Z',
      by: 'orga@snowcamp.io',
    }],
    ...overrides,
  };
}

test('ensureGetMethod accepts GET and rejects other methods', () => {
  assert.doesNotThrow(() => ensureGetMethod('GET'));
  assert.throws(
    () => ensureGetMethod('POST'),
    (error: unknown) => error instanceof HttpError && error.status === 405
  );
});

test('buildPublicSponsorsPayload only exposes confirmed sponsors from the current conference', () => {
  const payload = buildPublicSponsorsPayload(CONFERENCE, [
    buildSponsor({ id: 'confirmed', name: 'Confirmed' }),
    buildSponsor({ id: 'candidate', name: 'Candidate', status: 'CANDIDATE' }),
    buildSponsor({ id: 'other-conference', name: 'Other', conferenceId: 'other-conference-id' }),
  ], 'conference-id');

  assert.deepEqual(payload.map((sponsor) => sponsor.name), ['Confirmed']);
});

test('buildPublicSponsorsPayload resolves sponsor type names and sorts by sponsor type order', () => {
  const payload = buildPublicSponsorsPayload(CONFERENCE, [
    buildSponsor({
      id: 'silver-a',
      name: 'Silver A',
      sponsorTypeId: 'silver',
      registrationDate: '2026-01-02T00:00:00.000Z',
    }),
    buildSponsor({
      id: 'gold-b',
      name: 'Gold B',
      sponsorTypeId: 'gold',
      registrationDate: '2026-01-03T00:00:00.000Z',
    }),
    buildSponsor({
      id: 'gold-a',
      name: 'Gold A',
      sponsorTypeId: 'gold',
      registrationDate: '2026-01-01T00:00:00.000Z',
    }),
  ], 'conference-id');

  assert.deepEqual(payload.map((sponsor) => sponsor.name), ['Gold A', 'Gold B', 'Silver A']);
  assert.deepEqual(payload.map((sponsor) => sponsor.sponsorTypeName), ['Gold', 'Gold', 'Silver']);
});

test('toPublicSponsorDto keeps the public response shape stable when optional data is missing', () => {
  const dto = toPublicSponsorDto(
    buildSponsor({
      description: {},
      website: {},
      registrationDate: undefined,
      boothName: ' ',
      sponsorTypeId: 'unknown',
    }),
    undefined,
    'conference-id'
  );

  assert.equal(dto.sponsorTypeName, '');
  assert.deepEqual(dto.description, { en: '', fr: '' });
  assert.deepEqual(dto.website, { en: '', fr: '' });
  assert.equal('registrationDate' in dto, false);
  assert.equal('boothName' in dto, false);
});

test('toPublicSponsorDto does not expose private sponsor fields', () => {
  const dto = toPublicSponsorDto(buildSponsor(), GOLD_SPONSOR_TYPE, 'conference-id');
  const rawDto = dto as unknown as Record<string, unknown>;

  assert.equal(rawDto.adminEmails, undefined);
  assert.equal(rawDto.paymentStatus, undefined);
  assert.equal(rawDto.businessEvents, undefined);
  assert.equal(rawDto.participantTicketIds, undefined);
});
