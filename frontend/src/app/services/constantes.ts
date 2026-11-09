import { environment } from '../../environments/environment';
import { emulatorHosts, useEmulators } from '../firebase-emulators';

/** Base URL of the HTTP Cloud Functions, pointing to the Functions emulator when emulators are enabled. */
export const functionBaseUrl = useEmulators
  ? `http://${emulatorHosts.functions.host}:${emulatorHosts.functions.port}/${environment.firebase.projectId}/${environment.firebase.function_region}/`
  : `https://${environment.firebase.function_region}-${environment.firebase.projectId}.cloudfunctions.net/`;
