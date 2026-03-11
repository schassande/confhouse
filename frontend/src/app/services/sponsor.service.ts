import { Injectable } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { catchError, from, map, Observable, of } from 'rxjs';
import { Sponsor } from '../model/conference.model';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class SponsorService extends FirestoreGenericService<Sponsor> {
  /**
   * Gets the Firestore collection name.
   *
   * @returns Sponsor collection name.
   */
  protected override getCollectionName(): string {
    return 'sponsor';
  }

  /**
   * Loads all sponsors attached to one conference.
   *
   * @param conferenceId Conference identifier.
   * @returns Sponsors of the conference.
   */
  byConferenceId(conferenceId: string): Observable<Sponsor[]> {
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('conferenceId', '==', conferenceId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as Sponsor;
          data.id = qds.id;
          return data;
        })
      )
    );
  }

  /**
   * Loads the first sponsor managed by the provided admin email for one conference.
   *
   * @param conferenceId Conference identifier.
   * @param email Sponsor admin email.
   * @returns Matching sponsor when found.
   */
  byConferenceIdAndAdminEmail(conferenceId: string, email: string): Observable<Sponsor | undefined> {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    return from(
      getDocs(
        query(
          collection(this.firestore, this.getCollectionName()),
          where('adminEmails', 'array-contains', normalizedEmail)
        )
      )
    ).pipe(
      map((sponsors) =>
        sponsors.docs
          .map((qds) => {
            const data = qds.data() as Sponsor;
            data.id = qds.id;
            return data;
          })
          .find((sponsor) => String(sponsor.conferenceId ?? '').trim() === conferenceId)
      ),
      catchError((error: unknown) => {
        if (this.isPermissionDeniedError(error)) {
          return of(undefined);
        }
        throw error;
      })
    );
  }

  /**
   * Returns whether the error corresponds to a Firestore permission denial.
   *
   * @param error Error thrown by Firestore.
   * @returns `true` when the request is rejected by rules.
   */
  private isPermissionDeniedError(error: unknown): boolean {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').trim()
      : '';
    return code === 'permission-denied';
  }
}
