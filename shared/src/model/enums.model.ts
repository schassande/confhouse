/**
 * Enumeration for session status.
 */
export enum SessionStatus {
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  BACKUP = 'BACKUP',
  CANCELLED = 'CANCELLED'
}

/**
 * Enumeration for activity attribute types.
 */
export enum ActivityAttributeType {
  INTEGER = 'INTEGER',
  TEXT = 'TEXT',
  FLOAT = 'FLOAT',
  DATE = 'DATE'
}
