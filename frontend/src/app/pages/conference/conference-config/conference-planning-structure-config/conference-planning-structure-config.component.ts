import { Component, input, ChangeDetectionStrategy, computed, signal, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, Day } from '../../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { FormsModule } from '@angular/forms';
import { DayStructure } from './day-structure/day-structure';
import { ConferenceService } from '../../../../services/conference.service';
import { SlotTypeService } from '../../../../services/slot-type.service';
import { SlotType } from '../../../../model/slot-type.model';
import { DayToDayCopyRequest } from './copy-day-to-day/copy-day-to-day';

@Component({
  selector: 'app-conference-planning-structure-config',
  imports: [ButtonModule, 
    CommonModule,
    DatePickerModule,
    FormsModule,
    StepperModule,
    TranslateModule,
    DayStructure],
  templateUrl: './conference-planning-structure-config.component.html',
  styleUrls: ['./conference-planning-structure-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferencePlanningStructureConfigComponent implements OnInit {
  private readonly conferenceService = inject(ConferenceService);
  private readonly slotTypeService = inject(SlotTypeService);
  private readonly translateService = inject(TranslateService);
  private readonly messageService = inject(MessageService);

  readonly conference = input.required<Conference>();
  days = signal<Day[]>([]);
  slotTypes = signal<SlotType[]>([]);
  currentDayIdx = signal(-1); // zero based index
  currentDay = computed(() => this.days().length > 0 
    ? this.days()[this.currentDayIdx()] 
    : undefined);
  hasPreviousDay = computed(() => this.currentDayIdx() > 0);
  hasNextDay = computed(() => this.currentDayIdx()>=0 && this.currentDayIdx() < (this.days().length - 1));  
  currentDayDate: Date|undefined = undefined;
  disabledDates = computed(() => {
    if (this.days().length === 0) {
      return [];
    }
    // Disable all dates that are already used by other days, except the current day
    const currentDate = this.currentDay()?.date;
    return this.days().filter(d => d.date !== currentDate).map(d => this.conferenceService.stringToDate(d.date));
  });

  constructor() {
    effect(() => {
      const currentDay = this.currentDay();
      this.currentDayDate = currentDay ? this.conferenceService.stringToDate(currentDay.date) : undefined;
    });    
  }
  ngOnInit(): void {
    this.slotTypeService.init().subscribe(slotTypes => this.slotTypes.set(slotTypes));
    // Initialize current day based on conference planning
    this.days.set(this.conference().days || []);
    if (this.days().length > 0) {
      this.currentDayIdx.set(0); // set to first day index
    }
  }
  goToPreviousDay() {
    if (this.hasPreviousDay()) {
      this.currentDayIdx.update(idx => idx - 1);
    }
  }
  goToNextDay() {
    if (this.hasNextDay()) {
      this.currentDayIdx.update(idx => idx + 1);
    }
  }
  addFirstDay() {
    this.addDay(new Date());
  }
  addDayAfterCurrent() {
    const newDate = new Date(this.currentDay()!.date);
    newDate.setDate(newDate.getDate() + 1);
    while (this.days().some(d => d.date === this.conferenceService.dateToString(newDate))) {
      newDate.setDate(newDate.getDate() + 1);
    }
    this.addDay(newDate);
  }
  addDayBeforeCurrent() {
    const newDate = new Date(this.currentDay()!.date);
    newDate.setDate(newDate.getDate() - 1);
    while (this.days().some(d => d.date === this.conferenceService.dateToString(newDate))) {
      newDate.setDate(newDate.getDate() - 1);
    }
    this.addDay(newDate);
  }
  private addDay(newDate: Date) {
    const newDay: Day = {
      id: `day-${Date.now()}`,
      dayIndex: this.currentDayIdx() - 1,
      date: this.conferenceService.dateToString(newDate),
      beginTime: '09:00',
      endTime: '18:00',
      slots: [],
      disabledRoomIds: []
    };
    this.days.update(days => {
      const newDays = [...days];
      newDays.splice(this.currentDayIdx(), 0, newDay);
      newDays.sort((a, b) => this.conferenceService.stringToDate(a.date).getTime() - this.conferenceService.stringToDate(b.date).getTime());
      this.updateIndexes(newDays);
      this.conference().days = newDays;
      return newDays;
    });
    // update current day index to the new day
    this.currentDayIdx.set(this.days().findIndex(d => d.id === newDay.id));
    console.log('Conference:', JSON.stringify(this.conference(), null, 2));
  }
  changeCurrentDayDate(newDate: any) {
    const newDateStr = this.conferenceService.dateToString(newDate)
    console.log('Changing current day date to:', newDate, newDateStr);
    if (!this.days().some(d => d.date === newDateStr)) {
      // date not already used, we can update current day
      this.days.update(days => {
        const newDays = [...days];
        newDays[this.currentDayIdx()].date = newDateStr;
        newDays.sort((a, b) => this.conferenceService.stringToDate(a.date).getTime() - this.conferenceService.stringToDate(b.date).getTime());
        this.updateIndexes(newDays);
        this.conference().days = newDays;
        return newDays;
      });
      // update current day index to the new day
      this.currentDayIdx.set(this.days().findIndex(d => d.date === newDateStr));
    } else {
      // date already used, show error message
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.PLANNING_STRUCTURE.DAY_DATE_CONFLICT'),
      }); 
    }
  }
  removeCurrentDay() {
    if (confirm(this.translateService.instant('CONFERENCE.CONFIG.PLANNING_STRUCTURE.CONFIRM_REMOVE_DAY'))) {
      this.days.update(days => {
        const newDays = [...days];  
        newDays.splice(this.currentDayIdx(), 1);
        this.updateIndexes(newDays);
        this.conference().days = newDays;
        return newDays;
      });
      // update current day index to the new day
      this.currentDayIdx.update(idx => Math.min(idx, this.days().length - 1));
    } 
  }
  dayChanged(day: Day) {
    this.days.update( days => {
      const idx = days.findIndex(d => d.id === day.id);
      if (idx >= 0) {
        days[idx] = day;
      }
      this.conference().days = days;
      return days;
    });
  }
  copyDayToDay(request: DayToDayCopyRequest) {
    if (!request || request.sourceDayId === request.targetDayId) {
      return;
    }
    this.days.update(days => {
      const sourceDay = days.find(d => d.id === request.sourceDayId);
      const targetDayIdx = days.findIndex(d => d.id === request.targetDayId);
      if (!sourceDay || targetDayIdx < 0) {
        return days;
      }
      const candidates = sourceDay.slots.map(slot => ({
        ...slot,
        id: this.conferenceService.generateSlotId(),
        overflowRoomIds: [...(slot.overflowRoomIds || [])]
      }));
      const accepted = this.conferenceService.filterCompatibleSlots(
        candidates,
        days[targetDayIdx],
        this.slotTypes(),
        this.conference().sessionTypes,
        this.conference().rooms
      );
      if (accepted.length === 0) {
        return days;
      }
      const newDays = [...days];
      newDays[targetDayIdx] = {
        ...newDays[targetDayIdx],
        slots: [...newDays[targetDayIdx].slots, ...accepted]
      };
      this.conference().days = newDays;
      return newDays;
    });
  }
  private updateIndexes(days: Day[]) {
    days.forEach((day, index) => day.dayIndex = index);
  }
}
