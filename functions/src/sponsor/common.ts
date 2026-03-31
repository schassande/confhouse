import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import {
  authorizeConferenceOrganizerRequest,
  ensurePostMethod,
  getRequesterEmailFromAuthorization,
  HttpError,
  isRequesterOrganizer,
  loadConference,
  parseConferenceId,
  AuthorizedConferenceOrganizerContext,
} from '../conference/common';
import {
  applySponsorPaymentStatusTransition,
  applySponsorStatusTransition,
  applySuccessfulSponsorBusinessEvent,
} from './sponsor-helpers';
import {
  SponsorBusinessEvent,
  SponsorBusinessEventType,
  SponsorCommunicationLanguage,
  SponsorPaymentStatus,
  SponsorRecord,
  SponsorStatus,
} from './sponsor-model';
import { createMailHistoryRecord, updateMailHistoryRecord } from '../mail/mail-history';
import { MailjetService } from '../mail/mailjet-service';
import { buildSponsorInvoicePayload, buildSponsorOrderFormPayload, buildSponsorPaidInvoicePayload } from '../documents/sponsor-document-builders';
import { buildSponsorDocumentFilename } from '../documents/sponsor-document-filename';
import { renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import { MailAttachment, MailRecipient, TransactionalEmailPayload } from '../mail/mail-model';
import { MAILJET_SECRETS } from '../mail/mailjet-secrets';
import {
  allocateNextSponsorAcceptedNumber,
  buildSponsorCommunicationRecipients,
  resolveSponsorCommunicationLanguage,
} from './sponsor-communication';
import { SponsorDocumentLocale, SponsorDocumentPayload } from '../documents/sponsor-document-model';
import {
  buildSponsorMailVariables,
  parseMailjetTemplateId,
  resolveSponsorMailTemplateId,
  SponsorTemplateMessageType,
} from './sponsor-mail-template';

type SponsorActionOperation =
  | 'UPDATE_STATUS'
  | 'UPDATE_PAYMENT_STATUS'
  | 'ASSIGN_BOOTH'
  | 'ALLOCATE_TICKETS'
  | 'SEND_ORDER_FORM'
  | 'SEND_INVOICE'
  | 'SEND_PAID_INVOICE'
  | 'SEND_PAYMENT_REMINDER'
  | 'SEND_APPLICATION_CONFIRMATION'
  | 'SEND_ADMINISTRATIVE_SUMMARY';

type SponsorDocumentDownloadOperation = 'DOWNLOAD_ORDER_FORM' | 'DOWNLOAD_INVOICE' | 'DOWNLOAD_PAID_INVOICE';

interface SponsorActionReport {
  sponsor: Record<string, unknown>;
  mailHistoryId?: string;
  sendResult?: {
    ok: boolean;
    messageId?: string;
    error?: string;
  };
}

interface AuthorizedSponsorContext {
  db: AuthorizedConferenceOrganizerContext['db'];
  conferenceId: AuthorizedConferenceOrganizerContext['conferenceId'];
  sponsorId: string;
  requesterEmail: AuthorizedConferenceOrganizerContext['requesterEmail'];
  conferenceRef: AuthorizedConferenceOrganizerContext['conferenceRef'];
  conferenceData: AuthorizedConferenceOrganizerContext['conferenceData'];
  sponsorRef: admin.firestore.DocumentReference;
  sponsorData: Record<string, unknown>;
}

interface SendSponsorNotificationOptions {
  messageType: string;
  subject: string;
  textPart: string;
  eventType?: SponsorBusinessEventType;
  idempotenceKey?: string;
  templateId?: number;
  variables?: Record<string, unknown>;
}

interface SendSponsorDocumentOptions {
  messageType: string;
  eventType: SponsorBusinessEventType;
  buildPayload: () => SponsorDocumentPayload;
  buildEmailPayload: (
    attachment: MailAttachment,
    locale: SponsorDocumentLocale
  ) => Omit<TransactionalEmailPayload, 'recipients' | 'ccRecipients'>;
  buildIdempotenceKey: (payload: SponsorDocumentPayload) => string;
}

interface ExistingMailHistoryMatch {
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  mailjetMessageId?: string;
}

interface GeneratedSponsorDocument {
  filename: string;
  contentType: string;
  base64Content: string;
}

type SponsorMailMessageType =
  | 'SPONSOR_ORDER_FORM'
  | 'SPONSOR_INVOICE'
  | 'SPONSOR_PAID_INVOICE'
  | 'SPONSOR_PAYMENT_REMINDER'
  | 'SPONSOR_APPLICATION_CONFIRMATION'
  | 'SPONSOR_ADMINISTRATIVE_SUMMARY';

/**
 * Resolves one optional Mailjet template transport payload from sponsor template configuration.
 *
 * @param context Authorized sponsor action context.
 * @param messageType Sponsor email message type.
 * @param recipients Resolved recipients.
 * @param sender Resolved sender.
 * @param documentPayload Optional normalized document payload.
 * @returns Template transport configuration or an empty object when the fallback email body must be used.
 */
function resolveSponsorTemplateTransport(
  context: AuthorizedSponsorContext,
  messageType: SponsorTemplateMessageType,
  recipients: { to: MailRecipient[]; cc: MailRecipient[] },
  sender: { email: string; name?: string },
  documentPayload?: SponsorDocumentPayload
): Pick<TransactionalEmailPayload, 'templateId' | 'variables'> {
  const rawTemplateId = resolveSponsorMailTemplateId(messageType, context.conferenceData as any, context.sponsorData as any);
  if (!rawTemplateId) {
    return {};
  }

  const templateId = parseMailjetTemplateId(rawTemplateId);
  if (templateId === undefined) {
    logger.warn('sponsor mail template ignored because the configured provider id is not a numeric Mailjet template id', {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      messageType,
      rawTemplateId,
    });
    return {};
  }

  return {
    templateId,
    variables: buildSponsorMailVariables({
      messageType,
      conference: context.conferenceData as any,
      sponsor: context.sponsorData as any,
      recipients,
      sender,
      documentPayload,
    }),
  };
}

/**
 * Builds one sponsor notification option bag with optional template transport fallback.
 *
 * @param params Template-aware notification parameters.
 * @returns Notification options ready for sending.
 */
function buildSponsorTemplateAwareNotificationOptions(params: {
  context: AuthorizedSponsorContext;
  messageType: SponsorTemplateMessageType;
  locale: SponsorDocumentLocale;
  textPart: string;
  eventType?: SponsorBusinessEventType;
}): SendSponsorNotificationOptions {
  const recipients = resolveSponsorMailRecipients(params.context);
  const sender = resolveSponsorMailSender(params.context.conferenceData);
  const templateTransport = resolveSponsorTemplateTransport(
    params.context,
    params.messageType,
    recipients,
    sender
  );

  return {
    messageType: params.messageType,
    eventType: params.eventType,
    subject: buildLocalizedSponsorMailSubject(params.messageType, params.locale, params.context.conferenceData),
    textPart: params.textPart,
    ...templateTransport,
  };
}
/**
 * Updates sponsor business status through an organizer-only explicit backend action.
 */
export const updateSponsorStatus = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'UPDATE_STATUS', async (context) => {
    const nextStatus = parseSponsorStatus(req.body?.status);
    const statusDate = parseOptionalIsoDate(req.body?.statusDate) ?? new Date().toISOString();
    const nextSponsor = await updateSponsorStatusWithAcceptanceNumber(context, nextStatus, statusDate);
    return { sponsor: nextSponsor };
  });
});

