import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { Conference } from '@shared/model/conference.model';
import { ConferenceDashboard } from '@shared/model/conference-dashboard.model';
import { ConferenceAdminService } from '../../../../services/conference-admin.service';
import { ConferenceDashboardService } from '../../../../services/conference-dashboard.service';

interface SessionTypeColumn {
  id: string;
  label: string;
}

@Component({
  selector: 'app-conference-manage-dashboard',
  imports: [CommonModule, TranslateModule, ButtonModule],
  templateUrl: './conference-manage-dashboard.html',
  styleUrl: './conference-manage-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceManageDashboard {
  private readonly translateService = inject(TranslateService);
  private readonly conferenceAdminService = inject(ConferenceAdminService);
  private readonly conferenceDashboardService = inject(ConferenceDashboardService);

  readonly conferenceId = input.required<string>();
  readonly conference = input<Conference | undefined>(undefined);

  readonly dashboard = signal<ConferenceDashboard | undefined>(undefined);
  readonly dashboardLoaded = signal(false);
  readonly refreshingDashboard = signal(false);
  readonly dashboardRefreshError = signal<string>('');
  readonly dashboardRefreshedAt = signal<string>('');

  readonly sessionTypeColumns = computed<SessionTypeColumn[]>(() => {
    const conference = this.conference();
    const dashboard = this.dashboard();
    const conferenceTypes = Array.isArray(conference?.sessionTypes) ? conference.sessionTypes : [];
    const columns: SessionTypeColumn[] = conferenceTypes
      .map((sessionType) => ({
        id: String(sessionType?.id ?? '').trim(),
        label: String(sessionType?.name ?? '').trim() || String(sessionType?.id ?? '').trim(),
      }))
      .filter((column) => column.id.length > 0);

    const knownIds = new Set(columns.map((column) => column.id));
    const extraTypeIds = this.collectDashboardSessionTypeIds(dashboard);
    for (const sessionTypeId of extraTypeIds) {
      if (knownIds.has(sessionTypeId) || sessionTypeId === '__unknown__') {
        continue;
      }
      columns.push({ id: sessionTypeId, label: sessionTypeId });
    }
    if (extraTypeIds.has('__unknown__')) {
      columns.push({
        id: '__unknown__',
        label: this.translateService.instant('CONFERENCE.MANAGE.DASHBOARD.UNKNOWN_SESSION_TYPE'),
      });
    }
    return columns;
  });

  constructor() {
    effect((onCleanup) => {
      const conferenceId = this.conferenceId();
      if (!conferenceId) {
        this.dashboard.set(undefined);
        this.dashboardLoaded.set(true);
        return;
      }

      this.dashboardLoaded.set(false);
      const subscription = this.conferenceDashboardService.byConferenceId(conferenceId).subscribe((dashboard) => {
        this.dashboard.set(dashboard);
        this.dashboardLoaded.set(true);
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  async refreshConferenceDashboard(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    try {
      this.refreshingDashboard.set(true);
      this.dashboardRefreshError.set('');
      const report = await this.conferenceAdminService.refreshConferenceDashboard(conferenceId);
      this.dashboardRefreshedAt.set(report.dashboard.computedAt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Dashboard refresh failed';
      this.dashboardRefreshError.set(message);
    } finally {
      this.refreshingDashboard.set(false);
    }
  }

  getDashboardCount(metric: 'submitted' | 'confirmed' | 'allocated', sessionTypeId: string): number {
    const dashboard = this.dashboard();
    if (!dashboard) {
      return 0;
    }
    const value = dashboard[metric]?.bySessionTypeId?.[sessionTypeId];
    return typeof value === 'number' ? value : 0;
  }

  private collectDashboardSessionTypeIds(dashboard: ConferenceDashboard | undefined): Set<string> {
    if (!dashboard) {
      return new Set<string>();
    }
    return new Set<string>([
      ...Object.keys(dashboard.submitted?.bySessionTypeId ?? {}),
      ...Object.keys(dashboard.confirmed?.bySessionTypeId ?? {}),
      ...Object.keys(dashboard.allocated?.bySessionTypeId ?? {}),
    ]);
  }
}


