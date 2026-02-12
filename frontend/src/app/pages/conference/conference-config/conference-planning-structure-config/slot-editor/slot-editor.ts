import { Component, EventEmitter, Output, signal, model, computed, input, inject, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Room, SessionType, Slot } from '../../../../../model/conference.model';
import { SlotType } from '../../../../../model/slot-type.model';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { ConferenceService } from '../../../../../services/conference.service';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-slot-editor',
  standalone: true,
  imports: [
    ButtonModule,
    CommonModule, 
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    ReactiveFormsModule,
    SelectModule,
    TranslateModule
  ],
  templateUrl: './slot-editor.html',
  styleUrls: ['./slot-editor.scss']
})
export class SlotEditorComponent implements OnInit {
  slot = model.required<Slot>();
  rooms = input.required<Room[]>();
  slotTypes = input.required<SlotType[]>();
  sessionTypes = input.required<SessionType[]>();
  minTime = input.required<string>();
  maxTime = input.required<string>();
  
  save = output<Slot>();
  cancel = output<void>();

  slotEditorVisible = signal(false);

  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly currentForm = computed(() => this.form());
  private readonly translateService = inject(TranslateService);
  protected readonly defaultLanguage = signal<string>('EN');
  protected readonly minDate = computed(() => this.conferenceService.timeStringToDate(this.minTime()));
  protected readonly maxDate = computed(() => this.conferenceService.timeStringToDate(this.maxTime()));
  protected readonly slotType = signal<SlotType|undefined>(undefined);

  ngOnInit() {
    this.translateService.onLangChange.subscribe(ev => this.defaultLanguage.set(ev.lang.toLocaleUpperCase()));
    this.initializeForm();
  }

  private initializeForm() {
    const slot = this.slot()!;
    const formGroup = this.fb.group({
      startTime: [slot?.startTime || '', [Validators.required]],
      endTime: [slot?.endTime || '', [Validators.required]],
      duration: [slot?.duration || 30, [Validators.required, Validators.min(1)]],
      roomId: [slot?.roomId || '', []],
      slotTypeId: [slot?.slotTypeId || '', []],
      sessionTypeId: [slot?.sessionTypeId || '', []]
    });
    this.computeSessionTypeEnabled(slot.slotTypeId);
    this.form.set(formGroup);
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
        newEndTime = this.maxTime();

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
      this.slot.update(s => {
        s.startTime = this.form()?.get('startTime')?.value;
        s.duration = this.form()?.get('duration')?.value;
        s.endTime = this.form()?.get('endTime')?.value;
        return s;
      });
    }
  }
  onCancel() {
    this.cancel.emit();
  }

  onSave() {
    const saved: Slot = {
      ...this.form()!.value, 
      id: this.slot().id
    };
    this.slot.set(saved);
    this.save.emit(saved);
  }
  onSlotTypeChanged() {
    this.computeSessionTypeEnabled(this.form()?.get('slotTypeId')?.value);
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
      } else {
        form.get('sessionTypeId')?.disable();
      }
    }
  }
}