/**
 * Updates sponsor payment status through an organizer-only explicit backend action.
 */
export const updateSponsorPaymentStatus = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'UPDATE_PAYMENT_STATUS', async (context) => {
    const nextPaymentStatus = parseSponsorPaymentStatus(req.body?.paymentStatus);
    const paymentStatusDate = parseOptionalIsoDate(req.body?.paymentStatusDate) ?? new Date().toISOString();
    const nextSponsor = applySponsorPaymentStatusTransition(
      context.sponsorData as unknown as SponsorRecord,
      nextPaymentStatus,
      paymentStatusDate
    );
    await context.sponsorRef.set(nextSponsor, { merge: true });
    return { sponsor: { ...context.sponsorData, ...nextSponsor, id: context.sponsorId } };
  });
});

/**
 * Assigns or changes a sponsor booth through an organizer-only explicit backend action.
 */
export const assignSponsorBooth = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'ASSIGN_BOOTH', async (context) => {
    const boothName = String(req.body?.boothName ?? '').trim();
    if (!boothName) {
      throw new HttpError(400, 'Missing boothName', 'assignSponsorBooth rejected: missing boothName');
    }

    const previousBoothName = String(context.sponsorData?.boothName ?? '').trim();
    const eventType: SponsorBusinessEventType = previousBoothName && previousBoothName !== boothName
      ? 'BOOTH_CHANGED'
      : 'BOOTH_ASSIGNED';
    const eventAt = new Date().toISOString();
    const event: SponsorBusinessEvent = {
      type: eventType,
      at: eventAt,
      by: context.requesterEmail,
      metadata: {
        boothName,
      },
    };

    const sponsorWithEvent = applySuccessfulSponsorBusinessEvent(
      {
        ...(context.sponsorData as unknown as SponsorRecord),
        boothName,
      },
      event
    );
    await context.sponsorRef.set(
      {
        boothName,
        businessEvents: sponsorWithEvent.businessEvents,
        logistics: sponsorWithEvent.logistics,
      },
      { merge: true }
    );
    return {
      sponsor: {
        ...context.sponsorData,
        boothName,
        businessEvents: sponsorWithEvent.businessEvents,
        logistics: sponsorWithEvent.logistics,
        id: context.sponsorId,
      },
    };
  });
});

/**
 * Stores sponsor conference ticket allocation through an organizer-only explicit backend action.
 */
export const allocateSponsorTickets = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'ALLOCATE_TICKETS', async (context) => {
    const conferenceTickets = Array.isArray(req.body?.conferenceTickets) ? req.body.conferenceTickets : [];
    const eventAt = new Date().toISOString();
    const event: SponsorBusinessEvent = {
      type: 'TICKETS_ALLOCATED',
      at: eventAt,
      by: context.requesterEmail,
      metadata: {
        allocatedCount: conferenceTickets.length,
      },
    };
    const sponsorWithEvent = applySuccessfulSponsorBusinessEvent(
      {
        ...(context.sponsorData as unknown as SponsorRecord),
        conferenceTickets,
      } as SponsorRecord & { conferenceTickets: unknown[] },
      event
    ) as SponsorRecord & { conferenceTickets: unknown[] };
    await context.sponsorRef.set(
      {
        conferenceTickets,
        businessEvents: sponsorWithEvent.businessEvents,
        logistics: sponsorWithEvent.logistics,
      },
      { merge: true }
    );
    return {
      sponsor: {
        ...context.sponsorData,
        conferenceTickets,
        businessEvents: sponsorWithEvent.businessEvents,
        logistics: sponsorWithEvent.logistics,
        id: context.sponsorId,
      },
    };
  });
});

/**
 * Sends the sponsor order form email with its generated PDF attachment.
 */
