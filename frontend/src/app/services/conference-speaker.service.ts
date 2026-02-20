import { inject, Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { ConferenceSpeaker, SubmitSource } from '../model/speaker.model';
import { Session } from '../model/session.model';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

/**
 * Service for ConferenceSpeaker persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceSpeakerService extends FirestoreGenericService<ConferenceSpeaker> {
  private readonly db = inject(Firestore);
  private readonly statusesRequiringConferenceSpeaker = new Set([
    'ACCEPTED',
    'SPEAKER_CONFIRMED',
    'SCHEDULED',
    'PROGRAMMED',
  ]);

  protected override getCollectionName(): string {
    return 'conference-speaker';
  }

  byConferenceId(conferenceId: string): Observable<ConferenceSpeaker[]> {
    return from(
      getDocs(
        query(
          collection(this.db, this.getCollectionName()),
          where('conferenceId', '==', conferenceId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as ConferenceSpeaker;
          data.id = qds.id;
          return data;
        })
      )
    );
  }

  syncFromSession(session: Session, previousSession?: Session): Observable<void> {
    return from(this.syncFromSessionInternal(session, previousSession));
  }

  removeSessionFromConferenceSpeakers(conferenceId: string, sessionId: string): Observable<void> {
    return from(this.removeSessionFromConferenceSpeakersInternal(conferenceId, sessionId));
  }

  private async syncFromSessionInternal(session: Session, previousSession?: Session): Promise<void> {
    const conferenceId = String(session.conference?.conferenceId ?? '').trim();
    const sessionId = String(session.id ?? '').trim();
    if (!conferenceId || !sessionId) {
      return;
    }

    const shouldExist = this.statusesRequiringConferenceSpeaker.has(String(session.conference?.status ?? '').trim());
    const nextSpeakerIds = this.extractSpeakerIds(session);
    const previousSpeakerIds = this.extractSpeakerIds(previousSession);
    const personIdsToLoad = Array.from(new Set([...previousSpeakerIds, ...nextSpeakerIds]));
    if (personIdsToLoad.length === 0) {
      return;
    }

    const snap = await getDocs(
      query(
        collection(this.db, this.getCollectionName()),
        where('conferenceId', '==', conferenceId)
      )
    );
    const personIdsToLoadSet = new Set(personIdsToLoad);
    const existingByPersonId = new Map<string, ConferenceSpeaker>();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as ConferenceSpeaker;
      const personId = String(data.personId ?? '').trim();
      if (!personIdsToLoadSet.has(personId)) {
        return;
      }
      existingByPersonId.set(personId, { ...data, id: docSnap.id });
    });

    const batch = writeBatch(this.db);
    let opCount = 0;
    const source: SubmitSource = this.inferSource(session, previousSession);

    for (const personId of personIdsToLoad) {
      const existing = existingByPersonId.get(personId);
      const shouldContainSession = shouldExist && nextSpeakerIds.includes(personId);

      if (shouldContainSession) {
        const currentSessionIds = this.normalizeIds(existing?.sessionIds);
        const nextSessionIds = this.uniqueSorted([...currentSessionIds, sessionId]);
        if (existing && this.sameIds(currentSessionIds, nextSessionIds)) {
          continue;
        }

        const nextConferenceSpeaker: ConferenceSpeaker = {
          id: existing?.id ?? doc(collection(this.db, this.getCollectionName())).id,
          conferenceId,
          personId,
          unavailableSlotsId: this.normalizeIds(existing?.unavailableSlotsId),
          sessionIds: nextSessionIds,
          source: existing?.source ?? source,
          sourceId: String(existing?.sourceId ?? personId).trim(),
          lastUpdated: Date.now().toString(),
        };
        batch.set(doc(this.db, `${this.getCollectionName()}/${nextConferenceSpeaker.id}`), nextConferenceSpeaker);
        opCount += 1;
        continue;
      }

      if (!existing) {
        continue;
      }

      const currentSessionIds = this.normalizeIds(existing.sessionIds);
      if (!currentSessionIds.includes(sessionId)) {
        continue;
      }

      const nextSessionIds = currentSessionIds.filter((id) => id !== sessionId);
      if (nextSessionIds.length === 0) {
        batch.delete(doc(this.db, `${this.getCollectionName()}/${existing.id}`));
        opCount += 1;
        continue;
      }

      const nextConferenceSpeaker: ConferenceSpeaker = {
        ...existing,
        unavailableSlotsId: this.normalizeIds(existing.unavailableSlotsId),
        sessionIds: nextSessionIds,
        lastUpdated: Date.now().toString(),
      };
      batch.set(doc(this.db, `${this.getCollectionName()}/${nextConferenceSpeaker.id}`), nextConferenceSpeaker);
      opCount += 1;
    }

    if (opCount > 0) {
      await batch.commit();
    }
  }

  private async removeSessionFromConferenceSpeakersInternal(conferenceId: string, sessionId: string): Promise<void> {
    const normalizedConferenceId = String(conferenceId ?? '').trim();
    const normalizedSessionId = String(sessionId ?? '').trim();
    if (!normalizedConferenceId || !normalizedSessionId) {
      return;
    }

    const snap = await getDocs(
      query(
        collection(this.db, this.getCollectionName()),
        where('conferenceId', '==', normalizedConferenceId)
      )
    );

    const batch = writeBatch(this.db);
    let opCount = 0;

    snap.forEach((docSnap) => {
      const existing = { ...(docSnap.data() as ConferenceSpeaker), id: docSnap.id };
      const currentSessionIds = this.normalizeIds(existing.sessionIds);
      if (!currentSessionIds.includes(normalizedSessionId)) {
        return;
      }

      const nextSessionIds = currentSessionIds.filter((id) => id !== normalizedSessionId);
      if (nextSessionIds.length === 0) {
        batch.delete(doc(this.db, `${this.getCollectionName()}/${existing.id}`));
        opCount += 1;
        return;
      }

      const nextConferenceSpeaker: ConferenceSpeaker = {
        ...existing,
        unavailableSlotsId: this.normalizeIds(existing.unavailableSlotsId),
        sessionIds: nextSessionIds,
        lastUpdated: Date.now().toString(),
      };
      batch.set(doc(this.db, `${this.getCollectionName()}/${existing.id}`), nextConferenceSpeaker);
      opCount += 1;
    });

    if (opCount > 0) {
      await batch.commit();
    }
  }

  private inferSource(session: Session, previousSession?: Session): SubmitSource {
    const conferenceHallId = String(session.conference?.conferenceHallId ?? previousSession?.conference?.conferenceHallId ?? '').trim();
    return conferenceHallId ? 'CONFERENCE_HALL' : 'MANUAL';
  }

  private extractSpeakerIds(session?: Session): string[] {
    if (!session) {
      return [];
    }
    return this.uniqueSorted([
      String(session.speaker1Id ?? '').trim(),
      String(session.speaker2Id ?? '').trim(),
      String(session.speaker3Id ?? '').trim(),
    ].filter((id) => id.length > 0));
  }

  private normalizeIds(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return this.uniqueSorted(values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0));
  }

  private uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  private sameIds(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
}
