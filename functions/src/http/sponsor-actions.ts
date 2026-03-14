import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';
import {
  ensurePostMethod,
  getRequesterEmailFromAuthorization,
  HttpError,
  loadConference,
  parseConferenceId,
  ensureRequesterIsOrganizer,
} from './conference-http-common';
import {
  applySponsorPaymentStatusTransition,
  applySponsorStatusTransition,
  applySuccessfulSponsorBusinessEvent,
} from '../sponsor/sponsor-helpers';
import {
  SponsorBusinessEvent,
  SponsorBusinessEventType,
  SponsorPaymentStatus,
  SponsorRecord,
  SponsorStatus,
} from '../sponsor/sponsor-model';
import { createMailHistoryRecord, updateMailHistoryRecord } from '../mail/mail-history';
import { MailjetService } from '../mail/mailjet-service';
import { buildSponsorInvoicePayload, buildSponsorOrderFormPayload } from '../documents/sponsor-document-builders';
import { renderSponsorDocumentPdf } from '../documents/sponsor-document-renderer';
import { TransactionalEmailPayload } from '../mail/mail-model';
import { MAILJET_SECRETS } from '../mail/mailjet-secrets';

type SponsorActionOperation =
  | 'UPDATE_STATUS'
  | 'UPDATE_PAYMENT_STATUS'
  | 'ASSIGN_BOOTH'
  | 'ALLOCATE_TICKETS'
  | 'SEND_ORDER_FORM'
  | 'SEND_INVOICE'
  | 'SEND_PAYMENT_REMINDER'
  | 'SEND_APPLICATION_CONFIRMATION'
  | 'SEND_ADMINISTRATIVE_SUMMARY';

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
  db: admin.firestore.Firestore;
  conferenceId: string;
  sponsorId: string;
  requesterEmail: string;
  conferenceData: any;
  sponsorRef: admin.firestore.DocumentReference;
  sponsorData: any;
}

/**
 * Updates sponsor business status through an organizer-only explicit backend action.
 */
export const updateSponsorStatus = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'UPDATE_STATUS', async (context) => {
    const nextStatus = parseSponsorStatus(req.body?.status);
    const statusDate = parseOptionalIsoDate(req.body?.statusDate) ?? new Date().toISOString().slice(0, 10);
    const nextSponsor = applySponsorStatusTransition(context.sponsorData as SponsorRecord, nextStatus, statusDate);
    await context.sponsorRef.set(nextSponsor, { merge: true });
    return { sponsor: { ...context.sponsorData, ...nextSponsor, id: context.sponsorId } };
  });
});

/**
 * Updates sponsor payment status through an organizer-only explicit backend action.
 */
export const updateSponsorPaymentStatus = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  await handleSponsorAction(req, res, 'UPDATE_PAYMENT_STATUS', async (context) => {
    const nextPaymentStatus = parseSponsorPaymentStatus(req.body?.paymentStatus);
    const paymentStatusDate = parseOptionalIsoDate(req.body?.paymentStatusDate) ?? new Date().toISOString().slice(0, 10);
    const nextSponsor = applySponsorPaymentStatusTransition(
      context.sponsorData as SponsorRecord,
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
        ...(context.sponsorData as SponsorRecord),
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
        ...(context.sponsorData as SponsorRecord),
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
      buildIdempotenceKey: () => buildSponsorDocumentIdempotenceKey(
        'SPONSOR_ORDER_FORM',
        context.conferenceId,
        context.sponsorId,
        parseOptionalString(req.body?.documentNumber) ?? parseOptionalIsoDate(req.body?.issueDate) ?? 'latest'
      ),
      buildPayload: () => buildSponsorOrderFormPayload(context.conferenceData, context.sponsorData, {
        locale: parseDocumentLocale(req.body?.locale),
        issueDate: parseOptionalIsoDate(req.body?.issueDate) ?? new Date().toISOString().slice(0, 10),
        documentNumber: parseOptionalString(req.body?.documentNumber),
        vatRate: parseOptionalNumber(req.body?.vatRate) ?? 0,
        legalNotes: parseStringArray(req.body?.legalNotes),
      }),
      buildEmailPayload: (attachment) => ({
        messageType: 'SPONSOR_ORDER_FORM',
        subject: `Order form - ${String(context.conferenceData?.name ?? '').trim()}`,
        recipients: buildSponsorRecipients(context.sponsorData),
        textPart: `Please find attached the order form for ${String(context.conferenceData?.name ?? '').trim()}.`,
        attachments: [attachment],
        metadata: {
          conferenceId: context.conferenceId,
          sponsorId: context.sponsorId,
        },
      }),
    })
  );
});

