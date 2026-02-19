import { Component, computed, inject, input, output, model, OnInit, signal, Signal, HostBinding, effect } from '@angular/core';
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
import { CopyRoormToRoom } from '../copy-roorm-to-room/copy-roorm-to-room';
import { CopyDayToDay, DayToDayCopyRequest } from '../copy-day-to-day/copy-day-to-day';
import { MenuModule } from 'primeng/menu';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SessionAllocation } from '../../../../../model/session.model';
import { SessionAllocationService } from '../../../../../services/session-allocation.service';
import { SessionDeallocationService } from '../../../../../services/session-deallocation.service';

@Component({
  selector: 'app-day-structure',
  imports: [
    ButtonModule,
    CopyDayToDay,
    CommonModule,
    CopyRoormToRoom,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    MenuModule,
    SlotEditorComponent,
    ToggleSwitchModule,
    TranslateModule
  ],
  templateUrl: './day-structure.html',
  styleUrl: './day-structure.scss',
  standalone: true,
  providers: [ConfirmationService],
})
export class DayStructure implements OnInit {

  private readonly slotTypeService = inject(SlotTypeService);
  protected readonly conferenceService = inject(ConferenceService);
  private readonly translateService = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly sessionDeallocationService = inject(SessionDeallocationService);
  protected readonly defaultLanguage = signal<string>('EN');

  conferenceId = input.required<string>();
  rooms = input.required<Room[]>();
  days = input.required<Day[]>();
  day = model.required<Day>();
  sessionTypes = input.required<SessionType[]>();
  slotTypes = signal<SlotType[]>([]);
  dayChanged = output<Day>();
  copyDayRequested = output<DayToDayCopyRequest>();

  // Shared day bounds (ISO strings). Tu peux les exposer en @Input si tu veux.
  dayStartIso = computed(() => this.day().beginTime ? this.day().beginTime : '09:00');
  dayEndIso   = computed(() => this.day().endTime ? this.day().endTime : '18:00'); 

  defaultSlotColor = '#cfe9ff';

  // computed ms & total minutes for scale
  private dayStartMs = computed(() => this.computeTimeOfDay(this.dayStartIso()) );
  private dayEndMs   = computed(() => this.computeTimeOfDay(this.dayEndIso())   );
  totalMinutes = computed(() => Math.max(1, (this.dayEndMs() - this.dayStartMs()) / 60000));

  dayRooms = signal<DayRoom[]>([]);
  enabledRooms = computed(() => this.dayRooms().filter(dr => dr.enable).map(dr => dr.room));
  allocations = signal<SessionAllocation[]>([]);
  allocatedSlotIds = computed(() => new Set(this.allocations().map(a => a.slotId)));
  editedSlotIsAllocated = computed(() => {
    const editedSlotId = this.editedSlot()?.id;
    return !!editedSlotId && this.allocatedSlotIds().has(editedSlotId);
  });

  private readonly tickStep = 30;
  private readonly tickMainRatio = 2;

