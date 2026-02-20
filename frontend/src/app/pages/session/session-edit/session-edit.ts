import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, WritableSignal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { forkJoin, Observable, of, switchMap, take } from 'rxjs';
import { Conference, SessionType, Track } from '../../../model/conference.model';
import { Person } from '../../../model/person.model';
import { OverriddenField, Session, SessionAllocation, SessionLevel, SessionStatus } from '../../../model/session.model';
import { SessionStatusBadgeComponent } from '../../../components/session-status-badge/session-status-badge.component';
import { ConferenceService } from '../../../services/conference.service';
import { ConferenceSpeakerService } from '../../../services/conference-speaker.service';
import { PersonService } from '../../../services/person.service';
import { SessionAllocationService } from '../../../services/session-allocation.service';
import { SessionService } from '../../../services/session.service';
/**
 * Option affichée dans les auto-complétions de speakers.
 */
interface SpeakerOption {
  /** Libellé affiché à l'utilisateur. */
  label: string;
  /** Personne associée à l'option sélectionnée. */
  value: Person;
}

type SpeakerControlValue = SpeakerOption | Person | string | null | undefined;

/**
 * Transition de statut autorisée depuis un état donné.
 */
interface SessionStatusTransition {
  /** Statut cible appliqué quand l'action est déclenchée. */
  to: SessionStatus;
  /** Clé i18n du libellé d'action affiché sur le bouton. */
  actionKey: string;
}

const SESSION_STATUS_TRANSITIONS: Record<SessionStatus, SessionStatusTransition[]> = {
  DRAFT: [{ to: 'SUBMITTED', actionKey: 'SUBMIT' }],
  SUBMITTED: [
    { to: 'REJECTED', actionKey: 'REJECT' },
    { to: 'ACCEPTED', actionKey: 'ACCEPT' },
    { to: 'WAITLISTED', actionKey: 'WAITLIST' },
  ],
  REJECTED: [
    { to: 'WAITLISTED', actionKey: 'WAITLIST' },
  ],
  WAITLISTED: [
    { to: 'REJECTED', actionKey: 'REJECT' },
    { to: 'ACCEPTED', actionKey: 'ACCEPT' },
    { to: 'DECLINED_BY_SPEAKER', actionKey: 'DECLINE_SPEAKER' }
  ],
  ACCEPTED: [
    { to: 'SPEAKER_CONFIRMED', actionKey: 'CONFIRM_SPEAKER' },
    { to: 'DECLINED_BY_SPEAKER', actionKey: 'DECLINE_SPEAKER' }
    // 'SCHEDULED' excluded: done by planning workflow.
  ], 
  SPEAKER_CONFIRMED: [
    { to: 'DECLINED_BY_SPEAKER', actionKey: 'DECLINE_SPEAKER' },
    // 'PROGRAMMED' excluded: done by planning workflow.
  ], 
  SCHEDULED: [
    { to: 'DECLINED_BY_SPEAKER', actionKey: 'DECLINE_SPEAKER' },
    { to: 'PROGRAMMED', actionKey: 'CONFIRM_AFTER_SCHEDULE' },
  ],
  DECLINED_BY_SPEAKER: [
    { to: 'SPEAKER_CONFIRMED', actionKey: 'CONFIRM_SPEAKER' },
  ],
  PROGRAMMED: [
    { to: 'CANCELLED', actionKey: 'CANCEL' }
  ],
  CANCELLED: [],
};

