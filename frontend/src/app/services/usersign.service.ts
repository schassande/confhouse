import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, User, sendPasswordResetEmail, setPersistence, browserLocalPersistence, onAuthStateChanged } from '@angular/fire/auth';
import { PersonService } from './person.service';
import { Person } from '../model/person.model';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { functionBaseUrl } from './constantes';

@Injectable({ providedIn: 'root' })
export class UserSignService {
  private readonly auth = inject(Auth);
  private readonly personService = inject(PersonService);
  private readonly http = inject(HttpClient);
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
          this._person.set(person);
          this._user.set(firebaseUser);
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
      this._person.set(databasePerson);
      this._user.set(cred.user);
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
    let person: Person|undefined = {
        id: user.uid,
        lastUpdated: Date.now().toString(),
        firstName: user.displayName?.split(' ')[0] ?? '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') ?? '',
        email: user.email,
        hasAccount: true,
        preferredLanguage: 'en',
        isPlatformAdmin: false
      };
    // Try to create via Cloud Function first
    person = await this.createPersonViaFunction(person);

    // If successful, set signals
    if (person) {
        this._person.set(person);
        this._user.set(cred.user);
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
    const person = await firstValueFrom(this.personService.findByEmail(email));
    
    if (person) {
      this._person.set(person);
      this._user.set(cred.user);
    }
    
    return person;
  }

  /**
   * Login a user with Google authentication
   * @returns 
   */
  async loginWithGoogle(): Promise<Person|undefined> {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    const user = cred.user;
    
    if (!user.email) return undefined;
    
    // Fetch person from database using email
    const person = await firstValueFrom(this.personService.findByEmail(user.email));
    
    if (person) {
      this._person.set(person);
      this._user.set(cred.user);
    }
    
    return person;
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
}
