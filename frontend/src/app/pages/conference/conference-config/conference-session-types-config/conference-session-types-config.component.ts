import {
  ChangeDetectionStrategy,
  Component,
  input,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Conference, SessionType } from '@shared/model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConferenceService } from '../../../../services/conference.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-conference-session-types-config',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    ToggleButtonModule,
    ToastModule,
    DataViewModule,
    DialogModule,
  ],
  providers: [MessageService],
  templateUrl: './conference-session-types-config.component.html',
  styleUrls: ['./conference-session-types-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceSessionTypesConfigComponent implements OnInit {
  readonly conference = input.required<Conference>();

  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly sessionTypes = signal<SessionType[]>([]);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly dialogVisible = signal(false);
  private readonly formValueTrigger = signal<number>(0);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly currentEditingSessionType = computed(() => {
    const id = this.editingId();
    if (!id) {
      return undefined;
    }
    return this.sessionTypes().find((st) => st.id === id);
  });
  protected readonly currentSessionTypes = computed(() => {
    this.formValueTrigger();
    return this.sessionTypes();
  });

  ngOnInit() {
    this.initializeSessionTypes();
  }

  private initializeSessionTypes() {
    const conf = this.conference();
    this.sessionTypes.set(conf.sessionTypes || []);
  }

  createNewForm(sessionType?: SessionType) {
    const defaultLanguage = this.translateService.getCurrentLang() || 'EN';
    const formGroup = this.fb.group({
      name: [sessionType?.name || '', [Validators.required, Validators.minLength(2)]],
      duration: [sessionType?.duration || 60, [Validators.required, Validators.min(5), Validators.max(480)]],
      icon: [sessionType?.icon || '', []],
      color: [sessionType?.color || '#3498db', []],
      visible: [sessionType?.visible ?? true, []],
      maxSpeakers: [sessionType?.maxSpeakers || 1, [Validators.required, Validators.min(1), Validators.max(20)]],
      description_en: [sessionType?.description?.['EN'] || '', []],
      description_fr: [sessionType?.description?.['FR'] || '', []],
    });
    this.form.set(formGroup);
  }

  onAddNew() {
    this.editingId.set(null);
    this.createNewForm();
    this.dialogVisible.set(true);
  }

  onEdit(sessionType: SessionType) {
    this.editingId.set(sessionType.id);
    this.createNewForm(sessionType);
    this.dialogVisible.set(true);
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

    let updatedSessionTypes: SessionType[];

    if (editId) {
      // Update existing
      updatedSessionTypes = this.sessionTypes().map((st) =>
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
      const newSessionType: SessionType = {
        id: `st_${Date.now()}`,
        ...formValue,
        description: { 
            en: formValue.description_en || '',
            fr: formValue.description_fr || ''
         },
      };
      updatedSessionTypes = [...this.sessionTypes(), newSessionType];
    }

    const updatedConference: Conference = {
      ...this.conference(),
      sessionTypes: updatedSessionTypes,
    };

    this.conferenceService.save(updatedConference).subscribe({
      next: () => {
        this.sessionTypes.set(updatedSessionTypes);
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
        console.error('Error saving session type:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

  onCancel() {
    this.dialogVisible.set(false);
    this.form.set(null);
    this.editingId.set(null);
  }

  onDelete(sessionType: SessionType) {
    if (confirm(this.translateService.instant('CONFERENCE.CONFIG.CONFIRM_DELETE_SESSION_TYPE'))) {
      const updatedSessionTypes = this.sessionTypes().filter((st) => st.id !== sessionType.id);

      const updatedConference: Conference = {
        ...this.conference(),
        sessionTypes: updatedSessionTypes,
      };

      this.conferenceService.save(updatedConference).subscribe({
        next: () => {
          this.sessionTypes.set(updatedSessionTypes);
          this.formValueTrigger.update((v) => v + 1);
          this.form.set(null);
          this.editingId.set(null);
          this.dialogVisible.set(false);
          this.cdr.markForCheck();
          this.messageService.add({
            severity: 'success',
            summary: this.translateService.instant('COMMON.SUCCESS'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.SESSION_TYPE_DELETED'),
          });
        },
        error: (err) => {
          console.error('Error deleting session type:', err);
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('COMMON.ERROR'),
            detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
          });
        },
      });
    }
  }

  onSessionTypeClick(sessionType: SessionType) {
    this.onEdit(sessionType);
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



