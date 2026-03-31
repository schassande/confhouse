import { admin } from '../common/firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../common/firestore-collections';

/**
 * Typed HTTP error used by request handlers to map business failures to status codes.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly logMessage: string,
    public readonly meta: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/**
 * Ensures an HTTP request uses POST.
 * Throws HttpError(405) when method is invalid.
 */
export function ensurePostMethod(method: string, operationName: string): void {
  if (method !== 'POST') {
    throw new HttpError(
      405,
      'Method Not Allowed, use POST',
      `${operationName} rejected: invalid method`,
      { method }
    );
  }
}

/**
 * Reads and validates conferenceId from request body.
 * Throws HttpError(400) when missing.
 */
export function parseConferenceId(body: any, operationName: string): string {
  const conferenceId = String(body?.conferenceId ?? '').trim();
  if (!conferenceId) {
    throw new HttpError(
      400,
      'Missing conferenceId',
      `${operationName} rejected: missing conferenceId`
    );
  }
  return conferenceId;
}

/**
 * Loads a conference document and returns both reference and data.
 * Throws HttpError(404) when conference does not exist.
 */
export async function loadConference(
  db: admin.firestore.Firestore,
  conferenceId: string,
  operationName: string
): Promise<{ conferenceRef: admin.firestore.DocumentReference; conferenceData: any }> {
  const conferenceRef = db.collection(FIRESTORE_COLLECTIONS.CONFERENCE).doc(conferenceId);
  const conferenceSnap = await conferenceRef.get();
  if (!conferenceSnap.exists) {
    throw new HttpError(
      404,
      'Conference not found',
      `${operationName} rejected: conference not found`,
      { conferenceId }
    );
  }
  return { conferenceRef, conferenceData: conferenceSnap.data() as any };
}

/**
 * Shared organizer authorization flow for conference-scoped POST handlers.
 *
 * This helper:
 * - validates the HTTP method
 * - parses `conferenceId`
 * - authenticates the caller from the bearer token
 * - loads the conference document
 * - verifies organizer access against the loaded conference
 *
 * @param req HTTP request.
 * @param operationName Operation name used in error messages and logs.
 * @returns Authorized organizer context scoped to one conference.
 */
export async function authorizeConferenceOrganizerRequest(
  req: any,
  operationName: string
): Promise<AuthorizedConferenceOrganizerContext> {
  ensurePostMethod(req.method, operationName);
  const db = admin.firestore();
  const conferenceId = parseConferenceId(req.body, operationName);
  const requesterEmail = await getRequesterEmailFromAuthorization(
    req.headers.authorization,
    conferenceId,
    operationName
  );
  const { conferenceRef, conferenceData } = await loadConference(db, conferenceId, operationName);
  ensureRequesterIsOrganizer(conferenceData, conferenceId, requesterEmail, operationName);
  return {
    db,
    conferenceId,
    requesterEmail,
    conferenceRef,
    conferenceData,
  };
}

/**
 * Parses a bearer token from Authorization header.
 * Returns empty string when header is missing or malformed.
 */
export function extractBearerToken(header: string): string {
  if (!header) {
    return '';
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

/**
 * Verifies Firebase ID token from Authorization header and returns caller email.
 * Throws HttpError(401) when token is missing/invalid or email is missing.
 */
export async function getRequesterEmailFromAuthorization(
  authorizationHeader: unknown,
  conferenceId: string,
  operationName: string
): Promise<string> {
  const authHeader = String(authorizationHeader ?? '');
  const idToken = extractBearerToken(authHeader);
  if (!idToken) {
    throw new HttpError(
      401,
      'Unauthorized: missing bearer token',
      `${operationName} rejected: missing bearer token`,
      { conferenceId }
    );
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const requesterEmail = String(decodedToken?.email ?? '').trim().toLowerCase();
  if (!requesterEmail) {
    throw new HttpError(
      401,
      'Unauthorized: email missing in token',
      `${operationName} rejected: token has no email`,
      { conferenceId, uid: decodedToken?.uid ?? '' }
    );
  }
  return requesterEmail;
}

/**
 * Returns whether requester email is part of conference organizers, either explicitly or by configured domain.
 *
 * @param conferenceData Conference payload.
 * @param requesterEmail Requester email.
 * @returns `true` when requester is organizer.
 */
export function isRequesterOrganizer(conferenceData: any, requesterEmail: string): boolean {
  /**
   * Organizer emails.
   * @param conferenceData?.organizerEmails ?? [] Conference data?.organizer emails ?? [].
   * @returns Promise resolved when the operation completes.
   */
  const organizerEmails = (conferenceData?.organizerEmails ?? [])
    .map((email: any) => String(email ?? '').trim().toLowerCase())
    .filter((email: string) => email.length > 0);
  const organizerEmailDomain = String(conferenceData?.organizerEmailDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  const requesterDomain = requesterEmail.includes('@')
    ? requesterEmail.slice(requesterEmail.lastIndexOf('@') + 1)
    : '';
  return organizerEmails.includes(requesterEmail)
    || (!!organizerEmailDomain && requesterDomain === organizerEmailDomain);
}

/**
 * Ensures requester email is part of conference organizers, either explicitly or by configured domain.
 * Throws HttpError(403) when requester is not organizer.
 */
export function ensureRequesterIsOrganizer(
  conferenceData: any,
  conferenceId: string,
  requesterEmail: string,
  operationName: string
): void {
  const isOrganizer = isRequesterOrganizer(conferenceData, requesterEmail);
  /**
   * Organizer emails.
   * @param conferenceData?.organizerEmails ?? [] Conference data?.organizer emails ?? [].
   * @returns Computed result.
   */
  const organizerEmails = (conferenceData?.organizerEmails ?? [])
    .map((email: any) => String(email ?? '').trim().toLowerCase())
    .filter((email: string) => email.length > 0);
  const organizerEmailDomain = String(conferenceData?.organizerEmailDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  if (!isOrganizer) {
    throw new HttpError(
      403,
      'Forbidden: organizer access required',
      `${operationName} rejected: requester is not organizer`,
      {
        conferenceId,
        requesterEmail,
        organizerCount: organizerEmails.length,
        organizerEmailDomain,
      }
    );
  }
}

/**
 * Authorized organizer context resolved for one conference-scoped request.
 */
export interface AuthorizedConferenceOrganizerContext {
  /** Firestore handle. */
  db: admin.firestore.Firestore;
  /** Conference identifier taken from the request. */
  conferenceId: string;
  /** Authenticated organizer email. */
  requesterEmail: string;
  /** Loaded conference document reference. */
  conferenceRef: admin.firestore.DocumentReference;
  /** Loaded conference payload. */
  conferenceData: any;
}
