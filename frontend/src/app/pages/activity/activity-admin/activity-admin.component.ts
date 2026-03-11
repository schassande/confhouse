import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { firstValueFrom, take } from 'rxjs';
import { Activity, ActivityAttribute, ActivityParticipation } from '../../../model/activity.model';
import { Person } from '../../../model/person.model';
import { ConferenceSpeaker } from '../../../model/speaker.model';
import { ActivityParticipationService } from '../../../services/activity-participation.service';
import {
  ActivityParticipantExportRow,
  ActivitySpeakerParticipationService,
  SpeakerNonRespondentRow,
} from '../../../services/activity-speaker-participation.service';
import { ActivityService } from '../../../services/activity.service';
import { PersonService } from '../../../services/person.service';

interface AttributeStat {
  attributeName: string;
  attributeType: ActivityAttribute['attributeType'];
  trueCount: number;
  values: Array<{ value: string; count: number }>;
}

interface ParticipantRow {
  rowId: string;
  targetPersonId: string;
  participation?: ActivityParticipation;
  conferenceSpeaker?: ConferenceSpeaker;
  person?: Person;
  displayName: string;
  email: string;
  attributes: Array<{ name: string; value: string }>;
  searchField: string;
  status: Exclude<ParticipationFilter, 'ALL'>;
}

type ParticipationFilter = 'ALL' | 'ACCEPTED' | 'REFUSED' | 'NON_RESPONDED';

