import { Injectable } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
import { Sponsor } from '../model/conference.model';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class SponsorService extends FirestoreGenericService<Sponsor> {
  protected override getCollectionName(): string {
    return 'sponsor';
  }

  byConferenceId(conferenceId: string): Observable<Sponsor[]> {
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
          const data = qds.data() as Sponsor;
          data.id = qds.id;
          return data;
        })
      )
    );
  }
}
