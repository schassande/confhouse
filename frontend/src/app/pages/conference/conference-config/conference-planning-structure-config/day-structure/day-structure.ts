import { Component, computed, inject, input, output, model, OnInit, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Day, Room, SessionType, Slot } from '../../../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SlotTypeService } from '../../../../../services/slot-type.service';
import { SlotType } from '../../../../../model/slot-type.model';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { FormsModule } from '@angular/forms';
import { SlotEditorComponent } from '../slot-editor/slot-editor';
import { DialogModule } from 'primeng/dialog';
import { ConferenceService } from '../../../../../services/conference.service';

@Component({
  selector: 'app-day-structure',
  imports: [
    ButtonModule,
    CommonModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    SlotEditorComponent,
    TranslateModule
  ],
  templateUrl: './day-structure.html',
  styleUrl: './day-structure.scss',
  standalone: true,
})
export class DayStructure implements OnInit {

  private readonly slotTypeService = inject(SlotTypeService);
  protected readonly conferenceService = inject(ConferenceService);
  private readonly translateService = inject(TranslateService);
  protected readonly defaultLanguage = signal<string>('EN');

  rooms = input.required<Room[]>();
  day = model.required<Day>();
  sessionTypes = input.required<SessionType[]>();
  slotTypes = signal<SlotType[]>([]);
  dayChanged = output<Day>();

  // Shared day bounds (ISO strings). Tu peux les exposer en @Input si tu veux.
  dayStartIso = computed(() => this.day().beginTime ? this.day().beginTime : '09:00');
  dayEndIso   = computed(() => this.day().endTime ? this.day().endTime : '18:00'); 

  defaultSlotColor = '#cfe9ff';

  // computed ms & total minutes for scale
  private dayStartMs = computed(() => this.computeTimeOfDay(this.dayStartIso()) );
  private dayEndMs   = computed(() => this.computeTimeOfDay(this.dayEndIso())   );
  totalMinutes = computed(() => Math.max(1, (this.dayEndMs() - this.dayStartMs()) / 60000));

  // ticks (every 60 minutes by default)
  ticks = computed(() => {
    const start = new Date(this.dayStartIso());
    const end = new Date(this.dayEndIso());
    const stepMin = 60;
    const results: { label: string; topPercent: number }[] = [];
    const totalMins = (end.getTime() - start.getTime()) / 60000 || 1;
    for (let t = new Date(start.getTime()); t <= end; t = new Date(t.getTime() + stepMin * 60000)) {
      const minsFromStart = (t.getTime() - start.getTime()) / 60000;
      const topPercent = (minsFromStart / totalMins) * 100;
      results.push({ label: this.conferenceService.formatHour(t), topPercent });
      if (results.length > 500) break;
    }
    return results;
  });

  // group slots by room id (computed)
  slotsByRoom = computed(() => {
    const map = new Map<string, Slot[]>();
    const slots = this.day().slots ? this.day().slots : [];
    for (const slot of slots) {
      const roomId = slot.roomId;
      if (!map.has(roomId)) map.set(roomId, []);
      map.get(roomId)!.push(slot);
    }
    return map;
  });
  beginTime: string = '09:00';
  endTime: string = '18:00';

  editedSlot = signal<Slot | undefined>(undefined);
  slotEditorVisible = signal<boolean>(false);

  // Convertit un slot => top% & height% sur la base dayStart/dayEnd
  getSlotPosition(s: Slot) {
    const dayStart = this.dayStartMs();
    const totalMins = Math.max(1, this.totalMinutes());

    const sStartMs = new Date(s.startTime).getTime();
    const sEndMs = new Date(s.endTime).getTime();

    const topMins = Math.max(0, (sStartMs - dayStart) / 60000);
    // preferer duration si cohérent, sinon calculer
    const rawDuration = s.duration && s.duration > 0 ? s.duration : Math.max(1, (sEndMs - sStartMs) / 60000);
    const heightMins = Math.min(rawDuration, Math.max(0, totalMins - topMins));

    const top = (topMins / totalMins) * 100;
    const height = (heightMins / totalMins) * 100;
    return { top, height };
  }

