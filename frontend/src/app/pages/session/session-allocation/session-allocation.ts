import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, firstValueFrom, forkJoin, map, of, take } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import {
  UnallocatedSessionListComponent,
  UnallocatedSessionListItem,
} from '../../../components/unallocated-session-list/unallocated-session-list.component';
import { Conference, Day, Room, SessionType, Slot, Track } from '../../../model/conference.model';
import { SlotType } from '../../../model/slot-type.model';
import { Session, SessionAllocation as SessionAllocationModel, SessionStatus } from '../../../model/session.model';
import { ConferenceSpeaker } from '../../../model/speaker.model';
import { ConferenceService } from '../../../services/conference.service';
import { ConferenceSpeakerService } from '../../../services/conference-speaker.service';
import { PersonService } from '../../../services/person.service';
import { SessionAllocationService } from '../../../services/session-allocation.service';
import { SessionDeallocationService } from '../../../services/session-deallocation.service';
import { SessionService } from '../../../services/session.service';
import { SlotTypeService } from '../../../services/slot-type.service';

interface SelectOption {
  label: string;
  value: string;
}

interface SlotView {
  key: string;
  day: Day;
  room: Room;
  slot: Slot;
  roomColIdx: number;
  startTick: number;
}

interface TimelineTick {
  label: string;
  main: boolean;
}

interface DayTimeline {
  ticks: TimelineTick[];
  tickIndexByTime: Map<number, number>;
}

interface DayPlanningView {
  day: Day;
  enabledRooms: Room[];
  timelineTicks: TimelineTick[];
  slotViews: SlotView[];
  hasSessionSlots: boolean;
}

interface DragPayload {
  sessionId: string;
  sourceSlotKey?: string;
}

interface SpeakerAvailabilityConflict {
  speakerLabel: string;
  availableTimeRanges: string[];
}

