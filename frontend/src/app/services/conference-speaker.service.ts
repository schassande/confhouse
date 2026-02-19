import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { ConferenceSpeaker } from '../model/speaker.model';

/**
 * Service for ConferenceSpeaker persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceSpeakerService extends FirestoreGenericService<ConferenceSpeaker> {
  protected override getCollectionName(): string {
    return 'conference-speaker';
  }
}
