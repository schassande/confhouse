import type { SponsorType } from './sponsor.model';

/** Cached completion state for sponsor ticket allocation. */
export type SponsorTicketCompletionState = 'NO_TICKET' | 'TODO' | 'DONE';

/** Computes the sponsor ticket completion state from quotas and persisted ticket statuses. */
export function computeSponsorTicketCompletion(
  sponsorType: SponsorType | undefined,
  participantTicketStatuses: string[]): SponsorTicketCompletionState {

  const expectedTicketCount = (sponsorType?.conferenceTicketQuotas ?? [])
    .reduce((total, quota) => total + Math.max(0, Number(quota.quota ?? 0)), 0);

  if (expectedTicketCount === 0) return 'NO_TICKET';

  if (!participantTicketStatuses) return 'TODO';

  const createdTicketCount = participantTicketStatuses.filter((status) => status === 'CREATED').length;
  return createdTicketCount < expectedTicketCount ? 'TODO' : 'DONE';
}
