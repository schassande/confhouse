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
import { Activity, ActivityAttribute, ActivityParticipation } from '../../../model/activity.model';
import { Person } from '../../../model/person.model';
import { ActivityParticipationService } from '../../../services/activity-participation.service';
import { ActivityService } from '../../../services/activity.service';
import { PersonService } from '../../../services/person.service';
import { firstValueFrom, take } from 'rxjs';

interface AttributeStat {
  attributeName: string;
  attributeType: ActivityAttribute['attributeType'];
  trueCount: number;
  values: Array<{ value: string; count: number }>;
}

interface ParticipantRow {
  participation: ActivityParticipation;
  person?: Person;
  displayName: string;
  email: string;
  attributes: Array<{ name: string; value: string }>;
  searchField: string;
}

type ParticipationFilter = 'ALL' | 'ACCEPTED' | 'REFUSED';

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
  private readonly personService = inject(PersonService);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly activityId = computed(() => this.route.snapshot.paramMap.get('activityId') ?? '');
  readonly loading = signal(true);
  readonly activity = signal<Activity | undefined>(undefined);
  readonly participations = signal<ActivityParticipation[]>([]);
  readonly personsById = signal<Map<string, Person>>(new Map());
  readonly searchKeyword = signal('');
  readonly participationFilter = signal<ParticipationFilter>('ALL');

  readonly pageTitle = computed(() => {
    const activity = this.activity();
    return this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.TITLE', { name: activity?.name ?? '' });
  });

  readonly respondedCount = computed(() => this.participations().length);
  readonly yesParticipationCount = computed(() =>
    this.participations().filter((participation) => !!participation.participation).length
  );
  readonly noParticipationCount = computed(() =>
    this.respondedCount() - this.yesParticipationCount()
  );

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
    return this.participations()
      .map((participation) => {
        const person = personsById.get(participation.personId);
        const firstName = String(person?.firstName ?? '').trim();
        const lastName = String(person?.lastName ?? '').trim();
        const displayName = [firstName, lastName].filter((value) => !!value).join(' ').trim() || participation.personId;
        const email = String(person?.email ?? '').trim();
        return {
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
            ...(participation.attributes ?? []).map((attr) => String(attr.value ?? '').trim()),
          ]
            .join(' ')
            .toLowerCase(),
        } as ParticipantRow;
      })
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
        return !!row.participation.participation;
      }
      if (filter === 'REFUSED') {
        return !row.participation.participation;
      }
      return true;
    });
  });

  readonly participationFilterOptions = computed(() => ([
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_ADMIN.FILTER_ALL'), value: 'ALL' as ParticipationFilter },
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.ACCEPTED'), value: 'ACCEPTED' as ParticipationFilter },
    { label: this.translateService.instant('CONFERENCE.ACTIVITY_PARTICIPATION.REFUSED'), value: 'REFUSED' as ParticipationFilter },
  ]));

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

  onSearchKeywordChange(value: string): void {
    this.searchKeyword.set(String(value ?? ''));
  }

  onParticipationFilterChange(value: ParticipationFilter): void {
    this.participationFilter.set(value ?? 'ALL');
  }

  addParticipation(): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'activities', this.activityId(), 'participation']);
  }

  editParticipation(row: ParticipantRow): void {
    void this.router.navigate(
      ['/conference', this.conferenceId(), 'activities', this.activityId(), 'participation'],
      { queryParams: { personId: row.participation.personId } }
    );
  }

  private async loadParticipants(conferenceId: string, activityId: string): Promise<void> {
    const participations = await firstValueFrom(
      this.activityParticipationService.byActivityId(conferenceId, activityId).pipe(take(1))
    );
    this.participations.set(participations ?? []);

    const personIds = Array.from(new Set((participations ?? []).map((item) => item.personId).filter((id) => !!id)));
    const entries: Array<[string, Person]> = [];
    for (const personId of personIds) {
      try {
        const person = await firstValueFrom(this.personService.byId(personId).pipe(take(1)));
        if (person) {
          entries.push([personId, person]);
        }
      } catch {
        // Ignore person lookup failures for display resilience.
      }
    }
    this.personsById.set(new Map(entries));
  }

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
      const entry = (participation.attributes ?? []).find((item) => String(item.name ?? '').trim() === attribute.attributeName);
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