export const sendSponsorOrderForm = onRequest({ cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS }, async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_ORDER_FORM', async (context) =>
    await sendSponsorDocumentEmail(context, {
      messageType: 'SPONSOR_ORDER_FORM',
      eventType: 'ORDER_FORM_SENT',
      buildIdempotenceKey: (payload) => buildSponsorDocumentIdempotenceKey(
        'SPONSOR_ORDER_FORM',
        context.conferenceId,
        context.sponsorId,
        `${payload.documentNumber ?? 'latest'}:${payload.issueDate}`
      ),
      buildPayload: () => buildSponsorOrderFormPayload(context.conferenceData as any, context.sponsorData as any),
      buildEmailPayload: (attachment, locale) => ({
        messageType: 'SPONSOR_ORDER_FORM',
        subject: buildLocalizedSponsorMailSubject('SPONSOR_ORDER_FORM', locale, context.conferenceData),
        textPart: buildLocalizedSponsorMailText('SPONSOR_ORDER_FORM', locale, context.conferenceData),
        attachments: [attachment],
        metadata: {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
          locale,
        },
      }),
    })
  );
});

/**
 * Sends the sponsor invoice email with its generated PDF attachment.
 */
export const sendSponsorInvoice = onRequest({ cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS }, async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_INVOICE', async (context) =>
    await sendSponsorDocumentEmail(context, {
      messageType: 'SPONSOR_INVOICE',
      eventType: 'INVOICE_SENT',
      buildIdempotenceKey: (payload) => buildSponsorDocumentIdempotenceKey(
        'SPONSOR_INVOICE',
        context.conferenceId,
        context.sponsorId,
        `${payload.documentNumber ?? 'latest'}:${payload.issueDate}:${payload.dueDate ?? ''}`
      ),
      buildPayload: () => buildSponsorInvoicePayload(context.conferenceData as any, context.sponsorData as any),
      buildEmailPayload: (attachment, locale) => ({
        messageType: 'SPONSOR_INVOICE',
        subject: buildLocalizedSponsorMailSubject('SPONSOR_INVOICE', locale, context.conferenceData),
        textPart: buildLocalizedSponsorMailText('SPONSOR_INVOICE', locale, context.conferenceData),
        attachments: [attachment],
        metadata: {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
          locale,
        },
      }),
    })
  );
});

/**
 * Sends the sponsor paid invoice email with its generated PDF attachment.
 */
export const sendSponsorPaidInvoice = onRequest({ cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS }, async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_PAID_INVOICE', async (context) => {
    ensureSponsorPaymentMarkedAsPaid(context, 'SEND_PAID_INVOICE');
    return await sendSponsorDocumentEmail(context, {
      messageType: 'SPONSOR_PAID_INVOICE',
      eventType: 'INVOICE_PAID_SENT',
      buildIdempotenceKey: (payload) => buildSponsorDocumentIdempotenceKey(
        'SPONSOR_PAID_INVOICE',
        context.conferenceId,
        context.sponsorId,
        `${payload.documentNumber ?? 'latest'}:${payload.issueDate}:${payload.dueDate ?? ''}:${String(context.sponsorData.paymentStatusDate ?? '').trim()}`
      ),
      buildPayload: () => buildSponsorPaidInvoicePayload(context.conferenceData as any, context.sponsorData as any),
      buildEmailPayload: (attachment, locale) => ({
        messageType: 'SPONSOR_PAID_INVOICE',
        subject: buildLocalizedSponsorMailSubject('SPONSOR_PAID_INVOICE', locale, context.conferenceData),
        textPart: buildLocalizedSponsorMailText('SPONSOR_PAID_INVOICE', locale, context.conferenceData),
        attachments: [attachment],
        metadata: {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
          locale,
        },
      }),
    });
  });
});

/**
 * Sends the sponsor payment reminder email.
 */
export const sendSponsorPaymentReminder = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
    await handleSponsorAction(req, res, 'SEND_PAYMENT_REMINDER', async (context) => {
      const locale = resolveContextSponsorLocale(context);
      return await sendSponsorNotificationEmail(context, buildSponsorTemplateAwareNotificationOptions({
        context,
        messageType: 'SPONSOR_PAYMENT_REMINDER',
        eventType: 'PAYMENT_REMINDER_SENT',
        locale,
        textPart: String(req.body?.textPart ?? '').trim()
          || buildLocalizedSponsorMailText('SPONSOR_PAYMENT_REMINDER', locale, context.conferenceData),
      }));
    });
  }
);

/**
 * Sends the sponsor application confirmation email.
 */
export const sendSponsorApplicationConfirmation = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
    await handleSponsorAction(req, res, 'SEND_APPLICATION_CONFIRMATION', async (context) => {
      const locale = resolveContextSponsorLocale(context);
      return await sendSponsorNotificationEmail(context, buildSponsorTemplateAwareNotificationOptions({
        context,
        messageType: 'SPONSOR_APPLICATION_CONFIRMATION',
        locale,
        textPart: String(req.body?.textPart ?? '').trim()
          || buildLocalizedSponsorMailText('SPONSOR_APPLICATION_CONFIRMATION', locale, context.conferenceData),
      }), false);
    });
  }
);

/**
 * Sends the sponsor administrative summary email.
 */
export const sendSponsorAdministrativeSummary = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
    await handleSponsorAction(req, res, 'SEND_ADMINISTRATIVE_SUMMARY', async (context) => {
      const locale = resolveContextSponsorLocale(context);
      return await sendSponsorNotificationEmail(context, {
        messageType: 'SPONSOR_ADMINISTRATIVE_SUMMARY',
        subject: buildLocalizedSponsorMailSubject('SPONSOR_ADMINISTRATIVE_SUMMARY', locale, context.conferenceData),
        textPart: String(req.body?.textPart ?? '').trim()
          || buildLocalizedSponsorMailText('SPONSOR_ADMINISTRATIVE_SUMMARY', locale, context.conferenceData),
      }, false);
    });
  }
);

