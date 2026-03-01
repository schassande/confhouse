import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { functionBaseUrl } from './constantes';
import { environment } from '../../environments/environment';

export interface DeleteConferenceReport {
  conferenceDeleted: number;
  sessionsDeleted: number;
  conferenceSpeakersDeleted: number;
  personsDeleted: number;
  activitiesDeleted: number;
  activityParticipationsDeleted: number;
  sessionAllocationsDeleted: number;
  conferenceHallConfigsDeleted: number;
  conferenceSecretsDeleted: number;
  deletedAt: string;
}

export interface RefreshConferenceDashboardReport {
  historyId: string;
  dashboard: {
    conferenceId: string;
    computedAt: string;
    trigger: 'MANUAL_REFRESH' | 'SCHEDULED_DAILY' | 'AUTO_EVENT';
    submitted: {
      total: number;
      bySessionTypeId: Record<string, number>;
    };
    confirmed: {
      total: number;
      bySessionTypeId: Record<string, number>;
    };
    allocated: {
      total: number;
      bySessionTypeId: Record<string, number>;
    };
    speakers: {
      total: number;
      sessionsWith2Speakers: number;
      sessionsWith3Speakers: number;
    };
    slots: {
      allocated: number;
      total: number;
      ratio: number;
    };
    conferenceHall: {
      lastImportAt: string;
    };
    schedule: {
      conferenceStartDate: string;
      daysBeforeConference: number;
    };
  };
}

export interface DuplicateConferencePayload {
  conferenceId: string;
  name: string;
  edition: number;
  startDate: string;
  duplicateRooms: boolean;
  duplicateTracks: boolean;
  duplicatePlanningStructure: boolean;
  duplicateActivities: boolean;
  duplicateSponsors: boolean;
}

export interface DuplicateConferenceReport {
  conferenceId: string;
  activitiesCreated: number;
  createdAt: string;
}

export interface VoxxrinDescriptorStorageReport {
  message: string;
  filePath: string;
  downloadUrl: string;
  archivedPreviousFilePath: string | null;
}

export interface RefreshVoxxrinScheduleReport extends VoxxrinDescriptorStorageReport {
  voxxrinStatus: number;
  voxxrinResponse: unknown;
}

export interface RefreshVoxxrinOccupationReport {
  sessionsInConference: number;
  statsReceived: number;
  sessionsUpdated: number;
  unmatchedTalkStats: number;
  refreshedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ConferenceAdminService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  async deleteConference(conferenceId: string): Promise<DeleteConferenceReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: DeleteConferenceReport }>(
        `${functionBaseUrl}deleteConference`,
        { conferenceId },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  async refreshConferenceDashboard(conferenceId: string): Promise<RefreshConferenceDashboardReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: RefreshConferenceDashboardReport }>(
        `${functionBaseUrl}refreshConferenceDashboard`,
        { conferenceId },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  async duplicateConference(payload: DuplicateConferencePayload): Promise<DuplicateConferenceReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: DuplicateConferenceReport }>(
        `${functionBaseUrl}duplicateConference`,
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

  async refreshVoxxrinSchedule(conferenceId: string): Promise<RefreshVoxxrinScheduleReport> {
    const idToken = await this.getIdTokenOrThrow();
    return await firstValueFrom(
      this.http.post<RefreshVoxxrinScheduleReport>(
        `${functionBaseUrl}refreshVoxxrinSchedule`,
        { conferenceId },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
  }

  async refreshVoxxrinOccupation(conferenceId: string): Promise<RefreshVoxxrinOccupationReport> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ report: RefreshVoxxrinOccupationReport }>(
        `${functionBaseUrl}refreshVoxxrinOccupation`,
        { conferenceId },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.report;
  }

  getVoxxrinEventDescriptorPublicUrl(conferenceId: string): string {
    const bucketName = String(environment.firebase?.storageBucket ?? '').trim();
    if (!bucketName) {
      return '';
    }
    const normalizedConferenceId = String(conferenceId ?? '')
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/[\\/]+/g, '-');
    if (!normalizedConferenceId) {
      return '';
    }
    const objectPath = `public/${normalizedConferenceId}/voxxrin-full.json`;
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
  }

  private async getIdTokenOrThrow(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }
}
