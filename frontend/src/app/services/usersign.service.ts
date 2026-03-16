import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { FirebaseError } from 'firebase/app';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  ActionCodeSettings,
  AuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { PersonService } from './person.service';
import { Person } from '../model/person.model';
import { firstValueFrom } from 'rxjs';
import { functionBaseUrl } from './constantes';
import { TranslateService } from '@ngx-translate/core';
import { RedirectService } from './redirect.service';
import { environment } from '../../environments/environment';

interface AuthFlowResult {
  person?: Person;
  requiresEmailVerification?: boolean;
}

interface PendingEmailVerificationContext {
  email: string;
  idToken: string;
  continueUrl: string;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class UserSignService {
  private static readonly PENDING_EMAIL_VERIFICATION_STORAGE_KEY = 'pendingEmailVerification';
  private readonly auth = inject(Auth);
  private readonly personService = inject(PersonService);
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly redirectService = inject(RedirectService);
  private readonly _user = signal<User | null>(null);
  private readonly _person = signal<Person | null>(null);
  private readonly authReadyPromise: Promise<void>;
  person = computed(() => this._person());

  /**
   * Initializes Firebase persistence and restores the authenticated session when possible.
   */
  constructor() {
    this.authReadyPromise = this.initializeAuthPersistenceAndRestoreSession();
  }

  /**
   * Resolves once Firebase has restored the initial auth state from persistence.
   * Guards can await this to avoid redirecting during refresh.
   */
  async waitForAuthReady(): Promise<void> {
    await this.authReadyPromise;
  }

  /**
   * Create person via Cloud Function with email uniqueness guarantee
   * @param person 
   * @returns Created person or undefined if email already exists
   */
  private async createPersonViaFunction(person: Person): Promise<Person | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ person: Person }>(functionBaseUrl + 'createPerson', person)
      );
      return response.person;
    } catch (error: any) {
      if (error.status === 409) {
        // Email already exists - return the existing person
        return await firstValueFrom(this.personService.findByEmail(person.email));
      }
      throw error;
    }
  }

  /**
   * Sign up a new user with email and password
   * @param person 
   * @param password 
   * @param returnUrl URL to reopen after the user verifies the email.
   * @returns Authentication flow outcome.
   */
  async signupWithEmail(person: Person, password: string, returnUrl?: string | null): Promise<AuthFlowResult> {
    // Create auth user first
    const cred = await createUserWithEmailAndPassword(this.auth, person.email, password);
    person.id = cred.user.uid;
    
    // Ensure platform admin flag defaults to false if not provided
    if (person.isPlatformAdmin === undefined) {
      person.isPlatformAdmin = false;
    }

    // Create person via Cloud Function (guarantees email uniqueness)
    let databasePerson: Person|undefined = await this.createPersonViaFunction(person);

    // Ensure hasAccount is true
    if (databasePerson && !databasePerson.hasAccount) {
      databasePerson.hasAccount = true;
      databasePerson = await firstValueFrom(this.personService.save(databasePerson));
    }

    await this.redirectUnverifiedUser(cred.user, person.email, returnUrl, true);
    return { person: databasePerson, requiresEmailVerification: true };
  }

  /**
   * Sign up a new user with Google authentication
   * @returns Authentication flow outcome.
   */
  async signupWithGoogle(): Promise<AuthFlowResult> {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    const user = cred.user;
    if (!user.email) return {};

    // Create a person object from user info of the OAuth account
    const person = await this.createPersonFromOAuthUser(user);

    if (this.requiresEmailVerification(cred.user)) {
      await this.redirectUnverifiedUser(cred.user, user.email, undefined, true);
      return { person, requiresEmailVerification: true };
    }

    if (person) {
      this.clearPendingEmailVerification();
      this.setAuthenticatedContext(cred.user, person);
    }
    return { person };
  }
  /**
   * Login a user with email and password
   * @param email 
   * @param password 
   * @param returnUrl URL to reopen after verification.
   * @returns Authentication flow outcome.
   */
  async loginWithEmail(email: string, password: string, returnUrl?: string | null): Promise<AuthFlowResult> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);

    await reload(cred.user);

    if (this.requiresEmailVerification(cred.user)) {
      await this.redirectUnverifiedUser(cred.user, email, returnUrl, false);
      return { requiresEmailVerification: true };
    }
    
    // Fetch person from database using email
    let person = await firstValueFrom(this.personService.findByEmail(email));
    if (person) {
      this.clearPendingEmailVerification();
      this.setAuthenticatedContext(cred.user, person);
    }
    return { person };
  }

  /**
   * Login a user with Google authentication
   * @returns Authentication flow outcome.
   */
  async loginWithGoogle(): Promise<AuthFlowResult> {
    const provider = new GoogleAuthProvider();
    return await this.loginWithOAuthProvider(
      provider,
      (error) => GoogleAuthProvider.credentialFromError(error),
      'Google'
    );
  }

  /**
   * Login a user with GitHub authentication
   * @returns
   */
  async loginWithGithub(): Promise<AuthFlowResult> {
    const provider = new GithubAuthProvider();
    provider.addScope('user:email');
    return await this.loginWithOAuthProvider(
      provider,
      (error) => GithubAuthProvider.credentialFromError(error),
      'GitHub'
    );
  }

  /**
   * Signs in with an OAuth provider and handles account linking edge cases.
   * @param provider Firebase OAuth provider instance.
   * @param credentialFromError Helper used to recover a pending OAuth credential.
   * @param providerLabel Provider name for user-facing errors.
   * @returns Authentication flow outcome.
   */
  private async loginWithOAuthProvider(
    provider: AuthProvider,
    credentialFromError: (error: FirebaseError) => ReturnType<typeof GoogleAuthProvider.credentialFromError>,
    providerLabel: string
  ): Promise<AuthFlowResult> {
    try {
      const cred = await signInWithPopup(this.auth, provider);
      return await this.finishOAuthLogin(cred.user);
    } catch (error: any) {
      if (error?.code !== 'auth/account-exists-with-different-credential') {
        throw error;
      }

      const email = error?.customData?.email;
      if (!email) {
        throw new Error(`An account already exists with a different sign-in method. Use the original provider for ${providerLabel}.`);
      }

      const methods = await fetchSignInMethodsForEmail(this.auth, email);
      const pendingCredential = credentialFromError(error);

      if (methods.includes(GoogleAuthProvider.PROVIDER_ID) && provider.providerId !== GoogleAuthProvider.PROVIDER_ID) {
        const googleCred = await signInWithPopup(this.auth, new GoogleAuthProvider());
        if (this.auth.currentUser && pendingCredential) {
          await linkWithCredential(this.auth.currentUser, pendingCredential);
        }
        return await this.finishOAuthLogin(googleCred.user);
      }

      if (methods.includes(GithubAuthProvider.PROVIDER_ID) && provider.providerId !== GithubAuthProvider.PROVIDER_ID) {
        const githubProvider = new GithubAuthProvider();
        githubProvider.addScope('user:email');
        const githubCred = await signInWithPopup(this.auth, githubProvider);
        if (this.auth.currentUser && pendingCredential) {
          await linkWithCredential(this.auth.currentUser, pendingCredential);
        }
        return await this.finishOAuthLogin(githubCred.user);
      }

      if (methods.includes('password')) {
        throw new Error(`An account already exists for ${email}. Sign in with email and password first, then retry ${providerLabel} if you want to link it later.`);
      }

      const methodLabel = methods[0] ?? 'another provider';
      throw new Error(`An account already exists for ${email} with ${methodLabel}. Use that method to sign in first.`);
    }
  }

  /**
   * Completes the login flow after a successful OAuth authentication.
   * @param user Firebase authenticated user.
   * @returns Authentication flow outcome.
   */
  private async finishOAuthLogin(user: User): Promise<AuthFlowResult> {
    if (!user.email) return {};

    let person = await firstValueFrom(this.personService.findByEmail(user.email));
    if (!person) {
      person = await this.createPersonFromOAuthUser(user);
    }

    if (this.requiresEmailVerification(user)) {
      await this.redirectUnverifiedUser(user, user.email, undefined, true);
      return { person, requiresEmailVerification: true };
    }

    if (person) {
      this.clearPendingEmailVerification();
      this.setAuthenticatedContext(user, person);
    }
    return { person };
  }

  /**
   * Creates the local `Person` document for a newly authenticated OAuth user.
   * @param user Firebase authenticated user.
   * @returns Created person or the existing person when email already exists.
   */
  private async createPersonFromOAuthUser(user: User): Promise<Person|undefined> {
    const firstName: string = user.displayName?.split(' ')[0] ?? '';
    const lastName: string = user.displayName?.split(' ').slice(1).join(' ') ?? '';
    let person: Person = {
        id: user.uid,
        lastUpdated: Date.now().toString(),
        firstName: firstName,
        lastName: lastName,
        email: user.email!,
        search: user.displayName?.toLowerCase() ?? '',
        hasAccount: true,
        isSpeaker: false,
        preferredLanguage: 'en',
        isPlatformAdmin: false
      };
    // Try to create via Cloud Function first
    return await this.createPersonViaFunction(person);
  }

  /**
   * Returns the currently authenticated `Person` stored in the application state.
   * @returns Current person or `null`.
   */
  getCurrentPerson(): Person | null {
    return this._person();
  }

  /**
   * Disconnects the current Firebase user and clears the local application state.
   * @returns Promise resolved when the sign-out is completed.
   */
  async disconnectUser() {
    this._user.set(null);
    this._person.set(null);
    this.clearPendingEmailVerification();
    return await signOut(this.auth);
  }

  /**
   * Send password reset email using Firebase Auth
   * @param email
   */
  async sendPasswordReset(email: string): Promise<void> {
    return await sendPasswordResetEmail(this.auth, email);
  }

  /**
   * Resends the email verification link using the pending verification context stored before sign-out.
   * @returns Promise resolved when the verification email has been requested.
   */
  async resendEmailVerification(): Promise<void> {
    const pending = this.getPendingEmailVerification();
    if (!pending) {
      throw new Error(this.translate.instant('AUTH.EMAIL_NOT_VERIFIED.RESEND_REQUIRES_LOGIN'));
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${environment.firebase.apiKey}`;
    const locale = (this.translate.currentLang || 'en').toLowerCase();
    const headers = new HttpHeaders({ 'X-Firebase-Locale': locale });

    try {
      await firstValueFrom(
        this.http.post(
          url,
          {
            requestType: 'VERIFY_EMAIL',
            idToken: pending.idToken
          },
          { headers }
        )
      );
    } catch (error: any) {
      const message = error?.error?.error?.message;
      if (message === 'INVALID_ID_TOKEN' || message === 'TOKEN_EXPIRED' || message === 'USER_NOT_FOUND') {
        this.clearPendingEmailVerification();
        throw new Error(this.translate.instant('AUTH.EMAIL_NOT_VERIFIED.RESEND_REQUIRES_LOGIN'));
      }
      throw new Error(this.translate.instant('AUTH.EMAIL_NOT_VERIFIED.RESEND_ERROR'));
    }
  }

  /**
   * Returns the email associated with the pending verification flow.
   * @returns Pending email address or `null`.
   */
  getPendingVerificationEmail(): string | null {
    return this.getPendingEmailVerification()?.email ?? null;
  }

  /**
   * Returns the safe return URL associated with the pending verification flow.
   * @returns Pending application return URL or `null`.
   */
  getPendingVerificationContinueUrl(): string | null {
    return this.getPendingEmailVerification()?.continueUrl ?? null;
  }

  /**
   * Removes the pending verification context from session storage.
   */
  clearPendingEmailVerification(): void {
    try {
      sessionStorage.removeItem(UserSignService.PENDING_EMAIL_VERIFICATION_STORAGE_KEY);
    } catch (error) {
      // ignore storage errors
    }
  }

  /**
   * Updates the preferred language for the connected person and applies it immediately.
   * @param lang Requested language.
   */
  async updatePreferredLanguage(lang: 'en' | 'fr'): Promise<void> {
    const normalized: 'en' | 'fr' = lang === 'fr' ? 'fr' : 'en';
    const current = this._person();

    if (!current) {
      if (this.translate.currentLang !== normalized) {
        await this.translate.use(normalized);
      }
      return;
    }

    if ((current.preferredLanguage || 'en').toLowerCase() === normalized) {
      if (this.translate.currentLang !== normalized) {
        await this.translate.use(normalized);
      }
      return;
    }

    const updated: Person = { ...current, preferredLanguage: normalized };
    const saved = await firstValueFrom(this.personService.save(updated));
    this._person.set(saved);
    if (this.translate.currentLang !== normalized) {
      await this.translate.use(normalized);
    }
  }

  /**
   * Stores the authenticated Firebase user and the associated application `Person`.
   * @param user Firebase user.
   * @param person Application person.
   */
  private setAuthenticatedContext(user: User, person: Person): void {
    this._person.set(person);
    this._user.set(user);
    this.applyPreferredLanguage(person);
  }

  /**
   * Applies the user preferred language to the translation service.
   * @param person Application person.
   */
  private applyPreferredLanguage(person: Person): void {
    const preferred = (person.preferredLanguage || 'en').toLowerCase();
    const lang: 'en' | 'fr' = preferred === 'fr' ? 'fr' : 'en';
    if (this.translate.currentLang !== lang) {
      void this.translate.use(lang);
    }
  }

  /**
   * Restores the current authentication state and disconnects unverified users.
   * @param firebaseUser Firebase user emitted by the auth state listener.
   */
  private async handleAuthStateChanged(firebaseUser: User | null): Promise<void> {
    if (!firebaseUser || !firebaseUser.email) {
      this._user.set(null);
      this._person.set(null);
      return;
    }

    await reload(firebaseUser);

    if (this.requiresEmailVerification(firebaseUser)) {
      await this.redirectUnverifiedUser(firebaseUser, firebaseUser.email, this.router.url, false);
      return;
    }

    const person = await firstValueFrom(this.personService.findByEmail(firebaseUser.email));
    if (person) {
      this.clearPendingEmailVerification();
      this.setAuthenticatedContext(firebaseUser, person);
      return;
    }

    this._user.set(null);
    this._person.set(null);
  }

  /**
   * Applies the Firebase email verification policy to the current user.
   * @param user Firebase user.
   * @returns `true` when the user must verify their email before continuing.
   */
  private requiresEmailVerification(user: User): boolean {
    return !user.emailVerified;
  }

  /**
   * Sends a verification email, stores the pending verification context and redirects to the dedicated information page.
   * @param user Firebase user requiring verification.
   * @param email User email address.
   * @param returnUrl Optional application return URL.
   * @param sendVerificationEmail Whether a new verification email should be sent immediately.
   */
  private async redirectUnverifiedUser(user: User, email: string, returnUrl?: string | null, sendVerificationEmail = false): Promise<void> {
    const continueUrl = this.getSafeContinueUrl(returnUrl);
    if (sendVerificationEmail) {
      await sendEmailVerification(user, this.buildEmailVerificationActionSettings(continueUrl));
    }
    await this.storePendingEmailVerification(user, email, continueUrl);
    await signOut(this.auth);
    this._user.set(null);
    this._person.set(null);

    const queryParams: Record<string, string> = { email };
    if (continueUrl !== '/login') {
      queryParams['returnUrl'] = continueUrl;
    }

    if (!this.router.url.startsWith('/email-not-verified')) {
      await this.router.navigate(['/email-not-verified'], { queryParams, replaceUrl: true });
    }
  }

  /**
   * Builds the Firebase action code settings used in email verification links.
   * @param continueUrl Safe application return URL.
   * @returns Firebase action code settings.
   */
  private buildEmailVerificationActionSettings(continueUrl: string): ActionCodeSettings {
    return {
      url: `${window.location.origin}${continueUrl}`,
      handleCodeInApp: false
    };
  }

  /**
   * Stores the information required to resend a verification email after the user has been signed out.
   * @param user Firebase user requiring verification.
   * @param email Email address displayed to the user.
   * @param continueUrl Safe application return URL.
   */
  private async storePendingEmailVerification(user: User, email: string, continueUrl: string): Promise<void> {
    const pending: PendingEmailVerificationContext = {
      email,
      idToken: await user.getIdToken(),
      continueUrl,
      createdAt: Date.now()
    };

    try {
      sessionStorage.setItem(
        UserSignService.PENDING_EMAIL_VERIFICATION_STORAGE_KEY,
        JSON.stringify(pending)
      );
    } catch (error) {
      // ignore storage errors
    }
  }

  /**
   * Reads the stored pending verification context from session storage.
   * @returns Pending verification context or `null`.
   */
  private getPendingEmailVerification(): PendingEmailVerificationContext | null {
    try {
      const rawValue = sessionStorage.getItem(UserSignService.PENDING_EMAIL_VERIFICATION_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      const pending = JSON.parse(rawValue) as PendingEmailVerificationContext;
      if (!pending.email || !pending.idToken || !pending.continueUrl) {
        return null;
      }

      return pending;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalizes a candidate return URL and removes routes that would create auth loops.
   * @param returnUrl Candidate application route.
   * @returns Safe local route.
   */
  private getSafeContinueUrl(returnUrl?: string | null): string {
    if (returnUrl?.startsWith('/')) {
      this.redirectService.set(returnUrl);
    }

    return this.redirectService.get() ?? '/login';
  }

  /**
   * Configures Firebase auth persistence and resolves once the initial auth state is restored.
   */
  private async initializeAuthPersistenceAndRestoreSession(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
    } catch (error) {
      console.error('Unable to configure Firebase auth persistence:', error);
    }

    await new Promise<void>((resolve) => {
      let firstEmission = true;
      onAuthStateChanged(this.auth, (firebaseUser) => {
        void this.handleAuthStateChanged(firebaseUser).finally(() => {
          if (firstEmission) {
            firstEmission = false;
            resolve();
          }
        });
      });
    });
  }
}