  // ticks (every 60 minutes by default)
  ticks = computed(() => {
    const start = this.dayStartMs();
    const end = this.dayEndMs();
    const results: Tick[] = [];
    let idx = 0;
    for (let t = start; t <= end; t = t + this.tickStep * 60000) {
      const startTime = this.conferenceService.formatHour(new Date(t));
      results.push({ startTime,
        label: startTime, 
        main: idx % this.tickMainRatio === 0 
      });
      idx++;
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
  private lastEditedSlotId: string|undefined;

  menuItems: MenuItem[] = [
    { label: 'New Slot', icon: 'pi pi-plus', command: () => this.onSlotAdd() },
    { label: 'Select rooms', icon: 'pi pi-clone', command: () => this.roomSelectorVisible.set(true) },
    { label: 'Copy Room to Room', icon: 'pi pi-clone', command: () => this.copyRoomVisible.set(true) },
    { label: 'Copy Day to Day', icon: 'pi pi-clone', command: () => this.copyDayVisible.set(true) },
  ];
  copyRoomVisible = signal<boolean>(false);
  copyDayVisible = signal<boolean>(false);
  roomSelectorVisible = signal<boolean>(false);

  constructor() {
    effect(() =>{
      this.computeDayRooms();
    })
  }

  computeDayRooms() {
    this.dayRooms.set(this.rooms().map(room => {
      const disabledRoomIds: string[] = this.day().disabledRoomIds || [];
      const dr: DayRoom = {
        room, 
        enable: disabledRoomIds.findIndex(rid => rid === room.id) < 0
      };
      // console.log('compute room', room.name, dr.enable);
      return dr;
    }));
  }
  // Convertit un slot => top% & height% sur la base dayStart/dayEnd
  getSlotPosition(s: Slot) {
    const dayStart = this.conferenceService.timeStringToDate(this.beginTime).getTime();
    const slotStart = this.conferenceService.timeStringToDate(s.startTime).getTime();
    const delta = (slotStart - dayStart) / 60000;
    // console.log('dayStart',dayStart, 'slotStart', slotStart, 'delta', delta, "min");
    const startTick = delta / this.tickStep;
    const durationtick = s.duration / this.tickStep;
    const roomColIdx = this.enabledRooms().findIndex(room => room.id === s.roomId);
    const position = { startTick, durationtick, roomColIdx };
    // console.log(position);
    return position;
  }

  ngOnInit() {
    this.slotTypeService.init().subscribe(slotTypes => {
      this.slotTypes.set(slotTypes);
    });
    if (this.conferenceId()) {
      this.sessionAllocationService.byConferenceId(this.conferenceId()).subscribe(allocations => {
        this.allocations.set(allocations);
      });
    }
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
    this.lastEditedSlotId = s.id;
  }

  onSlotAdd(room: Room|undefined = undefined, tick: Tick|undefined = undefined) {
    const slotType: SlotType|undefined = this.slotTypes().length ? this.slotTypes()[0] : undefined;
    const sessionType : SessionType|undefined = slotType && slotType.isSession 
      ? (this.sessionTypes() ? this.sessionTypes()[0] : undefined)
      : undefined;
    const duration = sessionType ? sessionType.duration : 30;
    const lastEditedSlot = this.lastEditedSlotId ? this.day().slots.find(s => s.id === this.lastEditedSlotId) : undefined;

    let slot:Slot|undefined;
    if (room && tick) {
      slot  = {
        id: '',
        startTime: tick.startTime,
        duration,
        endTime: this.conferenceService.computeSlotEndtime(tick.startTime, duration),
        roomId: room.id,
        slotTypeId: slotType ? slotType.id : '',
        sessionTypeId: sessionType ? sessionType.id : '',
        overflowRoomIds: []
      };
      // console.log('Add with context', slot);
    } else if (lastEditedSlot) {
      slot = {
        id: '',
        startTime: lastEditedSlot.endTime,
        endTime: this.conferenceService.computeSlotEndtime(lastEditedSlot.endTime, lastEditedSlot.duration),
        duration: lastEditedSlot.duration,
        roomId: lastEditedSlot.roomId,
        slotTypeId: lastEditedSlot.slotTypeId,
        sessionTypeId: lastEditedSlot.sessionTypeId,
        overflowRoomIds: lastEditedSlot.overflowRoomIds
      };
    } else {
      slot = {
        id: '',
        startTime: this.beginTime, // beginning of the day
        endTime: this.conferenceService.computeSlotEndtime(this.beginTime, duration),
        roomId: this.rooms().length ? this.rooms()[0].id : '',
        duration,
        slotTypeId: slotType ? slotType.id : '',
        sessionTypeId: sessionType ? sessionType.id : '',
        overflowRoomIds: []
      };
    }
    this.slotEditorVisible.set(true);
    this.editedSlot.set(slot);
  }

  changeBeginTime(newBeginTimeDate: Date) {
    this.day.update(day => {
      // check the beginTime is BEFORE the endTime
      let validBeginTime = new Date(this.computeTimeOfDay(this.conferenceService.formatHour(newBeginTimeDate)));
      if (validBeginTime.getTime() >= this.dayEndMs()) {
        validBeginTime = new Date(this.dayEndMs() - 5 * 60000); // end of day minus 5 minutes
      }
      day.beginTime = this.conferenceService.formatHour(validBeginTime);
      // TODO check the day slots with the new beginning of the day
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
      //TODO check the day slots with new end of day
      return { ...day};
    });
    this.dayChanged.emit(this.day());
  }
 
  async onSlotSave(slot: Slot) {
    this.slotEditorVisible.set(false);
    this.editedSlot.set(undefined);
    if (slot && this.conferenceService.isValidSlot(slot, 
        this.day(), this.slotTypes(), this.sessionTypes(), this.rooms()).length === 0) {
      const existingSlot = slot.id ? this.day().slots.find(s => s.id === slot.id) : undefined;
      const mustDeallocate = !!existingSlot
        && this.allocatedSlotIds().has(existingSlot.id)
        && (existingSlot.slotTypeId !== slot.slotTypeId
          || existingSlot.sessionTypeId !== slot.sessionTypeId);
      if (mustDeallocate) {
        await this.deallocateSlots([existingSlot!.id]);
      }
      this.day.update(day => {
        if (slot.id && slot.id.length >= 0) {
          // update an existing slot from the list
          const idx = day.slots.findIndex(s => s.id === slot.id);
          if (idx >= 0) {
            day.slots[idx] = slot;
          }
        } else {
          // add a new slot in list
          slot.id = this.conferenceService.generateSlotId();
          day.slots.push(slot);
        }
        this.lastEditedSlotId = slot.id;
        return { ...day};
      });
      this.dayChanged.emit(this.day());
    }
  }
  onSlotEditCancel() {
    if (this.editedSlot() && this.editedSlot()!.id) {
      this.lastEditedSlotId = this.editedSlot()!.id;
    }
    this.slotEditorVisible.set(false);
    this.editedSlot.set(undefined);
  }
  async onSlotEditRemove(slotId: string|undefined) {
    this.slotEditorVisible.set(false);
    this.editedSlot.set(undefined);
    let changed = false;
    if (slotId && this.allocatedSlotIds().has(slotId)) {
      await this.deallocateSlots([slotId]);
    }
    this.day.update(day => {
      if (slotId && slotId.length >= 0) {
        // delete an existing slot from the list
        const idx = day.slots.findIndex(s => s.id === slotId);
        if (idx >= 0) {
          day.slots.splice(idx, 1);
          changed = true;
          return { ...day};
        }
      }
      return day; // no change
    });
    if (changed) this.dayChanged.emit(this.day());
  }
  createSlots(newslots: Slot[]) {
    console.log('createSlots', newslots);
    if (!newslots || newslots.length === 0) return;
    this.day.update(day => {
      const accepted = this.conferenceService.filterCompatibleSlots(
        newslots,
        day,
        this.slotTypes(),
        this.sessionTypes(),
        this.rooms()
      );
      if (accepted.length === 0) {
        return day;
      }
      day.slots.push(...accepted);
      return { ...day };
    });
    this.dayChanged.emit(this.day());
  }
  onCopyDayRequested(request: DayToDayCopyRequest) {
    this.copyDayVisible.set(false);
    this.copyDayRequested.emit(request);
  }
  toggleRoom(room: Room) {
    const dr = this.dayRooms().find(dr => dr.room.id === room.id);
    this.day.update(day => {
      if (!day.disabledRoomIds) {
        day.disabledRoomIds = [];
      }
      if (dr!.enable) {
        console.log('Enable room', room.name);
        day.disabledRoomIds = day.disabledRoomIds.filter(rid => room.id != rid)
      } else {
        console.log('Disable room', room.name);
        day.disabledRoomIds.push(room.id)
      }
      return {...day};
    });
  }

  confirmResetSlots() {
    this.confirmationService.confirm({
      message: this.translateService.instant('CONFERENCE.CONFIG.PLANNING_STRUCTURE.CONFIRM_RESET_SLOTS'),
      header: this.translateService.instant('CONFERENCE.CONFIG.PLANNING_STRUCTURE.RESET_SLOTS'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: {
        label: this.translateService.instant('COMMON.REMOVE'),
        severity: 'danger',
      },
      rejectButtonProps: {
        label: this.translateService.instant('COMMON.CANCEL'),
        severity: 'secondary',
      },
      accept: () => this.resetSlots(),
    });
  }

  private async resetSlots() {
    if (!this.day().slots || this.day().slots.length === 0) {
      return;
    }
    const slotsToRemove = [...this.day().slots];
    await this.deallocateSlots(slotsToRemove.map(slot => slot.id));
    this.day.update(day => ({ ...day, slots: [] }));
    this.dayChanged.emit(this.day());
  }

  private async deallocateSlots(slotIds: string[]): Promise<void> {
    const cleanIds = slotIds.filter(id => !!id);
    if (!this.conferenceId() || cleanIds.length === 0) {
      return;
    }
    await this.sessionDeallocationService.deallocateBySlotIds(this.conferenceId(), cleanIds, {
      allAllocations: this.allocations(),
    });
    const removedIds = new Set(cleanIds);
    this.allocations.update(allocations => allocations.filter(a => !removedIds.has(a.slotId)));
  }
} 
interface Tick { 
  label: string;
  main: boolean, 
  startTime: string 
}
interface DayRoom {
  room: Room;
  enable: boolean;
}
