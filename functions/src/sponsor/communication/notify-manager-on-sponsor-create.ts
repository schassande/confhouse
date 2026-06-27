import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { Conference } from '../../../../shared/src/model/conference.model';
import { Sponsor, SponsorType } from '../../../../shared/src/model/sponsor.model';
import { FIRESTORE_COLLECTIONS } from '../../common/firestore-collections';
import { admin } from '../../common/firebase-admin';
import { TransactionalEmailPayload } from '../../mail/mail-model';
import { MailjetService } from '../../mail/mailjet-service';
import { MAILJET_SECRETS } from '../../mail/mailjet-secrets';

const MESSAGE_TYPE = 'SPONSOR_MANAGER_NOTIFICATION';

/**
 * Notifies the conference sponsor manager when a sponsor document is created.
 */
export const notifyManagerOnSponsorCreate = onDocumentCreated(
  {
    document: `${FIRESTORE_COLLECTIONS.SPONSOR}/{sponsorId}`,
    secrets: MAILJET_SECRETS,
  },
  async (event): Promise<void> => {
    const sponsorId = String(event.params.sponsorId ?? '').trim();
    const sponsor = event.data?.data() as Sponsor | undefined;
    if (!sponsor) {
      logger.warn('sponsor manager notification skipped: missing sponsor payload', { sponsorId });
      return;
    }

    const conferenceId = String(sponsor.conferenceId ?? '').trim();
    if (!conferenceId) {
      logger.warn('sponsor manager notification skipped: missing conference id', { sponsorId });
      return;
    }

    try {
      await sendSponsorManagerNotification(sponsorId, sponsor, conferenceId);
    } catch (error) {
      logger.error('sponsor manager notification failed unexpectedly', {
        sponsorId,
        conferenceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * Loads conference context, builds the Mailjet template payload, and sends the notification.
 *
 * @param sponsorId Identifier of the newly created sponsor document.
 * @param sponsor Newly created sponsor payload.
 * @param conferenceId Identifier of the conference linked to the sponsor.
 */
async function sendSponsorManagerNotification(
  sponsorId: string,
  sponsor: Sponsor,
  conferenceId: string
): Promise<void> {
  const db = admin.firestore();
  const conferenceSnap = await db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).doc(conferenceId).get();
  if (!conferenceSnap.exists) {
    logger.warn('sponsor manager notification skipped: conference not found', { sponsorId, conferenceId });
    return;
  }

  const conference = conferenceSnap.data() as Conference;
  const managerEmail = String(conference.sponsoring?.email ?? '').trim();
  if (!managerEmail) {
    logger.warn('sponsor manager notification skipped: missing Conference.sponsoring.email', { sponsorId, conferenceId });
    return;
  }

  const sponsorType = resolveSponsorType(conference, sponsor.sponsorTypeId);
  if (!sponsorType) {
    logger.warn('sponsor manager notification skipped: sponsor type not found', {
      sponsorId,
      conferenceId,
      sponsorTypeId: sponsor.sponsorTypeId,
    });
    return;
  }

  const templateId = parseMailjetTemplateId(sponsorType.templateEmail?.emailManagerNotificationTemplateId);
  if (!templateId) {
    logger.warn('sponsor manager notification skipped: missing manager notification template', {
      sponsorId,
      conferenceId,
      sponsorTypeId: sponsorType.id,
    });
    return;
  }

  const sponsorAdminUrl = buildSponsorAdminUrl(process.env.ADMIN_BASE_URL, conferenceId, sponsorId);
  if (!sponsorAdminUrl) {
    logger.warn('sponsor manager notification skipped: missing ADMIN_BASE_URL', { sponsorId, conferenceId });
    return;
  }

  const payload = buildSponsorManagerNotificationPayload({
    conference,
    sponsor,
    sponsorId,
    sponsorType,
    managerEmail,
    templateId,
    sponsorAdminUrl,
  });
  const mailService = new MailjetService({
    fromEmail: managerEmail,
    fromName: String(conference.sponsoring?.legalEntity ?? conference.name ?? '').trim() || undefined,
  });
  const sendResult = await mailService.sendTransactionalEmail(payload);

  if (!sendResult.ok) {
    logger.error('sponsor manager notification send failed', {
      sponsorId,
      conferenceId,
      sponsorTypeId: sponsorType.id,
      error: sendResult.error,
    });
    return;
  }

  logger.info('sponsor manager notification sent', {
    sponsorId,
    conferenceId,
    sponsorTypeId: sponsorType.id,
    mailjetMessageId: sendResult.messageId,
  });
}

/**
 * Builds the absolute admin URL for one sponsor.
 *
 * @param adminBaseUrl Public administration base URL.
 * @param conferenceId Conference identifier.
 * @param sponsorId Sponsor identifier.
 * @returns Absolute sponsor admin URL or an empty string when the base URL is missing.
 */
export function buildSponsorAdminUrl(adminBaseUrl: unknown, conferenceId: string, sponsorId: string): string {
  const baseUrl = String(adminBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return '';
  }
  return `${baseUrl}/conference/${encodeURIComponent(conferenceId)}/sponsors/manage/${encodeURIComponent(sponsorId)}`;
}

/**
 * Builds the Mailjet template payload used for the manager notification.
 *
 * @param params Notification context.
 * @returns Transactional email payload for Mailjet.
 */
export function buildSponsorManagerNotificationPayload(params: {
  conference: Conference;
  sponsor: Sponsor;
  sponsorId: string;
  sponsorType: SponsorType;
  managerEmail: string;
  templateId: number;
  sponsorAdminUrl: string;
}): TransactionalEmailPayload {
  const submissionDate = String(params.sponsor.registrationDate ?? '').trim() || new Date().toISOString();
  const conferenceName = String(params.conference.name ?? '').trim();
  return {
    messageType: MESSAGE_TYPE,
    subject: `New sponsor application - ${conferenceName}`,
    recipients: [{ email: params.managerEmail }],
    templateId: params.templateId,
    variables: {
      conferenceName,
      conferenceEdition: params.conference.edition,
      sponsorId: params.sponsorId,
      sponsorName: String(params.sponsor.name ?? '').trim(),
      sponsorTypeId: params.sponsorType.id,
      sponsorTypeName: String(params.sponsorType.name ?? '').trim(),
      submissionDate,
      sponsorAdminUrl: params.sponsorAdminUrl,
    },
    metadata: {
      conferenceId: params.sponsor.conferenceId,
      sponsorId: params.sponsorId,
    },
  };
}

/**
 * Resolves the sponsor type matching one sponsor payload.
 *
 * @param conference Conference data containing sponsor type configuration.
 * @param sponsorTypeId Sponsor type identifier to resolve.
 * @returns Matching sponsor type or `undefined`.
 */
function resolveSponsorType(conference: Conference, sponsorTypeId: string): SponsorType | undefined {
  const normalizedSponsorTypeId = String(sponsorTypeId ?? '').trim();
  return (conference.sponsoring?.sponsorTypes ?? []).find((sponsorType) => sponsorType.id === normalizedSponsorTypeId);
}

/**
 * Parses a Mailjet template identifier from sponsor configuration.
 *
 * @param value Raw template identifier.
 * @returns Numeric Mailjet template identifier or `undefined`.
 */
function parseMailjetTemplateId(value: unknown): number | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return undefined;
  }
  const templateId = Number(normalized);
  return Number.isInteger(templateId) && templateId > 0 ? templateId : undefined;
}
