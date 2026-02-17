import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class ConferenceHallService {
  private readonly http = inject(HttpClient);

  async importConference(conference: Conference): Promise<ConferenceHallImportReport> {
    const response = await firstValueFrom(
      this.http.post<{ report: ConferenceHallImportReport }>(
        `${functionBaseUrl}importConferenceHall`,
        { conferenceId: conference.id }
      )
    );
    return response.report;
  }
}
