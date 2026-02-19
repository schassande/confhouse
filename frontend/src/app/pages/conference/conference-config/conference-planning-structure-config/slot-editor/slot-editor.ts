import { Component, EventEmitter, Output, signal, model, computed, input, inject, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Day, Room, SessionType, Slot } from '../../../../../model/conference.model';
import { SlotType } from '../../../../../model/slot-type.model';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { ConferenceService } from '../../../../../services/conference.service';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';

@Component({
  selector: 'app-slot-editor',
  standalone: true,
  imports: [
    ButtonModule,
    CommonModule, 
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    ReactiveFormsModule,
    SelectModule,
    TranslateModule
  ],
  templateUrl: './slot-editor.html',
  styleUrls: ['./slot-editor.scss']
})
export class SlotEditorComponent implements OnInit {
  private readonly conferenceService = inject(ConferenceService);
  private readonly translateService = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  slot = input.required<Slot>();
  slotAllocated = input<boolean>(false);
  rooms = input.required<Room[]>();
  slotTypes = input.required<SlotType[]>();
  sessionTypes = input.required<SessionType[]>();
  day = input.required<Day>();
  save = output<Slot>();
  cancel = output<void>();
  remove = output<string|undefined>();

  protected readonly form = signal<FormGroup | null>(null);
  protected readonly defaultLanguage = signal<string>('EN');
  protected readonly currentSlot = signal<Slot|undefined>(undefined);
  protected readonly minDate = computed(() => this.conferenceService.timeStringToDate(this.day().beginTime));
  protected readonly maxDate = computed(() => this.conferenceService.timeStringToDate(this.day().endTime));
  slotErrors = computed(() => this.conferenceService.isValidSlot(this.currentSlot(), this.day(), this.slotTypes(), this.sessionTypes(), this.rooms()));

  ngOnInit() {
    this.translateService.onLangChange.subscribe(ev => this.defaultLanguage.set(ev.lang.toLocaleUpperCase()));
    this.initializeForm();
  }

  private computeCurrentSlot(): Slot{ 
    return { 
      id: this.slot()?.id, 
      ...this.form()!.value,
      // these fields can be disabled.
      sessionTypeId: this.form()!.get('sessionTypeId')!.value,
      duration: this.form()!.get('duration')!.value
    }; 
  }

  private initializeForm() {
    const slot = this.slot()!;
    const formGroup = this.fb.group({
      startTime: [slot?.startTime || '', [Validators.required]],
      endTime: [slot?.endTime || '', []],
      duration: [slot?.duration || 30, [Validators.min(0)]],
      roomId: [slot?.roomId || '', [Validators.required]],
      overflowRoomIds: [slot?.overflowRoomIds || [], []],
      slotTypeId: [slot?.slotTypeId || '', [Validators.required]],
      sessionTypeId: [slot?.sessionTypeId || '', []]
    });
    this.form.set(formGroup);
    this.computeSessionTypeEnabled(slot.slotTypeId);
    this.currentSlot.set(this.computeCurrentSlot());
  }

  onStartTimeOrDurationChange() {
    //update the end time based on the duration and the new start time
    let startTime = this.form()?.get('startTime')?.value;
    const duration = this.form()?.get('duration')?.value;
    if (startTime && duration) {
      if ((typeof startTime) !== 'string') {
        startTime = this.conferenceService.formatHour(startTime);
        this.form()!.get('startTime')!.setValue(startTime);
      }

      let newEndTime = this.conferenceService.computeSlotEndtime(startTime, duration);
      
      const newEndTimeDateTime = this.conferenceService.timeStringToDate(newEndTime).getTime();
      if (newEndTimeDateTime > this.maxDate().getTime()) {
        // The end time is after max Time of the day => set end time to the end of the day
        newEndTime = this.day().beginTime;

        //and adjust the duration
        const startTimeDateTime = this.conferenceService.timeStringToDate(startTime).getTime();
        let newDuration = (newEndTimeDateTime - startTimeDateTime) / 60000;
        if (duration <= 0) { 
          // duration must greater than 0 => set a default duration and compute start time
          newDuration = 5;
          const newStartTime = this.conferenceService.formatHour(new Date(newEndTimeDateTime - newDuration));
          this.form()?.get('startTime')?.setValue(newStartTime);
        }
        this.form()?.get('duration')?.setValue(newDuration);
      }
      this.form()?.get('endTime')?.setValue(newEndTime);
      this.currentSlot.set(this.computeCurrentSlot());

      this.computeDurationFromSessionType();
    }
  }
  onCancel() {
    this.cancel.emit();
  }

  onSave() {
    this.save.emit(this.computeCurrentSlot());
  }
  onRemove() {
    this.remove.emit(this.slot()?.id);
  }
  onSlotTypeChanged() {
    this.computeSessionTypeEnabled(this.form()?.get('slotTypeId')?.value);
    this.currentSlot.set(this.computeCurrentSlot());
  }

  computeSessionTypeEnabled(slotTypeId: string|undefined) {
    const form = this.form();
    if (form) {
      let enabled = false;
      if (slotTypeId?.length) {
        const slotType = this.slotTypes().find(st => st.id === slotTypeId);
        if (slotType?.isSession) enabled = true;
      }
      if (enabled) {
        form.get('sessionTypeId')?.enable();
        form.get('duration')?.disable();
        this.computeDurationFromSessionType();
      } else {
        form.get('sessionTypeId')?.disable();
        form.get('duration')?.enable();
      }
    }
  }
  onSessionTypeChanged() {
    this.computeSessionTypeEnabled(this.form()?.get('slotTypeId')?.value);
    this.currentSlot.set(this.computeCurrentSlot());
  }

  computeDurationFromSessionType() {
    const form = this.form();
    if (!form) return;
    if (form.get('sessionTypeId')?.enabled) {
      const _sessionTypeId = this.form()!.get('sessionTypeId')!.value;
      const _sessionType = this.sessionTypes().find(st => st.id === _sessionTypeId);
      if (_sessionType) {
        form.get('duration')!.setValue(_sessionType.duration);
        const startTime = this.form()?.get('startTime')?.value;
        const startTimeDate = this.conferenceService.timeStringToDate(startTime).getTime();
        const endTimeDate = new Date(startTimeDate + _sessionType.duration * 60000);
        form.get('endTime')!.setValue(this.conferenceService.formatHour(endTimeDate));
      }
    }    
  }
  onRoomChanged() {
    this.currentSlot.set(this.computeCurrentSlot());
  }
}

