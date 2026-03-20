import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConferenceDashboard } from '@shared/model/conference-dashboard.model';
import { FirestoreGenericService } from './firestore-generic.service';

@Injectable({ providedIn: 'root' })
export class ConferenceDashboardService extends FirestoreGenericService<ConferenceDashboard> {
  protected override getCollectionName(): string {
    return 'conference-dashboard';
  }

  byConferenceId(conferenceId: string): Observable<ConferenceDashboard | undefined> {
    return this.byId(conferenceId);
  }
}

