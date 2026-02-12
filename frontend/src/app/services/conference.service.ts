import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Conference } from '../model/conference.model';

/**
 * Service for Conference persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceService extends FirestoreGenericService<Conference> {
  protected override getCollectionName(): string {
    return 'conference';
  }

  computeSlotEndtime(startTime: string, duration: number): string {
    const endDate = new Date(this.timeStringToDate(startTime).getTime() + duration * 60000);
    return this.formatHour(endDate);
  }

  private two(n: number) {
    return n.toString().padStart(2, '0');
  }
  public formatHour(d: Date) {
    return `${this.two(d.getHours())}:${this.two(d.getMinutes())}`;
  }
  public timeStringToDate(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  }
  public dateToString(date: Date): string {
    const str = date.toISOString().split('T')[0];
    return str;
  }
  public stringToDate(dateStr: string): Date {
    return new Date(dateStr);
  }
  public formatTimeRange(startIso: string, endIso: string) {
    const s = new Date(startIso);
    const e = new Date(endIso);
    return `${this.formatHour(s)} - ${this.formatHour(e)}`;
  }
}
