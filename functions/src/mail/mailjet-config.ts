import * as logger from 'firebase-functions/logger';
import { MAILJET_API_KEY_SECRET, MAILJET_SECRET_KEY_SECRET } from './mailjet-secrets';

/**
 * Resolved Mailjet credentials.
 */
export interface MailjetCredentials {
  apiKey: string;
  secretKey: string;
  source: 'firebase-secrets' | 'environment';
}

/**
 * Returns whether the current runtime looks like local development or emulator usage.
 *
 * @returns `true` when the process is running locally or in the Firebase emulator.
 */
function isLocalOrEmulatorRuntime(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true'
    || !process.env.K_SERVICE;
}

/**
 * Reads one non-empty value from a list of candidates.
 *
 * @param values Candidate values to inspect.
 * @returns The first non-empty normalized value or an empty string.
 */
function pickFirstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return '';
}

/**
 * Resolves Mailjet credentials using the hybrid strategy:
 * Firebase secrets first, then environment variables in local or emulator contexts.
 *
 * @returns Resolved Mailjet credentials.
 * @throws Error When no valid credentials can be resolved.
 */
export function resolveMailjetCredentials(): MailjetCredentials {
  const secretApiKey = pickFirstNonEmpty(MAILJET_API_KEY_SECRET.value());
  const secretSecretKey = pickFirstNonEmpty(MAILJET_SECRET_KEY_SECRET.value());
  if (secretApiKey && secretSecretKey) {
    logger.info('mailjet credentials resolved', { source: 'firebase-secrets' });
    return {
      apiKey: secretApiKey,
      secretKey: secretSecretKey,
      source: 'firebase-secrets',
    };
  }

  const envApiKey = pickFirstNonEmpty(process.env.MAILJET_API_KEY);
  const envSecretKey = pickFirstNonEmpty(process.env.MAILJET_SECRET_KEY);
  if (envApiKey && envSecretKey && isLocalOrEmulatorRuntime()) {
    logger.info('mailjet credentials resolved', { source: 'environment' });
    return {
      apiKey: envApiKey,
      secretKey: envSecretKey,
      source: 'environment',
    };
  }

  const runningLocally = isLocalOrEmulatorRuntime();
  logger.error('mailjet credentials resolution failed', {
    runningLocally,
    hasSecretApiKey: !!secretApiKey,
    hasSecretSecretKey: !!secretSecretKey,
    hasEnvApiKey: !!envApiKey,
    hasEnvSecretKey: !!envSecretKey,
  });
  throw new Error(
    runningLocally
      ? 'Missing Mailjet credentials: configure Firebase secrets or local environment variables'
      : 'Missing Mailjet Firebase secrets in deployed environment'
  );
}
