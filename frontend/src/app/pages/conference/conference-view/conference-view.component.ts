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
import { UserSignService } from '../../../services/usersign.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCalendarDays, faCircleInfo, faGlobe, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { SessionService } from '../../../services/session.service';
import { Session, SessionAllocation } from '../../../model/session.model';
import { SessionStatusBadgeComponent } from '../../../components/session-status-badge/session-status-badge.component';
import { PersonService } from '../../../services/person.service';
import { catchError, forkJoin, map, of, take } from 'rxjs';
import { SessionAllocationService } from '../../../services/session-allocation.service';

interface SessionSpeakerView {
  id: string;
  fullName: string;
  company: string;
}

@Component({
  selector: 'app-conference-view',
  standalone: true,
  imports: [
    CardModule,
    CommonModule,
    FontAwesomeModule,
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
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly personService = inject(PersonService);
  private readonly userSignService = inject(UserSignService);
  private readonly _conference = signal<Conference | undefined>(undefined);
  private readonly _activities = signal<Activity[]>([]);
  private readonly _speakerSessions = signal<Session[]>([]);
  private readonly _sessionAllocations = signal<SessionAllocation[]>([]);
  private readonly speakerInfoById = signal<Map<string, SessionSpeakerView>>(new Map());
  private translateService = inject(TranslateService);
  lang = computed(() => this.translateService.getCurrentLang().toUpperCase());
  currentPerson = computed(() => this.userSignService.getCurrentPerson());

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (conferenceId) {
      this.conferenceService.byId(conferenceId).subscribe((conf: Conference | undefined) => this._conference.set(conf));
      this.activityService.byConferenceId(conferenceId).subscribe((activities) => this._activities.set(activities ?? []));
      this.sessionAllocationService.byConferenceId(conferenceId).subscribe((allocations) => this._sessionAllocations.set(allocations ?? []));
    }

    effect((onCleanup) => {
      const conference = this.conference();
      const person = this.currentPerson();
      const conferenceId = String(conference?.id ?? '').trim();
      const speakerId = String(person?.id ?? '').trim();

      if (!conferenceId || !speakerId || !person?.isSpeaker) {
        this._speakerSessions.set([]);
        return;
      }

      const sub = this.sessionService.bySpeaker(speakerId).subscribe((sessions) => {
        const feedbackSessions = (sessions ?? [])
          .filter((session) => String(session.conference?.conferenceId ?? '').trim() === conferenceId)
          .sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')));
        this._speakerSessions.set(feedbackSessions);
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
    if (!person || !conference) {
      return false;
    }
    const email = String(person.email ?? '').trim().toLowerCase();
    if (!email) {
      return false;
    }
    return (conference.organizerEmails ?? [])
      .map((organizerEmail) => String(organizerEmail ?? '').trim().toLowerCase())
      .includes(email);
  });

  private readonly userRoles = computed<ParticipantType[]>(() => {
    const person = this.currentPerson();
    const conference = this.conference();
    if (!person || !conference) {
      return [];
    }
    const roles = new Set<ParticipantType>(['ATTENDEE']);
    if (person.isSpeaker) {
      roles.add('SPEAKER');
    }
    if (conference.organizerEmails?.includes(person.email)) {
      roles.add('ORGANIZER');
    }
    return Array.from(roles);
  });

  visibleActivities = computed(() => {
    const roles = new Set(this.userRoles());
    return this._activities()
      .filter((activity) => {
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

  sessionTypeName(session: Session): string {
    return this.sessionType(session)?.name ?? this.translateService.instant('SESSION.LIST.UNKNOWN_SESSION_TYPE');
  }

  sessionTrackName(session: Session): string {
    return this.sessionTrack(session)?.name ?? this.translateService.instant('SESSION.LIST.UNKNOWN_TRACK');
  }

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
}
