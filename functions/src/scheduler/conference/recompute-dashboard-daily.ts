import { onSchedule } from 'firebase-functions/scheduler';
import * as logger from 'firebase-functions/logger';
import { admin } from '../../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import { isConferenceStartInFuture, recomputeAndPersistConferenceDashboard } from '../../conference/dashboard/compute';

/**
 * Recomputes conference dashboard daily.
 */
export const recomputeConferenceDashboardDaily = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'Europe/Paris',
    timeoutSeconds: 540,
  },
  async () => {
    const startedAt = Date.now();
    const db = admin.firestore();
    const conferencesSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).get();

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    logger.info('recomputeConferenceDashboardDaily started', {
      conferencesCount: conferencesSnap.size,
    });

    for (const conferenceDoc of conferencesSnap.docs) {
      const conferenceId = conferenceDoc.id;
      const conferenceData = conferenceDoc.data() as any;
      if (!isConferenceStartInFuture(conferenceData)) {
        skipped += 1;
        continue;
      }

      try {
        await recomputeAndPersistConferenceDashboard(db, {
          conferenceId,
          conferenceData,
          trigger: 'SCHEDULED_DAILY',
        });
        processed += 1;
      } catch (err: unknown) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'unknown error';
        logger.error('recomputeConferenceDashboardDaily conference failed', {
          conferenceId,
          message,
        });
      }
    }

    logger.info('recomputeConferenceDashboardDaily completed', {
      conferencesCount: conferencesSnap.size,
      processed,
      skipped,
      failed,
      elapsedMs: Date.now() - startedAt,
    });
  }
);