@Component({
  selector: 'app-session-edit',
  imports: [
    AutoCompleteModule,
    ButtonModule,
    CommonModule,
    InputTextModule,
    ReactiveFormsModule,
    SelectModule,
    SessionStatusBadgeComponent,
    TextareaModule,
    TranslateModule,
  ],
  templateUrl: './session-edit.html',
  styleUrl: './session-edit.scss',
})
export class SessionEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly sessionService = inject(SessionService);
  private readonly conferenceSpeakerService = inject(ConferenceSpeakerService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly personService = inject(PersonService);
  private readonly sessionAllocationService = inject(SessionAllocationService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly createMode = signal(false);
  readonly errorMessage = signal('');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly initialSession = signal<Session | undefined>(undefined);
  readonly sessionAllocations = signal<SessionAllocation[]>([]);
  readonly selectedStatus = signal<SessionStatus | ''>('');
  readonly speaker1Suggestions = signal<SpeakerOption[]>([]);
  readonly speaker2Suggestions = signal<SpeakerOption[]>([]);
  readonly speaker3Suggestions = signal<SpeakerOption[]>([]);

  readonly form = this.fb.group({
    title: ['', [Validators.required]],
    abstract: [''],
    speaker1: [null as SpeakerOption | null],
    speaker2: [null as SpeakerOption | null],
    speaker3: [null as SpeakerOption | null],
    sessionTypeId: ['', [Validators.required]],
    trackId: ['', [Validators.required]],
    level: ['' as SessionLevel | ''],
  });

  readonly sessionTypeOptions = computed<{ label: string; value: string }[]>(() =>
    (this.conference()?.sessionTypes ?? []).map((sessionType: SessionType) => ({
      label: sessionType.name,
      value: sessionType.id,
    }))
  );

  readonly trackOptions = computed<{ label: string; value: string }[]>(() =>
    (this.conference()?.tracks ?? []).map((track: Track) => ({
      label: track.name,
      value: track.id,
    }))
  );

  readonly levelOptions: { label: SessionLevel; value: SessionLevel }[] = [
    { label: 'BEGINNER', value: 'BEGINNER' },
    { label: 'INTERMEDIATE', value: 'INTERMEDIATE' },
    { label: 'ADVANCED', value: 'ADVANCED' },
  ];

  readonly pageTitleParams = computed(() => ({
    conference: (
      (this.conference()?.name || '')
      + (this.conference()?.edition ? ` ${this.conference()?.edition}` : '')
    ).trim(),
  }));
  readonly pageTitleKey = computed(() =>
    this.createMode() ? 'SESSION.EDIT.PAGE_TITLE_CREATE' : 'SESSION.EDIT.PAGE_TITLE'
  );

  readonly availableStatusTransitions = computed<SessionStatusTransition[]>(() => {
    const current = this.selectedStatus();
    if (!current) {
      return [];
    }
    return SESSION_STATUS_TRANSITIONS[current] ?? [];
  });

  readonly allocatedSlotLabel = computed(() => {
    const session = this.initialSession();
    const conference = this.conference();
    if (!session?.id || !conference) {
      return '';
    }

    const allocation = this.sessionAllocations().find(
      (candidate) => String(candidate.sessionId ?? '').trim() === session.id
    );
    if (!allocation) {
      return '';
    }

    const day = (conference.days ?? []).find((candidate) => candidate.id === allocation.dayId);
    if (!day) {
      return '';
    }

    const slot = (day.slots ?? []).find((candidate) => candidate.id === allocation.slotId);
    if (!slot) {
      return '';
    }

    return `${day.date} ${slot.startTime} - ${slot.endTime}`;
  });

  ngOnInit(): void {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    const mode = String(this.route.snapshot.data['mode'] ?? '').trim();
    if (!conferenceId) {
      this.errorMessage.set('SESSION.EDIT.ERROR_NOT_FOUND');
      this.loading.set(false);
      return;
    }

    if (mode === 'create') {
      this.createMode.set(true);
      this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
        next: (conference) => {
          if (!conference) {
            this.errorMessage.set('SESSION.EDIT.ERROR_NOT_FOUND');
            this.loading.set(false);
            return;
          }
          this.conference.set(conference);
          const session = this.createDraftSession(conferenceId);
          this.initialSession.set(session);
          this.sessionAllocations.set([]);
          this.populateForm(session);
        },
        error: () => {
          this.errorMessage.set('SESSION.EDIT.ERROR_LOAD');
          this.loading.set(false);
        },
      });
      return;
    }

    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (!sessionId) {
      this.errorMessage.set('SESSION.EDIT.ERROR_NOT_FOUND');
      this.loading.set(false);
      return;
    }

    this.createMode.set(false);
    forkJoin({
      conference: this.conferenceService.byId(conferenceId).pipe(take(1)),
      session: this.sessionService.byId(sessionId).pipe(take(1)),
      sessionAllocations: this.sessionAllocationService.byConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, session, sessionAllocations }) => {
        if (!conference || !session || session.conference?.conferenceId !== conferenceId) {
          this.errorMessage.set('SESSION.EDIT.ERROR_NOT_FOUND');
          this.loading.set(false);
          return;
        }

        this.conference.set(conference);
        this.initialSession.set(session);
        this.sessionAllocations.set(sessionAllocations ?? []);
        this.populateForm(session);
      },
      error: () => {
        this.errorMessage.set('SESSION.EDIT.ERROR_LOAD');
        this.loading.set(false);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const initial = this.initialSession();
    if (!initial || !initial.conference) {
      return;
    }

    const raw = this.form.getRawValue();
    const title = raw.title?.trim() ?? '';
    const abstract = raw.abstract ?? '';
    const speaker1Id = this.extractSpeakerId(raw.speaker1);
    const speaker2Id = this.extractSpeakerId(raw.speaker2);
    const speaker3Id = this.extractSpeakerId(raw.speaker3);
    const speaker1Label = this.extractSpeakerLabel(raw.speaker1);
    const speaker2Label = this.extractSpeakerLabel(raw.speaker2);
    const speaker3Label = this.extractSpeakerLabel(raw.speaker3);
    const updatedConference = {
      ...initial.conference,
      sessionTypeId: raw.sessionTypeId ?? '',
      trackId: raw.trackId ?? '',
      level: (raw.level as SessionLevel) ?? initial.conference.level,
      status: (this.selectedStatus() || initial.conference.status) as SessionStatus,
    };

    const updated: Session = {
      ...initial,
      title,
      abstract,
      speaker1Id,
      speaker2Id,
      speaker3Id,
      search: this.buildSessionSearch(title, abstract, speaker1Label, speaker2Label, speaker3Label),
      conference: updatedConference,
    };

    const existingOverrides = initial.conference.overriddenFields ?? [];
    updatedConference.overriddenFields = this.createMode()
      ? []
      : this.computeOverriddenFields(initial, updated, existingOverrides);

    this.saving.set(true);
    const previousSession = this.createMode() ? undefined : initial;
    this.sessionService.save(updated).pipe(
      take(1),
      switchMap((savedSession) => this.conferenceSpeakerService.syncFromSession(savedSession, previousSession))
    ).subscribe({
      next: () => {
        this.saving.set(false);
        const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
        if (conferenceId) {
          void this.router.navigate(['/conference', conferenceId, 'sessions']);
        }
      },
      error: () => {
        this.saving.set(false);
        this.errorMessage.set('SESSION.EDIT.ERROR_SAVE');
      },
    });
  }

  cancel(): void {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (conferenceId) {
      void this.router.navigate(['/conference', conferenceId, 'sessions']);
    }
  }

  searchSpeaker1(event: AutoCompleteCompleteEvent): void {
    this.searchSpeakers(event, this.speaker1Suggestions);
  }

  searchSpeaker2(event: AutoCompleteCompleteEvent): void {
    this.searchSpeakers(event, this.speaker2Suggestions);
  }

  searchSpeaker3(event: AutoCompleteCompleteEvent): void {
    this.searchSpeakers(event, this.speaker3Suggestions);
  }

  speakerLabel(person: Person | null | undefined): string {
    if (!person) {
      return '';
    }
    const fullName = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
    if (!fullName.length) {
      return person.email ?? '';
    }
    return person.speaker?.company ? `${fullName} (${person.speaker.company})` : fullName;
  }

  onSpeakerClear(controlName: 'speaker1' | 'speaker2' | 'speaker3'): void {
    this.form.get(controlName)?.setValue(null);
  }

  applyStatusTransition(transition: SessionStatusTransition): void {
    const allowedTransitions = this.availableStatusTransitions();
    const isAllowed = allowedTransitions.some((item) => item.to === transition.to && item.actionKey === transition.actionKey);
    if (!isAllowed) {
      return;
    }
    this.selectedStatus.set(transition.to);
  }

  private populateForm(session: Session): void {
    this.selectedStatus.set((session.conference?.status ?? '') as SessionStatus | '');
    forkJoin({
      speaker1: this.loadSpeaker(session.speaker1Id),
      speaker2: this.loadSpeaker(session.speaker2Id),
      speaker3: this.loadSpeaker(session.speaker3Id),
    }).subscribe({
      next: ({ speaker1, speaker2, speaker3 }) => {
        this.form.patchValue({
          title: session.title ?? '',
          abstract: session.abstract ?? '',
          speaker1: this.toSpeakerOption(speaker1),
          speaker2: this.toSpeakerOption(speaker2),
          speaker3: this.toSpeakerOption(speaker3),
          sessionTypeId: session.conference?.sessionTypeId ?? '',
          trackId: session.conference?.trackId ?? '',
          level: session.conference?.level ?? '',
        });
        this.loading.set(false);
      },
      error: () => {
        this.form.patchValue({
          title: session.title ?? '',
          abstract: session.abstract ?? '',
          sessionTypeId: session.conference?.sessionTypeId ?? '',
          trackId: session.conference?.trackId ?? '',
          level: session.conference?.level ?? '',
        });
        this.loading.set(false);
      },
    });
  }

  private loadSpeaker(personId: string | undefined): Observable<Person | undefined> {
    if (!personId) {
      return of(undefined);
    }
    return this.personService.byId(personId).pipe(take(1));
  }

  private searchSpeakers(event: AutoCompleteCompleteEvent, target: WritableSignal<SpeakerOption[]>): void {
    const query = event.query ?? '';
    if (query.trim().length < 3) {
      target.set([]);
      return;
    }

    this.personService.searchSpeakersBySearch(query, 10).pipe(take(1)).subscribe({
      next: (persons) =>
        target.set(
          persons
            .map((person) => this.toSpeakerOption(person))
            .filter((item): item is SpeakerOption => !!item)
        ),
      error: () => target.set([]),
    });
  }

  private toSpeakerOption(person: Person | null | undefined): SpeakerOption | null {
    if (!person) {
      return null;
    }
    return {
      label: this.speakerLabel(person),
      value: person,
    };
  }

  private computeOverriddenFields(initial: Session, updated: Session, existing: OverriddenField[]): OverriddenField[] {
    const overridden = [...existing];
    const fieldAliases: Record<string, string[]> = {
      speakerId1: ['speakerId1', 'speaker1Id'],
      speakerId2: ['speakerId2', 'speaker2Id'],
      speakerId3: ['speakerId3', 'speaker3Id'],
    };
    const hasOverride = (fieldName: string) => {
      const aliases = fieldAliases[fieldName] ?? [fieldName];
      return overridden.some((field) => aliases.includes(field.fieldName));
    };
    const addIfChanged = (fieldName: string, oldValue: string, newValue: string) => {
      if (oldValue !== newValue && !hasOverride(fieldName)) {
        overridden.push({ fieldName, oldValue });
      }
    };

    addIfChanged('title', initial.title ?? '', updated.title ?? '');
    addIfChanged('abstract', initial.abstract ?? '', updated.abstract ?? '');
    addIfChanged('speakerId1', initial.speaker1Id ?? '', updated.speaker1Id ?? '');
    addIfChanged('speakerId2', initial.speaker2Id ?? '', updated.speaker2Id ?? '');
    addIfChanged('speakerId3', initial.speaker3Id ?? '', updated.speaker3Id ?? '');

    return overridden;
  }

  private createDraftSession(conferenceId: string): Session {
    const now = new Date().toISOString();
    return {
      id: '',
      lastUpdated: '',
      title: '',
      abstract: '',
      references: '',
      sessionType: '',
      speaker1Id: '',
      speaker2Id: '',
      speaker3Id: '',
      lastChangeDate: now,
      search: '',
      conference: {
        conferenceId,
        status: 'DRAFT',
        sourceSessionUuid: '',
        sessionTypeId: '',
        trackId: '',
        overriddenFields: [],
        submitDate: now,
        level: 'BEGINNER',
        langs: [],
        conferenceHallId: '',
        review: {
          average: 0,
          votes: 0,
        },
      },
    };
  }

  private buildSessionSearch(
    title: string,
    abstract: string,
    speaker1Label?: string,
    speaker2Label?: string,
    speaker3Label?: string
  ): string {
    return [title, abstract, speaker1Label, speaker2Label, speaker3Label]
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0)
      .join(' ')
      .toLowerCase();
  }

  private extractSpeakerId(value: SpeakerControlValue): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return this.findSpeakerIdByLabel(value);
    }
    const candidate = value as Partial<SpeakerOption> & Partial<Person>;
    const nestedPersonId = String(candidate.value?.id ?? '').trim();
    if (nestedPersonId.length > 0) {
      return nestedPersonId;
    }
    const directPersonId = String(candidate.id ?? '').trim();
    if (directPersonId.length > 0) {
      return directPersonId;
    }
    const label = String(candidate.label ?? '').trim();
    if (label.length > 0) {
      return this.findSpeakerIdByLabel(label);
    }
    return '';
  }

  private extractSpeakerLabel(value: SpeakerControlValue): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    const candidate = value as Partial<SpeakerOption> & Partial<Person>;
    const optionLabel = String(candidate.label ?? '').trim();
    if (optionLabel.length > 0) {
      return optionLabel;
    }
    const firstName = String(candidate.firstName ?? '').trim();
    const lastName = String(candidate.lastName ?? '').trim();
    return [firstName, lastName].filter((entry) => entry.length > 0).join(' ').trim();
  }

  private findSpeakerIdByLabel(label: string): string {
    const normalized = String(label ?? '').trim().toLowerCase();
    if (normalized.length === 0) {
      return '';
    }
    const allSuggestions = [
      ...this.speaker1Suggestions(),
      ...this.speaker2Suggestions(),
      ...this.speaker3Suggestions(),
    ];
    const match = allSuggestions.find(
      (item) => String(item.label ?? '').trim().toLowerCase() === normalized
    );
    return String(match?.value?.id ?? '').trim();
  }
}

