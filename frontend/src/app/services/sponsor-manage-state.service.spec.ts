import { describe, expect, it } from 'vitest';
import { SponsorManageStateService } from './sponsor-manage-state.service';

describe('SponsorManageStateService', () => {
  it('returns defaults until criteria are saved', () => {
    const service = new SponsorManageStateService();

    expect(service.getState('conference-1')).toEqual({
      typeId: 'ALL',
      sponsorStatus: 'ALL',
      paymentStatus: 'ALL',
      sortMode: 'NAME',
    });
  });

  it('keeps criteria separate for each conference', () => {
    const service = new SponsorManageStateService();

    service.setState('conference-1', {
      typeId: 'gold',
      sponsorStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      sortMode: 'PAYMENT_DATE',
    });

    expect(service.getState('conference-1')).toEqual({
      typeId: 'gold',
      sponsorStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      sortMode: 'PAYMENT_DATE',
    });
    expect(service.getState('conference-2').typeId).toBe('ALL');
  });

  it('returns a copy so callers cannot mutate the saved state', () => {
    const service = new SponsorManageStateService();
    const state = service.getState('conference-1');

    state.typeId = 'gold';

    expect(service.getState('conference-1').typeId).toBe('ALL');
  });
});
