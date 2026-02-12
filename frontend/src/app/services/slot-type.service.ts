import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FirestoreGenericService } from './firestore-generic.service';
import { Session } from '../model/session.model';
import { SlotType } from '../model/slot-type.model';
import { forkJoin, mergeMap, Observable, of } from 'rxjs';

/**
 * Service for Session persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SlotTypeService extends FirestoreGenericService<SlotType> {
  protected override getCollectionName(): string {
    return 'slot-type';
  }

  init(): Observable<SlotType[]> {
    // Initialize with some default slot types if collection is empty
    const SLOT_TYPES: SlotType[] = [
      {
        id: 'session',
        isSession: true,
        lastUpdated: new Date().toISOString(),
        name: { 'EN': 'Session', 'FR': 'Session' },
        icon: 'mic',
        color: '#cfe9ff',
        description: { 'EN': 'A presentation session', 'FR': 'Une session de présentation ou d\'atelier' }
      },
      {
        id: 'break',
        isSession: false,
        lastUpdated: new Date().toISOString(),
        name: { 'EN': 'Break', 'FR': 'Pause' },
        icon: 'coffee',
        color: '#e0e0e0',
        description: { 'EN': 'A break session', 'FR': 'Une pause' }
      },
      {
        id: 'lunch',
        isSession: false,
        lastUpdated: new Date().toISOString(),
        name: { 'EN': 'Lunch', 'FR': 'Déjeuner' },
        icon: 'utensils',
        color: '#f0f8ff',
        description: { 'EN': 'A lunch break', 'FR': 'Une pause déjeuner' }
      },
      {
        id: 'activity',
        isSession: false,
        lastUpdated: new Date().toISOString(),
        name: { 'EN': 'Activity', 'FR': 'Activité' },
        icon: 'utensils',
        color: '#f0f8ff',
        description: { 'EN': 'A conference activity ', 'FR': 'Une activité de conférence' }
      }
    ];
    return this.all().pipe(
      mergeMap(slotTypes => {
        if (slotTypes.length !== SLOT_TYPES.length) {
          return forkJoin(SLOT_TYPES.map(slotType => this.save(slotType)));
        } else {
          return of(slotTypes);
        }
      })
    )
  }
}
