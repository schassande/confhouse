import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, forkJoin, take } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { CheckboxModule } from 'primeng/checkbox';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { Conference, Day, Slot } from '../../../model/conference.model';
import { Person } from '../../../model/person.model';
import { Session } from '../../../model/session.model';
import { ConferenceSpeaker } from '../../../model/speaker.model';
import { ConferenceService } from '../../../services/conference.service';
import { ConferenceSpeakerService } from '../../../services/conference-speaker.service';
import { PersonService } from '../../../services/person.service';
import { SessionService } from '../../../services/session.service';

interface SelectOption {
  label: string;
  value: string;
}

interface SpeakerSessionTypeCount {
  sessionTypeId: string;
  sessionTypeLabel: string;
  count: number;
  backgroundColor: string;
  textColor: string;
}

interface ConferenceSpeakerView {
  conferenceSpeaker: ConferenceSpeaker;
  person?: Person;
  fullName: string;
  company: string;
  searchField: string;
  sessionTypeCounts: SpeakerSessionTypeCount[];
  unavailableSlotsCount: number;
}

interface DayAvailabilityEditor {
  dayId: string;
  dayLabel: string;
  minMinute: number;
  maxMinute: number;
  range: [number, number];
  isDayAvailable: boolean;
}

@Component({
  selector: 'app-conference-speakers',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DataViewModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    DialogModule,
    TabsModule,
    ButtonModule,
    AvatarModule,
    CheckboxModule,
    TextareaModule,
    SliderModule,
  ],
  templateUrl: './conference-speakers.html',
  styleUrl: './conference-speakers.scss',
})
export class ConferenceSpeakers implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceSpeakerService = inject(ConferenceSpeakerService);
  private readonly sessionService = inject(SessionService);
  private readonly personService = inject(PersonService);
  private readonly translateService = inject(TranslateService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly conference = signal<Conference | undefined>(undefined);
  readonly conferenceSpeakers = signal<ConferenceSpeaker[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly personsById = signal<Map<string, Person>>(new Map());
  readonly selectedSessionTypeIds = signal<string[]>([]);
  readonly searchText = signal('');
  readonly hasUnavailableSlotFilter = signal(false);
  readonly hasMultipleSessionsFilter = signal(false);
  readonly editDialogVisible = signal(false);
  readonly createMode = signal(false);
  readonly editingConferenceSpeaker = signal<ConferenceSpeaker | null>(null);
  readonly editingPerson = signal<Person | null>(null);
  readonly editingDayAvailabilities = signal<DayAvailabilityEditor[]>([]);
  readonly languageOptions = signal([
    { label: 'English', value: 'en' },
    { label: 'Français', value: 'fr' },
  ]);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');

  readonly sessionTypeOptions = computed<SelectOption[]>(() =>
    (this.conference()?.sessionTypes ?? []).map((sessionType) => ({
      label: sessionType.name,
      value: sessionType.id,
    }))
  );

  private readonly sessionById = computed(() => {
    const map = new Map<string, Session>();
    this.sessions().forEach((session) => {
      if (session.id) {
        map.set(session.id, session);
      }
    });
    return map;
  });

  private readonly sessionTypeNameById = computed(() => {
    const map = new Map<string, string>();
    (this.conference()?.sessionTypes ?? []).forEach((sessionType) => {
      map.set(sessionType.id, sessionType.name);
    });
    return map;
  });

  readonly speakerViews = computed<ConferenceSpeakerView[]>(() => {
    const personsById = this.personsById();
    const sessionById = this.sessionById();
    const sessionTypeNameById = this.sessionTypeNameById();

    return this.conferenceSpeakers().map((conferenceSpeaker) => {
      const person = personsById.get(conferenceSpeaker.personId);
      const firstName = String(person?.firstName ?? '').trim();
      const lastName = String(person?.lastName ?? '').trim();
      const fullName = [firstName, lastName].filter((value) => !!value).join(' ').trim();
      const company = String(person?.speaker?.company ?? '').trim();

      const countsByTypeId = new Map<string, number>();
      (conferenceSpeaker.sessionIds ?? []).forEach((sessionId) => {
        const session = sessionById.get(sessionId);
        const sessionTypeId = session?.conference?.sessionTypeId;
        if (!sessionTypeId) {
          return;
        }
        countsByTypeId.set(sessionTypeId, (countsByTypeId.get(sessionTypeId) ?? 0) + 1);
      });

      const sessionTypeCounts = Array.from(countsByTypeId.entries())
        .map(([sessionTypeId, count]) => {
          const sessionType = (this.conference()?.sessionTypes ?? []).find((item) => item.id === sessionTypeId);
          const backgroundColor = sessionType?.color ?? '#E2E8F0';
          return {
            sessionTypeId,
            sessionTypeLabel: sessionTypeNameById.get(sessionTypeId) ?? sessionTypeId,
            count,
            backgroundColor,
            textColor: this.computeTextColorForBackground(backgroundColor),
          };
        })
        .filter((entry) => entry.count > 0)
        .sort((a, b) => a.sessionTypeLabel.localeCompare(b.sessionTypeLabel));

      const unavailableSlotsCount = new Set(
        (conferenceSpeaker.unavailableSlotsId ?? []).map((id) => String(id).trim()).filter((id) => !!id)
      ).size;

      const searchField = [firstName, lastName, company].join(' ').toLowerCase().trim();

      return {
        conferenceSpeaker,
        person,
        fullName,
        company,
        searchField,
        sessionTypeCounts,
        unavailableSlotsCount,
      };
    });
  });

  readonly filteredSpeakerViews = computed(() => {
    let values = [...this.speakerViews()];
    const selectedSessionTypeIds = this.selectedSessionTypeIds();
    const normalizedSearch = this.normalizeSearchText(this.searchText());
    const filterHasUnavailableSlot = this.hasUnavailableSlotFilter();
    const filterHasMultipleSessions = this.hasMultipleSessionsFilter();

    if (selectedSessionTypeIds.length > 0) {
      values = values.filter((value) =>
        value.sessionTypeCounts.some((countByType) => selectedSessionTypeIds.includes(countByType.sessionTypeId))
      );
    }

    if (normalizedSearch.length >= 3) {
      values = values.filter((value) => value.searchField.includes(normalizedSearch));
    }

    if (filterHasUnavailableSlot) {
      values = values.filter((value) => value.unavailableSlotsCount > 0);
    }

    if (filterHasMultipleSessions) {
      values = values.filter((value) => (value.conferenceSpeaker.sessionIds ?? []).length > 1);
    }

    return values.sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    this.loading.set(true);
    forkJoin({
      conference: this.conferenceService.byId(conferenceId).pipe(take(1)),
      conferenceSpeakers: this.conferenceSpeakerService.byConferenceId(conferenceId).pipe(take(1)),
      sessions: this.sessionService.byConferenceId(conferenceId).pipe(take(1)),
      persons: this.personService.bySubmittedConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, conferenceSpeakers, sessions, persons }) => {
        this.conference.set(conference);
        this.conferenceSpeakers.set(conferenceSpeakers);
        this.sessions.set(sessions);
        this.personsById.set(new Map(persons.filter((person) => !!person.id).map((person) => [person.id, person])));
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading conference speakers page:', error);
        this.loading.set(false);
      },
    });
  }

  openSpeakerEdit(view: ConferenceSpeakerView): void {
    if (!view.person) {
      return;
    }

    const conferenceSpeakerCopy: ConferenceSpeaker = {
      ...view.conferenceSpeaker,
      unavailableSlotsId: [...(view.conferenceSpeaker.unavailableSlotsId ?? [])],
      sessionIds: [...(view.conferenceSpeaker.sessionIds ?? [])],
    };

    const personCopy = this.deepCopyPerson(view.person);
    this.ensureSpeaker(personCopy);

    this.createMode.set(false);
    this.editingConferenceSpeaker.set(conferenceSpeakerCopy);
    this.editingPerson.set(personCopy);
    this.editingDayAvailabilities.set(
      this.buildDayAvailabilityEditors(
        this.conference()?.days ?? [],
        conferenceSpeakerCopy.unavailableSlotsId ?? []
      )
    );
    this.editDialogVisible.set(true);
  }

  closeSpeakerEdit(): void {
    this.editDialogVisible.set(false);
    this.createMode.set(false);
    this.editingConferenceSpeaker.set(null);
    this.editingPerson.set(null);
    this.editingDayAvailabilities.set([]);
  }

  addSocialLink(): void {
    const person = this.editingPerson();
    if (!person) {
      return;
    }
    const speaker = this.ensureSpeaker(person);
    speaker.socialLinks.push({ network: '', url: '' });
    this.editingPerson.set({ ...person });
  }

  removeSocialLink(index: number): void {
    const person = this.editingPerson();
    if (!person?.speaker?.socialLinks) {
      return;
    }
    person.speaker.socialLinks.splice(index, 1);
    this.editingPerson.set({ ...person });
  }

  onAddSpeaker(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    const person: Person = {
      id: '',
      lastUpdated: '',
      firstName: '',
      lastName: '',
      email: '',
      hasAccount: false,
      isPlatformAdmin: false,
      isSpeaker: true,
      preferredLanguage: 'en',
      search: '',
      speaker: {
        company: '',
        bio: '',
        reference: '',
        photoUrl: '',
        submittedConferenceIds: [conferenceId],
        socialLinks: [],
        conferenceHallId: ''
      },
    };

    const conferenceSpeaker: ConferenceSpeaker = {
      id: '',
      lastUpdated: '',
      conferenceId,
      personId: '',
      unavailableSlotsId: [],
      sessionIds: [],
      source: 'MANUAL',
      sourceId: '',
    };

    this.createMode.set(true);
    this.editingConferenceSpeaker.set(conferenceSpeaker);
    this.editingPerson.set(person);
    this.editingDayAvailabilities.set(this.buildDayAvailabilityEditors(this.conference()?.days ?? [], []));
    this.editDialogVisible.set(true);
  }

  onDayRangeChange(dayAvailability: DayAvailabilityEditor, value: number[] | null): void {
    if (!value || value.length !== 2) {
      return;
    }
    const nextRange = this.normalizeRange([
      Number(value[0] ?? dayAvailability.minMinute),
      Number(value[1] ?? dayAvailability.maxMinute),
    ] as [number, number], dayAvailability.minMinute, dayAvailability.maxMinute);
    dayAvailability.range = nextRange;
    this.editingDayAvailabilities.set([...this.editingDayAvailabilities()]);
  }

  onDayAvailabilityToggle(dayAvailability: DayAvailabilityEditor, value: boolean | null): void {
    dayAvailability.isDayAvailable = !!value;
    if (dayAvailability.isDayAvailable
      && dayAvailability.range[0] === dayAvailability.minMinute
      && dayAvailability.range[1] === dayAvailability.minMinute) {
      dayAvailability.range = [dayAvailability.minMinute, dayAvailability.maxMinute];
    }
    this.editingDayAvailabilities.set([...this.editingDayAvailabilities()]);
  }

  async saveSpeakerEdit(): Promise<void> {
    const conferenceSpeaker = this.editingConferenceSpeaker();
    const person = this.editingPerson();
    if (!conferenceSpeaker || !person) {
      return;
    }
    if (!this.isSpeakerFormValid(person)) {
      return;
    }
    const isCreateMode = this.createMode();

    const conferenceDays = this.conference()?.days ?? [];
    const unavailableSlotsId = this.computeUnavailableSlotsId(conferenceDays, this.editingDayAvailabilities());
    const nextPerson = this.deepCopyPerson(person);
    const speaker = this.ensureSpeaker(nextPerson);
    this.ensureSubmittedConferenceId(speaker);
    if (isCreateMode) {
      nextPerson.hasAccount = false;
      nextPerson.isPlatformAdmin = false;
    }

    this.saving.set(true);
    try {
      console.log('[ConferenceSpeakers] Saving person in collection "person"...', {
        personId: nextPerson.id,
        conferenceId: this.conferenceId(),
        createMode: isCreateMode,
      });
      let savedPerson: Person;
      try {
        savedPerson = await firstValueFrom(
          isCreateMode
            ? this.personService.createViaFunction(nextPerson)
            : this.personService.save(nextPerson)
        );
        console.log('[ConferenceSpeakers] Saved person.', {
          personId: savedPerson.id,
          createMode: isCreateMode,
        });
      } catch (error) {
        console.error('[ConferenceSpeakers] Failed saving person.', {
          personId: nextPerson.id,
          conferenceId: this.conferenceId(),
          createMode: isCreateMode,
          error,
        });
        throw error;
      }

      const nextConferenceSpeaker: ConferenceSpeaker = {
        ...conferenceSpeaker,
        conferenceId: this.conferenceId(),
        personId: savedPerson.id,
        unavailableSlotsId,
        sessionIds: isCreateMode ? [] : [...(conferenceSpeaker.sessionIds ?? [])],
        source: isCreateMode ? 'MANUAL' : (conferenceSpeaker.source ?? 'MANUAL'),
        sourceId: isCreateMode ? '' : String(conferenceSpeaker.sourceId ?? '').trim(),
      };

      console.log('[ConferenceSpeakers] Saving conference speaker in collection "conference-speaker"...', {
        conferenceSpeakerId: nextConferenceSpeaker.id,
        conferenceId: nextConferenceSpeaker.conferenceId,
        personId: nextConferenceSpeaker.personId,
      });
      let savedConferenceSpeaker: ConferenceSpeaker;
      try {
        savedConferenceSpeaker = await firstValueFrom(this.conferenceSpeakerService.save(nextConferenceSpeaker));
        console.log('[ConferenceSpeakers] Saved conference speaker in collection "conference-speaker".', {
          conferenceSpeakerId: savedConferenceSpeaker.id,
        });
      } catch (error) {
        console.error('[ConferenceSpeakers] Failed saving collection "conference-speaker".', {
          conferenceSpeakerId: nextConferenceSpeaker.id,
          conferenceId: nextConferenceSpeaker.conferenceId,
          personId: nextConferenceSpeaker.personId,
          error,
        });
        throw error;
      }

      this.personsById.update((current) => {
        const next = new Map(current);
        next.set(savedPerson.id, savedPerson);
        return next;
      });
      this.conferenceSpeakers.update((current) =>
        current.some((item) => item.id === savedConferenceSpeaker.id)
          ? current.map((item) => (item.id === savedConferenceSpeaker.id ? savedConferenceSpeaker : item))
          : [...current, savedConferenceSpeaker]
      );
      this.closeSpeakerEdit();
    } catch (error) {
      console.error('Error while saving speaker:', error);
    } finally {
      this.saving.set(false);
    }
  }

  formatRange(range: [number, number]): string {
    return `${this.formatMinutes(range[0])} - ${this.formatMinutes(range[1])}`;
  }

  formatDayBoundary(minutes: number): string {
    return this.formatMinutes(minutes);
  }

  computeDayUnavailableCount(dayId: string): number {
    const conferenceDays = this.conference()?.days ?? [];
    const day = conferenceDays.find((candidate) => candidate.id === dayId);
    if (!day) {
      return 0;
    }
    const availability = this.editingDayAvailabilities().find((candidate) => candidate.dayId === dayId);
    if (!availability) {
      return 0;
    }
    if (!availability.isDayAvailable) {
      return (day.slots ?? []).length;
    }
    return this.computeUnavailableSlotIdsForDay(day, availability.range).length;
  }

  private deepCopyPerson(person: Person): Person {
    return {
      ...person,
      speaker: person.speaker
        ? {
            company: person.speaker.company,
            bio: person.speaker.bio,
            reference: person.speaker.reference,
            photoUrl: person.speaker.photoUrl,
            conferenceHallId: person.speaker.conferenceHallId,
            submittedConferenceIds: [...(person.speaker.submittedConferenceIds ?? [])],
            socialLinks: (person.speaker.socialLinks ?? []).map((socialLink) => ({ ...socialLink })),
          }
        : undefined,
    };
  }

  private ensureSpeaker(person: Person): NonNullable<Person['speaker']> {
    if (!person.speaker) {
      person.speaker = {
        company: '',
        bio: '',
        reference: '',
        photoUrl: '',
        submittedConferenceIds: [],
        socialLinks: [],
      };
    }
    if (!Array.isArray(person.speaker.socialLinks)) {
      person.speaker.socialLinks = [];
    }
    if (!Array.isArray(person.speaker.submittedConferenceIds)) {
      person.speaker.submittedConferenceIds = [];
    }
    return person.speaker;
  }

  private ensureSubmittedConferenceId(speaker: NonNullable<Person['speaker']>): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }
    const ids = new Set(
      (speaker.submittedConferenceIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => !!id)
    );
    ids.add(conferenceId);
    speaker.submittedConferenceIds = Array.from(ids).sort((a, b) => a.localeCompare(b));
  }

  private normalizeSearchText(value: string): string {
    return String(value ?? '').trim().toLowerCase();
  }

  isSpeakerFormValid(person: Person | null): boolean {
    if (!person) {
      return false;
    }
    return this.isRequiredTextFilled(person.firstName)
      && this.isRequiredTextFilled(person.lastName)
      && this.isRequiredTextFilled(person.email);
  }

  isRequiredTextFilled(value: string | null | undefined): boolean {
    return String(value ?? '').trim().length > 0;
  }

  private buildDayAvailabilityEditors(days: Day[], unavailableSlotsId: string[]): DayAvailabilityEditor[] {
    const unavailableSet = new Set(
      (unavailableSlotsId ?? []).map((id) => String(id ?? '').trim()).filter((id) => !!id)
    );

    return [...(days ?? [])]
      .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
      .map((day) => {
        const minMinute = this.timeToMinutes(day.beginTime);
        const maxMinute = this.timeToMinutes(day.endTime);
        const daySlots = day.slots ?? [];
        const dayUnavailableSlots = daySlots.filter((slot) => unavailableSet.has(slot.id));
        const isDayAvailable = !(daySlots.length > 0 && dayUnavailableSlots.length === daySlots.length);
        const availableSlots = daySlots.filter((slot) => !unavailableSet.has(slot.id));
        let range: [number, number] = [minMinute, maxMinute];

        // Default behavior: if no slot is marked unavailable for the day, speaker is available all day.
        if (dayUnavailableSlots.length === 0) {
          range = [minMinute, maxMinute];
        } else if (daySlots.length > 0 && availableSlots.length === 0) {
          range = [minMinute, minMinute];
        } else if (availableSlots.length > 0) {
          const availabilityStart = Math.min(...availableSlots.map((slot) => this.timeToMinutes(slot.startTime)));
          const availabilityEnd = Math.max(...availableSlots.map((slot) => this.timeToMinutes(slot.endTime)));
          range = this.normalizeRange([availabilityStart, availabilityEnd], minMinute, maxMinute);
        }

        return {
          dayId: day.id,
          dayLabel: this.formatDayLabel(day),
          minMinute,
          maxMinute,
          range,
          isDayAvailable,
        };
      });
  }

  private formatDayLabel(day: Day): string {
    const date = new Date(`${day.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return day.date;
    }
    const lang = (this.translateService.currentLang || this.translateService.getDefaultLang() || 'en').toLowerCase();
    const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(date);
    return `${weekday} ${day.date}`;
  }

  private computeUnavailableSlotsId(days: Day[], dayAvailabilities: DayAvailabilityEditor[]): string[] {
    const availabilityByDayId = new Map(dayAvailabilities.map((availability) => [availability.dayId, availability]));
    const unavailable = new Set<string>();

    days.forEach((day) => {
      const dayAvailability = availabilityByDayId.get(day.id);
      if (dayAvailability && !dayAvailability.isDayAvailable) {
        (day.slots ?? []).forEach((slot) => unavailable.add(slot.id));
        return;
      }
      const range: [number, number] = dayAvailability
        ? this.normalizeRange(dayAvailability.range, dayAvailability.minMinute, dayAvailability.maxMinute)
        : [this.timeToMinutes(day.beginTime), this.timeToMinutes(day.endTime)];

      this.computeUnavailableSlotIdsForDay(day, range).forEach((slotId) => unavailable.add(slotId));
    });

    return Array.from(unavailable).sort((a, b) => a.localeCompare(b));
  }

  private computeUnavailableSlotIdsForDay(day: Day, range: [number, number]): string[] {
    const daySlots = day.slots ?? [];
    return daySlots
      .filter((slot) => this.isSlotUnavailableForRange(slot, range))
      .map((slot) => slot.id);
  }

  private isSlotUnavailableForRange(slot: Slot, range: [number, number]): boolean {
    const slotStart = this.timeToMinutes(slot.startTime);
    const slotEnd = this.timeToMinutes(slot.endTime);
    const [availableStart, availableEnd] = range;
    const isFullyInsideAvailability = slotStart >= availableStart && slotEnd <= availableEnd;
    return !isFullyInsideAvailability;
  }

  private normalizeRange(range: [number, number], min: number, max: number): [number, number] {
    const start = Math.max(min, Math.min(max, range[0]));
    const end = Math.max(min, Math.min(max, range[1]));
    return [Math.min(start, end), Math.max(start, end)];
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = String(time ?? '00:00').split(':').map((value) => Number(value));
    return (hours * 60) + minutes;
  }

  private formatMinutes(minutes: number): string {
    const clamped = Math.max(0, Math.floor(minutes));
    const h = Math.floor(clamped / 60).toString().padStart(2, '0');
    const m = (clamped % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private computeTextColorForBackground(backgroundColor: string): string {
    const normalized = String(backgroundColor ?? '').trim();
    const shortHexMatch = normalized.match(/^#([0-9a-fA-F]{3})$/);
    const fullHexMatch = normalized.match(/^#([0-9a-fA-F]{6})$/);

    let r = 226;
    let g = 232;
    let b = 240;

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
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
  }
}
