import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { SessionAllocation } from '../model/session.model';
import { from, map, Observable } from 'rxjs';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';

/**
 * Service for SessionAllocation persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SessionAllocationService extends FirestoreGenericService<SessionAllocation> {
  protected override getCollectionName(): string {
    return 'session-allocation';
  }

  byConferenceId(conferenceId: string): Observable<SessionAllocation[]> {
    return from(
      getDocs(
        fbQuery(this.itemsCollection(), fbWhere('conferenceId', '==', conferenceId))
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as SessionAllocation;
          data.id = qds.id;
          return data;
        })
      )
    );
  }
}
