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
        return this.normalizeConfig({ ...(first.data() as BilletwebConfig), id: first.id });
      })
    );
  }

  saveByConferenceId(
    conferenceId: string,
    data: Partial<BilletwebConfig>
  ): Observable<BilletwebConfig> {
    return this.findByConferenceId(conferenceId).pipe(
      switchMap((existing) => {
        const normalizedExisting = this.normalizeConfig(existing);
        const config: BilletwebConfig = {
          ...(normalizedExisting ?? {}),
          id: existing?.id ?? '',
          lastUpdated: existing?.lastUpdated ?? '',
          apiUrl: existing?.apiUrl ?? '',
          userId: existing?.userId ?? '',
          keyVersion: existing?.keyVersion ?? '',
          eventId: existing?.eventId ?? '',
          ticketTypes: normalizedExisting?.ticketTypes ?? {
            speaker: { ticketTypeId: '', ticketTypeName: '' },
            organizer: { ticketTypeId: '', ticketTypeName: '' },
            sponsors: [],
          },
          conferenceId,
          ...existing,
          ...data,
        };
        return this.save(config);
      })
    );
  }

  /**
   * Normalizes one BilletWeb config payload, including legacy sponsor ticket fields.
   *
   * @param config Raw BilletWeb configuration.
   * @returns Normalized BilletWeb configuration.
   */
  private normalizeConfig(config: BilletwebConfig | undefined): BilletwebConfig | undefined {
    if (!config) {
      return undefined;
    }

    const legacyTicketTypes = config.ticketTypes as {
      speaker?: BilletwebConfig['ticketTypes']['speaker'];
      organizer?: BilletwebConfig['ticketTypes']['organizer'];
      sponsors?: BilletwebConfig['ticketTypes']['sponsors'];
      sponsorConference?: BilletwebConfig['ticketTypes']['speaker'];
      sponsorStand?: BilletwebConfig['ticketTypes']['speaker'];
    } | undefined;

    const sponsors = Array.isArray(legacyTicketTypes?.sponsors)
      ? legacyTicketTypes.sponsors
      : [legacyTicketTypes?.sponsorConference, legacyTicketTypes?.sponsorStand]
          .filter((ticketType): ticketType is NonNullable<typeof ticketType> => !!ticketType)
          .filter((ticketType) => String(ticketType.ticketTypeId ?? '').trim().length > 0);

    return {
      ...config,
      ticketTypes: {
        speaker: legacyTicketTypes?.speaker ?? { ticketTypeId: '', ticketTypeName: '' },
        organizer: legacyTicketTypes?.organizer ?? { ticketTypeId: '', ticketTypeName: '' },
        sponsors,
      },
    };
  }
}
