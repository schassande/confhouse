import { Component, input, ChangeDetectionStrategy, ChangeDetectorRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, SessionType, Room } from '../../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ConferenceService } from '../../../../services/conference.service';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToggleButtonModule } from 'primeng/togglebutton';

@Component({
  selector: 'app-conference-rooms-config',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    ToggleButtonModule,
    ToastModule,
    CardModule,    
  ],
  templateUrl: './conference-rooms-config.component.html',
  styleUrls: ['./conference-rooms-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceRoomsConfigComponent {
  readonly conference = input.required<Conference>();

  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly rooms = signal<Room[]>([]);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly editingId = signal<string | null>(null);
  private readonly formValueTrigger = signal<number>(0);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly currentRooms = computed(() => {
    this.formValueTrigger();
    return this.rooms();
  });

  ngOnInit() {
    this.initializeRooms();
  }

  private initializeRooms() {
    const conf = this.conference();
    this.rooms.set(conf.rooms || []);
  }

  createNewForm(room?: Room) {
    const defaultLanguage = this.translateService.getCurrentLang() || 'EN';
    const formGroup = this.fb.group({
      name: [room?.name || '', [Validators.required, Validators.minLength(2)]],
      capacity: [room?.capacity || 0, []],
      plan: [room?.plan || '', []]
    });
    this.form.set(formGroup);
  }

  onAddNew() {
    this.editingId.set(null);
    this.createNewForm();
  }

  onEdit(room: Room) {
    this.editingId.set(room.id);
    this.createNewForm(room);
  }

  onCancel() {
    this.form.set(null);
    this.editingId.set(null);
  }

  onDelete(room: Room) {
    if (confirm(this.translateService.instant('CONFERENCE.CONFIG.ROOMS.CONFIRM_DELETE'))) {
      const updatedRooms = this.rooms().filter((t) => t.id !== room.id);
      const updatedConference: Conference = {
        ...this.conference(),
        rooms: updatedRooms,
      };

      this.conferenceService.save(updatedConference).subscribe({
        next: () => {
          this.rooms.set(updatedRooms);
          this.formValueTrigger.update((v) => v + 1);
          this.cdr.markForCheck();
          this.messageService.add({
            severity: 'success',
            summary: this.translateService.instant('COMMON.SUCCESS'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.ROOMS.TRACK_DELETED'),
          });
        },
        error: (err) => {
          console.error('Error deleting room:', err);
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('COMMON.ERROR'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.ROOMS.TRACK_DELETE_ERROR'),
          });
        },
      });
    }
  }
  onSave() {
    const currentForm = this.currentForm();
    if (!currentForm || currentForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const formValue = currentForm.value;
    const editId = this.editingId();

    let updatedRooms: Room[];

    if (editId) {
      // Update existing
      updatedRooms = this.rooms().map((st) =>
        st.id === editId
          ? {
              ...st,
              ...formValue,
              plan: st.plan, 
              capacity: st.capacity, 
            }
          : st
      );
    } else {
      // Add new
      const newRoom: Room = {
        id: `st_${Date.now()}`,
        ...formValue,
        plan: formValue.plan || '',
        capacity: formValue.capacity || 0,
      };
      updatedRooms = [...this.rooms(), newRoom];
    }

    const updatedConference: Conference = {
      ...this.conference(),
      rooms: updatedRooms,
    };

    this.conferenceService.save(updatedConference).subscribe({
      next: () => {
        this.rooms.set(updatedRooms);
        this.formValueTrigger.update((v) => v + 1);
        this.form.set(null);
        this.editingId.set(null);
        this.cdr.markForCheck();
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.SAVED'),
        });
      },
      error: (err) => {
        console.error('Error saving room:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }
}
