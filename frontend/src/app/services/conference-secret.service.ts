import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { ConferenceSecret } from '@shared/model/conference-secret.model';
import { Observable, from, map, switchMap } from 'rxjs';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';

export const CONFERENCE_HALL_TOKEN_SECRET_NAME = 'CONFERENCE_HALL_TOKEN';
export const VOXXRIN_SECRET_TOKEN_SECRET_NAME = 'VOXXRIN_SECRET_TOKEN';
export const BILLETWEB_KEY_SECRET_NAME = 'BILLETWEB_KEY';

@Injectable({ providedIn: 'root' })
export class ConferenceSecretService extends FirestoreGenericService<ConferenceSecret> {
  protected override getCollectionName(): string {
    return 'conferenceSecret';
  }

  findByConferenceAndName(conferenceId: string, secretName: string): Observable<ConferenceSecret | undefined> {
    return from(
      getDocs(
        fbQuery(
          this.itemsCollection(),
          fbWhere('conferenceId', '==', conferenceId),
        )
      )
    ).pipe(
      map((qs) => {
        const matches: ConferenceSecret[] = [];
        qs.forEach((qds) => {
          const data = qds.data() as ConferenceSecret;
          data.id = qds.id;
          if (data.secretName === secretName) {
            matches.push(data);
          }
        });
        return matches[0];
      })
    );
  }

  saveByConferenceAndName(conferenceId: string, secretName: string, secretValue: string): Observable<ConferenceSecret> {
    return this.findByConferenceAndName(conferenceId, secretName).pipe(
      switchMap((existing) => {
        const secret: ConferenceSecret = existing ?? {
          id: '',
          lastUpdated: '',
          conferenceId,
          secretName,
          secretValue: '',
        };
        secret.conferenceId = conferenceId;
        secret.secretName = secretName;
        secret.secretValue = secretValue;
        console.log("Saving secret", secret);
        return this.save(secret);
      })
    );
  }
}

