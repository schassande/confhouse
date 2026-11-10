import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { firstValueFrom, from, map, Observable } from 'rxjs';
import { ParticipantBilletWebTicket } from '@shared/model/billetweb-config';
import { Session } from '@shared/model/session.model';
import { ConferenceSpeaker, SubmitSource } from '@shared/model/speaker.model';
import { functionBaseUrl } from './constantes';
import { FirestoreGenericService } from './firestore-generic.service';

/** Result returned by one speaker ticket server action. */
export interface SpeakerTicketActionReport {
  /** Updated conference speaker projection. */
  conferenceSpeaker: ConferenceSpeaker;
  /** Created or updated ticket, omitted after deletion. */
  ticket?: ParticipantBilletWebTicket;
}

/**
 * Service for ConferenceSpeaker persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceSpeakerService extends FirestoreGenericService<ConferenceSpeaker> {
  private readonly db = inject(Firestore);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
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
          where('conferenceId', '==', conferenceId),
        ),
      ),
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as ConferenceSpeaker;
          data.id = qds.id;
          return data;
        }),
      ),
    );
  }

  /**
   * Loads a single conference speaker projection for a person in a conference.
   *
   * @param conferenceId Conference identifier.
   * @param personId Person identifier.
   * @returns The matching conference speaker or `undefined`.
   */
  byConferenceAndPersonId(
    conferenceId: string,
    personId: string,
  ): Observable<ConferenceSpeaker | undefined> {
    const normalizedPersonId = String(personId ?? '').trim();
    return this.byConferenceId(conferenceId).pipe(
      map((conferenceSpeakers) =>
        (conferenceSpeakers ?? []).find(
          (conferenceSpeaker) =>
            String(conferenceSpeaker.personId ?? '').trim() === normalizedPersonId,
        ),
      ),
    );
  }

  syncFromSession(session: Session, previousSession?: Session): Observable<void> {
    return from(this.syncFromSessionInternal(session, previousSession));
  }

  removeSessionFromConferenceSpeakers(conferenceId: string, sessionId: string): Observable<void> {
    return from(this.removeSessionFromConferenceSpeakersInternal(conferenceId, sessionId));
  }

  /** Creates or updates the BilletWeb ticket for one conference speaker. */
  async upsertSpeakerTicket(
    conferenceId: string,
    speakerId: string,
  ): Promise<SpeakerTicketActionReport> {
    return await this.postTicketAction('upsertSpeakerTicket', { conferenceId, speakerId });
  }

  /** Deletes the BilletWeb ticket for one conference speaker. */
  async deleteSpeakerTicket(
    conferenceId: string,
    speakerId: string,
  ): Promise<SpeakerTicketActionReport> {
    return await this.postTicketAction('deleteSpeakerTicket', { conferenceId, speakerId });
  }

  /** Posts one organizer-authorized speaker ticket action to the server. */
  private async postTicketAction(
    actionName: string,
    payload: { conferenceId: string; speakerId: string },
  ): Promise<SpeakerTicketActionReport> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    const token = await user.getIdToken();
    const response = await firstValueFrom(
      this.http.post<{ report: SpeakerTicketActionReport }>(
        `${functionBaseUrl}${actionName}`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    );
    return response.report;
  }

  private async syncFromSessionInternal(
    session: Session,
    previousSession?: Session,
  ): Promise<void> {
    const conferenceId = String(session.conference?.conferenceId ?? '').trim();
    const sessionId = String(session.id ?? '').trim();
    if (!conferenceId || !sessionId) {
      return;
    }

    const shouldExist = this.statusesRequiringConferenceSpeaker.has(
      String(session.conference?.status ?? '').trim(),
    );
    const nextSpeakerIds = this.extractSpeakerIds(session);
    const previousSpeakerIds = this.extractSpeakerIds(previousSession);
    const personIdsToLoad = Array.from(new Set([...previousSpeakerIds, ...nextSpeakerIds]));
    if (personIdsToLoad.length === 0) {
      return;
    }

    const snap = await getDocs(
      query(
        collection(this.db, this.getCollectionName()),
        where('conferenceId', '==', conferenceId),
      ),
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
          ...existing,
          id: existing?.id ?? doc(collection(this.db, this.getCollectionName())).id,
          conferenceId,
          personId,
          unavailableSlotsId: this.normalizeIds(existing?.unavailableSlotsId),
          sessionIds: nextSessionIds,
          source: existing?.source ?? source,
          sourceId: String(existing?.sourceId ?? personId).trim(),
          lastUpdated: Date.now().toString(),
        };
        batch.set(
          doc(this.db, `${this.getCollectionName()}/${nextConferenceSpeaker.id}`),
          nextConferenceSpeaker,
        );
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
        if (String(existing.ticketId ?? '').trim()) {
          await this.deleteSpeakerTicket(conferenceId, existing.id);
        }
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
      batch.set(
        doc(this.db, `${this.getCollectionName()}/${nextConferenceSpeaker.id}`),
        nextConferenceSpeaker,
      );
      opCount += 1;
    }

    if (opCount > 0) {
      await batch.commit();
    }
  }

  private async removeSessionFromConferenceSpeakersInternal(
    conferenceId: string,
    sessionId: string,
  ): Promise<void> {
    const normalizedConferenceId = String(conferenceId ?? '').trim();
    const normalizedSessionId = String(sessionId ?? '').trim();
    if (!normalizedConferenceId || !normalizedSessionId) {
      return;
    }

    const snap = await getDocs(
      query(
        collection(this.db, this.getCollectionName()),
        where('conferenceId', '==', normalizedConferenceId),
      ),
    );

    const batch = writeBatch(this.db);
    let opCount = 0;

    for (const docSnap of snap.docs) {
      const existing = { ...(docSnap.data() as ConferenceSpeaker), id: docSnap.id };
      const currentSessionIds = this.normalizeIds(existing.sessionIds);
      if (!currentSessionIds.includes(normalizedSessionId)) {
        continue;
      }

      const nextSessionIds = currentSessionIds.filter((id) => id !== normalizedSessionId);
      if (nextSessionIds.length === 0) {
        if (String(existing.ticketId ?? '').trim()) {
          await this.deleteSpeakerTicket(normalizedConferenceId, existing.id);
        }
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
      batch.set(doc(this.db, `${this.getCollectionName()}/${existing.id}`), nextConferenceSpeaker);
      opCount += 1;
    }

    if (opCount > 0) {
      await batch.commit();
    }
  }

  private inferSource(session: Session, previousSession?: Session): SubmitSource {
    const conferenceHallId = String(
      session.conference?.conferenceHallId ?? previousSession?.conference?.conferenceHallId ?? '',
    ).trim();
    return conferenceHallId ? 'CONFERENCE_HALL' : 'MANUAL';
  }

  private extractSpeakerIds(session?: Session): string[] {
    if (!session) {
      return [];
    }
    return this.uniqueSorted(
      [
        String(session.speaker1Id ?? '').trim(),
        String(session.speaker2Id ?? '').trim(),
        String(session.speaker3Id ?? '').trim(),
      ].filter((id) => id.length > 0),
    );
  }

  private normalizeIds(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return this.uniqueSorted(
      values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0),
    );
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
