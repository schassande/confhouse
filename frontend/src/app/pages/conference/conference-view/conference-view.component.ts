import { ChangeDetectionStrategy, Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ConferenceService } from '../../../services/conference.service';
import { Conference, SessionType, Track } from '../../../model/conference.model';
import { TranslateService } from '@ngx-translate/core';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TranslateModule } from '@ngx-translate/core';
import { Activity, ParticipantType } from '../../../model/activity.model';
import { ActivityService } from '../../../services/activity.service';
import { ActivityParticipationService } from '../../../services/activity-participation.service';
import { UserSignService } from '../../../services/usersign.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCalendarDays, faCircleInfo, faGlobe, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { SessionService } from '../../../services/session.service';
import { Session, SessionAllocation } from '../../../model/session.model';
import { SessionStatusBadgeComponent } from '../../../components/session-status-badge/session-status-badge.component';
import { PersonService } from '../../../services/person.service';
import { catchError, forkJoin, map, of, take } from 'rxjs';
import { SessionAllocationService } from '../../../services/session-allocation.service';
import { ConferenceOrganizerService } from '../../../services/conference-organizer.service';
import {
  SpeakerSessionDecision,
  SpeakerSessionManagementService,
} from '../../../services/speaker-session-management.service';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { RadioButtonModule } from 'primeng/radiobutton';

interface SessionSpeakerView {
  id: string;
  fullName: string;
  company: string;
}

type ActivityResponseState = 'UNKNOWN' | 'YES' | 'NO';

