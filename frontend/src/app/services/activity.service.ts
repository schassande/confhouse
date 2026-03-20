import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Activity } from '@shared/model/activity.model';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

/**
 * Service for Activity persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService extends FirestoreGenericService<Activity> {
  protected override getCollectionName(): string {
    return 'activity';
  }

  byConferenceId(conferenceId: string): Observable<Activity[]> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('conferenceId', '==', conferenceId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as Activity;
          data.id = qds.id;
          return data;
        })
      )
    );
  }
}

