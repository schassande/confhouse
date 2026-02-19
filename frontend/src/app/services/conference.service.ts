import { Injectable } from '@angular/core';
import { FirestoreGenericService } from './firestore-generic.service';
import { Conference, Day, Room, SessionType, Slot, SlotError } from '../model/conference.model';
import { SlotType } from '../model/slot-type.model';
import { getDocs, orderBy as fbOrderBy, startAfter as fbStartAfter, limit as fbLimit, query as fbQuery, startAt as fbStartAt, endAt as fbEndAt, where as fbWhere } from 'firebase/firestore';
import { map, Observable, from } from 'rxjs';

/**
 * Service for Conference persistent documents in Firestore.
 */
@Injectable({ providedIn: 'root' })
export class ConferenceService extends FirestoreGenericService<Conference> {
  protected override getCollectionName(): string {
    return 'conference';
  }
  public generateSlotId(prefix = 's'): string {
    return prefix + Math.random().toString(36).slice(2, 9);
  }

  public organizerConferences(email: string): Observable<Conference[]> {
    return from(getDocs(fbQuery(this.itemsCollection(), fbWhere('organizerEmails', 'array-contains', email)))).pipe(
      map((qs) => qs.docs.map((qds) => qds.data() as Conference)));
  }

  public isValidSlot(slot: Slot|undefined, day: Day, slotTypes: SlotType[], sessionTypes: SessionType[], rooms: Room[]) : SlotError[] {
    if (!slot) return [];
    const errors: SlotError[] = [];
    const slotStartTime = this.timeStringToDate(slot.startTime).getTime();
    const slotEndTime = this.timeStringToDate(slot.endTime).getTime();
    const dayBeginTime = this.timeStringToDate(day.beginTime).getTime();
    const dayEndTime = this.timeStringToDate(day.endTime).getTime();
    if (slotEndTime < slotStartTime) {
      errors.push('START_AFTER_END');
    }
    if (slot.duration < 0 || slot.duration > 1000) {
      console.log('WRONG_DURATION', slot.duration)
      errors.push('WRONG_DURATION');
    }
    if (slotStartTime < dayBeginTime) {
      console.log(slot.startTime, day.beginTime);
      errors.push('BEFORE_DAY_BEGIN');
    }
    if (dayEndTime < slotEndTime) {
      errors.push('AFTER_DAY_END');
    }
    const room: Room|undefined = rooms.find(r => r.id === slot.roomId);
    if (!room) {
      errors.push('UNEXISTING_ROOM');
    }
    if (day.disabledRoomIds?.includes(slot.roomId)) {
      errors.push('ROOM_DISABLED');
    }
    const slotType: SlotType|undefined = slotTypes.find(st => st.id === slot.slotTypeId);
    if (!slotType) {
      errors.push('WRONG_SLOT_TYPE');
    } else {
      if (room && room.isSessionRoom !== slotType.isSession) {
        errors.push('WRONG_ROOM_TYPE');
      }
      if (slotType.isSession) {
        const sessionType: SessionType|undefined = sessionTypes.find(st => st.id === slot.sessionTypeId);
        if (sessionType) {
          if (sessionType.duration !== slot.duration) {
            console.log('WRONG_DURATION_SESSION', sessionType.duration, slot.duration)
            errors.push('WRONG_DURATION_SESSION');
          }
        } else {
          errors.push('WRONG_SESSION_TYPE');
        }
      }
    }
    const overlaps = this.getSlotOverlapedSlots(day.slots, slot);
    if (overlaps.length > 0) {
      console.log(overlaps.map(s=> s.startTime+'-'+s.endTime).join(','))
      errors.push('OVERLAP_SLOT');
    }
    const delta = (this.timeStringToDate(slot.endTime).getTime() - this.timeStringToDate(slot.startTime).getTime()) / 60000;
    if (slot.duration !== delta) {
      console.log('WRONG_DURATION', delta, slot.duration);
      errors.push('WRONG_DURATION');
    }
    return errors;
  }
  public filterCompatibleSlots(
    candidates: Slot[],
    targetDay: Day,
    slotTypes: SlotType[],
    sessionTypes: SessionType[],
    rooms: Room[]
  ): Slot[] {
    const accepted: Slot[] = [];
    const workingDay: Day = {
      ...targetDay,
      slots: [...targetDay.slots]
    };
    for (const candidate of candidates) {
      const errors = this.isValidSlot(candidate, workingDay, slotTypes, sessionTypes, rooms);
      if (errors.length === 0) {
        accepted.push(candidate);
        workingDay.slots.push(candidate);
      }
    }
    return accepted;
  }
  public getSlotOverlapedSlots(existingSlots: Slot[], aSlot: Slot): Slot[] {
    return existingSlots.filter(slot => {
      if (slot.id === aSlot.id // same slot => not an overlap
        || !(slot.roomId === aSlot.roomId  // not the same room
          || slot.overflowRoomIds.find(rid => rid===aSlot.roomId)
          || aSlot.overflowRoomIds.find(rid => rid===slot.roomId))) {
        return false;
      }
      //console.log('not the same room', aSlot, slot);
      const slotStartTime = this.timeStringToDate(slot.startTime).getTime();
      const slotEndTime = this.timeStringToDate(slot.endTime).getTime();
      const aSlotStartTime = this.timeStringToDate(aSlot.startTime).getTime();
      const aSlotEndTime = this.timeStringToDate(aSlot.endTime).getTime();
      if (slotStartTime <= aSlotStartTime &&  aSlotStartTime < slotEndTime) {
        // console.log('start during an existing slot', aSlot, slot);
        return true
      }
      if (slotStartTime < aSlotEndTime &&  aSlotEndTime <= slotEndTime) {
        // console.log('end during an existing slot', aSlot, slot);
        return true;
      }
      if (aSlotStartTime <= slotStartTime &&  slotEndTime <= aSlotEndTime)  {
        //console.log('slot includes an existing slot', aSlot, slot);
        return true;
      }
      return false;
    });
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
    if (!time) return new Date();
    if (typeof time === 'object') {
      return time as Date;
    }
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
