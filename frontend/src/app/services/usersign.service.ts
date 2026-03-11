import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { FirebaseError } from 'firebase/app';
import {
  AuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
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
import { HttpClient } from '@angular/common/http';
import { functionBaseUrl } from './constantes';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class UserSignService {
  private readonly auth = inject(Auth);
  private readonly personService = inject(PersonService);
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly _user = signal<User | null>(null);
  private readonly _person = signal<Person | null>(null);
  person = computed(() => this._person());

  constructor() {
    // Set Firebase persistence to localStorage (survives page refreshes)
    void setPersistence(this.auth, browserLocalPersistence);
    
    // Listen to auth state changes and restore user session
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // User is authenticated - fetch Person from database
        const person = await firstValueFrom(this.personService.findByEmail(firebaseUser.email));
        if (person) {
          this.setAuthenticatedContext(firebaseUser, person);
        }
      } else {
        // No user - clear signals
        this._user.set(null);
        this._person.set(null);
      }
    });
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
   * @returns 
   */
  async signupWithEmail(person: Person, password: string): Promise<Person|undefined> {
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

    // If successful, set signals
    if (databasePerson) {
      this.setAuthenticatedContext(cred.user, databasePerson);
    }
    return databasePerson;
  }

  /**
   * Sign up a new user with Google authentication
   * @returns 
   */
  async signupWithGoogle(): Promise<Person|undefined> {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    const user = cred.user;
    if (!user.email) return undefined;

    // Create a person object from user info of the google account
    const person = await this.createPersonFromGoogleUser(user);

    // If successful, set signals
    if (person) {
        this.setAuthenticatedContext(cred.user, person);
    }    
    return person;
  }
  /**
   * Login a user with email and password
   * @param email 
   * @param password 
   * @returns 
   */
  async loginWithEmail(email: string, password: string): Promise<Person|undefined> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    
    // Fetch person from database using email
    let person = await firstValueFrom(this.personService.findByEmail(email));
    if (person) {
      this.setAuthenticatedContext(cred.user, person);
    }
    return person;
  }

  /**
   * Login a user with Google authentication
   * @returns 
   */
  async loginWithGoogle(): Promise<Person|undefined> {
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
  async loginWithGithub(): Promise<Person|undefined> {
    const provider = new GithubAuthProvider();
    provider.addScope('user:email');
    return await this.loginWithOAuthProvider(
      provider,
      (error) => GithubAuthProvider.credentialFromError(error),
      'GitHub'
    );
  }

  private async loginWithOAuthProvider(
    provider: AuthProvider,
    credentialFromError: (error: FirebaseError) => ReturnType<typeof GoogleAuthProvider.credentialFromError>,
    providerLabel: string
  ): Promise<Person | undefined> {
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

  private async finishOAuthLogin(user: User): Promise<Person | undefined> {
    if (!user.email) return undefined;

    let person = await firstValueFrom(this.personService.findByEmail(user.email));
    if (!person) {
      person = await this.createPersonFromGoogleUser(user);
    }
    if (person) {
      this.setAuthenticatedContext(user, person);
    }
    return person;
  }

  private async createPersonFromGoogleUser(user: User): Promise<Person|undefined> {
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

  getCurrentPerson(): Person | null {
    return this._person();
  }

  async disconnectUser() {
    this._user.set(null);
    this._person.set(null);
    return await signOut(this.auth);
  }

  /**
   * Send password reset email using Firebase Auth
   * @param email
   */
  async sendPasswordReset(email: string): Promise<void> {
    return await sendPasswordResetEmail(this.auth, email);
  }

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

  private setAuthenticatedContext(user: User, person: Person): void {
    this._person.set(person);
    this._user.set(user);
    this.applyPreferredLanguage(person);
  }

  private applyPreferredLanguage(person: Person): void {
    const preferred = (person.preferredLanguage || 'en').toLowerCase();
    const lang: 'en' | 'fr' = preferred === 'fr' ? 'fr' : 'en';
    if (this.translate.currentLang !== lang) {
      void this.translate.use(lang);
    }
  }
}
