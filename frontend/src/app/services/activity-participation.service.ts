import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { ActivityParticipation } from '@shared/model/activity.model';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firstValueFrom, from, map, Observable } from 'rxjs';

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

  /**
   * Loads all activity participations of a person scoped to one conference.
   *
   * @param conferenceId Conference identifier.
   * @param personId Person identifier.
   * @returns Matching activity participations.
   */
  byConferenceAndPersonId(conferenceId: string, personId: string): Observable<ActivityParticipation[]> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('conferenceId', '==', conferenceId),
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

  /**
   * Deletes all activity participations of a person for one conference.
   *
   * @param conferenceId Conference identifier.
   * @param personId Person identifier.
   * @returns Number of deleted participation documents.
   */
  async deleteByConferenceAndPersonId(conferenceId: string, personId: string): Promise<number> {
    const normalizedConferenceId = String(conferenceId ?? '').trim();
    const normalizedPersonId = String(personId ?? '').trim();
    if (!normalizedConferenceId || !normalizedPersonId) {
      return 0;
    }

    const toDelete = await firstValueFrom(
      this.byConferenceAndPersonId(normalizedConferenceId, normalizedPersonId)
    );

    await Promise.all(
      toDelete
        .map((participation) => String(participation.id ?? '').trim())
        .filter((id) => !!id)
        .map((id) => this.delete(id))
    );

    return toDelete.length;
  }
}