@Component({
  selector: 'app-activity-admin',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    DataViewModule,
    TagModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
  ],
  templateUrl: './activity-admin.component.html',
  styleUrl: './activity-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityAdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translateService = inject(TranslateService);
  private readonly activityService = inject(ActivityService);
  private readonly activityParticipationService = inject(ActivityParticipationService);
  private readonly activitySpeakerParticipationService = inject(ActivitySpeakerParticipationService);
  private readonly personService = inject(PersonService);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly activityId = computed(() => this.route.snapshot.paramMap.get('activityId') ?? '');
  readonly loading = signal(true);
  readonly activity = signal<Activity | undefined>(undefined);
  readonly participations = signal<ActivityParticipation[]>([]);
  readonly personsById = signal<Map<string, Person>>(new Map());
  readonly searchKeyword = signal('');
  readonly participationFilter = signal<ParticipationFilter>('ALL');
  readonly nonRespondedSpeakerRows = signal<SpeakerNonRespondentRow[]>([]);
  readonly loadingNonRespondedSpeakers = signal(false);

  readonly pageTitle = computed(() => {
    const activity = this.activity();
    return this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.TITLE', { name: activity?.name ?? '' });
  });

  readonly respondedCount = computed(() => this.participations().length);
  readonly yesParticipationCount = computed(() =>
    this.participations().filter((participation) => !!participation.participation).length
  );
  readonly noParticipationCount = computed(() => this.respondedCount() - this.yesParticipationCount());
  readonly nonRespondedCount = computed(() => this.nonRespondedSpeakerRows().length);

  readonly attributeStats = computed<AttributeStat[]>(() => {
    const activity = this.activity();
    if (!activity) {
      return [];
    }
    const participations = this.participations().filter((participation) => !!participation.participation);
    return (activity.specificAttributes ?? [])
      .filter((attribute) => attribute.attributeType === 'LIST' || attribute.attributeType === 'BOOLEAN')
      .map((attribute) => this.computeAttributeStat(attribute, participations));
  });

  readonly participantRows = computed<ParticipantRow[]>(() => {
    const personsById = this.personsById();
    return [
      ...this.participations().map((participation) => this.toRespondedParticipantRow(participation, personsById)),
      ...this.nonRespondedSpeakerRows().map((row) => this.toNonRespondedParticipantRow(row)),
    ]
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  readonly filteredParticipantRows = computed<ParticipantRow[]>(() => {
    const keyword = String(this.searchKeyword() ?? '').trim().toLowerCase();
    const filter = this.participationFilter();
    return this.participantRows().filter((row) => {
      const byKeyword = !keyword || row.searchField.includes(keyword);
      if (!byKeyword) {
        return false;
      }
      if (filter === 'ACCEPTED') {
        return row.status === 'ACCEPTED';
      }
      if (filter === 'REFUSED') {
        return row.status === 'REFUSED';
      }
      if (filter === 'NON_RESPONDED') {
        return row.status === 'NON_RESPONDED';
      }
      return true;
    });
  });

  readonly participationFilterOptions = computed(() => [
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.FILTER_ALL'), value: 'ALL' as ParticipationFilter },
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.ACCEPTED'), value: 'ACCEPTED' as ParticipationFilter },
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.REFUSED'), value: 'REFUSED' as ParticipationFilter },
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.NON_RESPONDED'), value: 'NON_RESPONDED' as ParticipationFilter },
  ]);

  /**
   * Initializes the page by loading the selected activity and its participation data.
   */
  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }
    this.activityService.byConferenceId(conferenceId).pipe(take(1)).subscribe({
      next: async (activities) => {
        const activityId = this.activityId();
        if (!activityId) {
          this.loading.set(false);
          return;
        }
        const current = (activities ?? []).find((item) => item.id === activityId);
        this.activity.set(current);
        if (!current) {
          this.loading.set(false);
          return;
        }
        await this.loadParticipants(conferenceId, current.id);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading activities for admin:', error);
        this.loading.set(false);
      },
    });
  }

  /**
   * Resolves a localized participant type label.
   *
   * @param type Raw participant type.
   * @returns Localized label or a fallback.
   */
  participantTypeLabel(type: string | undefined): string {
    const normalized = String(type ?? '').trim();
    if (!normalized) {
      return this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.UNKNOWN_TYPE');
    }
    const translated = this.translateService.instant(`CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.${normalized}`);
    return translated === `CONFERENCE.ACTIVITIES.PARTICIPANT_TYPE.${normalized}`
      ? normalized
      : translated;
  }

  /**
   * Updates the participant search keyword.
   *
   * @param value Raw input value.
   */
  onSearchKeywordChange(value: string): void {
    this.searchKeyword.set(String(value ?? ''));
  }

  /**
   * Updates the participation filter.
   *
   * @param value Selected filter value.
   */
  onParticipationFilterChange(value: ParticipationFilter): void {
    this.participationFilter.set(value ?? 'ALL');
  }

  /**
   * Opens the participation form to create a new response.
   */
  addParticipation(): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'activities', this.activityId(), 'participation']);
  }

  /**
   * Opens the participation form for one existing response.
   *
   * @param row Participant row to edit.
   */
  editParticipation(row: ParticipantRow): void {
    void this.router.navigate(
      ['/conference', this.conferenceId(), 'activities', this.activityId(), 'participation'],
      { queryParams: { personId: row.targetPersonId } }
    );
  }

  /**
   * Downloads the activity participants list as an Excel workbook.
   */
  async exportParticipantsExcel(): Promise<void> {
    const activity = this.activity();
    const rows = this.participantRows();
    if (!activity || rows.length === 0) {
      return;
    }

    await this.activitySpeakerParticipationService.downloadParticipantsWorkbook(
      this.buildParticipantsExportFileName(),
      activity,
      rows.map((row) => this.toActivityParticipantExportRow(row)),
      {
        firstName: this.translateService.instant('PERSON.EDIT.FIRSTNAME'),
        lastName: this.translateService.instant('PERSON.EDIT.LASTNAME'),
        status: this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.EXPORT_STATUS'),
      }
    );
  }

  /**
   * Converts one participant row into an export row.
   *
   * @param row Participant row.
   * @returns Export row.
   */
  private toActivityParticipantExportRow(row: ParticipantRow): ActivityParticipantExportRow {
    return {
      firstName: String(row.person?.firstName ?? '').trim(),
      lastName: String(row.person?.lastName ?? '').trim(),
      statusLabel: this.participantStatusLabel(row.status),
      attributesByName: Object.fromEntries(
        (row.attributes ?? []).map((attribute) => [
          String(attribute.name ?? '').trim(),
          String(attribute.value ?? '').trim(),
        ])
      ),
    };
  }

  /**
   * Resolves the localized label of one participant status.
   *
   * @param status Participant status.
   * @returns Localized label.
   */
  private participantStatusLabel(status: Exclude<ParticipationFilter, 'ALL'>): string {
    if (status === 'ACCEPTED') {
      return this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.ACCEPTED');
    }
    if (status === 'REFUSED') {
      return this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.REFUSED');
    }
    return this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.NON_RESPONDED');
  }

  /**
   * Builds the file name for the participants Excel export.
   *
   * @returns Safe file name.
   */
  private buildParticipantsExportFileName(): string {
    const activityName = String(this.activity()?.name ?? 'activity').trim() || 'activity';
    return `${this.fileSafe(activityName)}_participants.xlsx`;
  }

  /**
   * Sanitizes text for use in a file name.
   *
   * @param value Raw text.
   * @returns Safe file fragment.
   */
  private fileSafe(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  /**
   * Loads participants data and the speaker non-response summary.
   *
   * @param conferenceId Conference identifier.
   * @param activityId Activity identifier.
   */
  private async loadParticipants(conferenceId: string, activityId: string): Promise<void> {
    const activity = this.activity();
    const participations = await firstValueFrom(
      this.activityParticipationService.byActivityId(conferenceId, activityId).pipe(take(1))
    );
    const safeParticipations = participations ?? [];
    this.participations.set(safeParticipations);

    const [entries, nonRespondedSpeakerRows] = await Promise.all([
      this.loadParticipantEntries(safeParticipations),
      this.loadNonRespondedSpeakerRows(conferenceId, activity, safeParticipations),
    ]);

    this.personsById.set(new Map(entries));
    this.nonRespondedSpeakerRows.set(nonRespondedSpeakerRows);
  }

  /**
   * Loads person documents for the existing participant responses.
   *
   * @param participations Activity participations to resolve.
   * @returns Tuples consumable by a `Map<string, Person>`.
   */
  private async loadParticipantEntries(participations: ActivityParticipation[]): Promise<Array<[string, Person]>> {
    const personIds = Array.from(
      new Set((participations ?? []).map((item) => String(item.personId ?? '').trim()).filter((id) => !!id))
    );
    const persons = await Promise.all(
      personIds.map((personId) =>
        firstValueFrom(this.personService.byId(personId).pipe(take(1))).catch(() => undefined)
      )
    );

    return persons.reduce<Array<[string, Person]>>((entries, person, index) => {
      if (person) {
        entries.push([personIds[index], person]);
      }
      return entries;
    }, []);
  }

  /**
   * Loads the speakers who have not answered yet for the current activity.
   *
   * @param conferenceId Conference identifier.
   * @param activity Current activity.
   * @param participations Existing activity participations.
   * @returns Rows to display in the dedicated section.
   */
  private async loadNonRespondedSpeakerRows(
    conferenceId: string,
    activity: Activity | undefined,
    participations: ActivityParticipation[]
  ): Promise<SpeakerNonRespondentRow[]> {
    if (!this.activitySpeakerParticipationService.isSpeakerParticipationEnabled(activity)) {
      this.loadingNonRespondedSpeakers.set(false);
      return [];
    }

    this.loadingNonRespondedSpeakers.set(true);
    try {
      return await this.activitySpeakerParticipationService.loadNonRespondedSpeakerRows(
        conferenceId,
        activity,
        participations
      );
    } finally {
      this.loadingNonRespondedSpeakers.set(false);
    }
  }

  /**
   * Converts one stored participation into a unified participant row.
   *
   * @param participation Existing activity participation.
   * @param personsById Persons indexed by identifier.
   * @returns Participant row ready for display and filtering.
   */
  private toRespondedParticipantRow(
    participation: ActivityParticipation,
    personsById: Map<string, Person>
  ): ParticipantRow {
    const person = personsById.get(participation.personId);
    const firstName = String(person?.firstName ?? '').trim();
    const lastName = String(person?.lastName ?? '').trim();
    const email = String(person?.email ?? '').trim();
    const displayName = [firstName, lastName].filter((value) => !!value).join(' ').trim() || participation.personId;
    const status: Exclude<ParticipationFilter, 'ALL'> = participation.participation ? 'ACCEPTED' : 'REFUSED';

    return {
      rowId: String(participation.id ?? '').trim() || String(participation.personId ?? '').trim(),
      targetPersonId: String(participation.personId ?? '').trim(),
      participation,
      person,
      displayName,
      email,
      attributes: participation.attributes ?? [],
      searchField: [
        firstName,
        lastName,
        email,
        String(participation.participantType ?? '').trim(),
        this.participantTypeLabel(participation.participantType),
        this.translateService.instant(`CONFERENCE.ACTIVITY_PARTICIPATION.${status}`),
        ...(participation.attributes ?? []).map((attr) => String(attr.value ?? '').trim()),
      ]
        .join(' ')
        .toLowerCase(),
      status,
    };
  }

  /**
   * Converts one non-responded speaker into the unified participant row format.
   *
   * @param row Non-responded speaker row.
   * @returns Participant row ready for display and filtering.
   */
  private toNonRespondedParticipantRow(row: SpeakerNonRespondentRow): ParticipantRow {
    return {
      rowId: String(row.conferenceSpeaker.id ?? '').trim() || String(row.conferenceSpeaker.personId ?? '').trim(),
      targetPersonId: String(row.conferenceSpeaker.personId ?? '').trim(),
      conferenceSpeaker: row.conferenceSpeaker,
      person: row.person,
      displayName: row.displayName,
      email: row.email,
      attributes: [],
      searchField: [
        row.displayName,
        row.email,
        this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.NON_RESPONDED'),
      ]
        .join(' ')
        .toLowerCase(),
      status: 'NON_RESPONDED',
    };
  }

  /**
   * Aggregates one attribute statistic for accepted participations.
   *
   * @param attribute Activity attribute definition.
   * @param participations Accepted activity participations.
   * @returns Attribute summary for the UI.
   */
  private computeAttributeStat(attribute: ActivityAttribute, participations: ActivityParticipation[]): AttributeStat {
    const counts = new Map<string, number>();
    if (attribute.attributeType === 'BOOLEAN') {
      counts.set('true', 0);
      counts.set('false', 0);
    }
    if (attribute.attributeType === 'LIST') {
      (attribute.attributeAllowedValues ?? []).forEach((value) => counts.set(value, 0));
    }

    participations.forEach((participation) => {
      const entry = (participation.attributes ?? []).find(
        (item) => String(item.name ?? '').trim() === attribute.attributeName
      );
      if (!entry) {
        return;
      }
      const key = String(entry.value ?? '').trim();
      if (!key) {
        return;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return {
      attributeName: attribute.attributeName,
      attributeType: attribute.attributeType,
      trueCount: counts.get('true') ?? 0,
      values: Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    };
  }

}
