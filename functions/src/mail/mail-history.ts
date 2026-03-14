import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import { MailHistoryRecord } from './mail-model';

/**
 * Persists one technical mail trace in Firestore.
 *
 * @param db Firestore instance.
 * @param record Mail history record to persist.
 * @returns Created document identifier.
 */
export async function createMailHistoryRecord(
  db: admin.firestore.Firestore,
  record: MailHistoryRecord
): Promise<string> {
  const ref = db.collection(FIRESTORE_COLLECTIONS.MAIL_HISTORY).doc();
  await ref.set(removeUndefinedDeep(record) as MailHistoryRecord);
  logger.info('mail history record created', {
    mailHistoryId: ref.id,
    messageType: record.messageType,
    status: record.status,
  });
  return ref.id;
}

/**
 * Updates one technical mail trace in Firestore.
 *
 * @param db Firestore instance.
 * @param mailHistoryId Document identifier to update.
 * @param patch Partial record patch.
 */
export async function updateMailHistoryRecord(
  db: admin.firestore.Firestore,
  mailHistoryId: string,
  patch: Partial<MailHistoryRecord>
): Promise<void> {
  const sanitizedPatch = removeUndefinedDeep(patch) as Partial<MailHistoryRecord>;
  await db.collection(FIRESTORE_COLLECTIONS.MAIL_HISTORY).doc(mailHistoryId).set(sanitizedPatch, { merge: true });
  logger.info('mail history record updated', {
    mailHistoryId,
    patchedKeys: Object.keys(sanitizedPatch),
  });
}

/**
 * Removes undefined values recursively from Firestore payloads.
 *
 * @param value Raw value to sanitize.
 * @returns Sanitized value without undefined properties.
 */
function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}
