import { describe, expect, it } from 'vitest';
import { Sponsor } from '@shared/model/sponsor.model';
import { SponsorBoothAllocationService } from './sponsor-booth-allocation.service';

function buildSponsor(overrides: Partial<Sponsor>): Sponsor {
  return {
    id: overrides.id ?? 'sponsor-id',
    lastUpdated: overrides.lastUpdated ?? '0',
    conferenceId: overrides.conferenceId ?? 'conf-1',
    name: overrides.name ?? 'Sponsor',
    status: overrides.status ?? 'CONFIRMED',
    statusDate: overrides.statusDate ?? '2026-01-10T09:00:00.000Z',
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    paymentStatusDate: overrides.paymentStatusDate ?? '2026-01-12T09:00:00.000Z',
    description: overrides.description ?? {},
    sponsorTypeId: overrides.sponsorTypeId ?? 'gold',
    logo: overrides.logo ?? '',
    website: overrides.website ?? {},
    boothName: overrides.boothName ?? '',
    boothWishes: overrides.boothWishes ?? [],
    boothWishesDate: overrides.boothWishesDate ?? '2026-01-11T09:00:00.000Z',
    communicationLanguage: overrides.communicationLanguage,
    purchaseOrder: overrides.purchaseOrder,
    address: overrides.address,
    registrationDate: overrides.registrationDate ?? '2026-01-09T09:00:00.000Z',
    acceptedNumber: overrides.acceptedNumber,
    invoiceDueDate: overrides.invoiceDueDate,
    adminEmails: overrides.adminEmails ?? [],
    businessEvents: overrides.businessEvents,
    documents: overrides.documents,
    logistics: overrides.logistics,
    conferenceTickets: overrides.conferenceTickets,
  };
}