/**
 * Sends the sponsor invoice email with its generated PDF attachment.
 */
export const sendSponsorInvoice = onRequest({ cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS }, async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_INVOICE', async (context) => {
    logger.debug('sendSponsorInvoice action started');
    return await sendSponsorDocumentEmail(context, {
        messageType: 'SPONSOR_INVOICE',
        eventType: 'INVOICE_SENT',
        buildIdempotenceKey: () => buildSponsorDocumentIdempotenceKey(
          'SPONSOR_INVOICE',
          context.conferenceId,
          context.sponsorId,
          parseOptionalString(req.body?.documentNumber)
            ?? parseOptionalIsoDate(req.body?.dueDate)
            ?? parseOptionalIsoDate(req.body?.issueDate)
            ?? 'latest'
        ),
        buildPayload: () => buildSponsorInvoicePayload(context.conferenceData, context.sponsorData, {
          locale: parseDocumentLocale(req.body?.locale),
          issueDate: parseOptionalIsoDate(req.body?.issueDate) ?? new Date().toISOString().slice(0, 10),
          dueDate: parseOptionalIsoDate(req.body?.dueDate) ?? undefined,
          documentNumber: parseOptionalString(req.body?.documentNumber),
          vatRate: parseOptionalNumber(req.body?.vatRate) ?? 0,
          legalNotes: parseStringArray(req.body?.legalNotes),
        }),
        buildEmailPayload: (attachment) => ({
          messageType: 'SPONSOR_INVOICE',
          subject: `Invoice - ${String(context.conferenceData?.name ?? '').trim()}`,
          recipients: buildSponsorRecipients(context.sponsorData),
          textPart: `Please find attached the invoice for ${String(context.conferenceData?.name ?? '').trim()}.`,
          attachments: [attachment],
          metadata: {
            conferenceId: context.conferenceId,
            sponsorId: context.sponsorId,
          },
        }),
      });
    }
  );
});

/**
 * Sends the sponsor payment reminder email.
 */
export const sendSponsorPaymentReminder = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_PAYMENT_REMINDER', async (context) =>
    await sendSponsorNotificationEmail(context, {
      messageType: 'SPONSOR_PAYMENT_REMINDER',
      eventType: 'PAYMENT_REMINDER_SENT',
      subject: `Payment reminder - ${String(context.conferenceData?.name ?? '').trim()}`,
      textPart: String(req.body?.textPart ?? '').trim()
        || `This is a reminder regarding the sponsor payment for ${String(context.conferenceData?.name ?? '').trim()}.`,
    })
  );
  }
);

/**
 * Sends the sponsor application confirmation email.
 */
export const sendSponsorApplicationConfirmation = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_APPLICATION_CONFIRMATION', async (context) =>
    await sendSponsorNotificationEmail(context, {
      messageType: 'SPONSOR_APPLICATION_CONFIRMATION',
      subject: `Sponsor application confirmation - ${String(context.conferenceData?.name ?? '').trim()}`,
      textPart: String(req.body?.textPart ?? '').trim()
        || `Your sponsor application for ${String(context.conferenceData?.name ?? '').trim()} has been recorded.`,
    }, false)
  );
  }
);

/**
 * Sends the sponsor administrative summary email.
 */
export const sendSponsorAdministrativeSummary = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: MAILJET_SECRETS },
  async (req, res) => {
  await handleSponsorAction(req, res, 'SEND_ADMINISTRATIVE_SUMMARY', async (context) =>
    await sendSponsorNotificationEmail(context, {
      messageType: 'SPONSOR_ADMINISTRATIVE_SUMMARY',
      subject: `Administrative summary - ${String(context.conferenceData?.name ?? '').trim()}`,
      textPart: String(req.body?.textPart ?? '').trim()
        || `Here is the current administrative summary for your sponsorship on ${String(context.conferenceData?.name ?? '').trim()}.`,
    }, false)
  );
  }
);

interface SendSponsorNotificationOptions {
  messageType: string;
  subject: string;
  textPart: string;
  eventType?: SponsorBusinessEventType;
  idempotenceKey?: string;
}