/**
 * Regenerates and returns the sponsor order form for one sponsor admin or conference organizer.
 */
export const downloadSponsorOrderForm = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorDocumentDownload(req, res, 'DOWNLOAD_ORDER_FORM', 'ORDER_FORM');
});

/**
 * Regenerates and returns the sponsor invoice for one sponsor admin or conference organizer.
 */
export const downloadSponsorInvoice = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorDocumentDownload(req, res, 'DOWNLOAD_INVOICE', 'INVOICE');
});

/**
 * Regenerates and returns the sponsor paid invoice for one sponsor admin or conference organizer.
 */
export const downloadSponsorPaidInvoice = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
  await handleSponsorDocumentDownload(req, res, 'DOWNLOAD_PAID_INVOICE', 'INVOICE_PAID');
});

/**
 * Updates one sponsor status and assigns the immutable accepted number when first confirmed.
 *
 * @param context Authorized sponsor organizer context.
 * @param nextStatus Target sponsor status.
 * @param statusDate Effective status date.
 * @returns Updated sponsor payload.
 */
async function updateSponsorStatusWithAcceptanceNumber(
  context: AuthorizedSponsorContext,
  nextStatus: SponsorStatus,
  statusDate: string
): Promise<Record<string, unknown>> {
  return await context.db.runTransaction(async (transaction) => {
    const [conferenceSnap, sponsorSnap] = await Promise.all([
      transaction.get(context.conferenceRef),
      transaction.get(context.sponsorRef),
    ]);

    if (!conferenceSnap.exists) {
      throw new HttpError(404, 'Conference not found', 'UPDATE_STATUS rejected: conference not found', {
        conferenceId: context.conferenceId,
      });
    }
    if (!sponsorSnap.exists) {
      throw new HttpError(404, 'Sponsor not found', 'UPDATE_STATUS rejected: sponsor not found', {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
      });
    }

    const conferenceData = conferenceSnap.data() as Record<string, unknown>;
    const sponsorData = sponsorSnap.data() as SponsorRecord & Record<string, unknown>;
    const nextSponsor = applySponsorStatusTransition(sponsorData, nextStatus, statusDate) as SponsorRecord & Record<string, unknown>;
    let acceptedNumber = Number(sponsorData.acceptedNumber);

    if (nextStatus === 'CONFIRMED' && !Number.isFinite(acceptedNumber)) {
      const allocation = allocateNextSponsorAcceptedNumber(
        Number((conferenceData.sponsoring as { counter?: number } | undefined)?.counter)
      );
      acceptedNumber = allocation.acceptedNumber;
      nextSponsor.acceptedNumber = acceptedNumber;

      transaction.set(context.conferenceRef, {
        sponsoring: {
          ...((conferenceData.sponsoring as Record<string, unknown> | undefined) ?? {}),
          counter: allocation.nextCounter,
        },
      }, { merge: true });
    }

    transaction.set(context.sponsorRef, nextSponsor, { merge: true });
    return {
      ...sponsorData,
      ...nextSponsor,
      acceptedNumber: Number.isFinite(acceptedNumber) ? acceptedNumber : sponsorData.acceptedNumber,
      id: context.sponsorId,
    };
  });
}

/**
 * Builds and sends one sponsor document email with a generated PDF attachment.
 *
 * @param context Authorized sponsor action context.
 * @param options Document send options.
 * @returns Sponsor action report.
 */
async function sendSponsorDocumentEmail(
  context: AuthorizedSponsorContext,
  options: SendSponsorDocumentOptions
): Promise<SponsorActionReport> {
  const payload = options.buildPayload();
  const locale = payload.locale;
  const attachment = await generateSponsorDocumentAttachment(payload);
  const emailPayload = options.buildEmailPayload(attachment, locale);
  const recipients = resolveSponsorMailRecipients(context);
  const sender = resolveSponsorMailSender(context.conferenceData);
  const templateTransport = resolveSponsorTemplateTransport(
    context,
    options.messageType as SponsorTemplateMessageType,
    recipients,
    sender,
    payload
  );

  return await sendSponsorNotificationEmail(context, {
    messageType: emailPayload.messageType,
    eventType: options.eventType,
    subject: emailPayload.subject,
    textPart: emailPayload.textPart ?? '',
    idempotenceKey: options.buildIdempotenceKey(payload),
    templateId: templateTransport.templateId,
    variables: templateTransport.variables,
  }, true, emailPayload.attachments);
}

/**
 * Regenerates one previously sent sponsor document and returns it to one sponsor admin or conference organizer.
 *
 * @param req HTTP request.
 * @param res HTTP response.
 * @param operation Download operation name.
 * @param documentType Requested document type.
 */
