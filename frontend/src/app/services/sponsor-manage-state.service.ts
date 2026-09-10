import { Injectable } from '@angular/core';

/** Supported sort modes for the sponsor management list. */
export type SponsorSortMode =
  | 'NAME'
  | 'REGISTRATION_DATE'
  | 'CONFIRMATION_DATE'
  | 'PAYMENT_DATE'
  | 'BOOTH';

/** Filter and sort values restored when returning to a sponsor management list. */
export interface SponsorManageState {
  typeId: string;
  sponsorStatus: string;
  paymentStatus: string;
  sortMode: SponsorSortMode;
}

const DEFAULT_STATE: SponsorManageState = {
  typeId: 'ALL',
  sponsorStatus: 'ALL',
  paymentStatus: 'ALL',
  sortMode: 'NAME',
};

/**
 * Keeps sponsor management filters and sorting in memory for the current application session.
 *
 * State is scoped by conference so navigating between conference management pages does not
 * leak criteria from one conference to another. It is intentionally not persisted externally.
 */
@Injectable({ providedIn: 'root' })
export class SponsorManageStateService {
  private readonly statesByConferenceId = new Map<string, SponsorManageState>();

  /**
   * Returns the saved state for a conference, or the default list state.
   *
   * @param conferenceId Conference whose list state is requested.
   * @returns A copy of the saved filter and sort values.
   */
  getState(conferenceId: string): SponsorManageState {
    return { ...DEFAULT_STATE, ...(this.statesByConferenceId.get(conferenceId) ?? {}) };
  }

  /**
   * Saves the current state for a conference in memory.
   *
   * @param conferenceId Conference whose list state is updated.
   * @param state Filter and sort values to retain.
   */
  setState(conferenceId: string, state: SponsorManageState): void {
    this.statesByConferenceId.set(conferenceId, { ...state });
  }
}