describe('SponsorBoothAllocationService', () => {
  const service = new SponsorBoothAllocationService();

  it('allocates by wishes after sorting by registration date', () => {
    const result = service.allocateForSponsorType(
      {
        id: 'gold',
        name: 'Gold',
        description: {},
        maxNumber: 3,
        price: 1000,
        color: '#000',
        fontColor: '#fff',
        boothNames: ['A1', 'A2', 'A3'],
        boothAllocationMode: 'REGISTRATION_DATE',
        conferenceTicketQuotas: [],
      },
      [
        buildSponsor({
          id: 's2',
          name: 'Bravo',
          registrationDate: '2026-02-02T10:00:00.000Z',
          boothWishes: ['A1', 'A2'],
          boothName: 'OLD',
        }),
        buildSponsor({
          id: 's1',
          name: 'Alpha',
          registrationDate: '2026-02-01T10:00:00.000Z',
          boothWishes: ['A1', 'A3'],
          boothName: 'OLD',
        }),
        buildSponsor({
          id: 's3',
          name: 'Charlie',
          registrationDate: '2026-02-03T10:00:00.000Z',
          boothWishes: ['A1'],
          boothName: 'OLD',
        }),
      ]
    );

    expect(result.processedSponsors.map((sponsor) => [sponsor.id, sponsor.boothName])).toEqual([
      ['s1', 'A1'],
      ['s2', 'A2'],
      ['s3', ''],
    ]);
    expect(result.unallocatedSponsors.map((sponsor) => sponsor.id)).toEqual(['s3']);
  });

  it('uses wishes date for sorting and ignores non confirmed or other-type sponsors', () => {
    const result = service.allocateForSponsorType(
      {
        id: 'gold',
        name: 'Gold',
        description: {},
        maxNumber: 3,
        price: 1000,
        color: '#000',
        fontColor: '#fff',
        boothNames: ['A1', 'A2'],
        boothAllocationMode: 'WISHES_DATE',
        conferenceTicketQuotas: [],
      },
      [
        buildSponsor({
          id: 'late',
          boothWishesDate: '2026-02-03T10:00:00.000Z',
          boothWishes: ['A1'],
        }),
        buildSponsor({
          id: 'early',
          boothWishesDate: '2026-02-01T10:00:00.000Z',
          boothWishes: ['A1', 'A2'],
        }),
        buildSponsor({
          id: 'candidate',
          status: 'CANDIDATE',
          boothWishesDate: '2026-01-01T10:00:00.000Z',
          boothWishes: ['A2'],
        }),
        buildSponsor({
          id: 'silver',
          sponsorTypeId: 'silver',
          boothWishesDate: '2026-01-01T10:00:00.000Z',
          boothWishes: ['A2'],
        }),
      ]
    );

    expect(result.processedSponsors.map((sponsor) => sponsor.id)).toEqual(['early', 'late']);
    expect(result.processedSponsors.map((sponsor) => sponsor.boothName)).toEqual(['A1', '']);
  });

  it('leaves sponsors without assignment when none of their wishes can be satisfied', () => {
    const result = service.allocateForSponsorType(
      {
        id: 'gold',
        name: 'Gold',
        description: {},
        maxNumber: 2,
        price: 1000,
        color: '#000',
        fontColor: '#fff',
        boothNames: ['A1', 'A2'],
        boothAllocationMode: 'CONFIRMATION_DATE',
        conferenceTicketQuotas: [],
      },
      [
        buildSponsor({
          id: 'first',
          statusDate: '2026-02-01T10:00:00.000Z',
          boothWishes: ['A1'],
          boothName: 'SHOULD_BE_RESET',
        }),
        buildSponsor({
          id: 'second',
          statusDate: '2026-02-02T10:00:00.000Z',
          boothWishes: ['A1'],
          boothName: 'SHOULD_BE_RESET',
        }),
      ]
    );

    expect(result.processedSponsors.map((sponsor) => [sponsor.id, sponsor.boothName])).toEqual([
      ['first', 'A1'],
      ['second', ''],
    ]);
    expect(result.unallocatedSponsors.map((sponsor) => sponsor.id)).toEqual(['second']);
  });

  it('allocates randomly without using wishes in RANDOM mode', () => {
    const values = [0.8, 0.1, 0.6, 0.2];
    let index = 0;
    const random = (): number => {
      const value = values[index] ?? 0;
      index += 1;
      return value;
    };

    const result = service.allocateForSponsorType(
      {
        id: 'gold',
        name: 'Gold',
        description: {},
        maxNumber: 3,
        price: 1000,
        color: '#000',
        fontColor: '#fff',
        boothNames: ['A1', 'A2'],
        boothAllocationMode: 'RANDOM',
        conferenceTicketQuotas: [],
      },
      [
        buildSponsor({ id: 'first', boothWishes: ['A9'] }),
        buildSponsor({ id: 'second', boothWishes: [] }),
        buildSponsor({ id: 'third', boothWishes: ['A1'] }),
      ],
      { random }
    );

    expect(result.processedSponsors.map((sponsor) => [sponsor.id, sponsor.boothName])).toEqual([
      ['second', 'A1'],
      ['first', 'A2'],
      ['third', ''],
    ]);
  });

  it('does not auto-allocate when the sponsor type has no booth configured', () => {
    const result = service.allocateForSponsorType(
      {
        id: 'gold',
        name: 'Gold',
        description: {},
        maxNumber: 3,
        price: 1000,
        color: '#000',
        fontColor: '#fff',
        boothNames: [' ', ''],
        boothAllocationMode: 'REGISTRATION_DATE',
        conferenceTicketQuotas: [],
      },
      [
        buildSponsor({
          id: 'first',
          boothName: 'OLD',
          boothWishes: ['A1'],
        }),
      ]
    );

    expect(result.allocatedSponsors).toEqual([]);
    expect(result.unallocatedSponsors.map((sponsor) => [sponsor.id, sponsor.boothName])).toEqual([
      ['first', ''],
    ]);
  });
});
