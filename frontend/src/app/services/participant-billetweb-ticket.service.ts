import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ParticipantBilletWebTicket } from '@shared/model/billetweb-config';
import { FirestoreGenericService } from './firestore-generic.service';

/**
 * Service for persisted `ParticipantBilletWebTicket` documents.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantBilletwebTicketService extends FirestoreGenericService<ParticipantBilletWebTicket> {
  protected override getCollectionName(): string {
    return 'participantBilletWebTicket';
  }

  /**
   * Loads several participant tickets by id while preserving the provided order.
   *
   * @param ids Ordered participant ticket ids.
   * @returns Existing participant tickets in the same order.
   */
  async byIds(ids: string[]): Promise<ParticipantBilletWebTicket[]> {
    const orderedIds = (ids ?? []).map((id) => String(id ?? '').trim()).filter((id) => !!id);
    const items = await Promise.all(
      orderedIds.map(async (id) => await firstValueFrom(this.byId(id)))
    );
    return items.filter((item): item is ParticipantBilletWebTicket => !!item);
  }
}
