import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Session } from '../model/session.model';
import { map, Observable, from } from 'rxjs';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';

/**
 * Service for Session persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SessionService extends FirestoreGenericService<Session> {
  protected override getCollectionName(): string {
    return 'session';
  }
  /** Load the session of a conference
   * @param conferenceId the identifier of the conference
   * @returns 
   */
  byConferenceId(conferenceId: string): Observable<Session[]> {
    return from(getDocs(fbQuery(this.itemsCollection(), fbWhere('conference.conferenceId', '==', conferenceId)))).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const session = qds.data() as Session;
          session.id = qds.id;
          return session;
        })
      )
    );
  }

  /** Search all session of a speaker */
  bySpeaker(speakerId: string): Observable<Session[]> {
    const q1 = getDocs(fbQuery(this.itemsCollection(), fbWhere('speaker1Id', '==', speakerId)));
    const q2 = getDocs(fbQuery(this.itemsCollection(), fbWhere('speaker2Id', '==', speakerId)));
    const q3 = getDocs(fbQuery(this.itemsCollection(), fbWhere('speaker3Id', '==', speakerId)));
    return from(Promise.all([q1, q2, q3])).pipe(
      map(([qs1, qs2, qs3]) => {
        const byId = new Map<string, Session>();
        [qs1, qs2, qs3].forEach((qs) =>
          qs.docs.forEach((qds) => {
            const session = qds.data() as Session;
            session.id = qds.id;
            byId.set(qds.id, session);
          })
        );
        return Array.from(byId.values());
      })
    );
  }
}
