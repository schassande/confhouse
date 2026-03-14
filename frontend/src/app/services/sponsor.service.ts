import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { catchError, firstValueFrom, from, map, Observable, of } from 'rxjs';
import {
  ConferenceTicket,
  Sponsor,
  SponsorBusinessEvent,
  SponsorPaymentStatus,
  SponsorStatus,
} from '../model/sponsor.model';
import { FirestoreGenericService } from './firestore-generic.service';
import { functionBaseUrl } from './constantes';

export interface SponsorActionReport {
  sponsor: Sponsor;
  mailHistoryId?: string;
  sendResult?: {
    ok: boolean;
    messageId?: string;
    error?: string;
  };
}

interface SponsorOrganizerActionPayload {
  conferenceId: string;
  sponsorId: string;
}

@Injectable({ providedIn: 'root' })
export class SponsorService extends FirestoreGenericService<Sponsor> {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

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

  /**
   * Updates one sponsor business status through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param status Next sponsor status.
   * @param statusDate Effective status date.
   * @returns Backend sponsor action report.
   */
  async updateSponsorStatus(
    conferenceId: string,
    sponsorId: string,
    status: SponsorStatus,
    statusDate: string
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('updateSponsorStatus', {
      conferenceId,
      sponsorId,
      status,
      statusDate,
    });
  }

  /**
   * Updates one sponsor payment status through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param paymentStatus Next payment status.
   * @param paymentStatusDate Effective payment status date.
   * @returns Backend sponsor action report.
   */
  async updateSponsorPaymentStatus(
    conferenceId: string,
    sponsorId: string,
    paymentStatus: SponsorPaymentStatus,
    paymentStatusDate: string
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('updateSponsorPaymentStatus', {
      conferenceId,
      sponsorId,
      paymentStatus,
      paymentStatusDate,
    });
  }

  /**
   * Assigns or changes the sponsor booth through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param boothName Assigned booth name.
   * @returns Backend sponsor action report.
   */
  async assignSponsorBooth(
    conferenceId: string,
    sponsorId: string,
    boothName: string
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('assignSponsorBooth', {
      conferenceId,
      sponsorId,
      boothName,
    });
  }

  /**
   * Updates sponsor conference ticket allocation through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param conferenceTickets Ticket allocation payload.
   * @returns Backend sponsor action report.
   */
  async allocateSponsorTickets(
    conferenceId: string,
    sponsorId: string,
    conferenceTickets: ConferenceTicket[]
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('allocateSponsorTickets', {
      conferenceId,
      sponsorId,
      conferenceTickets,
    });
  }

  /**
   * Sends the sponsor order form email through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param locale Requested email/document locale.
   * @returns Backend sponsor action report.
   */
  async sendSponsorOrderForm(
    conferenceId: string,
    sponsorId: string,
    locale: 'en' | 'fr'
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('sendSponsorOrderForm', {
      conferenceId,
      sponsorId,
      locale,
      issueDate: this.getTodayIsoDate(),
    });
  }

  /**
   * Sends the sponsor invoice email through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param locale Requested email/document locale.
   * @returns Backend sponsor action report.
   */
  async sendSponsorInvoice(
    conferenceId: string,
    sponsorId: string,
    locale: 'en' | 'fr'
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('sendSponsorInvoice', {
      conferenceId,
      sponsorId,
      locale,
      issueDate: this.getTodayIsoDate(),
    });
  }

  /**
   * Sends the sponsor payment reminder email through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param locale Requested email locale.
   * @returns Backend sponsor action report.
   */
  async sendSponsorPaymentReminder(
    conferenceId: string,
    sponsorId: string,
    locale: 'en' | 'fr'
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('sendSponsorPaymentReminder', {
      conferenceId,
      sponsorId,
      locale,
      textPart: this.buildDefaultReminderText(locale),
    });
  }

  /**
   * Sends the sponsor application confirmation email through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param locale Requested email locale.
   * @returns Backend sponsor action report.
   */
  async sendSponsorApplicationConfirmation(
    conferenceId: string,
    sponsorId: string,
    locale: 'en' | 'fr'
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('sendSponsorApplicationConfirmation', {
      conferenceId,
      sponsorId,
      locale,
      textPart: this.buildDefaultApplicationConfirmationText(locale),
    });
  }

  /**
   * Sends the sponsor administrative summary email through the backend action layer.
   *
   * @param conferenceId Conference identifier.
   * @param sponsorId Sponsor identifier.
   * @param locale Requested email locale.
   * @returns Backend sponsor action report.
   */
  async sendSponsorAdministrativeSummary(
    conferenceId: string,
    sponsorId: string,
    locale: 'en' | 'fr'
  ): Promise<SponsorActionReport> {
    return await this.postSponsorOrganizerAction('sendSponsorAdministrativeSummary', {
      conferenceId,
      sponsorId,
      locale,
      textPart: this.buildDefaultAdministrativeSummaryText(locale),
    });
  }

  /**
   * Returns sponsor business events sorted from newest to oldest.
   *
   * @param sponsor Sponsor record.
   * @returns Sorted sponsor business events.
   */
  getSortedBusinessEvents(sponsor: Sponsor | undefined): SponsorBusinessEvent[] {
    return [...(sponsor?.businessEvents ?? [])].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  }

  /**
   * Posts one organizer-only sponsor action to the backend function layer.
   *
   * @param actionName Function action name.
   * @param payload Action payload.
   * @returns Backend sponsor action report.
   */
  private async postSponsorOrganizerAction<T extends SponsorOrganizerActionPayload>(
    actionName: string,
    payload: T
  ): Promise<SponsorActionReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: SponsorActionReport }>(
        `${functionBaseUrl}${actionName}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  /**
   * Returns the current authenticated user id token.
   *
   * @returns Firebase ID token.
   */
  private async getIdTokenOrThrow(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  /**
   * Returns today's ISO date in `YYYY-MM-DD` format.
   *
   * @returns ISO date string.
   */
  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Builds the default sponsor reminder text in the requested locale.
   *
   * @param locale Requested locale.
   * @returns Default reminder message.
   */
  private buildDefaultReminderText(locale: 'en' | 'fr'): string {
    return locale === 'fr'
      ? 'Ceci est un rappel concernant votre paiement sponsor.'
      : 'This is a reminder regarding your sponsor payment.';
  }

  /**
   * Builds the default sponsor application confirmation text in the requested locale.
   *
   * @param locale Requested locale.
   * @returns Default confirmation message.
   */
  private buildDefaultApplicationConfirmationText(locale: 'en' | 'fr'): string {
    return locale === 'fr'
      ? 'Votre candidature sponsor a bien ete prise en compte.'
      : 'Your sponsor application has been recorded.';
  }

  /**
   * Builds the default sponsor administrative summary text in the requested locale.
   *
   * @param locale Requested locale.
   * @returns Default administrative summary message.
   */
  private buildDefaultAdministrativeSummaryText(locale: 'en' | 'fr'): string {
    return locale === 'fr'
      ? 'Voici votre recapitulatif administratif sponsor.'
      : 'Here is your sponsor administrative summary.';
  }
}
