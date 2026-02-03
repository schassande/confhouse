import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, User, UserCredential } from '@angular/fire/auth';
import { PersonService } from './person.service';
import { Person } from '../model/person.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SignupService {
  private readonly auth = inject(Auth);
  private readonly personService = inject(PersonService);
  private readonly _user = signal<User | null>(null);
  private readonly _person = signal<Person | null>(null);
  person = computed(() => this._person());

  /**
   * Sign up a new user with email and password
   * @param person 
   * @param password 
   * @returns 
   */
  async signupWithEmail(person: Person, password: string): Promise<Person|undefined> {
    let databasePerson: Person|undefined = await firstValueFrom(this.personService.findByEmail(person.email));
    const cred = await createUserWithEmailAndPassword(this.auth, person.email, password);
    if (databasePerson) {
        databasePerson.hasAccount = true;
    } else {
        databasePerson = person;
    }
    databasePerson = await firstValueFrom(this.personService.save(databasePerson));
    this._person.set(databasePerson);
    this._user.set(cred.user);
    return databasePerson;
  }

  /**
   * Sign up a new user with Google authentication
   * @returns 
   */
  async signupWithGoogle(): Promise<Person|undefined> {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    this._user.set(cred.user);

    const user = cred.user;
    if (!user.email) return undefined;
    // Check if the person already exists (by email)
    let person: Person|undefined = await firstValueFrom(this.personService.findByEmail(user.email));
    if (!person) {
      // Build Person from Google profile info
      person = {
        id: user.uid,
        lastUpdated: Date.now().toString(),
        firstName: user.displayName?.split(' ')[0] ?? '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') ?? '',
        email: user.email,
        hasAccount: true,
        preferredLanguage: 'en'
      };
      person = await firstValueFrom(this.personService.save(person));
    }
    this._person.set(person);
    return person;
  }

  getCurrentPerson(): Person | null {
    return this._person();
  }

  async disconnectUser() {
    this._user.set(null);
    return await signOut(this.auth);
  }
}
