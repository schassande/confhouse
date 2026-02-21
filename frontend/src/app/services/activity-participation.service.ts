import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { ActivityParticipation } from '../model/activity.model';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

/**
 * Service for ActivityParticipation persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ActivityParticipationService extends FirestoreGenericService<ActivityParticipation> {
  protected override getCollectionName(): string {
    return 'activityParticipation';
  }

  byActivityId(conferenceId: string, activityId: string): Observable<ActivityParticipation[]> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('conferenceId', '==', conferenceId),
          where('activityId', '==', activityId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as ActivityParticipation;
          data.id = qds.id;
          return data;
        })
      )
    );
  }

  byActivityAndPersonId(conferenceId: string, activityId: string, personId: string): Observable<ActivityParticipation | undefined> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('conferenceId', '==', conferenceId),
          where('activityId', '==', activityId),
          where('personId', '==', personId)
        )
      )
    ).pipe(
      map((qs) => {
        const docSnap = qs.docs[0];
        if (!docSnap) {
          return undefined;
        }
        const data = docSnap.data() as ActivityParticipation;
        data.id = docSnap.id;
        return data;
      })
    );
  }

  byPersonId(personId: string): Observable<ActivityParticipation[]> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('personId', '==', personId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as ActivityParticipation;
          data.id = qds.id;
          return data;
        })
      )
    );
  }
}
