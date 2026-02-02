import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Session } from '../model/session.model';

/**
 * Service for Session persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SessionService extends FirestoreGenericService<Session> {
  protected override getCollectionName(): string {
    return 'session';
  }
}
