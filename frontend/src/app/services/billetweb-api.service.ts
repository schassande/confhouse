import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { functionBaseUrl } from './constantes';

export interface BilletwebEvent {
  id: string;
  ext_id: string;
  name: string;
  start: string;
  end: string;
}

export interface BilletwebTicketTypeOption {
  id: string;
  name: string;
  full_name: string;
}

interface BilletwebFetchBasePayload {
  conferenceId: string;
  apiUrl: string;
  userId: string;
  keyVersion: string;
  key: string;
}

@Injectable({ providedIn: 'root' })
export class BilletwebApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  async listEvents(payload: BilletwebFetchBasePayload): Promise<BilletwebEvent[]> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ events: BilletwebEvent[] }>(
        `${functionBaseUrl}fetchBilletweb`,
        { ...payload, operation: 'events' },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.events ?? [];
  }

  async listTickets(payload: BilletwebFetchBasePayload & { eventId: string }): Promise<BilletwebTicketTypeOption[]> {
    const idToken = await this.getIdTokenOrThrow();
    const response = await firstValueFrom(
      this.http.post<{ tickets: BilletwebTicketTypeOption[] }>(
        `${functionBaseUrl}fetchBilletweb`,
        { ...payload, operation: 'tickets' },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )
    );
    return response.tickets ?? [];
  }

  private async getIdTokenOrThrow(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }
}
