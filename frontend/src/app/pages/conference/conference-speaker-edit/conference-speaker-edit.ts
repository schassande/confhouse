import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, forkJoin, take } from 'rxjs';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DataViewModule } from 'primeng/dataview';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { SessionStatusBadgeComponent } from '../../../components/session-status-badge/session-status-badge.component';
import { Conference, Day, Slot } from '../../../model/conference.model';
import { Person } from '../../../model/person.model';
import { Session, SessionAllocation } from '../../../model/session.model';
import { ConferenceSpeaker } from '../../../model/speaker.model';
import { ConferenceService } from '../../../services/conference.service';
import { ConferenceSpeakerService } from '../../../services/conference-speaker.service';
import { PersonService } from '../../../services/person.service';
import { SessionAllocationService } from '../../../services/session-allocation.service';
import { SessionService } from '../../../services/session.service';

interface DayAvailabilityEditor {
  dayId: string;
  dayLabel: string;
  minMinute: number;
  maxMinute: number;
  range: [number, number];
  isDayAvailable: boolean;
}

interface SpeakerSessionView {
  id: string;
  title: string;
  speakersLabel: string;
  slotLabel: string;
  status: string;
  sessionTypeLabel: string;
  sessionTypeBackgroundColor: string;
  sessionTypeTextColor: string;
  trackLabel: string;
  trackBackgroundColor: string;
  trackTextColor: string;
}