interface SendSponsorDocumentOptions {
  messageType: string;
  eventType: SponsorBusinessEventType;
  buildPayload: () => any;
  buildEmailPayload: (attachment: { filename: string; contentType: string; base64Content: string }) => TransactionalEmailPayload;
  buildIdempotenceKey: () => string;
}

interface ExistingMailHistoryMatch {
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  mailjetMessageId?: string;
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
  logger.debug('sponsor document email generation start', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    messageType: options.messageType,
  });
  const payload = options.buildPayload();
  logger.debug('sponsor document email payload', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    messageType: options.messageType,
    payload
  });
  const pdfBuffer = await renderSponsorDocumentPdf(payload);
  logger.debug('sponsor document email pdf buffer', {
    conferenceId: context.conferenceId,
    sponsorId: context.sponsorId,
    messageType: options.messageType,
    pdfBufferSize: pdfBuffer.length
  });
  const attachment = {
    filename: `${options.messageType.toLowerCase()}-${context.sponsorId}.pdf`,
    contentType: 'application/pdf',
    base64Content: pdfBuffer.toString('base64'),
  };
  const emailPayload = options.buildEmailPayload(attachment);

  return await sendSponsorNotificationEmail(context, {
    messageType: emailPayload.messageType,
    eventType: options.eventType,
    subject: emailPayload.subject,
    textPart: emailPayload.textPart ?? '',
    idempotenceKey: options.buildIdempotenceKey(),
  }, true, emailPayload.attachments);
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
  attachments?: Array<{ filename: string; contentType: string; base64Content: string }>
): Promise<SponsorActionReport> {
  logger.debug('sponsor mail send setup start');
  const db = context.db;
  const existingMail = options.idempotenceKey
    ? await findExistingMailHistoryByIdempotenceKey(db, options.idempotenceKey)
    : undefined;
  if (existingMail?.status === 'PENDING') {
    logger.debug('sponsor mail send rejected because matching idempotent send is already pending');
    throw new HttpError(
      409,
      'A matching document send is already in progress',
      `${options.messageType} rejected: idempotent send already pending`,
      {
        conferenceId: context.conferenceId,
        sponsorId: context.sponsorId,
        idempotenceKey: options.idempotenceKey,
        mailHistoryId: existingMail.id,
      }
    );
  }
  if (existingMail?.status === 'SENT') {
    logger.info('sponsor mail skipped because matching idempotent send already exists', {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      messageType: options.messageType,
      idempotenceKey: options.idempotenceKey,
      mailHistoryId: existingMail.id,
    });
    return {
      sponsor: {
        ...context.sponsorData,
        id: context.sponsorId,
      },
      mailHistoryId: existingMail.id,
      sendResult: {
        ok: true,
        messageId: existingMail.mailjetMessageId,
      },
    };
  }

  const payload: TransactionalEmailPayload = {
    messageType: options.messageType,
    subject: options.subject,
    recipients: buildSponsorRecipients(context.sponsorData),
    textPart: options.textPart,
    attachments,
    idempotenceKey: options.idempotenceKey,
    metadata: {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
    },
  };
  const sender = resolveSponsorMailSender(context.conferenceData);

  const mailHistoryId = await createMailHistoryRecord(db, {
    messageType: payload.messageType,
    recipientEmails: payload.recipients.map((recipient) => recipient.email),
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
  logger.debug('sponsor mail send setup complete, starting send');
  try {
    sendResult = await mailService.sendTransactionalEmail(payload);
  } catch (error: unknown) {
    logger.error('sponsor mail send failed', {
      conferenceId: context.conferenceId,
      sponsorId: context.sponsorId,
      messageType: options.messageType,
      mailHistoryId,
      error
    });
    const message = error instanceof Error ? error.message : 'unknown error';
    await updateMailHistoryRecord(db, mailHistoryId, {
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
    await updateMailHistoryRecord(db, mailHistoryId, {
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

  await updateMailHistoryRecord(db, mailHistoryId, {
    status: 'SENT',
    sentAt: new Date().toISOString(),
    mailjetMessageId: sendResult.messageId,
  });

  let nextSponsor = context.sponsorData;
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
    nextSponsor = applySuccessfulSponsorBusinessEvent(context.sponsorData as SponsorRecord, event);
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
    logger.info('sponsor action start', { operation, startedAt, req });
    const context = await authorizeSponsorOrganizerRequest(req, operation);
    logger.info('sponsor action context', { operation, context });
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
    logger.error('sponsor action failed', err);
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
  ensurePostMethod(req.method, operation);
  const db = admin.firestore();
  const conferenceId = parseConferenceId(req.body, operation);
  const sponsorId = parseSponsorId(req.body, operation);
  const requesterEmail = await getRequesterEmailFromAuthorization(req.headers.authorization, conferenceId, operation);
  const { conferenceData } = await loadConference(db, conferenceId, operation);
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, operation);
  const sponsorRef = db.collection(FIRESTORE_COLLECTIONS.SPONSOR).doc(sponsorId);
  const sponsorSnap = await sponsorRef.get();
  if (!sponsorSnap.exists) {
    throw new HttpError(404, 'Sponsor not found', `${operation} rejected: sponsor not found`, {
      conferenceId,
      sponsorId,
    });
  }
  const sponsorData = sponsorSnap.data() as any;
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
    conferenceData,
    sponsorRef,
    sponsorData,
  };
}

/**
 * Reads and validates `sponsorId` from request body.
 *
 * @param body HTTP request body.
 * @param operation Sponsor action name.
 * @returns Normalized sponsor id.
 */
function parseSponsorId(body: any, operation: SponsorActionOperation): string {
  const sponsorId = String(body?.sponsorId ?? '').trim();
  if (!sponsorId) {
    throw new HttpError(400, 'Missing sponsorId', `${operation} rejected: missing sponsorId`);
  }
  return sponsorId;
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
 * Parses one optional trimmed string.
 *
 * @param value Unknown input value.
 * @returns Normalized string or `undefined`.
 */
function parseOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

/**
 * Parses one optional numeric value.
 *
 * @param value Unknown input value.
 * @returns Parsed number or `undefined` when invalid.
 */
function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Parses one optional string array.
 *
 * @param value Unknown input value.
 * @returns Trimmed non-empty strings.
 */
function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
}

/**
 * Parses the requested document locale with English fallback.
 *
 * @param value Unknown input value.
 * @returns Supported document locale.
 */
function parseDocumentLocale(value: unknown): 'en' | 'fr' {
  return String(value ?? '').trim().toLowerCase() === 'fr' ? 'fr' : 'en';
}

/**
 * Builds the list of sponsor recipients from sponsor admin emails.
 *
 * @param sponsorData Sponsor Firestore payload.
 * @returns Mail recipients.
 * @throws HttpError When no sponsor admin email is available.
 */
function buildSponsorRecipients(sponsorData: any): Array<{ email: string; name?: string }> {
  const recipients = (Array.isArray(sponsorData?.adminEmails) ? sponsorData.adminEmails : [])
    .map((email: unknown) => String(email ?? '').trim())
    .filter((email: string) => email.length > 0)
    .map((email: string) => ({
      email,
      name: String(sponsorData?.name ?? '').trim() || undefined,
    }));
  if (recipients.length === 0) {
    throw new HttpError(400, 'Sponsor has no recipient email', 'sponsor mail rejected: missing sponsor admin email', {
      sponsorName: String(sponsorData?.name ?? '').trim(),
    });
  }
  return recipients;
}

/**
 * Resolves the sender configuration for sponsor emails from conference sponsorship settings.
 *
 * @param conferenceData Conference Firestore payload.
 * @returns Sender email and display name.
 * @throws HttpError When sender email is missing.
 */
function resolveSponsorMailSender(conferenceData: any): { email: string; name?: string } {
  const email = String(conferenceData?.sponsoring?.email ?? '').trim();
  const name = String(conferenceData?.sponsoring?.legalEntity ?? '').trim()
    || String(conferenceData?.name ?? '').trim()
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
 * Searches one existing mail history record by idempotence key.
 *
 * @param db Firestore instance.
 * @param idempotenceKey Deterministic idempotence key.
 * @returns Existing mail history record when found.
 */
async function findExistingMailHistoryByIdempotenceKey(
  db: admin.firestore.Firestore,
  idempotenceKey: string
): Promise<ExistingMailHistoryMatch | undefined> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.MAIL_HISTORY)
    .where('idempotenceKey', '==', idempotenceKey)
    .limit(1)
    .get();
  if (snapshot.empty) {
    return undefined;
  }
  const data = snapshot.docs[0].data() as any;
  return {
    id: snapshot.docs[0].id,
    status: data?.status ?? 'FAILED',
    mailjetMessageId: String(data?.mailjetMessageId ?? '').trim() || undefined,
  };
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
