import * as logger from 'firebase-functions/logger';
import { resolveMailjetCredentials } from './mailjet-config';
import { MailSendResult, TransactionalEmailPayload } from './mail-model';

const MAILJET_SEND_API_URL = 'https://api.mailjet.com/v3.1/send';

interface MailjetMessagePayload {
  From: {
    Email: string;
    Name?: string;
  };
  To: Array<{
    Email: string;
    Name?: string;
  }>;
  Cc?: Array<{
    Email: string;
    Name?: string;
  }>;
  Subject: string;
  Variables?: Record<string, unknown>;
  TextPart?: string;
  HTMLPart?: string;
  Attachments?: Array<{
    ContentType: string;
    Filename: string;
    Base64Content: string;
  }>;
  CustomID?: string;
  TemplateID?: number;
  TemplateLanguage?: boolean;
}

interface MailjetSendRequest {
  Messages: MailjetMessagePayload[];
}

/**
 * Configuration required by the generic Mailjet service.
 */
export interface MailjetServiceConfig {
  fromEmail: string;
  fromName?: string;
}

/**
 * Generic Mailjet transport service isolated behind one backend abstraction.
 */
export class MailjetService {
  constructor(private readonly config: MailjetServiceConfig) {}

  /**
   * Sends one transactional email through Mailjet.
   *
   * @param payload Internal email payload independent from Mailjet request details.
   * @returns Generic send result.
   */
  async sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<MailSendResult> {
    const credentials = resolveMailjetCredentials();
    const requestBody = this.buildMailjetRequest(payload);
    const auth = Buffer.from(`${credentials.apiKey}:${credentials.secretKey}`).toString('base64');

    logger.info('mailjet send started', {
      messageType: payload.messageType,
      recipientCount: payload.recipients.length,
      attachmentCount: payload.attachments?.length ?? 0,
      credentialSource: credentials.source,
    });

    const response = await fetch(MAILJET_SEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const rawResponse = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = `Mailjet send failed with status ${response.status}`;
      logger.error('mailjet send failed', {
        messageType: payload.messageType,
        status: response.status,
        rawResponse,
      });
      return {
        ok: false,
        provider: 'MAILJET',
        error,
        raw: rawResponse,
      };
    }

    const messageId = this.extractMailjetMessageId(rawResponse);
    logger.info('mailjet send completed', {
      messageType: payload.messageType,
      messageId,
    });
    return {
      ok: true,
      provider: 'MAILJET',
      messageId,
      raw: rawResponse,
    };
  }

  /**
   * Builds the Mailjet request payload from the internal generic payload.
   *
   * @param payload Internal generic payload.
   * @returns Mailjet request payload.
   */
  private buildMailjetRequest(payload: TransactionalEmailPayload): MailjetSendRequest {
    const message: MailjetMessagePayload = {
      From: {
        Email: this.config.fromEmail,
        Name: this.config.fromName,
      },
      To: payload.recipients.map((recipient) => ({
        Email: recipient.email,
        Name: recipient.name,
      })),
      Subject: payload.subject,
      CustomID: payload.messageType,
    };

    if (payload.templateId) {
      message.TemplateID = payload.templateId;
      message.TemplateLanguage = true;
    }

    if (payload.variables && Object.keys(payload.variables).length > 0) {
      message.Variables = payload.variables;
    }

    if (payload.textPart) {
      message.TextPart = payload.textPart;
    }

    if (payload.htmlPart) {
      message.HTMLPart = payload.htmlPart;
    }

    if (payload.attachments && payload.attachments.length > 0) {
      message.Attachments = payload.attachments.map((attachment) => ({
        ContentType: attachment.contentType,
        Filename: attachment.filename,
        Base64Content: attachment.base64Content,
      }));
    }

    if (payload.ccRecipients && payload.ccRecipients.length > 0) {
      message.Cc = payload.ccRecipients.map((recipient) => ({
        Email: recipient.email,
        Name: recipient.name,
      }));
    }

    return { Messages: [message] };
  }

  /**
   * Extracts one Mailjet message identifier from a successful response.
   *
   * @param rawResponse Raw Mailjet response.
   * @returns Mailjet message identifier or an empty string when unavailable.
   */
  private extractMailjetMessageId(rawResponse: unknown): string {
    const response = rawResponse as {
      Messages?: Array<{
        To?: Array<{ MessageID?: number | string }>;
      }>;
    };
    const value = response?.Messages?.[0]?.To?.[0]?.MessageID;
    return String(value ?? '').trim();
  }
}
