import { Component, input, ChangeDetectionStrategy, ChangeDetectorRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, SessionType, Track } from '@shared/model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ConferenceService } from '../../../../services/conference.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-conference-tracks-config',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    DataViewModule,
    DialogModule,
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
  protected readonly dialogVisible = signal(false);
  private readonly formValueTrigger = signal<number>(0);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly currentEditingTrack = computed(() => {
    const id = this.editingId();
    if (!id) {
      return undefined;
    }
    return this.tracks().find((track) => track.id === id);
  });
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
      description_en: [track?.description?.['EN'] || '', []],
      description_fr: [track?.description?.['FR'] || '', []],
    });
    this.form.set(formGroup);
  }

  onAddNew() {
    this.editingId.set(null);
    this.createNewForm();
    this.dialogVisible.set(true);
  }

  onEdit(track: Track) {
    this.editingId.set(track.id);
    this.createNewForm(track);
    this.dialogVisible.set(true);
  }

  onCancel() {
    this.dialogVisible.set(false);
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
          this.form.set(null);
          this.editingId.set(null);
          this.dialogVisible.set(false);
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
        this.dialogVisible.set(false);
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

  onTrackClick(track: Track) {
    this.onEdit(track);
  }

  onDialogHide() {
    this.onCancel();
  }

  computeTextColorForBackground(backgroundColor: string): string {
    const normalized = backgroundColor.trim();
    const shortHexMatch = normalized.match(/^#([0-9a-fA-F]{3})$/);
    const fullHexMatch = normalized.match(/^#([0-9a-fA-F]{6})$/);

    let r = 0;
    let g = 0;
    let b = 0;

    if (shortHexMatch) {
      const hex = shortHexMatch[1];
      r = parseInt(`${hex[0]}${hex[0]}`, 16);
      g = parseInt(`${hex[1]}${hex[1]}`, 16);
      b = parseInt(`${hex[2]}${hex[2]}`, 16);
    } else if (fullHexMatch) {
      const hex = fullHexMatch[1];
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else {
      return '#FFFFFF';
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111827' : '#FFFFFF';
  }
}


