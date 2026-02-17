import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { Conference } from '../model/conference.model';
import { functionBaseUrl } from './constantes';

export interface ConferenceHallImportReport {
  sessionAdded: number;
  sessionUpdated: number;
  sessionUnchanged: number;
  speakerAdded: number;
  speakerUpdated: number;
  speakerUnchanged: number;
  trackAdded: number;
  trackUpdated: number;
  trackUnchanged: number;
  importedAt: string;
}

export interface ConferenceHallResetReport {
  sessionDeleted: number;
  speakerDeleted: number;
  resetAt: string;
}

@Injectable({ providedIn: 'root' })
export class ConferenceHallService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  async importConference(conference: Conference): Promise<ConferenceHallImportReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: ConferenceHallImportReport }>(
        `${functionBaseUrl}importConferenceHall`,
        { conferenceId: conference.id },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  async resetConferenceImport(conference: Conference): Promise<ConferenceHallResetReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: ConferenceHallResetReport }>(
        `${functionBaseUrl}resetConferenceHallImport`,
        { conferenceId: conference.id },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  private async getIdTokenOrThrow(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }
}
