import { Injectable } from '@angular/core';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { Observable, from, map, switchMap } from 'rxjs';
import { ConferenceHallConfig, SessionTypeMapping } from '@shared/model/conferencehall.model';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class ConferenceHallConfigService extends FirestoreGenericService<ConferenceHallConfig> {
  protected override getCollectionName(): string {
    return 'conference-hall-config';
  }

  findByConferenceId(conferenceId: string): Observable<ConferenceHallConfig | undefined> {
    return from(
      getDocs(
        fbQuery(
          this.itemsCollection(),
          fbWhere('conferenceId', '==', conferenceId),
        )
      )
    ).pipe(
      map((qs) => {
        const first = qs.docs[0];
        if (!first) {
          return undefined;
        }
        return { ...(first.data() as ConferenceHallConfig), id: first.id };
      })
    );
  }

  saveByConferenceId(
    conferenceId: string,
    data: {
      conferenceName: string;
      sessionTypeMappings: SessionTypeMapping[];
      lastCommunication?: string;
    }
  ): Observable<ConferenceHallConfig> {
    return this.findByConferenceId(conferenceId).pipe(
      switchMap((existing) => {
        const config: ConferenceHallConfig = existing ?? {
          id: '',
          lastUpdated: '',
          conferenceId,
          conferenceName: '',
          sessionTypeMappings: [],
          lastCommunication: '',
        };
        config.conferenceId = conferenceId;
        config.conferenceName = data.conferenceName;
        config.sessionTypeMappings = data.sessionTypeMappings;
        if (typeof data.lastCommunication === 'string') {
          config.lastCommunication = data.lastCommunication;
        } else if (!config.lastCommunication) {
          config.lastCommunication = '';
        }
        return this.save(config);
      })
    );
  }
}

