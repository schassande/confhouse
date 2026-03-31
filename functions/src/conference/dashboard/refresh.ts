import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../../common/firebase-admin';
import {
  HttpError,
  ensurePostMethod,
  parseConferenceId,
  getRequesterEmailFromAuthorization,
  loadConference,
  ensureRequesterIsOrganizer,
} from '../common';
import { recomputeAndPersistConferenceDashboard } from './compute';

/**
 * Refreshes conference dashboard.
 * @param req HTTP request.
 * @param res HTTP response.
 */
export const refreshConferenceDashboard = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  const startedAt = Date.now();
  try {
    ensurePostMethod(req.method, 'refreshConferenceDashboard');
    const conferenceId = parseConferenceId(req.body, 'refreshConferenceDashboard');
    const requesterEmail = await getRequesterEmailFromAuthorization(
      req.headers.authorization,
      conferenceId,
      'refreshConferenceDashboard'
    );

    const db = admin.firestore();
    const { conferenceData } = await loadConference(db, conferenceId, 'refreshConferenceDashboard');
    ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, 'refreshConferenceDashboard');

    const report = await recomputeAndPersistConferenceDashboard(db, {
      conferenceId,
      conferenceData,
      trigger: 'MANUAL_REFRESH',
    });

    logger.info('refreshConferenceDashboard completed', {
      conferenceId,
      requesterEmail,
      elapsedMs: Date.now() - startedAt,
      computedAt: report.dashboard.computedAt,
      historyId: report.historyId,
    });
    res.status(200).send({ report });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('refreshConferenceDashboard failed', {
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({
      error: 'Dashboard refresh failed',
      code: 'CONFERENCE_DASHBOARD_REFRESH_ERROR',
      detail: message,
    });
  }
});


