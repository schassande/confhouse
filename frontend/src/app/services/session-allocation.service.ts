import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { SessionAllocation } from '../model/session.model';

/**
 * Service for SessionAllocation persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SessionAllocationService extends FirestoreGenericService<SessionAllocation> {
  protected override getCollectionName(): string {
    return 'sessionAllocation';
  }
}