@Component({
  selector: 'app-conference-speaker-edit',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DataViewModule,
    InputTextModule,
    SelectModule,
    TabsModule,
    ButtonModule,
    AvatarModule,
    CheckboxModule,
    TextareaModule,
    SliderModule,
    SessionStatusBadgeComponent,
  ],
  templateUrl: './conference-speaker-edit.html',
  styleUrl: './conference-speaker-edit.scss',
})
export class ConferenceSpeakerEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceSpeakerService = inject(ConferenceSpeakerService);
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly personService = inject(PersonService);
  private readonly translateService = inject(TranslateService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly createMode = signal(false);
  readonly conference = signal<Conference | undefined>(undefined);
  readonly sessions = signal<Session[]>([]);
  readonly sessionAllocations = signal<SessionAllocation[]>([]);
  readonly personsById = signal<Map<string, Person>>(new Map());
  readonly conferenceSpeakers = signal<ConferenceSpeaker[]>([]);
  readonly editingConferenceSpeaker = signal<ConferenceSpeaker | null>(null);
  readonly editingPerson = signal<Person | null>(null);
  readonly editingDayAvailabilities = signal<DayAvailabilityEditor[]>([]);
  readonly languageOptions = signal([
    { label: 'English', value: 'en' },
    { label: 'Français', value: 'fr' },
  ]);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly speakerPageTitleKey = computed(() =>
    this.createMode()
      ? 'CONFERENCE.SPEAKERS.EDIT.PAGE_TITLE_CREATE'
      : 'CONFERENCE.SPEAKERS.EDIT.PAGE_TITLE'
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

  private readonly sessionAllocationBySessionId = computed(() => {
    const map = new Map<string, SessionAllocation>();
    this.sessionAllocations().forEach((allocation) => {
      const sessionId = String(allocation.sessionId ?? '').trim();
      if (!sessionId || map.has(sessionId)) {
        return;
      }
      map.set(sessionId, allocation);
    });
    return map;
  });

  readonly editingSessionViews = computed<SpeakerSessionView[]>(() => {
    const conferenceSpeaker = this.editingConferenceSpeaker();
    const conference = this.conference();
    if (!conferenceSpeaker || !conference) {
      return [];
    }

    const sessionIds = conferenceSpeaker.sessionIds ?? [];
    const sessionById = this.sessionById();
    const personsById = this.personsById();
    const sessionAllocationBySessionId = this.sessionAllocationBySessionId();

    return sessionIds
      .map((sessionId) => {
        const session = sessionById.get(sessionId);
        if (!session) {
          return null;
        }
        const sessionType = conference.sessionTypes.find(
          (item) => item.id === String(session.conference?.sessionTypeId ?? '').trim()
        );
        const track = conference.tracks.find(
          (item) => item.id === String(session.conference?.trackId ?? '').trim()
        );
        const sessionTypeBackgroundColor = sessionType?.color ?? '#E2E8F0';
        const trackBackgroundColor = track?.color ?? '#334155';

        const speakerNames = [session.speaker1Id, session.speaker2Id, session.speaker3Id]
          .map((id) => String(id ?? '').trim())
          .filter((id) => !!id)
          .map((speakerId) => {
            const person = personsById.get(speakerId);
            if (!person) {
              return '';
            }
            return `${String(person.firstName ?? '').trim()} ${String(person.lastName ?? '').trim()}`.trim();
          })
          .filter((name) => !!name);

        const allocation = sessionAllocationBySessionId.get(session.id);
        const slotLabel = this.buildSessionSlotLabel(allocation, conference.days ?? []);

        return {
          id: session.id,
          title: String(session.title ?? '').trim(),
          speakersLabel: speakerNames.join(', '),
          slotLabel,
          status: String(session.conference?.status ?? 'UNKNOWN').trim() || 'UNKNOWN',
          sessionTypeLabel: sessionType?.name ?? String(session.conference?.sessionTypeId ?? '').trim(),
          sessionTypeBackgroundColor,
          sessionTypeTextColor: this.computeTextColorForBackground(sessionTypeBackgroundColor),
          trackLabel: track?.name ?? String(session.conference?.trackId ?? '').trim(),
          trackBackgroundColor,
          trackTextColor: this.computeTextColorForBackground(trackBackgroundColor),
        } as SpeakerSessionView;
      })
      .filter((value): value is SpeakerSessionView => !!value)
      .sort((a, b) => a.title.localeCompare(b.title));
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
      sessionAllocations: this.sessionAllocationService.byConferenceId(conferenceId).pipe(take(1)),
      persons: this.personService.bySubmittedConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, conferenceSpeakers, sessions, sessionAllocations, persons }) => {
        this.conference.set(conference);
        this.conferenceSpeakers.set(conferenceSpeakers);
        this.sessions.set(sessions);
        this.sessionAllocations.set(sessionAllocations);
        this.personsById.set(new Map(persons.filter((person) => !!person.id).map((person) => [person.id, person])));
        this.initFromRoute(conferenceSpeakers);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading conference speaker edit page:', error);
        this.loading.set(false);
      },
    });
  }

  closeSpeakerEdit(): void {
    this.router.navigate(['/conference', this.conferenceId(), 'speakers']);
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
    if (!conferenceSpeaker || !person || !this.isSpeakerFormValid(person)) {
      return;
    }

    const conferenceDays = this.conference()?.days ?? [];
    const unavailableSlotsId = this.computeUnavailableSlotsId(conferenceDays, this.editingDayAvailabilities());
    const nextPerson = this.deepCopyPerson(person);
    const speaker = this.ensureSpeaker(nextPerson);
    this.ensureSubmittedConferenceId(speaker);
    if (this.createMode()) {
      nextPerson.hasAccount = false;
      nextPerson.isPlatformAdmin = false;
    }

    this.saving.set(true);
    try {
      const savedPerson = await firstValueFrom(
        this.createMode()
          ? this.personService.createViaFunction(nextPerson)
          : this.personService.save(nextPerson)
      );

      const nextConferenceSpeaker: ConferenceSpeaker = {
        ...conferenceSpeaker,
        conferenceId: this.conferenceId(),
        personId: savedPerson.id,
        unavailableSlotsId,
        sessionIds: this.createMode() ? [] : [...(conferenceSpeaker.sessionIds ?? [])],
        source: this.createMode() ? 'MANUAL' : (conferenceSpeaker.source ?? 'MANUAL'),
        sourceId: this.createMode() ? '' : String(conferenceSpeaker.sourceId ?? '').trim(),
      };
      await firstValueFrom(this.conferenceSpeakerService.save(nextConferenceSpeaker));
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

  private initFromRoute(conferenceSpeakers: ConferenceSpeaker[]): void {
    const mode = String(this.route.snapshot.data['mode'] ?? '').trim();
    if (mode === 'create') {
      const conferenceId = this.conferenceId();
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
          conferenceHallId: '',
        },
      };
      this.createMode.set(true);
      this.editingPerson.set(person);
      this.editingConferenceSpeaker.set({
        id: '',
        lastUpdated: '',
        conferenceId,
        personId: '',
        unavailableSlotsId: [],
        sessionIds: [],
        source: 'MANUAL',
        sourceId: '',
      });
      this.editingDayAvailabilities.set(this.buildDayAvailabilityEditors(this.conference()?.days ?? [], []));
      return;
    }

    const conferenceSpeakerId = String(this.route.snapshot.paramMap.get('conferenceSpeakerId') ?? '').trim();
    const conferenceSpeaker = conferenceSpeakers.find((item) => item.id === conferenceSpeakerId);
    if (!conferenceSpeaker) {
      this.closeSpeakerEdit();
      return;
    }
    const person = this.personsById().get(conferenceSpeaker.personId);
    if (!person) {
      this.closeSpeakerEdit();
      return;
    }

    this.createMode.set(false);
    this.editingConferenceSpeaker.set({
      ...conferenceSpeaker,
      unavailableSlotsId: [...(conferenceSpeaker.unavailableSlotsId ?? [])],
      sessionIds: [...(conferenceSpeaker.sessionIds ?? [])],
    });
    const personCopy = this.deepCopyPerson(person);
    this.ensureSpeaker(personCopy);
    this.editingPerson.set(personCopy);
    this.editingDayAvailabilities.set(
      this.buildDayAvailabilityEditors(
        this.conference()?.days ?? [],
        conferenceSpeaker.unavailableSlotsId ?? []
      )
    );
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

  private buildSessionSlotLabel(allocation: SessionAllocation | undefined, days: Day[]): string {
    if (!allocation) {
      return '';
    }
    const day = days.find((candidate) => candidate.id === allocation.dayId);
    if (!day) {
      return '';
    }
    const slot = (day.slots ?? []).find((candidate) => candidate.id === allocation.slotId);
    if (!slot) {
      return '';
    }
    return `${day.date} ${slot.startTime} - ${slot.endTime}`;
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
