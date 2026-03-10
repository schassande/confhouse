import { Injectable, inject } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Session, SessionAllocation, SessionStatus } from '../model/session.model';
import { from, map, Observable, firstValueFrom } from 'rxjs';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { SessionService } from './session.service';

export interface SessionDeallocateOptions {
  allAllocations?: SessionAllocation[];
  sessions?: Session[];
  deleteAllocations?: boolean;
}

export interface SessionDeallocationResult {
  deallocatedAllocations: SessionAllocation[];
  updatedSessions: Session[];
}

export interface SpeakerAvailabilityDeallocationInput {
  conferenceId: string;
  sessionIds: string[];
  unavailableSlotIds: string[];
  allAllocations?: SessionAllocation[];
  sessions?: Session[];
}

export interface SpeakerAvailabilityDeallocationResult extends SessionDeallocationResult {
  deallocatedCount: number;
}

/**
 * Service for SessionAllocation persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SessionAllocationService extends FirestoreGenericService<SessionAllocation> {
  private readonly sessionService = inject(SessionService);

  protected override getCollectionName(): string {
    return 'session-allocation';
  }

  byConferenceId(conferenceId: string): Observable<SessionAllocation[]> {
    return from(
      getDocs(
        fbQuery(this.itemsCollection(), fbWhere('conferenceId', '==', conferenceId))
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as SessionAllocation;
          data.id = qds.id;
          return data;
        })
      )
    );
  }

  /**
   * Deallocates every allocation attached to the provided slot ids.
   *
   * This method resolves matching allocations first, then delegates the actual
   * status update / allocation deletion workflow to {@link deallocateByAllocations}.
   *
   * @param conferenceId Conference identifier.
   * @param slotIds Slot ids to deallocate.
   * @param options Optional preloaded data and behavior flags.
   * @returns Deallocation report with removed allocations and updated sessions.
   */
  async deallocateBySlotIds(
    conferenceId: string,
    slotIds: string[],
    options?: SessionDeallocateOptions
  ): Promise<SessionDeallocationResult> {
    if (!conferenceId || !slotIds?.length) {
      return { deallocatedAllocations: [], updatedSessions: [] };
    }

    const allAllocations = options?.allAllocations
      ?? await firstValueFrom(this.byConferenceId(conferenceId));
    const slotIdSet = new Set(slotIds.map((slotId) => String(slotId ?? '').trim()).filter((slotId) => !!slotId));
    const allocationsToRemove = allAllocations.filter((allocation) => slotIdSet.has(String(allocation.slotId ?? '').trim()));

    return this.deallocateByAllocations(conferenceId, allocationsToRemove, {
      ...options,
      allAllocations,
    });
  }

  /**
   * Deallocates every allocation attached to the provided session ids.
   *
   * This method resolves matching allocations first, then delegates the actual
   * status update / allocation deletion workflow to {@link deallocateByAllocations}.
   *
   * @param conferenceId Conference identifier.
   * @param sessionIds Session ids to deallocate.
   * @param options Optional preloaded data and behavior flags.
   * @returns Deallocation report with removed allocations and updated sessions.
   */
  async deallocateBySessionIds(
    conferenceId: string,
    sessionIds: string[],
    options?: SessionDeallocateOptions
  ): Promise<SessionDeallocationResult> {
    if (!conferenceId || !sessionIds?.length) {
      return { deallocatedAllocations: [], updatedSessions: [] };
    }

    const allAllocations = options?.allAllocations
      ?? await firstValueFrom(this.byConferenceId(conferenceId));
    const sessionIdSet = new Set(
      sessionIds.map((sessionId) => String(sessionId ?? '').trim()).filter((sessionId) => !!sessionId)
    );
    const allocationsToRemove = allAllocations.filter((allocation) =>
      sessionIdSet.has(String(allocation.sessionId ?? '').trim())
    );

    return this.deallocateByAllocations(conferenceId, allocationsToRemove, {
      ...options,
      allAllocations,
    });
  }

  /**
   * Deallocates the provided allocations and updates impacted session statuses when needed.
   *
   * Status transition rule:
   * - `SCHEDULED` -> `ACCEPTED`
   * - `PROGRAMMED` -> `SPEAKER_CONFIRMED`
   *
   * A session status is updated only when all its allocations are removed.
   *
   * @param conferenceId Conference identifier.
   * @param allocationsToRemove Allocations targeted for removal.
   * @param options Optional preloaded data and behavior flags.
   * @returns Deallocation report with removed allocations and updated sessions.
   */
  async deallocateByAllocations(
    conferenceId: string,
    allocationsToRemove: SessionAllocation[],
    options?: SessionDeallocateOptions
  ): Promise<SessionDeallocationResult> {
    if (!conferenceId || !allocationsToRemove?.length) {
      return { deallocatedAllocations: [], updatedSessions: [] };
    }

    const deleteAllocations = options?.deleteAllocations ?? true;
    const allAllocations = options?.allAllocations
      ?? await firstValueFrom(this.byConferenceId(conferenceId));
    const sessions = options?.sessions ?? await firstValueFrom(this.sessionService.byConferenceId(conferenceId));

    const sessionsById = new Map<string, Session>(
      sessions
        .filter((session) => !!session.id)
        .map((session) => [String(session.id ?? '').trim(), session])
    );
    const removedAllocationIds = new Set(
      allocationsToRemove
        .map((allocation) => String(allocation.id ?? '').trim())
        .filter((id) => !!id)
    );
    const removedAllocationKeys = new Set(
      allocationsToRemove.map((allocation) => this.allocationKey(allocation))
    );
    const isAllocationRemoved = (allocation: SessionAllocation): boolean => {
      const allocationId = String(allocation.id ?? '').trim();
      if (allocationId) {
        return removedAllocationIds.has(allocationId);
      }
      return removedAllocationKeys.has(this.allocationKey(allocation));
    };

    const updatedSessions: Session[] = [];
    const sessionIdsToCheck = Array.from(
      new Set(
        allocationsToRemove
          .map((allocation) => String(allocation.sessionId ?? '').trim())
          .filter((id) => !!id)
      )
    );

    for (const sessionId of sessionIdsToCheck) {
      const hasRemainingAllocation = allAllocations.some((allocation) => {
        if (String(allocation.sessionId ?? '').trim() !== sessionId) {
          return false;
        }
        return !isAllocationRemoved(allocation);
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
      const allocationIdsToDelete = allocationsToRemove
        .map((allocation) => String(allocation.id ?? '').trim())
        .filter((id) => !!id);
      await Promise.all(allocationIdsToDelete.map((id) => this.delete(id)));
    }

    return {
      deallocatedAllocations: allocationsToRemove,
      updatedSessions,
    };
  }

  /**
   * Deallocates a speaker's sessions that are currently allocated on slots now marked unavailable.
   *
   * It filters allocations by `(sessionId in sessionIds) AND (slotId in unavailableSlotIds)`,
   * then delegates to {@link deallocateByAllocations}.
   *
   * @param input Deallocation context for the speaker availability change.
   * @returns Deallocation report including the number of removed allocations.
   */
  async deallocateSpeakerAllocationsOutsideAvailability(
    input: SpeakerAvailabilityDeallocationInput
  ): Promise<SpeakerAvailabilityDeallocationResult> {
    const conferenceId = String(input.conferenceId ?? '').trim();
    const sessionIdSet = new Set(
      (input.sessionIds ?? []).map((sessionId) => String(sessionId ?? '').trim()).filter((sessionId) => !!sessionId)
    );
    const unavailableSlotIdSet = new Set(
      (input.unavailableSlotIds ?? []).map((slotId) => String(slotId ?? '').trim()).filter((slotId) => !!slotId)
    );

    if (!conferenceId || sessionIdSet.size === 0 || unavailableSlotIdSet.size === 0) {
      return {
        deallocatedAllocations: [],
        updatedSessions: [],
        deallocatedCount: 0,
      };
    }

    const allAllocations = input.allAllocations
      ?? await firstValueFrom(this.byConferenceId(conferenceId));
    const allocationsToRemove = allAllocations.filter((allocation) =>
      sessionIdSet.has(String(allocation.sessionId ?? '').trim())
      && unavailableSlotIdSet.has(String(allocation.slotId ?? '').trim())
    );

    if (allocationsToRemove.length === 0) {
      return {
        deallocatedAllocations: [],
        updatedSessions: [],
        deallocatedCount: 0,
      };
    }

    const result = await this.deallocateByAllocations(conferenceId, allocationsToRemove, {
      allAllocations,
      sessions: input.sessions,
      deleteAllocations: true,
    });

    return {
      ...result,
      deallocatedCount: allocationsToRemove.length,
    };
  }

  /**
   * Computes the next session status after deallocation.
   *
   * @param currentStatus Current session status.
   * @returns Target status after deallocation, or `null` when no transition is required.
   */
  statusAfterDeallocation(currentStatus: SessionStatus): SessionStatus | null {
    if (currentStatus === 'SCHEDULED') {
      return 'ACCEPTED';
    }
    if (currentStatus === 'PROGRAMMED') {
      return 'SPEAKER_CONFIRMED';
    }
    return null;
  }

  /**
   * Builds a unique key for a slot location in the planning.
   *
   * @param dayId Day identifier.
   * @param slotId Slot identifier.
   * @param roomId Room identifier.
   * @returns Stable slot key.
   */
  private slotKey(dayId: string, slotId: string, roomId: string): string {
    return `${dayId}::${slotId}::${roomId}`;
  }

  /**
   * Builds a unique allocation key used as a fallback when an allocation id is missing.
   *
   * @param allocation Allocation document.
   * @returns Stable allocation key.
   */
  private allocationKey(allocation: SessionAllocation): string {
    return `${this.slotKey(allocation.dayId, allocation.slotId, allocation.roomId)}::${String(allocation.sessionId ?? '').trim()}`;
  }
}
