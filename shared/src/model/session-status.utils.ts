import { SessionStatus } from './session.model';

export type SessionStatusTagSeverity =
  'success'
  | 'info'
  | 'warn'
  | 'danger'
  | 'secondary'
  | 'contrast';

export function getSessionStatusSeverity(status: SessionStatus | string | undefined): SessionStatusTagSeverity {
  switch (status) {
    case 'PROGRAMMED':
    case 'SPEAKER_CONFIRMED':
    case 'SCHEDULED':
      return 'success';
    case 'SUBMITTED':
    case 'ACCEPTED':
      return 'info';
    case 'WAITLISTED':
    case 'DRAFT':
      return 'warn';
    case 'DECLINED_BY_SPEAKER':
    case 'REJECTED':
    case 'CANCELLED':
      return 'danger';
    default:
      return 'secondary';
  }
}

export function getSessionStatusTranslationKey(status: SessionStatus | string | undefined): string {
  const value = String(status ?? '').trim().toUpperCase();
  if (!value) {
    return 'SESSION.STATUS.UNKNOWN';
  }
  return `SESSION.STATUS.${value}`;
}
