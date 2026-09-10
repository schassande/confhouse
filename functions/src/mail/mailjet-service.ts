import * as logger from 'firebase-functions/logger';
import { resolveMailjetCredentials } from './mailjet-config';
import { MailSendResult, TransactionalEmailPayload } from './mail-model';

const MAILJET_SEND_API_URL = 'https://api.mailjet.com/v3.1/send';
const MAILJET_MAX_ATTEMPTS = 4;
const MAILJET_REQUEST_TIMEOUT_MS = 15_000;
const MAILJET_RETRY_DELAYS_MS = [250, 1_000, 3_000];
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

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
  Subject?: string;
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

    const response = await this.fetchWithNetworkRetry(MAILJET_SEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, payload.messageType);

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
   * Executes the Mailjet request with a bounded retry policy for transport errors.
   * HTTP responses are returned immediately because Mailjet has already processed
   * the request far enough to provide a definitive provider result.
   *
   * @param url Mailjet endpoint URL.
   * @param init Request options.
   * @param messageType Logical message type used in operational logs.
   * @returns Mailjet HTTP response.
   * @throws The last network error when all attempts fail.
   */
  private async fetchWithNetworkRetry(
    url: string,
    init: RequestInit,
    messageType: string
  ): Promise<Response> {
    for (let attempt = 1; attempt <= MAILJET_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MAILJET_REQUEST_TIMEOUT_MS);

      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } catch (error: unknown) {
        if (!isRetryableNetworkError(error) || attempt === MAILJET_MAX_ATTEMPTS) {
          logger.error('mailjet network request failed', {
            messageType,
            attempt,
            maxAttempts: MAILJET_MAX_ATTEMPTS,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        const delayMs = MAILJET_RETRY_DELAYS_MS[attempt - 1];
        logger.warn('mailjet network request retry scheduled', {
          messageType,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: MAILJET_MAX_ATTEMPTS,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        await delay(delayMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Mailjet network request exhausted retry attempts');
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
      CustomID: payload.messageType
    };

    if (payload.templateId) {
      message.TemplateID = payload.templateId;
      message.TemplateLanguage = true;
    } else {
      message.Subject = payload.subject;
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

/**
 * Determines whether an error is a transient network failure.
 *
 * @param error Unknown error thrown by fetch or its underlying TLS/socket layer.
 * @returns `true` when retrying the request is appropriate.
 */
function isRetryableNetworkError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error || (typeof current === 'object' && current !== null)) {
    const candidate = current as { code?: unknown; name?: unknown };
    if (candidate.name === 'AbortError' || RETRYABLE_NETWORK_ERROR_CODES.has(String(candidate.code ?? ''))) {
      return true;
    }
    current = 'cause' in candidate ? (candidate as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/**
 * Waits before a retry.
 *
 * @param milliseconds Delay duration.
 * @returns Promise resolved after the delay.
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
