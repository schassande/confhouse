import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Session, SessionAllocation, SessionStatus } from '../model/session.model';
import { map, Observable, from } from 'rxjs';
import { getDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { Conference, Day, Room, Slot } from '../model/conference.model';
import { ConferenceSpeaker } from '../model/speaker.model';
import { SlotType } from '../model/slot-type.model';

export interface AutoAllocateInput {
  conferenceId: string;
  conference: Conference | undefined;
  sessions: Session[];
  currentAllocations: SessionAllocation[];
  conferenceSpeakers: ConferenceSpeaker[];
  slotTypes: SlotType[];
  random?: () => number;
}

export interface AutoAllocateSuggestion {
  dayId: string;
  slotId: string;
  roomId: string;
  sessionId: string;
}

interface AutoAllocateSlot {
  dayId: string;
  slotId: string;
  roomId: string;
  slot: Slot;
  room: Room;
  timeKey: string;
  daySortValue: number;
}

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

  computeAutoAllocationSuggestions(input: AutoAllocateInput): AutoAllocateSuggestion[] {
    const conference = input.conference;
    if (!conference) {
      return [];
    }

    const slotTypeById = new Map<string, SlotType>(
      (input.slotTypes ?? []).map((slotType) => [String(slotType.id ?? '').trim(), slotType])
    );
    const sessionById = new Map<string, Session>(
      (input.sessions ?? [])
        .filter((session) => !!session.id)
        .map((session) => [String(session.id ?? '').trim(), session])
    );
    const sessionIdsAlreadyAllocated = new Set(
      (input.currentAllocations ?? [])
        .map((allocation) => String(allocation.sessionId ?? '').trim())
        .filter((sessionId) => !!sessionId)
    );

    const allowedStatuses = new Set<SessionStatus>(['ACCEPTED', 'SPEAKER_CONFIRMED']);
    const sessionPool = new Map<string, Session>(
      (input.sessions ?? [])
        .filter((session) => {
          const sessionId = String(session.id ?? '').trim();
          if (!sessionId || sessionIdsAlreadyAllocated.has(sessionId)) {
            return false;
          }
          const status = session.conference?.status;
          return !!status && allowedStatuses.has(status);
        })
        .map((session) => [String(session.id ?? '').trim(), session])
    );
    if (sessionPool.size === 0) {
      return [];
    }

    const roomById = new Map<string, Room>(
      (conference.rooms ?? [])
        .filter((room) => !!room?.id && room.isSessionRoom)
        .map((room) => [String(room.id ?? '').trim(), room])
    );
    const dayOrderById = new Map<string, number>(
      (conference.days ?? []).map((day) => {
        const dateValue = Date.parse(`${day.date}T00:00:00`);
        const daySortValue = Number.isFinite(dateValue) ? dateValue : (day.dayIndex ?? 0);
        return [String(day.id ?? '').trim(), daySortValue];
      })
    );
    const allocatedSlotKeys = new Set(
      (input.currentAllocations ?? []).map((allocation) => this.slotKey(allocation.dayId, allocation.slotId, allocation.roomId))
    );

    const freeSlots = (conference.days ?? [])
      .flatMap((day) => this.extractDayFreeSessionSlots(day, roomById, slotTypeById, allocatedSlotKeys, dayOrderById))
      .sort((a, b) =>
        a.daySortValue - b.daySortValue
        || a.slot.startTime.localeCompare(b.slot.startTime)
        || a.slot.endTime.localeCompare(b.slot.endTime)
        || b.room.capacity - a.room.capacity
      );
    if (freeSlots.length === 0) {
      return [];
    }

    const slotByDayAndSlotId = this.buildSlotByDayAndSlotId(conference);
    const speakerUnavailableSlots = this.buildSpeakerUnavailableSlotMap(input.conferenceSpeakers ?? []);
    const speakerDayAllocations = this.buildSpeakerDayAllocations(input.currentAllocations ?? [], sessionById);
    const allocatedSpeakers = new Set(speakerDayAllocations.keys());
    const trackCoverageByTimeSlice = this.buildTrackCoverageByTimeSlice(
      input.currentAllocations ?? [],
      sessionById,
      slotByDayAndSlotId
    );
    const hasUnavailabilityBySessionId = new Map<string, boolean>(
      Array.from(sessionPool.values()).map((session) => [
        String(session.id ?? '').trim(),
        this.sessionSpeakerIds(session).some((speakerId) => (speakerUnavailableSlots.get(speakerId)?.size ?? 0) > 0),
      ])
    );

    const random = input.random ?? Math.random;
    const suggestions: AutoAllocateSuggestion[] = [];

    freeSlots.forEach((slot) => {
      const candidatesByTypeAndAvailability = Array.from(sessionPool.values())
        .filter((session) => this.isSessionTypeCompatible(session, slot.slot))
        .filter((session) => !this.hasSpeakerUnavailableForSlot(session, slot.slot.id, speakerUnavailableSlots));
      if (candidatesByTypeAndAvailability.length === 0) {
        return;
      }

      // Rule #2 is applied first; if impossible, fallback keeps allocation progressing.
      const strictCandidates = candidatesByTypeAndAvailability
        .filter((session) => !this.hasSpeakerAllocatedOnDay(session, slot.dayId, speakerDayAllocations));
      const candidates = strictCandidates.length > 0 ? strictCandidates : candidatesByTypeAndAvailability;
      if (candidates.length === 0) {
        return;
      }

      const chosen = candidates
        .map((session) => this.scoreCandidateSession(session, slot.timeKey, allocatedSpeakers, hasUnavailabilityBySessionId, trackCoverageByTimeSlice, random))
        .sort((a, b) =>
          b.hasSpeakerUnavailability - a.hasSpeakerUnavailability
          || b.sharesSpeakerWithAllocatedSession - a.sharesSpeakerWithAllocatedSession
          || b.addsTrackDiversityForTimeslice - a.addsTrackDiversityForTimeslice
          || b.reviewAverage - a.reviewAverage
          || b.randomTieBreaker - a.randomTieBreaker
        )[0];

      const chosenSession = chosen.session;
      const chosenSessionId = String(chosenSession.id ?? '').trim();
      if (!chosenSessionId) {
        return;
      }

      suggestions.push({
        dayId: slot.dayId,
        slotId: slot.slotId,
        roomId: slot.roomId,
        sessionId: chosenSessionId,
      });

      sessionPool.delete(chosenSessionId);
      const trackId = this.normalizeKey(chosenSession.conference?.trackId ?? '');
      if (trackId) {
        if (!trackCoverageByTimeSlice.has(slot.timeKey)) {
          trackCoverageByTimeSlice.set(slot.timeKey, new Set<string>());
        }
        trackCoverageByTimeSlice.get(slot.timeKey)!.add(trackId);
      }
      this.sessionSpeakerIds(chosenSession).forEach((speakerId) => {
        allocatedSpeakers.add(speakerId);
        if (!speakerDayAllocations.has(speakerId)) {
          speakerDayAllocations.set(speakerId, new Set<string>());
        }
        speakerDayAllocations.get(speakerId)!.add(slot.dayId);
      });
    });

    return suggestions;
  }

  private extractDayFreeSessionSlots(
    day: Day,
    roomById: Map<string, Room>,
    slotTypeById: Map<string, SlotType>,
    allocatedSlotKeys: Set<string>,
    dayOrderById: Map<string, number>
  ): AutoAllocateSlot[] {
    const disabledRoomIds = new Set((day.disabledRoomIds ?? []).map((roomId) => String(roomId ?? '').trim()));
    const dayId = String(day.id ?? '').trim();
    if (!dayId) {
      return [];
    }

    return (day.slots ?? [])
      .map((slot) => {
        const slotId = String(slot.id ?? '').trim();
        const roomId = String(slot.roomId ?? '').trim();
        const slotTypeId = String(slot.slotTypeId ?? '').trim();
        if (!slotId || !roomId || !slotTypeId) {
          return undefined;
        }
        if (!slotTypeById.get(slotTypeId)?.isSession) {
          return undefined;
        }
        const room = roomById.get(roomId);
        if (!room || disabledRoomIds.has(roomId)) {
          return undefined;
        }
        if (allocatedSlotKeys.has(this.slotKey(dayId, slotId, roomId))) {
          return undefined;
        }
        return {
          dayId,
          slotId,
          roomId,
          slot,
          room,
          timeKey: `${dayId}::${slot.startTime}::${slot.endTime}`,
          daySortValue: dayOrderById.get(dayId) ?? 0,
        } as AutoAllocateSlot;
      })
      .filter((slot): slot is AutoAllocateSlot => !!slot);
  }

  private scoreCandidateSession(
    session: Session,
    slotTimeKey: string,
    allocatedSpeakers: Set<string>,
    hasUnavailabilityBySessionId: Map<string, boolean>,
    trackCoverageByTimeSlice: Map<string, Set<string>>,
    random: () => number
  ): {
    session: Session;
    hasSpeakerUnavailability: number;
    sharesSpeakerWithAllocatedSession: number;
    addsTrackDiversityForTimeslice: number;
    reviewAverage: number;
    randomTieBreaker: number;
  } {
    const sessionId = String(session.id ?? '').trim();
    const speakers = this.sessionSpeakerIds(session);
    const hasSpeakerUnavailability = hasUnavailabilityBySessionId.get(sessionId) ? 1 : 0;
    const sharesSpeakerWithAllocatedSession = speakers.some((speakerId) => allocatedSpeakers.has(speakerId)) ? 1 : 0;

    const trackId = this.normalizeKey(session.conference?.trackId ?? '');
    const coveredTracks = trackCoverageByTimeSlice.get(slotTimeKey) ?? new Set<string>();
    const addsTrackDiversityForTimeslice = trackId && !coveredTracks.has(trackId) ? 1 : 0;

    const reviewAverage = Number(session.conference?.review?.average ?? 0);
    return {
      session,
      hasSpeakerUnavailability,
      sharesSpeakerWithAllocatedSession,
      addsTrackDiversityForTimeslice,
      reviewAverage: Number.isFinite(reviewAverage) ? reviewAverage : 0,
      randomTieBreaker: random(),
    };
  }

  private buildSpeakerUnavailableSlotMap(conferenceSpeakers: ConferenceSpeaker[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    (conferenceSpeakers ?? []).forEach((conferenceSpeaker) => {
      const personId = String(conferenceSpeaker.personId ?? '').trim();
      if (!personId) {
        return;
      }
      const unavailableSlots = (conferenceSpeaker.unavailableSlotsId ?? [])
        .map((slotId) => String(slotId ?? '').trim())
        .filter((slotId) => !!slotId);
      result.set(personId, new Set(unavailableSlots));
    });
    return result;
  }

  private buildSpeakerDayAllocations(
    allocations: SessionAllocation[],
    sessionById: Map<string, Session>
  ): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    allocations.forEach((allocation) => {
      const sessionId = String(allocation.sessionId ?? '').trim();
      const dayId = String(allocation.dayId ?? '').trim();
      if (!sessionId || !dayId) {
        return;
      }
      const session = sessionById.get(sessionId);
      if (!session) {
        return;
      }
      this.sessionSpeakerIds(session).forEach((speakerId) => {
        if (!result.has(speakerId)) {
          result.set(speakerId, new Set<string>());
        }
        result.get(speakerId)!.add(dayId);
      });
    });
    return result;
  }

  private buildTrackCoverageByTimeSlice(
    allocations: SessionAllocation[],
    sessionById: Map<string, Session>,
    slotByDayAndSlotId: Map<string, Slot>
  ): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    allocations.forEach((allocation) => {
      const session = sessionById.get(String(allocation.sessionId ?? '').trim());
      if (!session) {
        return;
      }
      const dayId = String(allocation.dayId ?? '').trim();
      const slotId = String(allocation.slotId ?? '').trim();
      if (!dayId || !slotId) {
        return;
      }
      const slot = slotByDayAndSlotId.get(`${dayId}::${slotId}`);
      if (!slot) {
        return;
      }
      const trackId = this.normalizeKey(session.conference?.trackId ?? '');
      if (!trackId) {
        return;
      }
      const timeKey = `${dayId}::${slot.startTime}::${slot.endTime}`;
      if (!result.has(timeKey)) {
        result.set(timeKey, new Set<string>());
      }
      result.get(timeKey)!.add(trackId);
    });
    return result;
  }

  private buildSlotByDayAndSlotId(conference: Conference): Map<string, Slot> {
    const result = new Map<string, Slot>();
    (conference.days ?? []).forEach((day) => {
      const dayId = String(day.id ?? '').trim();
      if (!dayId) {
        return;
      }
      (day.slots ?? []).forEach((slot) => {
        const slotId = String(slot.id ?? '').trim();
        if (!slotId) {
          return;
        }
        result.set(`${dayId}::${slotId}`, slot);
      });
    });
    return result;
  }

  private hasSpeakerUnavailableForSlot(
    session: Session,
    slotId: string,
    speakerUnavailableSlots: Map<string, Set<string>>
  ): boolean {
    return this.sessionSpeakerIds(session).some((speakerId) => speakerUnavailableSlots.get(speakerId)?.has(slotId));
  }

  private hasSpeakerAllocatedOnDay(
    session: Session,
    dayId: string,
    speakerDayAllocations: Map<string, Set<string>>
  ): boolean {
    return this.sessionSpeakerIds(session).some((speakerId) => speakerDayAllocations.get(speakerId)?.has(dayId));
  }

  private isSessionTypeCompatible(session: Session, slot: Slot): boolean {
    return (session.conference?.sessionTypeId ?? '') === (slot.sessionTypeId ?? '');
  }

  private sessionSpeakerIds(session: Session): string[] {
    return [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .map((speakerId) => String(speakerId ?? '').trim())
      .filter((speakerId) => !!speakerId);
  }

  private slotKey(dayId: string, slotId: string, roomId: string): string {
    return `${dayId}::${slotId}::${roomId}`;
  }

  private normalizeKey(value: string): string {
    return String(value ?? '').trim().toLowerCase();
  }
}
