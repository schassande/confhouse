import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Activity } from '../model/activity.model';

/**
 * Service for Activity persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService extends FirestoreGenericService<Activity> {
  protected override getCollectionName(): string {
    return 'activity';
  }
}