@Component({
  selector: 'app-conference-view',
  standalone: true,
  imports: [
    ButtonModule,
    CardModule,
    CommonModule,
    DialogModule,
    FontAwesomeModule,
    FormsModule,
    RadioButtonModule,
    RouterModule,
    TagModule,
    TranslateModule,
    SessionStatusBadgeComponent,
  ],
  templateUrl: './conference-view.component.html',
  styleUrls: ['./conference-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceViewComponent {
  readonly faCalendarDays = faCalendarDays;
  readonly faLocationDot = faLocationDot;
  readonly faCircleInfo = faCircleInfo;
  readonly faGlobe = faGlobe;

  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly activityService = inject(ActivityService);
  private readonly activityParticipationService = inject(ActivityParticipationService);
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly speakerSessionManagementService = inject(SpeakerSessionManagementService);
  private readonly personService = inject(PersonService);
  private readonly userSignService = inject(UserSignService);
  private readonly conferenceOrganizerService = inject(ConferenceOrganizerService);
  private readonly _conference = signal<Conference | undefined>(undefined);
  private readonly _activities = signal<Activity[]>([]);
  private readonly _activityResponseByActivityId = signal<Map<string, ActivityResponseState>>(new Map());
  private readonly _speakerSessions = signal<Session[]>([]);
  private readonly _sessionAllocations = signal<SessionAllocation[]>([]);
  private readonly _isConferenceSpeaker = signal(false);
  private readonly speakerInfoById = signal<Map<string, SessionSpeakerView>>(new Map());
  readonly sessionActionDialogVisible = signal(false);
  readonly selectedSessionAction = signal<SpeakerSessionDecision>('CANCEL_SESSION');
  readonly sessionActionTarget = signal<Session | null>(null);
  readonly processingSessionActionId = signal('');
  readonly sessionActionErrorKey = signal('');
  readonly dashboardRefreshWarning = signal(false);
  private translateService = inject(TranslateService);
  lang = computed(() => (this.translateService.getCurrentLang() ?? 'EN').toUpperCase());
  currentPerson = computed(() => this.userSignService.getCurrentPerson());

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (conferenceId) {
      this.conferenceService.byId(conferenceId).subscribe((conf: Conference | undefined) => this._conference.set(conf));
      this.activityService.byConferenceId(conferenceId).subscribe((activities) => this._activities.set(activities ?? []));
      this.sessionAllocationService.byConferenceId(conferenceId).subscribe((allocations) => this._sessionAllocations.set(allocations ?? []));
    }

    effect((onCleanup) => {
      const conferenceId = String(this.conference()?.id ?? '').trim();
      const personId = String(this.currentPerson()?.id ?? '').trim();
      if (!conferenceId || !personId) {
        this._activityResponseByActivityId.set(new Map());
        return;
      }

      const sub = this.activityParticipationService.byConferenceAndPersonId(conferenceId, personId).subscribe((participations) => {
        const next = new Map<string, ActivityResponseState>();
        (participations ?? [])
          .forEach((item) => {
            const activityId = String(item.activityId ?? '').trim();
            if (!activityId) {
              return;
            }
            next.set(activityId, item.participation ? 'YES' : 'NO');
          });
        this._activityResponseByActivityId.set(next);
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect((onCleanup) => {
      const conference = this.conference();
      const person = this.currentPerson();
      const conferenceId = String(conference?.id ?? '').trim();
      const speakerId = String(person?.id ?? '').trim();

      if (!conferenceId || !speakerId) {
        this._speakerSessions.set([]);
        this._isConferenceSpeaker.set(false);
        return;
      }

      const sub = this.sessionService.bySpeaker(speakerId).subscribe((sessions) => {
        const feedbackSessions = (sessions ?? [])
          .filter((session) => String(session.conference?.conferenceId ?? '').trim() === conferenceId)
          .sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')));
        this._speakerSessions.set(feedbackSessions);
        this._isConferenceSpeaker.set(
          feedbackSessions.some((session) => {
            const status = session.conference?.status;
            return status === 'ACCEPTED' || status === 'PROGRAMMED';
          })
        );
      });

      onCleanup(() => sub.unsubscribe());
    });

    effect((onCleanup) => {
      const sessions = this.speakerFeedbackSessions();
      const speakerIds = Array.from(
        new Set(
          sessions.flatMap((session) =>
            [session.speaker1Id, session.speaker2Id, session.speaker3Id]
              .map((id) => String(id ?? '').trim())
              .filter((id) => !!id)
          )
        )
      );

      if (speakerIds.length === 0) {
        this.speakerInfoById.set(new Map());
        return;
      }

      const sub = forkJoin(
        speakerIds.map((speakerId) =>
          this.personService.byId(speakerId).pipe(
            take(1),
            map((person) => {
              const firstName = String(person?.firstName ?? '').trim();
              const lastName = String(person?.lastName ?? '').trim();
              const fullName = `${firstName} ${lastName}`.trim() || this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER');
              const company = String(person?.speaker?.company ?? '').trim();
              return [
                speakerId,
                {
                  id: speakerId,
                  fullName,
                  company,
                },
              ] as const;
            }),
            catchError(() =>
              of([
                speakerId,
                {
                  id: speakerId,
                  fullName: this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER'),
                  company: '',
                },
              ] as const)
            )
          )
        )
      ).subscribe((entries) => this.speakerInfoById.set(new Map(entries)));

      onCleanup(() => sub.unsubscribe());
    });
  }

  conference = computed(() => this._conference());
  isConferenceSpeaker = computed(() => this._isConferenceSpeaker());

  /**
   * Computes conference start/end dates from configured days.
   *
   * @param conf Conference source.
   * @returns Date range when available.
   */
  conferenceDateRange(conf: Conference): { start?: string; end?: string } {
    const sortedDates = [...(conf.days ?? [])]
      .map((day) => day.date)
      .filter((date): date is string => !!date)
      .sort((a, b) => a.localeCompare(b));

    if (!sortedDates.length) {
      return {};
    }

    return { start: sortedDates[0], end: sortedDates[sortedDates.length - 1] };
  }

  /**
   * Computes CFP date range if both bounds are valid dates.
   *
   * @param conf Conference source.
   * @returns CFP date range or `null`.
   */
  cfpDateRange(conf: Conference): { start: string; end: string } | null {
    const start = String(conf.cfp?.startDate ?? '').trim();
    const end = String(conf.cfp?.endDate ?? '').trim();
    if (!start || !end) {
      return null;
    }

    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      return null;
    }

    return { start, end };
  }

  canManageConference = computed(() => {
    const person = this.currentPerson();
    const conference = this.conference();
    return this.conferenceOrganizerService.isConferenceOrganizer(conference, person?.email);
  });

  private readonly userRoles = computed<ParticipantType[]>(() => {
    const person = this.currentPerson();
    const conference = this.conference();
    if (!person || !conference) {
      return [];
    }
    const roles = new Set<ParticipantType>(['ATTENDEE']);
    if (this.isConferenceSpeaker()) {
      roles.add('SPEAKER');
    }
    if (this.conferenceOrganizerService.isConferenceOrganizer(conference, person.email)) {
      roles.add('ORGANIZER');
    }
    return Array.from(roles);
  });

  visibleActivities = computed(() => {
    const roles = new Set(this.userRoles());
    
    return this._activities()
      .filter((activity) => {
        if (!activity.registerParticipant) {
          return false;
        }
        const allowed = activity.participantTypes ?? [];
        if (allowed.length === 0) {
          return true;
        }
        if (allowed.every((role) => role === 'ORGANIZER')) {
          return false;
        }
        return allowed.some((role) => roles.has(role));
      })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  });

  speakerFeedbackSessions = computed(() => this._speakerSessions());

  /**
   * Resolves the response state for one activity.
   *
   * @param activityId Activity identifier.
   * @returns Current response state.
   */
  activityResponseState(activityId: string): ActivityResponseState {
    return this._activityResponseByActivityId().get(String(activityId ?? '').trim()) ?? 'UNKNOWN';
  }

  nonRespondedActivityCount = computed(() =>
    this.visibleActivities().filter((activity) => this.activityResponseState(activity.id) === 'UNKNOWN').length
  );

  private readonly sessionAllocationBySessionId = computed(() => {
    const map = new Map<string, SessionAllocation>();
    this._sessionAllocations().forEach((allocation) => {
      const sessionId = String(allocation.sessionId ?? '').trim();
      if (!sessionId || map.has(sessionId)) {
        return;
      }
      map.set(sessionId, allocation);
    });
    return map;
  });

  sessionTrack(session: Session): Track | undefined {
    const trackId = String(session.conference?.trackId ?? '').trim();
    return this.conference()?.tracks?.find((track) => track.id === trackId);
  }

  sessionType(session: Session): SessionType | undefined {
    const sessionTypeId = String(session.conference?.sessionTypeId ?? '').trim();
    return this.conference()?.sessionTypes?.find((item) => item.id === sessionTypeId);
  }

  /**
   * Gets the translated session type label fallback.
   *
   * @param session Session source.
   * @returns Session type label.
   */
  sessionTypeName(session: Session): string {
    return this.sessionType(session)?.name ?? this.translateService.instant('SESSION.LIST.UNKNOWN_SESSION_TYPE');
  }

  /**
   * Gets the translated track label fallback.
   *
   * @param session Session source.
   * @returns Track label.
   */
  sessionTrackName(session: Session): string {
    return this.sessionTrack(session)?.name ?? this.translateService.instant('SESSION.LIST.UNKNOWN_TRACK');
  }

  /**
   * Resolves full speaker view models for a session.
   *
   * @param session Session source.
   * @returns Speaker view list.
   */
  sessionSpeakers(session: Session): SessionSpeakerView[] {
    const mapById = this.speakerInfoById();
    return [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .map((id) => String(id ?? '').trim())
      .filter((id) => !!id)
      .map((id) => mapById.get(id) ?? {
        id,
        fullName: this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER'),
        company: '',
      });
  }

  /**
   * Resolves the allocated slot label for a session.
   *
   * @param session Session source.
   * @returns Human-readable slot label, empty when unallocated.
   */
  sessionSlotLabel(session: Session): string {
    const sessionId = String(session.id ?? '').trim();
    if (!sessionId) {
      return '';
    }

    const allocation = this.sessionAllocationBySessionId().get(sessionId);
    if (!allocation) {
      return '';
    }

    const day = (this.conference()?.days ?? []).find((candidate) => candidate.id === allocation.dayId);
    if (!day) {
      return '';
    }

    const slot = (day.slots ?? []).find((candidate) => candidate.id === allocation.slotId);
    if (!slot) {
      return '';
    }

    return `${day.date} ${slot.startTime} - ${slot.endTime}`;
  }

  /**
   * Returns whether speaker action is available for this session.
   *
   * @param session Session source.
   * @returns `true` when cancellation/withdrawal is allowed.
   */
  canManageSpeakerSession(session: Session): boolean {
    const status = session.conference?.status;
    return status === 'ACCEPTED'
      || status === 'SPEAKER_CONFIRMED'
      || status === 'SCHEDULED'
      || status === 'PROGRAMMED';
  }

  /**
   * Returns whether "remove speaker only" is available.
   *
   * @param session Session source.
   * @returns `true` when more than one speaker is attached.
   */
  canRemoveSpeakerOnly(session: Session): boolean {
    return this.sessionSpeakers(session).length > 1;
  }

  /**
   * Opens the session speaker action dialog for one session.
   *
   * @param session Target session.
   */
  openSessionActionDialog(session: Session): void {
    if (!this.canManageSpeakerSession(session)) {
      return;
    }
    this.sessionActionErrorKey.set('');
    this.dashboardRefreshWarning.set(false);
    this.sessionActionTarget.set(session);
    this.selectedSessionAction.set(this.canRemoveSpeakerOnly(session) ? 'REMOVE_SPEAKER_ONLY' : 'CANCEL_SESSION');
    this.sessionActionDialogVisible.set(true);
  }

  /**
   * Closes the session speaker action dialog.
   */
  closeSessionActionDialog(): void {
    this.sessionActionDialogVisible.set(false);
    this.sessionActionTarget.set(null);
  }

  /**
   * Applies the selected speaker action and updates local state.
   */
  async confirmSessionAction(): Promise<void> {
    const session = this.sessionActionTarget();
    const conferenceId = String(this.conference()?.id ?? '').trim();
    const speakerId = String(this.currentPerson()?.id ?? '').trim();
    const sessionId = String(session?.id ?? '').trim();
    if (!session || !conferenceId || !speakerId || !sessionId) {
      return;
    }

    this.processingSessionActionId.set(sessionId);
    this.sessionActionErrorKey.set('');
    this.dashboardRefreshWarning.set(false);
    try {
      const result = await this.speakerSessionManagementService.processSpeakerSessionDecision({
        conferenceId,
        session,
        speakerId,
        decision: this.selectedSessionAction(),
      });

      const updatedSessionById = new Map<string, Session>();
      updatedSessionById.set(String(result.updatedSession.id ?? '').trim(), result.updatedSession);
      result.deallocation.updatedSessions.forEach((updatedSession) => {
        updatedSessionById.set(String(updatedSession.id ?? '').trim(), updatedSession);
      });

      this._speakerSessions.update((sessions) =>
        sessions
          .map((value) => updatedSessionById.get(String(value.id ?? '').trim()) ?? value)
          .filter((value) => this.sessionContainsSpeaker(value, speakerId))
      );

      const removedAllocationIdSet = new Set(
        result.deallocation.deallocatedAllocations
          .map((allocation) => String(allocation.id ?? '').trim())
          .filter((allocationId) => !!allocationId)
      );
      if (removedAllocationIdSet.size > 0) {
        this._sessionAllocations.update((allocations) =>
          allocations.filter((allocation) => !removedAllocationIdSet.has(String(allocation.id ?? '').trim()))
        );
      }

      if (result.removedFromConferenceSpeakerIds.includes(speakerId)) {
        this._isConferenceSpeaker.set(false);
      }
      this.dashboardRefreshWarning.set(result.dashboardRefreshFailed);
      this.closeSessionActionDialog();
    } catch (error) {
      console.error('Error while applying speaker session action:', error);
      this.sessionActionErrorKey.set('CONFERENCE.VIEW.SESSION.ACTION_ERROR');
    } finally {
      this.processingSessionActionId.set('');
    }
  }

  /**
   * Computes a readable text color for a solid background color.
   *
   * @param backgroundColor Hex color.
   * @returns Foreground color.
   */
  computeTextColorForBackground(backgroundColor: string): string {
    const normalized = String(backgroundColor ?? '').trim();
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

  /**
   * Checks if a session still contains a speaker id.
   *
   * @param session Session source.
   * @param speakerId Speaker identifier.
   * @returns `true` when attached to speaker slots.
   */
  private sessionContainsSpeaker(session: Session, speakerId: string): boolean {
    const normalizedSpeakerId = String(speakerId ?? '').trim();
    return [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .map((id) => String(id ?? '').trim())
      .includes(normalizedSpeakerId);
  }
}
