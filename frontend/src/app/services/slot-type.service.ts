import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { SlotType } from '@shared/model/slot-type.model';
import { forkJoin, map, mergeMap, Observable, of, take } from 'rxjs';

const SLOT_TYPES: SlotType[] = [
  {
    id: 'welcome',
    isSession: false,
    lastUpdated: new Date().toISOString(),
    name: { 'EN': 'Welcome', 'FR': 'Accueil' },
    icon: 'home',
    color: '#cfe9ff',
    description: { 'EN': 'Welcome session', 'FR': 'Session d\'accueil' }
  },
  {
    id: 'Session',
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

/**
 * Service for Session persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SlotTypeService extends FirestoreGenericService<SlotType> {
  protected override getCollectionName(): string {
    return 'slot-type';
  }

  init(): Observable<void> {
    // Initialize slot types once, then complete.
    return this.all().pipe(
      take(1),
      mergeMap(slotTypes => {
        const existingIds = new Set(slotTypes.map(slotType => slotType.id));
        const isInitialized =
          slotTypes.length === SLOT_TYPES.length
          && SLOT_TYPES.every(slotType => existingIds.has(slotType.id));

        if (!isInitialized) {
          console.log('Initializing slot types collection', SLOT_TYPES.length, slotTypes.length);
          return this.deleteAll().pipe(
            mergeMap(() => forkJoin(
              SLOT_TYPES.map(slotType => this.save({ ...slotType }))
            )),
            map(() => void 0)
          );
        } else {
          console.log('Slot types collection already initialized');
          return of(void 0);
        }
      })
    );
  }
}

