import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Person } from '../model/person.model';
import { map, Observable, from, of, catchError, throwError } from 'rxjs';
import { getDocs, orderBy as fbOrderBy, startAfter as fbStartAfter, limit as fbLimit, query as fbQuery, startAt as fbStartAt, endAt as fbEndAt, where as fbWhere } from 'firebase/firestore';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { functionBaseUrl } from './constantes';

/**
 * Service for Person persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class PersonService extends FirestoreGenericService<Person> {
  private readonly http = inject(HttpClient);

  protected override getCollectionName(): string {
    return 'person';
  }

  /**
   * Compute the search field from person data: concatenation of lastName, firstName, email, speaker.company (lowercase, space-separated)
   */
  private computeSearchField(person: Person): string {
    const parts: string[] = [];
    if (person.lastName) parts.push(person.lastName.toLowerCase());
    if (person.firstName) parts.push(person.firstName.toLowerCase());
    if (person.email) parts.push(person.email.toLowerCase());
    if (person.speaker?.company) parts.push(person.speaker.company.toLowerCase());
    return parts.join(' ');
  }

  /**
   * Override save to compute search field before saving
   */
  public override save(item: Person): Observable<Person> {
    item.isSpeaker = !!item.speaker;
    item.search = this.computeSearchField(item);
    return super.save(item);
  }

  /**
   * Create person via Cloud Function to maintain email uniqueness index.
   * If email already exists, returns the existing person.
   */
  public createViaFunction(person: Person): Observable<Person> {
    return this.http.post<{ person: Person }>(`${functionBaseUrl}createPerson`, person).pipe(
      map((response) => response.person),
      catchError((error: any) => {
        if (error?.status === 409) {
          return this.findByEmail(person.email).pipe(
            map((existing) => {
              if (!existing) {
                throw error;
              }
              return existing;
            })
          );
        }
        return throwError(() => error);
      })
    );
  }

  findByEmail(email: string): Observable<Person | undefined> {
    const q = fbQuery(this.itemsCollection(), fbOrderBy('email'), fbLimit(1));
    // Use generic query helper
    return from(getDocs(fbQuery(this.itemsCollection(), fbWhere('email', '==', email), fbLimit(1)))).pipe(
      map((qs) => {
        let found: Person | undefined = undefined;
        qs.forEach((qds) => {
          const data = qds.data() as Person;
          data.id = qds.id;
          found = data;
        });
        return found;
      })
    );
  }

  findByConferenceHallId(conferenceHallId: string): Observable<Person | undefined> {
    return from(
      getDocs(
        fbQuery(
          this.itemsCollection(),
          fbWhere('speaker.conferenceHallId', '==', conferenceHallId),
          fbLimit(1)
        )
      )
    ).pipe(
      map((qs) => {
        let found: Person | undefined = undefined;
        qs.forEach((qds) => {
          const data = qds.data() as Person;
          data.id = qds.id;
          found = data;
        });
        return found;
      })
    );
  }

  bySubmittedConferenceId(conferenceId: string): Observable<Person[]> {
    return from(
      getDocs(
        fbQuery(
          this.itemsCollection(),
          fbWhere('speaker.submittedConferenceIds', 'array-contains', conferenceId)
        )
      )
    ).pipe(
      map((qs) =>
        qs.docs.map((qds) => {
          const data = qds.data() as Person;
          data.id = qds.id;
          return data;
        })
      )
    );
  }

  /**
   * Combined search and pagination using the search field.
   * Searches with prefix match on the computed search field.
   * Results are ordered by lastUpdated desc with cursor-based pagination.
   * @param searchTerm - Search term (prefix match on search field, case-insensitive)
   * @param pageSize - Number of results per page
   * @param startAfterValue - Cursor value (lastUpdated) for pagination
   * @returns Object with filtered+paged persons and nextCursor for the next page
   */
  public pagedSearch(
    searchTerm: string,
    pageSize: number,
    startAfterValue?: string
  ): Observable<{ persons: Person[]; nextCursor?: string }> {
    // If no search term, fetch all ordered by lastUpdated
    if (!searchTerm || searchTerm.trim().length === 0) {
      const order = fbOrderBy('lastUpdated', 'desc');
      const limiter = fbLimit(pageSize);
      let q;
      if (startAfterValue) {
        q = fbQuery(this.itemsCollection(), order, fbStartAfter(startAfterValue), limiter);
      } else {
        q = fbQuery(this.itemsCollection(), order, limiter);
      }
      return from(getDocs(q)).pipe(
        map((qs) => {
          const list: Person[] = [];
          qs.forEach((docSnap) => {
            const data = docSnap.data() as Person;
            data.id = docSnap.id;
            list.push(data);
          });
          const nextCursor = list.length > 0 ? list[list.length - 1].lastUpdated : undefined;
          return { persons: list, nextCursor };
        })
      );
    }

    // Normalize search term to lowercase for comparison
    const searchLower = searchTerm.toLowerCase();
    const endTerm = searchLower + '\uf8ff';
    
    // Query on the search field with prefix match
    const q = fbQuery(
      this.itemsCollection(),
      fbOrderBy('search'),
      fbStartAt(searchLower),
      fbEndAt(endTerm),
      fbLimit(500)
    );

    return from(getDocs(q)).pipe(
      map((qs) => {
        const results: Person[] = [];
        qs.forEach((ds) => {
          const data = ds.data() as Person;
          data.id = ds.id;
          results.push(data);
        });

        // Sort by lastUpdated desc
        results.sort((a, b) => {
          const aVal = parseInt(a.lastUpdated, 10) || 0;
          const bVal = parseInt(b.lastUpdated, 10) || 0;
          return bVal - aVal;
        });

        // Apply cursor pagination on sorted results
        let startIdx = 0;
        if (startAfterValue) {
          startIdx = results.findIndex(p => p.lastUpdated === startAfterValue) + 1;
          if (startIdx <= 0) startIdx = 0;
        }
        const paginated = results.slice(startIdx, startIdx + pageSize);
        const nextCursor = paginated.length > 0 && paginated.length === pageSize
          ? paginated[paginated.length - 1].lastUpdated
          : undefined;
        return { persons: paginated, nextCursor };
      })
    );
  }

  /**
   * Search speakers with exact match on firstName, lastName or email.
   */
  public searchSpeakersBySearch(searchTerm: string, maxResults = 10): Observable<Person[]> {
    const normalized = (searchTerm ?? '').trim().toLowerCase();
    const raw = (searchTerm ?? '').trim();
    if (!raw) {
      return of([] as Person[]);
    }
    const requestedResults = Math.max(maxResults, 1);

    return from((async () => {
      const personsById = new Map<string, Person>();
      const [firstNameSnap, lastNameSnap, emailSnap] = await Promise.all([
        getDocs(fbQuery(this.itemsCollection(), fbWhere('isSpeaker', '==', true), fbWhere('firstName', '==', raw), fbLimit(requestedResults))),
        getDocs(fbQuery(this.itemsCollection(), fbWhere('isSpeaker', '==', true), fbWhere('lastName', '==', raw), fbLimit(requestedResults))),
        getDocs(fbQuery(this.itemsCollection(), fbWhere('isSpeaker', '==', true), fbWhere('email', '==', normalized), fbLimit(requestedResults))),
      ]);

      const appendSnapshot = (snapshot: any) => {

        snapshot.forEach((ds: any) => {
          if (personsById.size >= requestedResults) {
            return;
          }
          const data = ds.data() as Person;
          data.id = ds.id;
          if (personsById.has(data.id)) {
            return;
          }
          personsById.set(data.id, data);
        });
      };

      appendSnapshot(firstNameSnap);
      appendSnapshot(lastNameSnap);
      appendSnapshot(emailSnap);

      return Array.from(personsById.values()).slice(0, requestedResults);
    })());
  }
}
