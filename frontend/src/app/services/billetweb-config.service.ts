import { Injectable } from '@angular/core';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { Observable, from, map, switchMap } from 'rxjs';
import { BilletwebConfig } from '../model/billetweb-config';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class BilletwebConfigService extends FirestoreGenericService<BilletwebConfig> {
  protected override getCollectionName(): string {
    return 'billetweb-config';
  }

  findByConferenceId(conferenceId: string): Observable<BilletwebConfig | undefined> {
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
        return { ...(first.data() as BilletwebConfig), id: first.id };
      })
    );
  }

  saveByConferenceId(
    conferenceId: string,
    data: Partial<BilletwebConfig>
  ): Observable<BilletwebConfig> {
    return this.findByConferenceId(conferenceId).pipe(
      switchMap((existing) => {
        const config: BilletwebConfig = {
          id: existing?.id ?? '',
          lastUpdated: existing?.lastUpdated ?? '',
          apiUrl: existing?.apiUrl ?? '',
          userId: existing?.userId ?? '',
          keyVersion: existing?.keyVersion ?? '',
          eventId: existing?.eventId ?? '',
          ticketTypes: existing?.ticketTypes ?? {
            speaker: { ticketTypeId: '', ticketTypeName: '' },
            organizer: { ticketTypeId: '', ticketTypeName: '' },
            sponsorConference: { ticketTypeId: '', ticketTypeName: '' },
            sponsorStand: { ticketTypeId: '', ticketTypeName: '' },
          },
          conferenceId,
          ...existing,
          ...data,
        };
        return this.save(config);
      })
    );
  }
}
