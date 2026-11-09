import { environment } from '../environments/environment';

/**
 * Whether the frontend targets the local Firebase emulators instead of the real project.
 * Enabled with `useEmulators: true` in `environments/environment.ts` (optional field, defaults to false).
 * See doc/dev.md, "Local preview with emulators".
 */
export const useEmulators = 'useEmulators' in environment && environment.useEmulators === true;

/** Local emulator endpoints, aligned with the ports declared in `firebase.json`. */
export const emulatorHosts = {
  firestore: { host: '127.0.0.1', port: 8080 },
  auth: 'http://127.0.0.1:9099',
  functions: { host: '127.0.0.1', port: 5001 },
};
