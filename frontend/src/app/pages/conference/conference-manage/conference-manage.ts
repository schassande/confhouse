import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ConferenceAdminService } from '../../../services/conference-admin.service';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { ConferenceManageDashboard } from './conference-manage-dashboard/conference-manage-dashboard';
import { Activity } from '../../../model/activity.model';
import { ActivityService } from '../../../services/activity.service';

@Component({
  selector: 'app-conference-manage',
  imports: [CommonModule, RouterModule, TranslateModule, ButtonModule, ConfirmDialogModule, ConferenceManageDashboard],
  providers: [ConfirmationService],
  templateUrl: './conference-manage.html',
  styleUrl: './conference-manage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceManage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translateService = inject(TranslateService);
  private readonly conferenceAdminService = inject(ConferenceAdminService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly activityService = inject(ActivityService);
  readonly conference = signal<Conference | undefined>(undefined);
  readonly activities = signal<Activity[]>([]);
  readonly managedActivities = computed(() =>
    [...this.activities()].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
  );

  conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  conferenceTitle = computed(() => {
    const conference = this.conference();
    if (!conference) {
      return this.translateService.instant('CONFERENCE.MANAGE.TITLE');
    }
    const edition = String(conference.edition ?? '').trim();
    return edition ? `${conference.name} ${edition}` : conference.name;
  });
  readonly deleting = signal(false);
  readonly deleteError = signal<string>('');

  constructor() {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }
    this.conferenceService.byId(conferenceId).subscribe((conference) => this.conference.set(conference));
    this.activityService.byConferenceId(conferenceId).subscribe((activities) => this.activities.set(activities ?? []));
  }

  confirmDeleteConference(): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('CONFERENCE.MANAGE.DELETE_CONFIRM'),
      header: this.translateService.instant('CONFERENCE.MANAGE.DELETE_BUTTON'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: {
        label: this.translateService.instant('COMMON.REMOVE'),
        severity: 'danger',
      },
      rejectButtonProps: {
        label: this.translateService.instant('COMMON.CANCEL'),
        severity: 'secondary',
      },
      accept: () => {
        void this.executeDeleteConference();
      },
    });
  }

  private async executeDeleteConference(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    try {
      this.deleting.set(true);
      this.deleteError.set('');
      await this.conferenceAdminService.deleteConference(conferenceId);
      await this.router.navigate(['/']);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : this.translateService.instant('CONFERENCE.MANAGE.DELETE_ERROR');
      this.deleteError.set(message || this.translateService.instant('CONFERENCE.MANAGE.DELETE_ERROR'));
    } finally {
      this.deleting.set(false);
    }
  }
}