async function handleSponsorDocumentDownload(
  req: any,
  res: any,
  operation: SponsorDocumentDownloadOperation,
  documentType: 'ORDER_FORM' | 'INVOICE' | 'INVOICE_PAID'
): Promise<void> {
  const startedAt = Date.now();
  try {
    const context = await authorizeSponsorDocumentDownloadRequest(req, operation);
    const sentAt = getPreviouslySentDocumentTimestamp(context.sponsorData, documentType);
    if (!sentAt) {
      throw new HttpError(
        409,
        'Document was never sent',
        `${operation} rejected: requested document has not been sent yet`,
        {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
          documentType,
        }
      );
    }
    const payload = documentType === 'ORDER_FORM'
      ? buildSponsorOrderFormPayload(context.conferenceData as any, context.sponsorData as any)
      : documentType === 'INVOICE'
        ? buildSponsorInvoicePayload(context.conferenceData as any, context.sponsorData as any)
        : buildSponsorPaidInvoicePayload(context.conferenceData as any, context.sponsorData as any);

    const document = await generateSponsorDocumentAttachment(payload);
    logger.info('sponsor document regenerated for download', {
      operation,
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      requesterEmail: context.requesterEmail,
      documentType,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(200).send({
      sponsor: {
        ...context.sponsorData,
        id: context.sponsorId,
      },
      document,
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('sponsor document download failed', { operation, message, elapsedMs: Date.now() - startedAt });
    res.status(500).send({
      error: 'Sponsor document download failed',
      code: 'SPONSOR_DOCUMENT_DOWNLOAD_ERROR',
      detail: message,
    });
  }
}

/**
 * Generates one sponsor document attachment from a normalized payload.
 *
 * @param payload Normalized document payload.
 * @returns Generated document attachment.
 */
async function generateSponsorDocumentAttachment(
  payload: SponsorDocumentPayload
): Promise<GeneratedSponsorDocument> {
  const pdfBuffer = await renderSponsorDocumentPdf(payload);
  return {
    filename: buildSponsorDocumentFilename(payload),
    contentType: 'application/pdf',
    base64Content: pdfBuffer.toString('base64'),
  };
}

/**
 * Sends one sponsor notification email, persists technical mail history,
 * and optionally appends the corresponding sponsor business event.
 *
 * @param context Authorized sponsor action context.
 * @param options Notification send options.
 * @param writeBusinessEvent Whether the sponsor history must be updated on success.
 * @param attachments Optional attachments to send with the email.
 * @returns Sponsor action report.
 */
async function sendSponsorNotificationEmail(
  context: AuthorizedSponsorContext,
  options: SendSponsorNotificationOptions,
  writeBusinessEvent = true,
  attachments?: MailAttachment[]
): Promise<SponsorActionReport> {
  const pendingMail = options.idempotenceKey
    ? await findPendingMailHistoryByIdempotenceKey(context.db, options.idempotenceKey)
    : undefined;
  if (pendingMail) {
    throw new HttpError(
      409,
      'A matching document send is already in progress',
      `${options.messageType} rejected: idempotent send already pending`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        idempotenceKey: options.idempotenceKey,
        mailHistoryId: pendingMail.id,
      }
    );
  }

  const recipients = resolveSponsorMailRecipients(context);
  const payload: TransactionalEmailPayload = {
    messageType: options.messageType,
    subject: options.subject,
    recipients: recipients.to,
    ccRecipients: recipients.cc,
    textPart: options.textPart,
    templateId: options.templateId,
    variables: options.variables,
    attachments,
    idempotenceKey: options.idempotenceKey,
    metadata: {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
    },
  };
  const sender = resolveSponsorMailSender(context.conferenceData);

  const mailHistoryId = await createMailHistoryRecord(context.db, {
    messageType: payload.messageType,
    recipientEmails: [...payload.recipients, ...(payload.ccRecipients ?? [])].map((recipient) => recipient.email),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    triggeredBy: context.requesterEmail,
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    idempotenceKey: payload.idempotenceKey,
    metadata: payload.metadata,
  });

  const mailService = new MailjetService({
    fromEmail: sender.email,
    fromName: sender.name,
  });

  let sendResult;
  try {
    sendResult = await mailService.sendTransactionalEmail(payload);
    if (options.messageType === 'SPONSOR_INVOICE') {
      logger.info('sponsor invoice Mailjet response received', {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        mailHistoryId,
        templateId: payload.templateId,
        attachmentCount: attachments?.length ?? 0,
        ok: sendResult.ok,
        messageId: sendResult.ok ? sendResult.messageId : undefined,
        error: sendResult.ok ? undefined : sendResult.error,
        rawResponse: sendResult.raw,
      });
    }
  } catch (error: unknown) {
    console.error(error, payload);
    const message = error instanceof Error ? error.message : 'unknown error';
    await updateMailHistoryRecord(context.db, mailHistoryId, {
      status: 'FAILED',
      error: message,
    });
    throw new HttpError(
      500,
      'Mail send setup failed',
      `${options.messageType} failed: transport setup error`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        mailHistoryId,
        error: message,
      }
    );
  }

  if (!sendResult.ok) {
    await updateMailHistoryRecord(context.db, mailHistoryId, {
      status: 'FAILED',
      error: sendResult.error,
    });
    throw new HttpError(
      502,
      'Mail send failed',
      `${options.messageType} failed: mail send failed`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        mailHistoryId,
        error: sendResult.error,
      }
    );
  }

  await updateMailHistoryRecord(context.db, mailHistoryId, {
    status: 'SENT',
    sentAt: new Date().toISOString(),
    mailjetMessageId: sendResult.messageId,
  });

  let nextSponsor: Record<string, unknown> = context.sponsorData;
  if (writeBusinessEvent && options.eventType) {
    const event: SponsorBusinessEvent = {
      type: options.eventType,
      at: new Date().toISOString(),
      by: context.requesterEmail,
      metadata: {
        mailHistoryId,
        mailjetMessageId: sendResult.messageId,
      },
    };
    nextSponsor = applySuccessfulSponsorBusinessEvent(context.sponsorData as unknown as SponsorRecord, event) as unknown as Record<string, unknown>;
    await context.sponsorRef.set(
      sanitizeFirestorePatch({
        businessEvents: nextSponsor.businessEvents,
        documents: nextSponsor.documents,
        logistics: nextSponsor.logistics,
      }),
      { merge: true }
    );
  }

  return {
    sponsor: {
      ...context.sponsorData,
      ...nextSponsor,
      id: context.sponsorId,
    },
    mailHistoryId,
    sendResult: {
      ok: true,
      messageId: sendResult.messageId,
    },
  };
}

/**
 * Orchestrates one organizer-only sponsor backend action and converts failures to HTTP responses.
 *
 * @param req HTTP request.
 * @param res HTTP response.
 * @param operation Sponsor action name.
 * @param action Business action implementation.
 */
async function handleSponsorAction(
  req: any,
  res: any,
  operation: SponsorActionOperation,
  action: (context: AuthorizedSponsorContext) => Promise<SponsorActionReport>
): Promise<void> {
  const startedAt = Date.now();
  try {
    const context = await authorizeSponsorOrganizerRequest(req, operation);
    const report = await action(context);
    logger.info('sponsor action completed', {
      operation,
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      requesterEmail: context.requesterEmail,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(200).send({ report });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      logger.warn(err.logMessage, err.meta);
      res.status(err.status).send({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.error('sponsor action failed', {
      operation,
      message,
      elapsedMs: Date.now() - startedAt,
    });
    res.status(500).send({
      error: 'Sponsor action failed',
      code: 'SPONSOR_ACTION_ERROR',
      detail: message,
    });
  }
}

/**
 * Authenticates the requester, verifies organizer authorization,
 * and loads the target conference and sponsor.
 *
 * @param req HTTP request.
 * @param operation Sponsor action name.
 * @returns Authorized sponsor context.
 */
async function authorizeSponsorOrganizerRequest(req: any, operation: SponsorActionOperation): Promise<AuthorizedSponsorContext> {
  const organizerContext = await authorizeConferenceOrganizerRequest(req, operation);
  const { db, conferenceId, requesterEmail, conferenceRef, conferenceData } = organizerContext;
  const sponsorId = parseSponsorId(req.body, operation);
  const sponsorRef = db.collection(FIRESTORE_COLLECTIONS.SPONSOR).doc(sponsorId);
  const sponsorSnap = await sponsorRef.get();
  if (!sponsorSnap.exists) {
    throw new HttpError(404, 'Sponsor not found', `${operation} rejected: sponsor not found`, {
      conferenceId,
      sponsorId,
    });
  }
  const sponsorData = sponsorSnap.data() as Record<string, unknown>;
  if (String(sponsorData?.conferenceId ?? '').trim() !== conferenceId) {
    throw new HttpError(400, 'Sponsor does not belong to conference', `${operation} rejected: sponsor conference mismatch`, {
      conferenceId,
      sponsorId,
    });
  }
  return {
    db,
    conferenceId,
    sponsorId,
    requesterEmail,
    conferenceRef,
    conferenceData: conferenceData as Record<string, unknown>,
    sponsorRef,
    sponsorData,
  };
}

/**
 * Authenticates one sponsor admin or organizer requester and loads the target conference and sponsor.
 *
 * @param req HTTP request.
 * @param operation Sponsor download operation name.
 * @returns Authorized sponsor context.
 */
async function authorizeSponsorDocumentDownloadRequest(
  req: any,
  operation: SponsorDocumentDownloadOperation
): Promise<AuthorizedSponsorContext> {
  ensurePostMethod(req.method, operation);
  const db = admin.firestore();
  const conferenceId = parseConferenceId(req.body, operation);
  const sponsorId = parseSponsorId(req.body, operation);
  const requesterEmail = await getRequesterEmailFromAuthorization(req.headers.authorization, conferenceId, operation);
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, operation);
  const sponsorRef = db.collection(FIRESTORE_COLLECTIONS.SPONSOR).doc(sponsorId);
  const sponsorSnap = await sponsorRef.get();
  if (!sponsorSnap.exists) {
    throw new HttpError(404, 'Sponsor not found', `${operation} rejected: sponsor not found`, {
      conferenceId,
      sponsorId,
    });
  }

  const sponsorData = sponsorSnap.data() as Record<string, unknown>;
  if (String(sponsorData?.conferenceId ?? '').trim() !== conferenceId) {
    throw new HttpError(400, 'Sponsor does not belong to conference', `${operation} rejected: sponsor conference mismatch`, {
      conferenceId,
      sponsorId,
    });
  }

  const normalizedRequesterEmail = requesterEmail.trim().toLowerCase();
  /**
   * Admin emails.
   * @param Array.isArray(sponsorData.adminEmails) ? sponsorData.adminEmails Array.is array(sponsor data.admin emails) ? sponsor data.admin emails.
   * @returns Computed result.
   */
  const adminEmails = (Array.isArray(sponsorData.adminEmails) ? sponsorData.adminEmails : [])
    .map((email: unknown) => String(email ?? '').trim().toLowerCase())
    .filter((email: string) => email.length > 0);

  const requesterIsSponsorAdmin = adminEmails.includes(normalizedRequesterEmail);
  const requesterIsOrganizer = isRequesterOrganizer(conferenceData, normalizedRequesterEmail);
  if (!requesterIsSponsorAdmin && !requesterIsOrganizer) {
    throw new HttpError(
      403,
      'Requester is neither a sponsor admin nor a conference organizer',
      `${operation} rejected: requester is neither sponsor admin nor organizer`,
      {
        conferenceId,
        sponsorId,
        requesterEmail,
      }
    );
  }

  logger.info('sponsor document requester authorized', {
    operation,
    conferenceId,
    sponsorId,
    requesterEmail,
    requesterRole: requesterIsOrganizer ? 'organizer' : 'sponsor-admin',
  });

  return {
    db,
    conferenceId,
    sponsorId,
    requesterEmail,
    conferenceRef,
    conferenceData: conferenceData as Record<string, unknown>,
    sponsorRef,
    sponsorData,
  };
}

/**
 * Parses one sponsor status from an unknown value.
 *
 * @param value Unknown input value.
 * @returns Validated sponsor status.
 */
function parseSponsorStatus(value: unknown): SponsorStatus {
  const status = String(value ?? '').trim() as SponsorStatus;
  const allowed: SponsorStatus[] = ['POTENTIAL', 'CANDIDATE', 'WAITING_LIST', 'CONFIRMED', 'REJECTED', 'CANCELED'];
  if (!allowed.includes(status)) {
    throw new HttpError(400, 'Invalid sponsor status', 'UPDATE_STATUS rejected: invalid sponsor status', { status });
  }
  return status;
}

/**
 * Parses one sponsor payment status from an unknown value.
 *
 * @param value Unknown input value.
 * @returns Validated sponsor payment status.
 */
function parseSponsorPaymentStatus(value: unknown): SponsorPaymentStatus {
  const status = String(value ?? '').trim() as SponsorPaymentStatus;
  const allowed: SponsorPaymentStatus[] = ['PENDING', 'PAID', 'OVERDUE'];
  if (!allowed.includes(status)) {
    throw new HttpError(400, 'Invalid sponsor payment status', 'UPDATE_PAYMENT_STATUS rejected: invalid sponsor payment status', { status });
  }
  return status;
}

/**
 * Ensures the sponsor is marked as paid before generating or sending the paid invoice.
 *
 * @param context Authorized sponsor action context.
 * @param operation Current operation name.
 */
function ensureSponsorPaymentMarkedAsPaid(
  context: AuthorizedSponsorContext,
  operation: SponsorActionOperation
): void {
  const paymentStatus = String(context.sponsorData?.paymentStatus ?? '').trim();
  if (paymentStatus === 'PAID') {
    return;
  }

  throw new HttpError(
    409,
    'Paid invoice is only available once payment status is PAID',
    `${operation} rejected: sponsor payment status is not PAID`,
    {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      paymentStatus,
    }
  );
}

/**
 * Reads and validates `sponsorId` from request body.
 *
 * @param body HTTP request body.
 * @param operation Sponsor action name.
 * @returns Normalized sponsor id.
 */
function parseSponsorId(body: any, operation: SponsorActionOperation | SponsorDocumentDownloadOperation): string {
  const sponsorId = String(body?.sponsorId ?? '').trim();
  if (!sponsorId) {
    throw new HttpError(400, 'Missing sponsorId', `${operation} rejected: missing sponsorId`);
  }
  return sponsorId;
}

/**
 * Parses an optional ISO-like date string.
 *
 * @param value Unknown input value.
 * @returns Normalized date string or `undefined`.
 */
function parseOptionalIsoDate(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

/**
 * Resolves the sender configuration for sponsor emails from conference sponsorship settings.
 *
 * @param conferenceData Conference Firestore payload.
 * @returns Sender email and display name.
 * @throws HttpError When sender email is missing.
 */
function resolveSponsorMailSender(conferenceData: Record<string, unknown>): { email: string; name?: string } {
  const sponsoring = conferenceData.sponsoring as Record<string, unknown> | undefined;
  const email = String(sponsoring?.email ?? '').trim();
  const name = String(sponsoring?.legalEntity ?? '').trim()
    || String(conferenceData.name ?? '').trim()
    || undefined;
  if (!email) {
    throw new HttpError(
      400,
      'Missing sponsor sender email in conference sponsoring settings',
      'sponsor mail rejected: missing Conference.sponsoring.email'
    );
  }
  return { email, name };
}

/**
 * Returns the locale currently configured on the sponsor with backward-compatible fallback.
 *
 * @param context Authorized sponsor context.
 * @returns Supported locale.
 */
function resolveContextSponsorLocale(context: AuthorizedSponsorContext): SponsorCommunicationLanguage {
  return resolveSponsorCommunicationLanguage(context.sponsorData, context.conferenceData);
}

/**
 * Builds the main and CC recipients for one sponsor communication.
 *
 * @param context Authorized sponsor context.
 * @returns Mail recipients.
 * @throws HttpError When no sponsor admin email is available.
 */
function resolveSponsorMailRecipients(context: AuthorizedSponsorContext): { to: MailRecipient[]; cc: MailRecipient[] } {
  const recipients = buildSponsorCommunicationRecipients(context.sponsorData, context.conferenceData);
  if (recipients.to.length === 0) {
    throw new HttpError(400, 'Sponsor has no recipient email', 'sponsor mail rejected: missing sponsor admin email', {
      sponsorName: String(context.sponsorData?.name ?? '').trim(),
    });
  }
  return recipients;
}

/**
 * Builds one deterministic idempotence key for sponsor document sends.
 *
 * @param messageType Logical email message type.
 * @param conferenceId Conference identifier.
 * @param sponsorId Sponsor identifier.
 * @param revision Document revision discriminator.
 * @returns Deterministic idempotence key.
 */
function buildSponsorDocumentIdempotenceKey(
  messageType: string,
  conferenceId: string,
  sponsorId: string,
  revision: string
): string {
  return [
    messageType.trim().toUpperCase(),
    conferenceId.trim(),
    sponsorId.trim(),
    revision.trim(),
  ].join(':');
}

/**
 * Returns the timestamp of the previously sent sponsor document when available.
 *
 * @param sponsorData Sponsor Firestore payload.
 * @param documentType Requested document type.
 * @returns ISO timestamp when the document was already sent.
 */
function getPreviouslySentDocumentTimestamp(
  sponsorData: Record<string, unknown>,
  documentType: 'ORDER_FORM' | 'INVOICE' | 'INVOICE_PAID'
): string | undefined {
  const documents = sponsorData.documents as Record<string, unknown> | undefined;
  const rawValue = documentType === 'ORDER_FORM'
    ? documents?.orderFormSentAt
    : documentType === 'INVOICE'
      ? documents?.invoiceSentAt
      : documents?.invoicePaidSentAt;
  const value = String(rawValue ?? '').trim();
  return value || undefined;
}

/**
 * Searches one in-progress mail history record by idempotence key.
 *
 * @param db Firestore instance.
 * @param idempotenceKey Deterministic idempotence key.
 * @returns Pending mail history record when found.
 */
async function findPendingMailHistoryByIdempotenceKey(
  db: admin.firestore.Firestore,
  idempotenceKey: string
): Promise<ExistingMailHistoryMatch | undefined> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.MAIL_HISTORY)
    .where('idempotenceKey', '==', idempotenceKey)
    .where('status', '==', 'PENDING')
    .limit(1)
    .get();
  if (snapshot.empty) {
    return undefined;
  }
  const data = snapshot.docs[0].data() as Record<string, unknown>;
  return {
    id: snapshot.docs[0].id,
    status: String(data?.status ?? 'FAILED') as ExistingMailHistoryMatch['status'],
    mailjetMessageId: String(data?.mailjetMessageId ?? '').trim() || undefined,
  };
}

/**
 * Builds the localized subject for one sponsor email type.
 *
 * @param messageType Logical sponsor message type.
 * @param locale Sponsor locale.
 * @param conferenceData Conference payload.
 * @returns Localized email subject.
 */
function buildLocalizedSponsorMailSubject(
  messageType: SponsorMailMessageType,
  locale: SponsorCommunicationLanguage,
  conferenceData: Record<string, unknown>
): string {
  const conferenceName = String(conferenceData.name ?? '').trim();
  const labels = locale === 'fr'
    ? {
      SPONSOR_ORDER_FORM: 'Bon de commande',
      SPONSOR_INVOICE: 'Facture',
      SPONSOR_PAID_INVOICE: 'Facture acquittee',
      SPONSOR_PAYMENT_REMINDER: 'Relance de paiement',
      SPONSOR_APPLICATION_CONFIRMATION: 'Confirmation de candidature sponsor',
      SPONSOR_ADMINISTRATIVE_SUMMARY: 'Recapitulatif administratif',
    }
    : {
      SPONSOR_ORDER_FORM: 'Order form',
      SPONSOR_INVOICE: 'Invoice',
      SPONSOR_PAID_INVOICE: 'Paid invoice',
      SPONSOR_PAYMENT_REMINDER: 'Payment reminder',
      SPONSOR_APPLICATION_CONFIRMATION: 'Sponsor application confirmation',
      SPONSOR_ADMINISTRATIVE_SUMMARY: 'Administrative summary',
    };
  return `${labels[messageType]} - ${conferenceName}`;
}

/**
 * Builds the localized plain-text body for one sponsor email type.
 *
 * @param messageType Logical sponsor message type.
 * @param locale Sponsor locale.
 * @param conferenceData Conference payload.
 * @returns Localized email body.
 */
function buildLocalizedSponsorMailText(
  messageType: SponsorMailMessageType,
  locale: SponsorCommunicationLanguage,
  conferenceData: Record<string, unknown>
): string {
  const conferenceName = String(conferenceData.name ?? '').trim();
  if (locale === 'fr') {
    switch (messageType) {
    case 'SPONSOR_ORDER_FORM':
      return `Veuillez trouver en piece jointe le bon de commande pour ${conferenceName}.`;
    case 'SPONSOR_INVOICE':
      return `Veuillez trouver en piece jointe la facture pour ${conferenceName}.`;
    case 'SPONSOR_PAID_INVOICE':
      return `Veuillez trouver en piece jointe la facture acquittee pour ${conferenceName}.`;
    case 'SPONSOR_PAYMENT_REMINDER':
      return `Ceci est un rappel concernant votre paiement sponsor pour ${conferenceName}.`;
    case 'SPONSOR_APPLICATION_CONFIRMATION':
      return `Votre candidature sponsor pour ${conferenceName} a bien ete prise en compte.`;
    case 'SPONSOR_ADMINISTRATIVE_SUMMARY':
      return `Voici votre recapitulatif administratif sponsor pour ${conferenceName}.`;
    default:
      return conferenceName;
    }
  }

  switch (messageType) {
  case 'SPONSOR_ORDER_FORM':
    return `Please find attached the order form for ${conferenceName}.`;
  case 'SPONSOR_INVOICE':
    return `Please find attached the invoice for ${conferenceName}.`;
  case 'SPONSOR_PAID_INVOICE':
    return `Please find attached the paid invoice for ${conferenceName}.`;
  case 'SPONSOR_PAYMENT_REMINDER':
    return `This is a reminder regarding your sponsor payment for ${conferenceName}.`;
  case 'SPONSOR_APPLICATION_CONFIRMATION':
    return `Your sponsor application for ${conferenceName} has been recorded.`;
  case 'SPONSOR_ADMINISTRATIVE_SUMMARY':
    return `Here is your sponsor administrative summary for ${conferenceName}.`;
  default:
    return conferenceName;
  }
}

/**
 * Removes undefined values recursively from a Firestore patch payload.
 *
 * @param value Raw patch payload.
 * @returns Sanitized patch payload.
 */
function sanitizeFirestorePatch<T>(value: T): T {
  return removeUndefinedDeep(value) as T;
}

/**
 * Removes undefined values recursively from unknown data.
 *
 * @param value Raw value.
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