  ngOnInit() {
    this.slotTypeService.init().subscribe(slotTypes => {
      this.slotTypes.set(slotTypes);
    });
    this.translateService.onLangChange.subscribe(ev => this.defaultLanguage.set(ev.lang.toLocaleUpperCase()));
  }

  computeTimeOfDay(timeStr: string) {
    return new Date(`${this.day().date}T${timeStr}:00`).getTime();
  }

  getSlotsByRoom(roomId: string): Slot[] {
    return this.slotsByRoom().get(roomId) || [];
  }
  getSlotType(slotTypeId: string): SlotType | undefined {
    return this.slotTypes().find(st => st.id === slotTypeId);
  }
  getSessionType(sessionTypeId: string): SessionType | undefined {
    return this.sessionTypes().find(st => st.id === sessionTypeId);
  }
  // interactions
  onSlotEdit(s: Slot) { 
    this.editedSlot.set({...s});
    this.slotEditorVisible.set(true);
  }

  onSlotAdd() {
    const slot: Slot = {
      id: '',
      startTime: this.beginTime, // beginning of the day
      endTime: this.conferenceService.computeSlotEndtime(this.beginTime, 30),
      duration: 30,
      roomId: this.rooms().length ? this.rooms()[0].id : '',
      slotTypeId: this.slotTypes().length ? this.slotTypes()[0].id : '',
      sessionTypeId: this.slotTypes().length && this.slotTypes()[0].isSession ? this.sessionTypes()[0].id : ''
    };
    this.editedSlot.set(slot);
    this.slotEditorVisible.set(true);
  }

  createSlotFromPrevious(prevSlot: Slot) {
    const slot: Slot = {
      id: '',
      startTime: prevSlot.endTime,
      endTime: this.conferenceService.computeSlotEndtime(prevSlot.endTime, prevSlot.duration),
      duration: prevSlot.duration,
      roomId: prevSlot.roomId,
      slotTypeId: prevSlot.slotTypeId,
      sessionTypeId: prevSlot.sessionTypeId
    };
    this.editedSlot.set(slot);
    this.slotEditorVisible.set(true);
  }

  changeBeginTime(newBeginTimeDate: Date) {
    this.day.update(day => {
      // check the beginTime is BEFORE the endTime
      let validBeginTime = new Date(this.computeTimeOfDay(this.conferenceService.formatHour(newBeginTimeDate)));
      if (validBeginTime.getTime() >= this.dayEndMs()) {
        validBeginTime = new Date(this.dayEndMs() - 5 * 60000); // end of day minus 5 minutes
      }
      day.beginTime = this.conferenceService.formatHour(validBeginTime);
      console.log('Begin time changed:', day.beginTime);
      return { ...day};
    });
    this.dayChanged.emit(this.day());
  }

  changeEndTime(newEndTimeDate: Date) {
    this.day.update(day => {
      // check the beginTime is BEFORE the endTime
      let validEndTime = new Date(this.computeTimeOfDay(this.conferenceService.formatHour(newEndTimeDate)));
      if (validEndTime.getTime() <= this.dayStartMs()) {
        validEndTime = new Date(this.dayStartMs() + 5 * 60000); // beginning of day plus 5 minutes
      }
      day.endTime = this.conferenceService.formatHour(validEndTime);
      console.log('End time changed:', day.endTime);
      return { ...day};
    });
    this.dayChanged.emit(this.day());
  }
  
  genId(prefix = 's'): string {
    return prefix + Math.random().toString(36).slice(2, 9);
  }
  
  onSlotSave(slot: Slot) {
    this.slotEditorVisible.set(false);
    this.editedSlot.set(undefined);
    if (slot) {
      this.day.update(day => {
        if (slot.id && slot.id.length >= 0) {
          // update an existing slot from the list
          const idx = day.slots.findIndex(s => s.id === slot.id);
          if (idx >= 0) {
            day.slots[idx] = slot;
          }
        } else {
          // add a new slot in list
          slot.id = this.genId();
          day.slots.push(slot);
        }
        return { ...day};
      });
      this.dayChanged.emit(this.day());
    }
  }
  onSlotEditCancel() {
    this.slotEditorVisible.set(false);
    this.editedSlot.set(undefined);
  }
} 