@Component({
  selector: 'app-session-allocation',
  imports: [
    ButtonModule,
    CheckboxModule,
    CommonModule,
    ConfirmDialogModule,
    DialogModule,
    FormsModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    UnallocatedSessionListComponent,
    TranslateModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './session-allocation.html',
  styleUrl: './session-allocation.scss',
})
export class SessionAllocation implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly translateService = inject(TranslateService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly conferenceSpeakerService = inject(ConferenceSpeakerService);
  private readonly personService = inject(PersonService);
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly sessionDeallocationService = inject(SessionDeallocationService);
  private readonly slotTypeService = inject(SlotTypeService);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly sessions = signal<Session[]>([]);
  readonly conferenceSpeakers = signal<ConferenceSpeaker[]>([]);
  readonly speakerDisplayById = signal<Map<string, string>>(new Map());
  readonly allocations = signal<SessionAllocationModel[]>([]);
  readonly slotTypes = signal<SlotType[]>([]);
  readonly selectedSessionTypeIds = signal<string[]>([]);
  readonly selectedTrackIds = signal<string[]>([]);
  readonly selectedSpeakerId = signal('');
  readonly hasUnavailabilityFilter = signal(false);
  readonly unallocatedSearchText = signal('');
  readonly draggingPayload = signal<DragPayload | null>(null);
  readonly dropTargetSlotKey = signal('');
  readonly sessionPickerVisible = signal(false);
  readonly selectedSlotForPicker = signal<SlotView | undefined>(undefined);
  readonly selectedPickerTrackIds = signal<string[]>([]);
  readonly pickerSearchText = signal('');
  readonly allocationConflictVisible = signal(false);
  readonly allocationConflictMessage = signal('');

  readonly days = computed(() => this.conference()?.days ?? []);

  readonly sessionTypeOptions = computed<SelectOption[]>(() =>
    (this.conference()?.sessionTypes ?? []).map((sessionType) => ({
      label: sessionType.name,
      value: sessionType.id,
    }))
  );

  readonly trackOptions = computed<SelectOption[]>(() =>
    (this.conference()?.tracks ?? []).map((track) => ({
      label: track.name,
      value: track.id,
    }))
  );

  readonly speakerOptions = computed<SelectOption[]>(() => {
    const namesById = this.speakerDisplayById();
    return this.conferenceSpeakers()
      .map((conferenceSpeaker) => String(conferenceSpeaker.personId ?? '').trim())
      .filter((speakerId) => speakerId.length > 0)
      .filter((speakerId, idx, all) => all.indexOf(speakerId) === idx)
      .map((speakerId) => ({
        label: namesById.get(speakerId) ?? speakerId,
        value: speakerId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  private readonly sessionById = computed(() => {
    const map = new Map<string, Session>();
    this.sessions().forEach((session) => {
      if (session.id) {
        map.set(session.id, session);
      }
    });
    return map;
  });

  private readonly slotTypeById = computed(() => {
    const map = new Map<string, SlotType>();
    this.slotTypes().forEach((slotType) => map.set(slotType.id, slotType));
    return map;
  });

  private readonly trackById = computed(() => {
    const map = new Map<string, Track>();
    (this.conference()?.tracks ?? []).forEach((track) => map.set(this.normalizeKey(track.id), track));
    return map;
  });

  private readonly conferenceSpeakerByPersonId = computed(() => {
    const map = new Map<string, ConferenceSpeaker>();
    this.conferenceSpeakers().forEach((conferenceSpeaker) => {
      const personId = String(conferenceSpeaker.personId ?? '').trim();
      if (personId && !map.has(personId)) {
        map.set(personId, conferenceSpeaker);
      }
    });
    return map;
  });

  private readonly sessionTypeById = computed(() => {
    const map = new Map<string, SessionType>();
    (this.conference()?.sessionTypes ?? []).forEach((sessionType) => map.set(sessionType.id, sessionType));
    return map;
  });

  readonly allocationBySlotKey = computed(() => {
    const map = new Map<string, SessionAllocationModel>();
    this.allocations().forEach((allocation) => {
      map.set(this.toSlotKey(allocation.dayId, allocation.slotId, allocation.roomId), allocation);
    });
    return map;
  });

  readonly allocationBySessionId = computed(() => {
    const map = new Map<string, SessionAllocationModel>();
    this.allocations().forEach((allocation) => {
      if (!map.has(allocation.sessionId)) {
        map.set(allocation.sessionId, allocation);
      }
    });
    return map;
  });

  readonly dayPlanningViews = computed<DayPlanningView[]>(() => {
    const conference = this.conference();
    if (!conference) {
      return [];
    }
    const slotTypeById = this.slotTypeById();
    return (conference.days ?? []).map((day) => {
      const enabledRooms = this.computeEnabledRooms(day, conference);
      const timeline = this.computeDayTimeline(day, enabledRooms, slotTypeById);
      const slotViews = this.computeSlotViews(day, enabledRooms, slotTypeById, timeline.tickIndexByTime);
      return {
        day,
        enabledRooms,
        timelineTicks: timeline.ticks,
        slotViews,
        hasSessionSlots: slotViews.length > 0,
      };
    });
  });

  readonly unallocatedSessions = computed<Session[]>(() => {
    const allocatedSessionIds = new Set(this.allocations().map((allocation) => allocation.sessionId));
    const filteredSessionTypeIds = this.selectedSessionTypeIds();
    const filteredTrackIds = this.selectedTrackIds();
    const filterHasUnavailability = this.hasUnavailabilityFilter();
    const allowedStatuses = new Set<SessionStatus>(['ACCEPTED', 'SPEAKER_CONFIRMED']);
    const statusAndTypeFiltered = this.sessions()
      .filter((session) => {
        if (!session.id || allocatedSessionIds.has(session.id)) {
          return false;
        }
        const status = session.conference?.status;
        if (!status || !allowedStatuses.has(status)) {
          return false;
        }
        const sessionTypeId = session.conference?.sessionTypeId ?? '';
        const trackId = session.conference?.trackId ?? '';
        if (filteredSessionTypeIds.length > 0 && !filteredSessionTypeIds.includes(sessionTypeId)) {
          return false;
        }
        if (filteredTrackIds.length > 0 && !filteredTrackIds.includes(trackId)) {
          return false;
        }
        if (filterHasUnavailability && !this.sessionHasSpeakerWithUnavailability(session)) {
          return false;
        }
        return true;
      });

    return this.filterSessionsByKeyword(statusAndTypeFiltered, this.unallocatedSearchText())
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  readonly unallocatedSessionItems = computed<UnallocatedSessionListItem[]>(() =>
    this.unallocatedSessions().map((session) => ({
      sessionId: session.id,
      title: session.title,
      speakersLabel: this.sessionSpeakersLabel(session),
      sessionTypeLabel: this.sessionTypeLabel(session),
      backgroundColor: this.sessionTrackColor(session),
      textColor: this.sessionTrackTextColor(session),
    }))
  );

  readonly pickerSessionItems = computed<UnallocatedSessionListItem[]>(() => {
    const slot = this.selectedSlotForPicker();
    const pickerTrackIds = this.selectedPickerTrackIds();
    const baseSessions = slot
      ? this.unallocatedSessions().filter((session) => (session.conference?.sessionTypeId ?? '') === slot.slot.sessionTypeId)
      : this.unallocatedSessions();
    const filteredByTrack = pickerTrackIds.length > 0
      ? baseSessions.filter((session) => pickerTrackIds.includes(session.conference?.trackId ?? ''))
      : baseSessions;
    const filteredByKeyword = this.filterSessionsByKeyword(filteredByTrack, this.pickerSearchText());
    const items = filteredByKeyword.map((session) => ({
      sessionId: session.id,
      title: session.title,
      speakersLabel: this.sessionSpeakersLabel(session),
      sessionTypeLabel: this.sessionTypeLabel(session),
      backgroundColor: this.sessionTrackColor(session),
      textColor: this.sessionTrackTextColor(session),
    }));
    return items;
  });

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.errorMessage.set('SESSION.ALLOCATION.ERROR_NOT_FOUND');
      this.loading.set(false);
      return;
    }

    this.conferenceService
      .byId(conferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conference) => {
        this.conference.set(conference);
      });

    this.sessionService
      .byConferenceId(conferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessions) => {
        const validSessions = sessions.filter((session) => !!session.id);
        this.sessions.set(validSessions);
        this.loadSpeakerDisplay(validSessions);
      });

    this.conferenceSpeakerService
      .byConferenceId(conferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conferenceSpeakers) => {
        this.conferenceSpeakers.set(conferenceSpeakers ?? []);
      });

    this.sessionAllocationService
      .byConferenceId(conferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((allocations) => {
        this.allocations.set(allocations);
      });

    this.slotTypeService
      .init()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((slotTypes) => {
        this.slotTypes.set(slotTypes);
      });

    this.loading.set(false);
  }

  slotSessionTypeLabel(slotView: SlotView): string {
    return this.sessionTypeById().get(slotView.slot.sessionTypeId)?.name ?? slotView.slot.sessionTypeId;
  }

  dayLabel(day: Day): string {
    const date = new Date(`${day.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return day.date;
    }
    const lang = (this.translateService.currentLang || this.translateService.getDefaultLang() || 'en').toLowerCase();
    const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(date);
    return `${weekday} ${day.date}`;
  }

  slotText(slotView: SlotView): string {
    return this.selectedSession(slotView)?.title ?? '';
  }

  slotStyle(slotView: SlotView): Record<string, string | number> {
    const session = this.selectedSession(slotView);
    const selectedSpeakerId = this.selectedSpeakerId().trim();
    const shouldGrayOut = !!selectedSpeakerId && !!session && !this.sessionHasSpeaker(session, selectedSpeakerId);
    const backgroundColor = session
      ? (shouldGrayOut ? '#CBD5E1' : this.sessionTrackColor(session))
      : '#FFFFFF';
    const textColor = session ? this.computeTextColorForBackground(backgroundColor) : '#0F172A';

    return {
      '--start-tick': slotView.startTick,
      '--room-col-idx': slotView.roomColIdx,
      'background-color': backgroundColor,
      color: textColor,
    };
  }

  sessionTrackLabel(session: Session): string {
    const track = this.resolveTrack(session);
    if (track) {
      return track.name;
    }
    return session.conference?.trackId ?? '';
  }

  sessionSpeakersLabel(session: Session): string {
    const namesById = this.speakerDisplayById();
    const names = this.sessionSpeakerIds(session)
      .map((speakerId) => namesById.get(speakerId))
      .filter((value): value is string => !!value);

    return names.join(', ');
  }

  sessionTypeLabel(session: Session): string {
    const sessionTypeId = session.conference?.sessionTypeId ?? '';
    return this.sessionTypeById().get(sessionTypeId)?.name ?? sessionTypeId;
  }

  sessionTrackColor(session: Session): string {
    return this.resolveTrack(session)?.color ?? '#E2E8F0';
  }

  sessionTrackTextColor(session: Session): string {
    return this.computeTextColorForBackground(this.sessionTrackColor(session));
  }

  selectedSessionId(slotView: SlotView): string | null {
    return this.allocationBySlotKey().get(slotView.key)?.sessionId ?? null;
  }

  selectedSession(slotView: SlotView): Session | undefined {
    const sessionId = this.selectedSessionId(slotView);
    if (!sessionId) {
      return undefined;
    }
    return this.sessionById().get(sessionId);
  }

  openSessionPicker(slotView: SlotView): void {
    this.selectedSlotForPicker.set(slotView);
    this.selectedPickerTrackIds.set([...(this.selectedTrackIds() ?? [])]);
    this.pickerSearchText.set(this.unallocatedSearchText());
    this.sessionPickerVisible.set(true);
  }

  closeSessionPicker(): void {
    this.selectedSlotForPicker.set(undefined);
    this.selectedPickerTrackIds.set([]);
    this.pickerSearchText.set('');
    this.sessionPickerVisible.set(false);
  }

  closeAllocationConflictDialog(): void {
    this.allocationConflictVisible.set(false);
    this.allocationConflictMessage.set('');
  }

  async onPickerSessionSelected(sessionId: string): Promise<void> {
    const slot = this.selectedSlotForPicker();
    if (!slot) {
      return;
    }
    if (!this.isSessionTypeCompatibleById(sessionId, slot)) {
      return;
    }
    const assigned = await this.assignSessionToSlot(sessionId, slot);
    if (assigned) {
      this.closeSessionPicker();
    }
  }

  async onPickerClearSlot(): Promise<void> {
    const slot = this.selectedSlotForPicker();
    if (!slot) {
      return;
    }
    await this.clearSlot(slot);
    this.closeSessionPicker();
  }

  onDragOver(event: DragEvent, slotView: SlotView): void {
    const payload = this.readDragPayload(event);
    const sessionId = payload?.sessionId ?? '';

    event.preventDefault();
    if (!event.dataTransfer) {
      return;
    }
    if (!sessionId || !this.isSessionTypeCompatibleById(sessionId, slotView)) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'move';
  }

  onDragEnter(slotKey: string): void {
    this.dropTargetSlotKey.set(slotKey);
  }

  onDragLeave(slotKey: string): void {
    if (this.dropTargetSlotKey() === slotKey) {
      this.dropTargetSlotKey.set('');
    }
  }

  onDragEnd(): void {
    this.draggingPayload.set(null);
    this.dropTargetSlotKey.set('');
  }

  onUnallocatedDragStart(event: DragEvent, sessionId: string): void {
    this.setDragPayload(event, { sessionId });
  }

  onSlotDragStart(event: DragEvent, slotView: SlotView): void {
    const sessionId = this.selectedSessionId(slotView);
    if (!sessionId) {
      return;
    }
    this.setDragPayload(event, {
      sessionId,
      sourceSlotKey: slotView.key,
    });
  }

  async onSlotDrop(event: DragEvent, slotView: SlotView): Promise<void> {
    event.preventDefault();
    this.dropTargetSlotKey.set('');
    const payload = this.readDragPayload(event);
    this.draggingPayload.set(null);
    if (!payload?.sessionId) {
      return;
    }
    if (!this.isSessionTypeCompatibleById(payload.sessionId, slotView)) {
      return;
    }
    await this.assignSessionToSlot(payload.sessionId, slotView);
  }

  async onUnallocatedDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const payload = this.readDragPayload(event);
    this.draggingPayload.set(null);
    this.dropTargetSlotKey.set('');
    if (!payload?.sessionId || !payload.sourceSlotKey) {
      return;
    }

    const allocation =
      this.allocationBySlotKey().get(payload.sourceSlotKey)
      ?? this.allocationBySessionId().get(payload.sessionId);
    if (!allocation) {
      return;
    }

    await this.deallocateAllocations([allocation]);
  }

  async resetDayAllocations(day: Day): Promise<void> {
    const dayAllocations = this.allocations().filter((allocation) => allocation.dayId === day.id);
    if (!dayAllocations.length) {
      return;
    }

    const confirmed = await this.confirmResetDay();
    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    try {
      const updatedSessions = await this.sessionDeallocationService.deallocateByAllocations(
        this.conferenceId(),
        dayAllocations,
        {
          allAllocations: this.allocations(),
          sessions: this.sessions(),
        }
      );
      if (updatedSessions.length > 0) {
        const updatedById = new Map(updatedSessions.map(session => [session.id, session]));
        this.sessions.update(values => values.map(item => updatedById.get(item.id) ?? item));
      }
      await this.reloadAllocationContext();
    } finally {
      this.saving.set(false);
    }
  }

  private confirmResetDay(): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmationService.confirm({
        message: this.translateService.instant('SESSION.ALLOCATION.CONFIRM_RESET_DAY'),
        header: this.translateService.instant('SESSION.ALLOCATION.RESET_DAY'),
        icon: 'pi pi-exclamation-triangle',
        acceptButtonProps: {
          label: this.translateService.instant('COMMON.REMOVE'),
          severity: 'danger',
        },
        rejectButtonProps: {
          label: this.translateService.instant('COMMON.CANCEL'),
          severity: 'secondary',
        },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  private async clearSlot(slotView: SlotView): Promise<void> {
    const current = this.allocationBySlotKey().get(slotView.key);
    if (!current?.id) {
      return;
    }

    await this.deallocateAllocations([current]);
  }

  private async deallocateAllocations(allocationsToRemove: SessionAllocationModel[]): Promise<void> {
    if (!allocationsToRemove.length) {
      return;
    }

    this.saving.set(true);
    try {
      const updatedSessions = await this.sessionDeallocationService.deallocateByAllocations(
        this.conferenceId(),
        allocationsToRemove,
        {
          allAllocations: this.allocations(),
          sessions: this.sessions(),
        }
      );
      if (updatedSessions.length > 0) {
        const updatedById = new Map(updatedSessions.map(session => [session.id, session]));
        this.sessions.update(values => values.map(item => updatedById.get(item.id) ?? item));
      }
      const slotKeysToRemove = new Set(
        allocationsToRemove.map((allocation) => this.toSlotKey(allocation.dayId, allocation.slotId, allocation.roomId))
      );
      this.allocations.update((values) =>
        values.filter((allocation) => !slotKeysToRemove.has(this.toSlotKey(allocation.dayId, allocation.slotId, allocation.roomId)))
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async assignSessionToSlot(sessionId: string, slotView: SlotView): Promise<boolean> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return false;
    }
    if (!this.isSessionTypeCompatibleById(sessionId, slotView)) {
      return false;
    }

    const currentTargetAllocation = this.allocationBySlotKey().get(slotView.key);
    const existingSessionAllocation = this.allocationBySessionId().get(sessionId);
    const replacedSessionId = currentTargetAllocation?.sessionId;

    if (currentTargetAllocation?.sessionId === sessionId) {
      return true;
    }

    const conflicts = this.findSpeakerAvailabilityConflicts(sessionId, slotView);
    if (conflicts.length > 0) {
      this.showAvailabilityConflict(conflicts);
      return false;
    }

    this.saving.set(true);
    try {
      if (replacedSessionId && replacedSessionId !== sessionId) {
        const updatedSessions = await this.sessionDeallocationService.deallocateByAllocations(
          conferenceId,
          [currentTargetAllocation!],
          {
            allAllocations: this.allocations(),
            sessions: this.sessions(),
            deleteAllocations: false,
          }
        );
        if (updatedSessions.length > 0) {
          const updatedById = new Map(updatedSessions.map(session => [session.id, session]));
          this.sessions.update(values => values.map(item => updatedById.get(item.id) ?? item));
        }
      }

      await this.updateSessionStatusForAllocation(sessionId);

      if (
        existingSessionAllocation?.id
        && this.toSlotKey(existingSessionAllocation.dayId, existingSessionAllocation.slotId, existingSessionAllocation.roomId) !== slotView.key
      ) {
        await this.sessionAllocationService.delete(existingSessionAllocation.id);
      }

      const allocationToSave: SessionAllocationModel = {
        ...(currentTargetAllocation ?? {
          id: '',
          lastUpdated: '',
        }),
        conferenceId,
        dayId: slotView.day.id,
        slotId: slotView.slot.id,
        roomId: slotView.room.id,
        sessionId,
      };

      const saved = await firstValueFrom(this.sessionAllocationService.save(allocationToSave));
      this.updateLocalAllocationsAfterSave(saved, slotView.key);
      return true;
    } finally {
      this.saving.set(false);
    }
  }

  private async updateSessionStatusForAllocation(sessionId: string): Promise<void> {
    const session = this.sessionById().get(sessionId);
    if (!session?.conference) {
      return;
    }

    const currentStatus = session.conference.status;
    const nextStatus = this.statusAfterAllocation(currentStatus);
    if (!nextStatus || nextStatus === currentStatus) {
      return;
    }

    const updated: Session = {
      ...session,
      conference: {
        ...session.conference,
        status: nextStatus,
      },
    };

    const saved = await firstValueFrom(this.sessionService.save(updated));
    this.sessions.update((values) =>
      values.map((item) => (item.id === saved.id ? saved : item))
    );
  }

  private statusAfterAllocation(currentStatus: SessionStatus): SessionStatus | null {
    if (currentStatus === 'ACCEPTED') {
      return 'SCHEDULED';
    }
    if (currentStatus === 'SPEAKER_CONFIRMED') {
      return 'PROGRAMMED';
    }
    return null;
  }

  private updateLocalAllocationsAfterSave(saved: SessionAllocationModel, targetSlotKey: string): void {
    this.allocations.update((values) => {
      const next = values.filter((allocation) => {
        if (allocation.id === saved.id) {
          return false;
        }
        if (allocation.sessionId === saved.sessionId) {
          return false;
        }
        return this.toSlotKey(allocation.dayId, allocation.slotId, allocation.roomId) !== targetSlotKey;
      });
      next.push(saved);
      return next;
    });
  }

  private toSlotKey(dayId: string, slotId: string, roomId: string): string {
    return `${dayId}::${slotId}::${roomId}`;
  }

  private isSessionTypeCompatibleById(sessionId: string, slotView: SlotView): boolean {
    const session = this.sessionById().get(sessionId);
    if (!session) {
      return false;
    }
    return this.isSessionTypeCompatible(session, slotView);
  }

  private isSessionTypeCompatible(session: Session, slotView: SlotView): boolean {
    const sessionTypeId = session.conference?.sessionTypeId ?? '';
    return sessionTypeId === (slotView.slot.sessionTypeId ?? '');
  }

  private sessionHasSpeakerWithUnavailability(session: Session): boolean {
    const conferenceSpeakerByPersonId = this.conferenceSpeakerByPersonId();
    return this.sessionSpeakerIds(session)
      .some((speakerId) => {
        const unavailableSlots = conferenceSpeakerByPersonId.get(speakerId)?.unavailableSlotsId ?? [];
        return unavailableSlots.length > 0;
      });
  }

  private findSpeakerAvailabilityConflicts(sessionId: string, slotView: SlotView): SpeakerAvailabilityConflict[] {
    const session = this.sessionById().get(sessionId);
    if (!session) {
      return [];
    }

    const conferenceSpeakerByPersonId = this.conferenceSpeakerByPersonId();
    const speakerDisplayById = this.speakerDisplayById();
    return this.sessionSpeakerIds(session)
      .map((speakerId) => {
        const conferenceSpeaker = conferenceSpeakerByPersonId.get(speakerId);
        const unavailableSlots = new Set(
          (conferenceSpeaker?.unavailableSlotsId ?? [])
            .map((slotId) => String(slotId ?? '').trim())
            .filter((slotId) => !!slotId)
        );
        if (!unavailableSlots.has(slotView.slot.id)) {
          return undefined;
        }

        const availableTimeRanges = this.availableTimeRangesForSpeakerOnDay(slotView.day, unavailableSlots);
        return {
          speakerLabel: speakerDisplayById.get(speakerId) ?? speakerId,
          availableTimeRanges,
        } as SpeakerAvailabilityConflict;
      })
      .filter((conflict): conflict is SpeakerAvailabilityConflict => !!conflict);
  }

  private availableTimeRangesForSpeakerOnDay(day: Day, unavailableSlots: Set<string>): string[] {
    const slotTypeById = this.slotTypeById();
    const availableRanges = (day.slots ?? [])
      .filter((slot) => !!slotTypeById.get(slot.slotTypeId)?.isSession)
      .filter((slot) => !unavailableSlots.has(slot.id))
      .map((slot) => `${slot.startTime}-${slot.endTime}`);
    return Array.from(new Set(availableRanges)).sort((a, b) => a.localeCompare(b));
  }

  private showAvailabilityConflict(conflicts: SpeakerAvailabilityConflict[]): void {
    const intro = this.translateService.instant('SESSION.ALLOCATION.UNAVAILABLE_CONFLICT_INTRO');
    const noAvailableSlots = this.translateService.instant('SESSION.ALLOCATION.UNAVAILABLE_NO_SLOT');
    const lines = conflicts.map((conflict) => {
      const availableSlotsLabel = conflict.availableTimeRanges.length > 0
        ? conflict.availableTimeRanges.join(', ')
        : noAvailableSlots;
      return `${conflict.speakerLabel}: ${availableSlotsLabel}`;
    });

    this.allocationConflictMessage.set([intro, ...lines].join('\n'));
    this.allocationConflictVisible.set(true);
  }

  private computeTimeOfDay(day: Day, timeStr: string): number {
    return new Date(`${day.date}T${timeStr}:00`).getTime();
  }

  private computeEnabledRooms(day: Day, conference: Conference): Room[] {
    const disabledRooms = new Set(day.disabledRoomIds ?? []);
    return conference.rooms.filter((room) => room.isSessionRoom && !disabledRooms.has(room.id));
  }

  private computeDayTimeline(
    day: Day,
    enabledRooms: Room[],
    slotTypeById: Map<string, SlotType>
  ): DayTimeline {
    const enabledRoomIds = new Set(enabledRooms.map((room) => room.id));
    const startTimes = Array.from(
      new Set(
        day.slots
          .filter((slot) => !!slotTypeById.get(slot.slotTypeId)?.isSession && enabledRoomIds.has(slot.roomId))
          .map((slot) => this.computeTimeOfDay(day, slot.startTime))
      )
    ).sort((a, b) => a - b);

    const ticks = startTimes.map((time) => ({
      label: this.conferenceService.formatHour(new Date(time)),
      main: true,
    }));
    const tickIndexByTime = new Map<number, number>(startTimes.map((time, idx) => [time, idx]));

    return {
      ticks,
      tickIndexByTime,
    };
  }

  private computeSlotViews(
    day: Day,
    enabledRooms: Room[],
    slotTypeById: Map<string, SlotType>,
    tickIndexByTime: Map<number, number>
  ): SlotView[] {
    const roomIndexById = new Map<string, number>(enabledRooms.map((room, idx) => [room.id, idx]));

    return day.slots
      .filter((slot) => !!slotTypeById.get(slot.slotTypeId)?.isSession)
      .map((slot) => {
        const roomColIdx = roomIndexById.get(slot.roomId);
        if (roomColIdx === undefined) {
          return undefined;
        }
        const room = enabledRooms[roomColIdx];
        const slotStart = this.computeTimeOfDay(day, slot.startTime);
        const startTick = tickIndexByTime.get(slotStart);
        if (startTick === undefined) {
          return undefined;
        }
        return {
          key: this.toSlotKey(day.id, slot.id, slot.roomId),
          day,
          slot,
          room,
          roomColIdx,
          startTick,
        };
      })
      .filter((value): value is SlotView => !!value)
      .sort((a, b) => {
        if (a.roomColIdx !== b.roomColIdx) {
          return a.roomColIdx - b.roomColIdx;
        }
        return a.slot.startTime.localeCompare(b.slot.startTime);
      });
  }

  private resolveTrack(session: Session): Track | undefined {
    const trackId = this.normalizeKey(session.conference?.trackId ?? '');
    if (!trackId) {
      return undefined;
    }
    return this.trackById().get(trackId);
  }

  private normalizeKey(value: string): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private computeTextColorForBackground(backgroundColor: string): string {
    const normalized = backgroundColor.trim();
    const shortHexMatch = normalized.match(/^#([0-9a-fA-F]{3})$/);
    const fullHexMatch = normalized.match(/^#([0-9a-fA-F]{6})$/);

    let r = 255;
    let g = 255;
    let b = 255;

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

  private loadSpeakerDisplay(sessions: Session[]): void {
    const speakerIds = Array.from(
      new Set(
        sessions.flatMap((session) => this.sessionSpeakerIds(session))
      )
    );

    if (!speakerIds.length) {
      this.speakerDisplayById.set(new Map());
      return;
    }

    forkJoin(
      speakerIds.map((speakerId) =>
        this.personService.byId(speakerId).pipe(
          take(1),
          map((person) => [speakerId, this.formatSpeaker(person?.lastName, person?.firstName, person?.speaker?.company)] as const),
          catchError(() => of([speakerId, ''] as const))
        )
      )
    ).subscribe((entries) => {
      this.speakerDisplayById.set(new Map(entries));
    });
  }

  private formatSpeaker(lastName?: string, firstName?: string, company?: string): string {
    const fullName = [lastName ?? '', firstName ?? ''].join(' ').trim();
    if (!fullName) {
      return '';
    }
    const companyPart = (company ?? '').trim();
    return companyPart ? `${fullName} (${companyPart})` : fullName;
  }

  private async reloadAllocationContext(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    const [sessions, allocations] = await Promise.all([
      firstValueFrom(this.sessionService.byConferenceId(conferenceId)),
      firstValueFrom(this.sessionAllocationService.byConferenceId(conferenceId)),
    ]);

    const validSessions = sessions.filter((session) => !!session.id);
    this.sessions.set(validSessions);
    this.allocations.set(allocations);
    this.loadSpeakerDisplay(validSessions);
  }

  private filterSessionsByKeyword(sessions: Session[], keyword: string): Session[] {
    const query = (keyword ?? '').trim().toLowerCase();
    if (query.length < 3) {
      return sessions;
    }
    return sessions.filter((session) => (session.search ?? '').toLowerCase().includes(query));
  }

  private sessionHasSpeaker(session: Session, speakerId: string): boolean {
    return this.sessionSpeakerIds(session).includes(speakerId);
  }

  private sessionSpeakerIds(session: Session): string[] {
    return [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .filter((speakerId): speakerId is string => !!speakerId);
  }

  private setDragPayload(event: DragEvent, payload: DragPayload): void {
    this.draggingPayload.set(payload);
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(payload));
  }

  private readDragPayload(event: DragEvent): DragPayload | null {
    const transferRaw = event.dataTransfer?.getData('text/plain');
    if (transferRaw) {
      try {
        const parsed = JSON.parse(transferRaw) as DragPayload;
        if (parsed?.sessionId) {
          return parsed;
        }
      } catch {
        return this.draggingPayload();
      }
    }
    return this.draggingPayload();
  }
}
