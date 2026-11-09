import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

import { environment } from '../environments/environment';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideAuth } from '@angular/fire/auth';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { emulatorHosts, useEmulators } from './firebase-emulators';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (useEmulators) {
        connectFirestoreEmulator(firestore, emulatorHosts.firestore.host, emulatorHosts.firestore.port);
      }
      return firestore;
    }),
    provideFunctions(() => {
      const functions = getFunctions();
      if (useEmulators) {
        connectFunctionsEmulator(functions, emulatorHosts.functions.host, emulatorHosts.functions.port);
      }
      return functions;
    }),
    provideAuth(() => {
      const auth = getAuth();
      if (useEmulators) {
        connectAuthEmulator(auth, emulatorHosts.auth, { disableWarnings: true });
      }
      return auth;
    }),
    provideTranslateService({
      loader: provideTranslateHttpLoader({prefix:'./i18n/', suffix:'.json'}),
      fallbackLang: 'en'
    }),
    providePrimeNG({ theme: { preset: Aura } })
  ]
};
