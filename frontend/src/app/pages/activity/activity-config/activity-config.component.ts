import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { Activity, ActivityAttribute, AttributeType, ParticipantType } from '../../../model/activity.model';
import { Conference } from '../../../model/conference.model';
import { ActivityService } from '../../../services/activity.service';
import { ConferenceService } from '../../../services/conference.service';
import { take } from 'rxjs';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-activity-config',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    DataViewModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule,
    SelectModule,
    MultiSelectModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './activity-config.component.html',
  styleUrl: './activity-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityConfigComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly activityService = inject(ActivityService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly loading = signal(true);

  protected readonly activities = signal<Activity[]>([]);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly dialogVisible = signal(false);

  protected readonly isEditing = computed(() => this.editingId() !== null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly currentActivities = computed(() =>
    [...this.activities()].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
  );
  protected readonly currentEditingActivity = computed(() => {
    const id = this.editingId();
    if (!id) {
      return undefined;
    }
    return this.activities().find((activity) => activity.id === id);
  });
  protected readonly participantTypeOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.SPEAKER'), value: 'SPEAKER' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.ATTENDEE'), value: 'ATTENDEE' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.SPONSOR'), value: 'SPONSOR' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.ORGANIZER'), value: 'ORGANIZER' },
  ]);
  protected readonly attributeTypeOptions: SelectOption[] = [
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.ATTRIBUTE_TYPE_TEXT'), value: 'TEXT' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.ATTRIBUTE_TYPE_INTEGER'), value: 'INTEGER' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.ATTRIBUTE_TYPE_LIST'), value: 'LIST' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.ATTRIBUTE_TYPE_DATE'), value: 'DATE' },
    { label: this.translateService.instant('CONFERENCE.ACTIVITIES.ATTRIBUTE_TYPE_BOOLEAN'), value: 'BOOLEAN' },
  ];

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
      next: (conference) => {
        this.conference.set(conference);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading conference:', error);
      },
    });

    this.activityService.byConferenceId(conferenceId).pipe(take(1)).subscribe({
      next: (activities) => {
        this.activities.set(activities ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading activities:', error);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onAddNew(): void {
    this.editingId.set(null);
    this.createForm();
    this.dialogVisible.set(true);
  }

  onEdit(activity: Activity): void {
    this.editingId.set(activity.id);
    this.createForm(activity);
    this.dialogVisible.set(true);
  }

  onCancel(): void {
    this.dialogVisible.set(false);
    this.form.set(null);
    this.editingId.set(null);
  }

  onDialogHide(): void {
    this.onCancel();
  }

  onActivityClick(activity: Activity): void {
    this.onEdit(activity);
  }

  onDelete(activity: Activity): void {
    if (!confirm(this.translateService.instant('CONFERENCE.ACTIVITIES.CONFIRM_DELETE'))) {
      return;
    }

    this.activityService.delete(activity.id).then(() => {
      this.activities.set(this.activities().filter((item) => item.id !== activity.id));
      this.onCancel();
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.ACTIVITIES.ACTIVITY_DELETED'),
      });
      this.cdr.markForCheck();
    }).catch((error) => {
      console.error('Error deleting activity:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.ACTIVITIES.ACTIVITY_DELETE_ERROR'),
      });
    });
  }

  onSave(): void {
    const currentForm = this.currentForm();
    if (!currentForm || currentForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const startIso = this.fromDateTimeInput(String(currentForm.value.start ?? ''));
    const endIso = this.fromDateTimeInput(String(currentForm.value.end ?? ''));
    if (!startIso || !endIso || new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.ACTIVITIES.INVALID_DATES'),
      });
      return;
    }

    const selectedParticipantTypes = (currentForm.value.participantTypes ?? []) as ParticipantType[];
    const normalizedParticipantTypes = Array.from(
      new Set(selectedParticipantTypes.map((value) => String(value ?? '').trim()).filter((value) => !!value))
    ) as ParticipantType[];

    const totalLimit = Number(currentForm.value.limitedTotal ?? 0);
    const perTypeLimits = {
      SPEAKER: Number(currentForm.value.limitSpeaker ?? 0),
      ATTENDEE: Number(currentForm.value.limitAttendee ?? 0),
      SPONSOR: Number(currentForm.value.limitSponsor ?? 0),
      ORGANIZER: Number(currentForm.value.limitOrganizer ?? 0),
    };

    const specificAttributes = this.extractSpecificAttributes(currentForm);
    const editId = this.editingId();
    const previous = this.currentEditingActivity();

    const payload: Activity = {
      id: editId ?? '',
      lastUpdated: previous?.lastUpdated ?? '',
      conferenceId: this.conferenceId(),
      name: String(currentForm.value.name ?? '').trim(),
      start: startIso,
      end: endIso,
      description: {
        EN: String(currentForm.value.description_en ?? '').trim(),
        FR: String(currentForm.value.description_fr ?? '').trim(),
      },
      participantTypes: normalizedParticipantTypes,
      limitedParticipationNumber: {
        total: Number.isFinite(totalLimit) ? Math.max(0, totalLimit) : 0,
        perParticipantType: Object.fromEntries(
          Object.entries(perTypeLimits)
            .filter(([, value]) => Number.isFinite(value) && value > 0)
            .map(([key, value]) => [key, Math.max(0, value)])
        ),
      },
      specificAttributes,
    };

    this.activityService.save(payload).subscribe({
      next: (saved) => {
        const hasExisting = this.activities().some((item) => item.id === saved.id);
        this.activities.set(
          hasExisting
            ? this.activities().map((item) => (item.id === saved.id ? saved : item))
            : [...this.activities(), saved]
        );
        this.onCancel();
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.SAVED'),
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error saving activity:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

  addAttribute(): void {
    const currentForm = this.currentForm();
    if (!currentForm) {
      return;
    }
    this.attributesArray(currentForm).push(this.createAttributeGroup());
  }

  removeAttribute(index: number): void {
    const currentForm = this.currentForm();
    if (!currentForm) {
      return;
    }
    this.attributesArray(currentForm).removeAt(index);
  }

  attributeControls(): FormGroup[] {
    const currentForm = this.currentForm();
    if (!currentForm) {
      return [];
    }
    return this.attributesArray(currentForm).controls as FormGroup[];
  }

  shouldShowNumberRange(attributeControl: FormGroup): boolean {
    return String(attributeControl.value.attributeType ?? '').trim() === 'INTEGER';
  }

  shouldShowAllowedValues(attributeControl: FormGroup): boolean {
    return String(attributeControl.value.attributeType ?? '').trim() === 'LIST';
  }

  formatActivityDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const lang = (this.translateService.currentLang || this.translateService.getDefaultLang() || 'en').toLowerCase();
    return new Intl.DateTimeFormat(lang, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  activityDescription(activity: Activity): string {
    const lang = (this.translateService.currentLang || this.translateService.getDefaultLang() || 'en').toUpperCase();
    const normalizedDescription = activity.description ?? {};
    return String(
      normalizedDescription[lang]
      ?? normalizedDescription['EN']
      ?? normalizedDescription['FR']
      ?? normalizedDescription['en']
      ?? normalizedDescription['fr']
      ?? ''
    ).trim();
  }

  participantTypeLabel(type: string): string {
    return this.translateService.instant(`CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.${type}`);
  }

  private createForm(activity?: Activity): void {
    const formGroup = this.fb.group({
      name: [activity?.name ?? '', [Validators.required, Validators.minLength(2)]],
      start: [this.toDateTimeInput(activity?.start), [Validators.required]],
      end: [this.toDateTimeInput(activity?.end), [Validators.required]],
      description_en: [activity?.description?.['EN'] ?? activity?.description?.['en'] ?? '', []],
      description_fr: [activity?.description?.['FR'] ?? activity?.description?.['fr'] ?? '', []],
      participantTypes: [activity?.participantTypes ?? [], []],
      limitedTotal: [activity?.limitedParticipationNumber?.total ?? 0, [Validators.min(0)]],
      limitSpeaker: [activity?.limitedParticipationNumber?.perParticipantType?.['SPEAKER'] ?? 0, [Validators.min(0)]],
      limitAttendee: [activity?.limitedParticipationNumber?.perParticipantType?.['ATTENDEE'] ?? 0, [Validators.min(0)]],
      limitSponsor: [activity?.limitedParticipationNumber?.perParticipantType?.['SPONSOR'] ?? 0, [Validators.min(0)]],
      limitOrganizer: [activity?.limitedParticipationNumber?.perParticipantType?.['ORGANIZER'] ?? 0, [Validators.min(0)]],
      specificAttributes: this.fb.array(
        (activity?.specificAttributes ?? []).map((attribute) => this.createAttributeGroup(attribute))
      ),
    });
    this.form.set(formGroup);
  }

  private createAttributeGroup(attribute?: ActivityAttribute): FormGroup {
    const normalizedType = this.normalizeAttributeType(attribute?.attributeType);
    return this.fb.group({
      attributeName: [attribute?.attributeName ?? '', [Validators.required, Validators.minLength(2)]],
      attributeType: [normalizedType, [Validators.required]],
      attributeRequired: [Boolean(attribute?.attributeRequired), []],
      attributeAllowedValuesText: [this.serializeAllowedValues(attribute?.attributeAllowedValues), []],
      attributeMinValue: [attribute?.attributeMinValue ?? null, []],
      attributeMaxValue: [attribute?.attributeMaxValue ?? null, []],
    });
  }

  private attributesArray(formGroup: FormGroup): FormArray {
    return formGroup.get('specificAttributes') as FormArray;
  }

  private extractSpecificAttributes(formGroup: FormGroup): ActivityAttribute[] {
    const attributes = this.attributesArray(formGroup).value as Array<ActivityAttribute & { attributeAllowedValuesText?: string }>;
    return attributes
      .map((attribute) => {
        const type = this.normalizeAttributeType(attribute.attributeType);
        const min = Number(attribute.attributeMinValue);
        const max = Number(attribute.attributeMaxValue);
        const allowedValues = this.parseAllowedValues(attribute.attributeAllowedValuesText);
        const normalized: ActivityAttribute = {
          attributeName: String(attribute.attributeName ?? '').trim(),
          attributeType: type,
          attributeRequired: Boolean(attribute.attributeRequired),
        };
        if (type === 'LIST' && allowedValues.length > 0) {
          normalized.attributeAllowedValues = allowedValues;
        }
        if (type === 'INTEGER' && Number.isFinite(min)) {
          normalized.attributeMinValue = min;
        }
        if (type === 'INTEGER' && Number.isFinite(max)) {
          normalized.attributeMaxValue = max;
        }
        return normalized;
      })
      .filter((attribute) => attribute.attributeName.length > 0);
  }

  private normalizeAttributeType(type: ActivityAttribute['attributeType'] | string | undefined): AttributeType {
    const normalized = String(type ?? '').trim().toUpperCase();
    if (normalized === 'INTEGER' || normalized === 'LIST' || normalized === 'DATE' || normalized === 'BOOLEAN' || normalized === 'TEXT') {
      return normalized;
    }
    // Backward compatibility with previous values.
    if (normalized === 'NUMBER') {
      return 'INTEGER';
    }
    if (normalized === 'STRING') {
      return 'TEXT';
    }
    return 'TEXT';
  }

  private serializeAllowedValues(values: string[] | undefined): string {
    if (!Array.isArray(values) || values.length === 0) {
      return '';
    }
    return values.join('\n');
  }

  private parseAllowedValues(raw: string | undefined): string[] {
    return String(raw ?? '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private toDateTimeInput(value: string | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      const normalized = String(value).trim();
      return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
    }
    const pad = (input: number) => String(input).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private fromDateTimeInput(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return normalized;
    }
    return date.toISOString();
  }
}
