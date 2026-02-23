import { Injectable } from '@angular/core';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { Observable, from, map, switchMap } from 'rxjs';
import { VoxxrinConfig } from '../model/voxxrin-config.model';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class VoxxrinConfigService extends FirestoreGenericService<VoxxrinConfig> {
  protected override getCollectionName(): string {
    return 'voxxrin-config';
  }

  findByConferenceId(conferenceId: string): Observable<VoxxrinConfig | undefined> {
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
        return { ...(first.data() as VoxxrinConfig), id: first.id };
      })
    );
  }

  saveByConferenceId(
    conferenceId: string,
    data: Partial<VoxxrinConfig>
  ): Observable<VoxxrinConfig> {
    return this.findByConferenceId(conferenceId).pipe(
      switchMap((existing) => {
        const config: VoxxrinConfig = {
          id: existing?.id ?? '',
          lastUpdated: existing?.lastUpdated ?? '',
          timezone: existing?.timezone ?? 'UTC',
          keywords: existing?.keywords ?? [],
          backgroundUrl: existing?.backgroundUrl ?? '',
          ...existing,
          ...data,
          conferenceId,
        };
        return this.save(config);
      })
    );
  }
}
