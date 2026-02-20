import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, combineLatest, forkJoin, map, of, take } from 'rxjs';
import { SessionService } from '../../../services/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Session, SessionStatus } from '../../../model/session.model';
import { getSessionStatusTranslationKey } from '../../../model/session-status.utils';
import { PersonService } from '../../../services/person.service';
import { SessionStatusBadgeComponent } from '../../../components/session-status-badge/session-status-badge.component';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';

interface SessionForView {
  session: Session;
  speakerNames: string[];
  sessionTypeName: string;
  sessionTypeColor: string;
  sessionTypeTextColor: string;
  trackName: string;
  trackColor: string;
  trackTextColor: string;
}

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-session-list',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    DataViewModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TagModule,
    SessionStatusBadgeComponent,
  ],
  templateUrl: './session-list.html',
  styleUrl: './session-list.scss',
})
export class SessionList implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly personService = inject(PersonService);
  private readonly sessionService = inject(SessionService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conference = signal<Conference | undefined>(undefined);
  private readonly translateService = inject(TranslateService);
  private readonly sessions = signal<Session[]>([]);
  private readonly speakerNamesById = signal<Map<string, string>>(new Map());

  readonly loading = signal(false);
  readonly searchText = signal('');
  readonly selectedStatuses = signal<SessionStatus[]>([]);
  readonly selectedSessionTypeIds = signal<string[]>([]);
  readonly selectedTrackIds = signal<string[]>([]);
  readonly sortBy = signal<'name' | 'statusSubmitDate'>('name');
  readonly conferenceName = computed(() => {
    const conference = this.conference();
    if (!conference) {
      return '';
    }
    const name = String(conference.name ?? '').trim();
    const edition = String(conference.edition ?? '').trim();
    return edition ? `${name} ${edition}` : name;
  });
  readonly searchPlaceholder$ = this.translateService.stream('SESSION.LIST.SEARCH_PLACEHOLDER');
  readonly sortPlaceholder$ = this.translateService.stream('SESSION.LIST.SORT_BY');
  readonly statusFilterPlaceholder$ = this.translateService.stream('SESSION.LIST.FILTER_STATUS');
  readonly sessionTypeFilterPlaceholder$ = this.translateService.stream('SESSION.LIST.FILTER_SESSION_TYPE');
  readonly trackFilterPlaceholder$ = this.translateService.stream('SESSION.LIST.FILTER_TRACK');
  private readonly sessionStatusTranslations = toSignal(
    this.translateService.stream('SESSION.STATUS'),
    { initialValue: {} as Record<string, string> }
  );
  private readonly sortLabels = toSignal(
    combineLatest([
      this.translateService.stream('SESSION.LIST.SORT_NAME'),
      this.translateService.stream('SESSION.LIST.SORT_STATUS_SUBMIT'),
    ]),
    { initialValue: ['', ''] }
  );

  readonly sortOptions = computed<SelectOption[]>(() => {
    const [sortByName, sortByStatusSubmit] = this.sortLabels();
    return [
      {
        label: sortByName,
        value: 'name',
      },
      {
        label: sortByStatusSubmit,
        value: 'statusSubmitDate',
      },
    ];
  });

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

  readonly statusOptions = computed<SelectOption[]>(() => {
    const statuses = new Set<SessionStatus>();
    this.sessions().forEach((session) => {
      const status = session.conference?.status;
      if (status) {
        statuses.add(status);
      }
    });
    return Array.from(statuses)
      .sort((a, b) => a.localeCompare(b))
      .map((status) => ({
        label: this.translateStatusLabel(status),
        value: status,
      }));
  });

  readonly sessionsForView = computed<SessionForView[]>(() => {
    const namesById = this.speakerNamesById();
    const conference = this.conference();

    return this.sessions().map((session) => {
      const speakers = [session.speaker1Id, session.speaker2Id, session.speaker3Id]
        .filter((id): id is string => !!id)
        .map((speakerId) => namesById.get(speakerId) ?? this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER'));

      const sessionTypeId = session.conference?.sessionTypeId;
      const trackId = session.conference?.trackId;
      const sessionType = conference?.sessionTypes.find((type) => type.id === sessionTypeId);
      const track = conference?.tracks.find((item) => item.id === trackId);

      const sessionTypeName =
        sessionType?.name ??
        this.translateService.instant('SESSION.LIST.UNKNOWN_SESSION_TYPE');
      const trackName =
        track?.name ??
        this.translateService.instant('SESSION.LIST.UNKNOWN_TRACK');
      const sessionTypeColor = sessionType?.color ?? '#64748B';
      const trackColor = track?.color ?? '#334155';

      return {
        session,
        speakerNames: speakers,
        sessionTypeName,
        sessionTypeColor,
        sessionTypeTextColor: this.computeTextColorForBackground(sessionTypeColor),
        trackName,
        trackColor,
        trackTextColor: this.computeTextColorForBackground(trackColor),
      };
    });
  });

  readonly filteredSortedSessions = computed<SessionForView[]>(() => {
    let values = [...this.sessionsForView()];
    const statuses = this.selectedStatuses();
    const typeIds = this.selectedSessionTypeIds();
    const trackIds = this.selectedTrackIds();
    const words = this.searchText()
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);

    if (statuses.length > 0) {
      values = values.filter((value) => {
        const status = value.session.conference?.status;
        return !!status && statuses.includes(status);
      });
    }

    if (typeIds.length > 0) {
      values = values.filter((value) =>
        typeIds.includes(value.session.conference?.sessionTypeId ?? '')
      );
    }

    if (trackIds.length > 0) {
      values = values.filter((value) =>
        trackIds.includes(value.session.conference?.trackId ?? '')
      );
    }

    if (words.length > 0) {
      values = values.filter((value) => {
        const search = (value.session.search ?? '').toLowerCase();
        return words.every((word) => search.includes(word));
      });
    }

    if (this.sortBy() === 'statusSubmitDate') {
      values.sort((a, b) => {
        const statusCompare = (a.session.conference?.status ?? '').localeCompare(
          b.session.conference?.status ?? ''
        );
        if (statusCompare !== 0) {
          return statusCompare;
        }
        const timeA = Date.parse(a.session.conference?.submitDate ?? '');
        const timeB = Date.parse(b.session.conference?.submitDate ?? '');
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      });
    } else {
      values.sort((a, b) => a.session.title.localeCompare(b.session.title));
    }

    return values;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('conferenceId');
    if (!id) {
      return;
    }

    this.loading.set(true);
    this.conferenceService.byId(id).subscribe((conf: Conference | undefined) => this.conference.set(conf));
    this.sessionService.byConferenceId(id).subscribe((sessions) => {
      this.sessions.set(sessions);
      this.loadSpeakerNames(sessions);
    });
  }

  openSessionEdit(sessionId: string): void {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (!conferenceId) {
      return;
    }
    void this.router.navigate(['/conference', conferenceId, 'sessions', sessionId, 'edit']);
  }

  onAddSession(): void {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (!conferenceId) {
      return;
    }
    void this.router.navigate(['/conference', conferenceId, 'sessions', 'create']);
  }

  private computeTextColorForBackground(backgroundColor: string): string {
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

  private translateStatusLabel(status: SessionStatus | string | undefined): string {
    const key = getSessionStatusTranslationKey(status).replace('SESSION.STATUS.', '');
    const labels = this.sessionStatusTranslations();
    return labels?.[key] ?? String(status ?? '');
  }

  private loadSpeakerNames(sessions: Session[]): void {
    const speakerIds = Array.from(
      new Set(
        sessions.flatMap((session) =>
          [session.speaker1Id, session.speaker2Id, session.speaker3Id].filter(
            (speakerId): speakerId is string => !!speakerId
          )
        )
      )
    );

    if (speakerIds.length === 0) {
      this.speakerNamesById.set(new Map());
      this.loading.set(false);
      return;
    }

    forkJoin(
      speakerIds.map((speakerId) =>
        this.personService.byId(speakerId).pipe(
          take(1),
          map((person) => [
            speakerId,
            person ? `${person.firstName} ${person.lastName}`.trim() : this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER'),
          ] as const),
          catchError(() =>
            of([speakerId, this.translateService.instant('SESSION.LIST.UNKNOWN_SPEAKER')] as const)
          )
        )
      )
    ).subscribe((entries) => {
      this.speakerNamesById.set(new Map(entries));
      this.loading.set(false);
    });
  }
}
