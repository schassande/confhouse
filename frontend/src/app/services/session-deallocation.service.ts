import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Session, SessionAllocation, SessionStatus } from '../model/session.model';
import { SessionAllocationService } from './session-allocation.service';
import { SessionService } from './session.service';

export interface DeallocateOptions {
  allAllocations?: SessionAllocation[];
  sessions?: Session[];
  deleteAllocations?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SessionDeallocationService {
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly sessionService = inject(SessionService);

  async deallocateBySlotIds(conferenceId: string, slotIds: string[], options?: DeallocateOptions): Promise<Session[]> {
    if (!conferenceId || !slotIds?.length) {
      return [];
    }
    const allAllocations = options?.allAllocations
      ?? await firstValueFrom(this.sessionAllocationService.byConferenceId(conferenceId));
    const slotIdSet = new Set(slotIds);
    const allocationsToRemove = allAllocations.filter((allocation) => slotIdSet.has(allocation.slotId));
    return this.deallocateByAllocations(conferenceId, allocationsToRemove, {
      ...options,
      allAllocations,
    });
  }

  async deallocateByAllocations(
    conferenceId: string,
    allocationsToRemove: SessionAllocation[],
    options?: DeallocateOptions
  ): Promise<Session[]> {
    if (!conferenceId || !allocationsToRemove?.length) {
      return [];
    }

    const deleteAllocations = options?.deleteAllocations ?? true;
    const allAllocations = options?.allAllocations
      ?? await firstValueFrom(this.sessionAllocationService.byConferenceId(conferenceId));
    const sessions = options?.sessions
      ?? await firstValueFrom(this.sessionService.byConferenceId(conferenceId));
    const sessionsById = new Map<string, Session>(sessions.filter(s => !!s.id).map(s => [s.id, s]));
    const removedAllocationIds = new Set(allocationsToRemove.map(a => a.id).filter(id => !!id));

    const updatedSessions: Session[] = [];
    const sessionIdsToCheck = Array.from(new Set(allocationsToRemove.map(a => a.sessionId).filter(id => !!id)));

    for (const sessionId of sessionIdsToCheck) {
      const hasRemainingAllocation = allAllocations.some((allocation) => {
        if (allocation.sessionId !== sessionId) {
          return false;
        }
        return !removedAllocationIds.has(allocation.id ?? '');
      });
      if (hasRemainingAllocation) {
        continue;
      }
      const session = sessionsById.get(sessionId);
      if (!session?.conference) {
        continue;
      }
      const nextStatus = this.statusAfterDeallocation(session.conference.status);
      if (!nextStatus || nextStatus === session.conference.status) {
        continue;
      }
      const updated: Session = {
        ...session,
        conference: {
          ...session.conference,
          status: nextStatus,
        },
      };
      const saved = await firstValueFrom(this.sessionService.save(updated));
      updatedSessions.push(saved);
      sessionsById.set(saved.id, saved);
    }

    if (deleteAllocations) {
      const allocationIdsToDelete = allocationsToRemove.map(a => a.id).filter(id => !!id);
      await Promise.all(allocationIdsToDelete.map(id => this.sessionAllocationService.delete(id)));
    }

    return updatedSessions;
  }

  statusAfterDeallocation(currentStatus: SessionStatus): SessionStatus | null {
    if (currentStatus === 'SCHEDULED') {
      return 'ACCEPTED';
    }
    if (currentStatus === 'PROGRAMMED') {
      return 'SPEAKER_CONFIRMED';
    }
    return null;
  }
}
