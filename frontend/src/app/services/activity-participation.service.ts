import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { ActivityParticipation } from '../model/activity.model';

/**
 * Service for ActivityParticipation persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ActivityParticipationService extends FirestoreGenericService<ActivityParticipation> {
  protected override getCollectionName(): string {
    return 'activityParticipation';
  }
}
