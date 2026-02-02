import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Conference } from '../model/conference.model';

/**
 * Service for Conference persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceService extends FirestoreGenericService<Conference> {
  protected override getCollectionName(): string {
    return 'conference';
  }
}
