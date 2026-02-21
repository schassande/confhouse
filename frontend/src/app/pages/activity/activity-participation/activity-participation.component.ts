import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { firstValueFrom, take } from 'rxjs';
import { Activity, ActivityAttribute, ActivityParticipation, ParticipantType } from '../../../model/activity.model';
import { Conference } from '../../../model/conference.model';
import { Person } from '../../../model/person.model';
import { ActivityParticipationService } from '../../../services/activity-participation.service';
import { ActivityService } from '../../../services/activity.service';
import { ConferenceService } from '../../../services/conference.service';
import { PersonService } from '../../../services/person.service';
import { UserSignService } from '../../../services/usersign.service';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-activity-participation',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    CardModule,
    DataViewModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    CheckboxModule,
    DatePickerModule,
    ToastModule,
    DialogModule,
    TagModule,
  ],
  providers: [MessageService],
  templateUrl: './activity-participation.component.html',
  styleUrl: './activity-participation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityParticipationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly activityService = inject(ActivityService);
  private readonly activityParticipationService = inject(ActivityParticipationService);
  private readonly personService = inject(PersonService);
  private readonly userSignService = inject(UserSignService);
  private readonly translateService = inject(TranslateService);
  private readonly messageService = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly activityId = computed(() => this.route.snapshot.paramMap.get('activityId') ?? '');
  readonly loading = signal(true);

  readonly conference = signal<Conference | undefined>(undefined);
  readonly activity = signal<Activity | undefined>(undefined);
  readonly activities = signal<Activity[]>([]);
  readonly currentUserPerson = signal<Person | null>(null);
  readonly targetPerson = signal<Person | null>(null);
  readonly targetParticipation = signal<ActivityParticipation | null>(null);
  readonly registeredActivityIds = signal<Set<string>>(new Set());
  readonly form = signal<FormGroup | null>(null);

  readonly selectingOtherPerson = signal(false);
  readonly searchEmail = signal('');
  readonly creationDialogVisible = signal(false);
  readonly createPersonForm = this.fb.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
  });

  readonly isOrganizer = computed(() => {
    const person = this.currentUserPerson();
    const conference = this.conference();
    const email = String(person?.email ?? '').trim();
    return !!email && !!conference && (conference.organizerEmails ?? []).includes(email);
  });

  readonly userRoles = computed<ParticipantType[]>(() => {
    const person = this.currentUserPerson();
    const conference = this.conference();
    const roles = new Set<ParticipantType>(['ATTENDEE']);
    if (person?.isSpeaker) {
      roles.add('SPEAKER');
    }
    if (conference && person?.email && conference.organizerEmails.includes(person.email)) {
      roles.add('ORGANIZER');
    }
    return Array.from(roles.values());
  });

  readonly canCurrentUserParticipate = computed(() => {
    const activity = this.activity();
    if (!activity) {
      return false;
    }
    if (this.isOrganizer()) {
      return true;
    }
    const allowed = new Set(activity.participantTypes ?? []);
    const userRoles = this.userRoles();
    return userRoles.some((role) => allowed.has(role));
  });

  readonly visibleActivitiesForCurrentUser = computed(() => {
    const allActivities = this.activities();
    const userRoles = new Set(this.userRoles());
    return allActivities
      .filter((activity) => {
        const types = activity.participantTypes ?? [];
        if (types.length === 0) {
          return true;
        }
        if (types.every((type) => type === 'ORGANIZER')) {
          return false;
        }
        return types.some((type) => userRoles.has(type));
      })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  });

  readonly activityTypeLabel = (type: ParticipantType) =>
    this.translateService.instant(`CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.${type}`);

  readonly participantTypeOptions = computed<SelectOption[]>(() => {
    const activity = this.activity();
    const allowed = (activity?.participantTypes?.length ? activity.participantTypes : ['SPEAKER', 'ATTENDEE', 'SPONSOR', 'ORGANIZER']) as ParticipantType[];
    return allowed.map((value) => ({
      label: this.translateService.instant(`CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.${value}`),
      value,
    }));
  });

  isRegistered(activityId: string): boolean {
    return this.registeredActivityIds().has(activityId);
  }

  openActivity(activityId: string): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'activities', activityId, 'participation']);
  }

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    const currentPerson = this.userSignService.getCurrentPerson();
    this.currentUserPerson.set(currentPerson);

    if (!conferenceId || !currentPerson) {
      this.loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
      next: (conference) => {
        this.conference.set(conference);
        this.cdr.markForCheck();
      },
      error: (error) => console.error('Error loading conference:', error),
    });

    this.activityService.byConferenceId(conferenceId).pipe(take(1)).subscribe({
      next: (activities) => {
        this.activities.set(activities ?? []);
        this.loadCurrentUserRegistrations();
        const activityId = this.activityId();
        if (!activityId) {
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }
        const selected = (activities ?? []).find((candidate) => candidate.id === activityId);
        if (!selected) {
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }
        this.activity.set(selected);
        void this.initializeTargetPerson(selected, currentPerson);
      },
      error: (error) => {
        console.error('Error loading activities:', error);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private async initializeTargetPerson(activity: Activity, currentPerson: Person): Promise<void> {
    const requestedPersonId = String(this.route.snapshot.queryParamMap.get('personId') ?? '').trim();
    if (!requestedPersonId || requestedPersonId === currentPerson.id) {
      this.selectingOtherPerson.set(false);
      this.targetPerson.set(currentPerson);
      this.buildParticipationForm(activity);
      await this.loadParticipationForTarget();
      return;
    }

    this.selectingOtherPerson.set(true);
    try {
      const person = await firstValueFrom(this.personService.byId(requestedPersonId).pipe(take(1)));
      if (person) {
        this.targetPerson.set(person);
        this.searchEmail.set(String(person.email ?? '').trim());
      } else {
        this.targetPerson.set(currentPerson);
        this.selectingOtherPerson.set(false);
      }
    } catch {
      this.targetPerson.set(currentPerson);
      this.selectingOtherPerson.set(false);
    }

    this.buildParticipationForm(activity);
    await this.loadParticipationForTarget();
  }

  onSearchEmailChange(value: string): void {
    this.searchEmail.set(value);
  }

  onToggleOtherPerson(value: boolean): void {
    this.selectingOtherPerson.set(!!value);
    const currentPerson = this.currentUserPerson();
    if (!value && currentPerson) {
      this.targetPerson.set(currentPerson);
      void this.loadParticipationForTarget();
    } else {
      this.targetPerson.set(null);
      this.targetParticipation.set(null);
    }
  }

  async searchPersonByEmail(): Promise<void> {
    const email = String(this.searchEmail() ?? '').trim().toLowerCase();
    if (!email) {
      return;
    }

    const found = await firstValueFrom(this.personService.findByEmail(email).pipe(take(1)));
    if (found) {
      this.targetPerson.set(found);
      this.creationDialogVisible.set(false);
      await this.loadParticipationForTarget();
      return;
    }

    this.createPersonForm.patchValue({ email, firstName: '', lastName: '' });
    this.creationDialogVisible.set(true);
  }

  async createPersonWithoutAccount(): Promise<void> {
    if (this.createPersonForm.invalid) {
      this.createPersonForm.markAllAsTouched();
      return;
    }

    const value = this.createPersonForm.value;
    const email = String(value.email ?? '').trim().toLowerCase();
    const existing = await firstValueFrom(this.personService.findByEmail(email).pipe(take(1)));
    if (existing) {
      this.targetPerson.set(existing);
      this.creationDialogVisible.set(false);
      await this.loadParticipationForTarget();
      return;
    }

    const personPayload: Person = {
      id: '',
      lastUpdated: '',
      firstName: String(value.firstName ?? '').trim(),
      lastName: String(value.lastName ?? '').trim(),
      email,
      hasAccount: false,
      isPlatformAdmin: false,
      isSpeaker: false,
      preferredLanguage: 'en',
      search: '',
    };

    this.personService.createViaFunction(personPayload).pipe(take(1)).subscribe({
      next: async (created) => {
        this.targetPerson.set(created);
        this.creationDialogVisible.set(false);
        await this.loadParticipationForTarget();
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.PERSON_CREATED'),
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error creating person:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.PERSON_CREATE_ERROR'),
        });
      },
    });
  }

  onCancelPersonDialog(): void {
    this.creationDialogVisible.set(false);
  }

  async saveParticipation(): Promise<void> {
    const activity = this.activity();
    const targetPerson = this.targetPerson();
    const form = this.form();
    if (!activity || !targetPerson || !form) {
      return;
    }
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    if (!this.canCurrentUserParticipate() && !this.isOrganizer()) {
      return;
    }

    const attributes = (activity.specificAttributes ?? []).map((attribute, index) => {
      const controlName = this.controlName(index);
      const rawValue = form.get(controlName)?.value;
      return {
        name: attribute.attributeName,
        value: this.serializeAttributeValue(attribute, rawValue),
      };
    });

    const previous = this.targetParticipation();
    const participantTypeControl = form.get('participantType');
    const selectedParticipantType = String(participantTypeControl?.value ?? '').trim() as ParticipantType;
    if (!selectedParticipantType) {
      participantTypeControl?.markAsTouched();
      return;
    }
    const payload: ActivityParticipation = {
      id: previous?.id ?? '',
      lastUpdated: previous?.lastUpdated ?? '',
      conferenceId: this.conferenceId() || activity.conferenceId,
      activityId: activity.id,
      personId: targetPerson.id,
      participantType: selectedParticipantType,
      attributes,
    };
    console.log('Saving participation with payload:', payload);
    this.activityParticipationService.save(payload).pipe(take(1)).subscribe({
      next: (saved) => {
        this.targetParticipation.set(saved);
        this.registeredActivityIds.update((current) => {
          const next = new Set(current);
          next.add(saved.activityId);
          return next;
        });
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.SAVE_SUCCESS'),
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error saving participation:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.SAVE_ERROR'),
        });
      },
    });
  }

  deleteParticipation(): void {
    const target = this.targetParticipation();
    if (!target) {
      return;
    }
    this.activityParticipationService.delete(target.id).then(() => {
      this.registeredActivityIds.update((current) => {
        const next = new Set(current);
        next.delete(target.activityId);
        return next;
      });
      this.targetParticipation.set(null);
      const activity = this.activity();
      if (activity) {
        this.buildParticipationForm(activity);
      }
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.DELETE_SUCCESS'),
      });
      this.cdr.markForCheck();
    }).catch((error) => {
      console.error('Error deleting participation:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.DELETE_ERROR'),
      });
    });
  }

  listOptions(attribute: ActivityAttribute): SelectOption[] {
    return (attribute.attributeAllowedValues ?? []).map((value) => ({ label: value, value }));
  }

  isInteger(attribute: ActivityAttribute): boolean {
    return attribute.attributeType === 'INTEGER';
  }

  isText(attribute: ActivityAttribute): boolean {
    return attribute.attributeType === 'TEXT';
  }

  isList(attribute: ActivityAttribute): boolean {
    return attribute.attributeType === 'LIST';
  }

  isBoolean(attribute: ActivityAttribute): boolean {
    return attribute.attributeType === 'BOOLEAN';
  }

  isDate(attribute: ActivityAttribute): boolean {
    return attribute.attributeType === 'DATE';
  }

  controlName(index: number): string {
    return `attr_${index}`;
  }

  private async loadParticipationForTarget(): Promise<void> {
    const activity = this.activity();
    const targetPerson = this.targetPerson();
    if (!activity || !targetPerson) {
      this.loading.set(false);
      this.cdr.markForCheck();
      return;
    }
    this.activityParticipationService.byActivityAndPersonId(this.conferenceId(), activity.id, targetPerson.id).pipe(take(1)).subscribe({
      next: (participation) => {
        this.targetParticipation.set(participation ?? null);
        this.patchFormFromParticipation(participation ?? null);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading participation:', error);
        this.targetParticipation.set(null);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadCurrentUserRegistrations(): void {
    const currentUser = this.currentUserPerson();
    const conferenceId = this.conferenceId();
    if (!currentUser?.id || !conferenceId) {
      this.registeredActivityIds.set(new Set());
      return;
    }
    this.activityParticipationService.byPersonId(currentUser.id).pipe(take(1)).subscribe({
      next: (participations) => {
        const ids = new Set(
          (participations ?? [])
            .filter((item) => String(item.conferenceId ?? '').trim() === conferenceId)
            .map((item) => item.activityId)
            .filter((id) => !!id)
        );
        this.registeredActivityIds.set(ids);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading current user registrations:', error);
      },
    });
  }

  private buildParticipationForm(activity: Activity): void {
    const controls: Record<string, FormControl> = {
      participantType: new FormControl<ParticipantType | null>(null, [Validators.required]),
    };
    (activity.specificAttributes ?? []).forEach((attribute, index) => {
      const validators = attribute.attributeRequired && attribute.attributeType !== 'BOOLEAN'
        ? [Validators.required]
        : [];
      const control = new FormControl(this.defaultValueFor(attribute), validators);
      controls[this.controlName(index)] = control;
    });
    this.form.set(this.fb.group(controls));
    const targetPerson = this.targetPerson();
    if (targetPerson) {
      const inferred = this.inferParticipantTypeForPerson(targetPerson, activity);
      this.form()?.get('participantType')?.setValue(inferred);
    }
  }

  private patchFormFromParticipation(participation: ActivityParticipation | null): void {
    const activity = this.activity();
    const form = this.form();
    if (!activity || !form) {
      return;
    }
    if (!participation) {
      this.buildParticipationForm(activity);
      return;
    }
    form.get('participantType')?.setValue(participation.participantType ?? null);
    const byName = new Map(
      (participation.attributes ?? []).map((entry) => [String(entry.name ?? '').trim(), String(entry.value ?? '')])
    );
    (activity.specificAttributes ?? []).forEach((attribute, index) => {
      const control = form.get(this.controlName(index));
      if (!control) {
        return;
      }
      const rawValue = byName.get(attribute.attributeName);
      control.setValue(this.deserializeAttributeValue(attribute, rawValue));
    });
  }

  private defaultValueFor(attribute: ActivityAttribute): unknown {
    if (attribute.attributeType === 'BOOLEAN') {
      return false;
    }
    return null;
  }

  private serializeAttributeValue(attribute: ActivityAttribute, rawValue: unknown): string {
    if (rawValue === null || rawValue === undefined) {
      return '';
    }
    switch (attribute.attributeType) {
      case 'DATE': {
        const date = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
      }
      case 'BOOLEAN':
        return rawValue ? 'true' : 'false';
      default:
        return String(rawValue);
    }
  }

  private deserializeAttributeValue(attribute: ActivityAttribute, rawValue: string | undefined): unknown {
    if (!rawValue) {
      return this.defaultValueFor(attribute);
    }
    switch (attribute.attributeType) {
      case 'INTEGER':
        return Number.isFinite(Number(rawValue)) ? Number(rawValue) : null;
      case 'BOOLEAN':
        return rawValue === 'true';
      case 'DATE': {
        const date = new Date(rawValue);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      default:
        return rawValue;
    }
  }

  private inferParticipantTypeForPerson(person: Person, activity: Activity): ParticipantType {
    const conference = this.conference();
    const candidates: ParticipantType[] = [];
    if (conference && conference.organizerEmails?.includes(person.email)) {
      candidates.push('ORGANIZER');
    }
    if (person.isSpeaker) {
      candidates.push('SPEAKER');
    }
    candidates.push('ATTENDEE');
    const allowed = activity.participantTypes ?? [];
    if (allowed.length === 0) {
      return candidates[0];
    }
    const selected = candidates.find((candidate) => allowed.includes(candidate));
    return selected ?? allowed[0];
  }
}
