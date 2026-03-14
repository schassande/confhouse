import { defineSecret } from 'firebase-functions/params';

/**
 * Mailjet API key secret used in deployed environments.
 */
export const MAILJET_API_KEY_SECRET = defineSecret('MAILJET_API_KEY');

/**
 * Mailjet secret key used in deployed environments.
 */
export const MAILJET_SECRET_KEY_SECRET = defineSecret('MAILJET_SECRET_KEY');

/**
 * Secrets required by functions using the Mailjet layer.
 */
export const MAILJET_SECRETS = [MAILJET_API_KEY_SECRET, MAILJET_SECRET_KEY_SECRET];
