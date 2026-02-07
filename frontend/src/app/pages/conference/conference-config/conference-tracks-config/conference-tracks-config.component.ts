import { Component, input, ChangeDetectionStrategy, ChangeDetectorRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, SessionType, Track } from '../../../../model/conference.model';
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
  selector: 'app-conference-tracks-config',
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
  templateUrl: './conference-tracks-config.component.html',
  styleUrls: ['./conference-tracks-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceTracksConfigComponent {
readonly conference = input.required<Conference>();

  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly tracks = signal<Track[]>([]);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly editingId = signal<string | null>(null);
  private readonly formValueTrigger = signal<number>(0);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly currentTracks = computed(() => {
    this.formValueTrigger();
    return this.tracks();
  });

  ngOnInit() {
    this.initializeTracks();
  }

  private initializeTracks() {
    const conf = this.conference();
    this.tracks.set(conf.tracks || []);
  }

  createNewForm(track?: Track) {
    const defaultLanguage = this.translateService.getCurrentLang() || 'EN';
    const formGroup = this.fb.group({
      name: [track?.name || '', [Validators.required, Validators.minLength(2)]],
      icon: [track?.icon || '', []],
      color: [track?.color || '#3498db', []],
      description: [track?.description?.[defaultLanguage] || '', []],
    });
    this.form.set(formGroup);
  }

  onAddNew() {
    this.editingId.set(null);
    this.createNewForm();
  }

  onEdit(track: Track) {
    this.editingId.set(track.id);
    this.createNewForm(track);
  }

  onCancel() {
    this.form.set(null);
    this.editingId.set(null);
  }

  onDelete(track: Track) {
    if (confirm(this.translateService.instant('CONFERENCE.CONFIG.TRACKS.CONFIRM_DELETE'))) {
      const updatedTracks = this.tracks().filter((t) => t.id !== track.id);
      const updatedConference: Conference = {
        ...this.conference(),
        tracks: updatedTracks,
      };

      this.conferenceService.save(updatedConference).subscribe({
        next: () => {
          this.tracks.set(updatedTracks);
          this.formValueTrigger.update((v) => v + 1);
          this.cdr.markForCheck();
          this.messageService.add({
            severity: 'success',
            summary: this.translateService.instant('COMMON.SUCCESS'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.TRACKS.TRACK_DELETED'),
          });
        },
        error: (err) => {
          console.error('Error deleting track:', err);
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('COMMON.ERROR'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.TRACKS.TRACK_DELETE_ERROR'),
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

    let updatedTracks: Track[];

    if (editId) {
      // Update existing
      updatedTracks = this.tracks().map((st) =>
        st.id === editId
          ? {
              ...st,
              ...formValue,
              description: { ...st.description, 
                en: formValue.description_en || st.description?.['EN'] || '', 
                fr: formValue.description_fr || st.description?.['FR'] || '' 
              },
            }
          : st
      );
    } else {
      // Add new
      const newTrack: Track = {
        id: `st_${Date.now()}`,
        ...formValue,
        description: { 
            en: formValue.description_en || '',
            fr: formValue.description_fr || ''
         },
      };
      updatedTracks = [...this.tracks(), newTrack];
    }

    const updatedConference: Conference = {
      ...this.conference(),
      tracks: updatedTracks,
    };

    this.conferenceService.save(updatedConference).subscribe({
      next: () => {
        this.tracks.set(updatedTracks);
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
        console.error('Error saving track:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

}
