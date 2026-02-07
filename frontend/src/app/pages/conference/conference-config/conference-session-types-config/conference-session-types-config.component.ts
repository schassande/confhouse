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
import { Conference, SessionType } from '../../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConferenceService } from '../../../../services/conference.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';

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
    CardModule,
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
  private readonly formValueTrigger = signal<number>(0);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
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
  }

  onEdit(sessionType: SessionType) {
    this.editingId.set(sessionType.id);
    this.createNewForm(sessionType);
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
}

