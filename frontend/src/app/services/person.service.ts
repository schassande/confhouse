import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Person } from '../model/person.model';

/**
 * Service for Person persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class PersonService extends FirestoreGenericService<Person> {
  protected override getCollectionName(): string {
    return 'person';
  }
}
