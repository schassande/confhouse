/**
 * One email recipient used by the generic Mailjet layer.
 */
export interface MailRecipient {
  email: string;
  name?: string;
}

/**
 * One attachment sent through the generic Mailjet layer.
 */
export interface MailAttachment {
  filename: string;
  contentType: string;
  base64Content: string;
}

/**
 * Internal transactional email payload independent from Mailjet request details.
 */
export interface TransactionalEmailPayload {
  messageType: string;
  subject: string;
  recipients: MailRecipient[];
  ccRecipients?: MailRecipient[];
  templateId?: number;
  textPart?: string;
  htmlPart?: string;
  idempotenceKey?: string;
  variables?: Record<string, unknown>;
  attachments?: MailAttachment[];
  metadata?: Record<string, unknown>;
}

/**
 * Successful Mailjet send result returned by the generic mail layer.
 */
export interface MailSendSuccess {
  ok: true;
  provider: 'MAILJET';
  messageId: string;
  raw: unknown;
}

/**
 * Failed Mailjet send result returned by the generic mail layer.
 */
export interface MailSendFailure {
  ok: false;
  provider: 'MAILJET';
  error: string;
  raw?: unknown;
}

/**
 * Generic mail send result.
 */
export type MailSendResult = MailSendSuccess | MailSendFailure;

/**
 * Persisted technical mail trace.
 */
export interface MailHistoryRecord {
  messageType: string;
  recipientEmails: string[];
  status: 'PENDING' | 'SENT' | 'FAILED';
  mailjetMessageId?: string;
  createdAt: string;
  sentAt?: string;
  triggeredBy?: string;
  error?: string;
  conferenceId?: string;
  sponsorId?: string;
  idempotenceKey?: string;
  metadata?: Record<string, unknown>;
}
