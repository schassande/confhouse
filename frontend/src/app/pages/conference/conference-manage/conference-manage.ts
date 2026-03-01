import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AbstractControl, AsyncValidatorFn, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService } from 'primeng/api';
import { ConferenceAdminService, DuplicateConferencePayload } from '../../../services/conference-admin.service';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { ConferenceManageDashboard } from './conference-manage-dashboard/conference-manage-dashboard';
import { Activity } from '../../../model/activity.model';
import { ActivityService } from '../../../services/activity.service';
import { ConferenceExcelExportService } from '../../../services/conference-excel-export.service';
import { catchError, from, map, of } from 'rxjs';

@Component({
  selector: 'app-conference-manage',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    ProgressSpinnerModule,
    InputTextModule,
    CheckboxModule,
    ConferenceManageDashboard,
  ],
  providers: [ConfirmationService],
  templateUrl: './conference-manage.html',
  styleUrl: './conference-manage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceManage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translateService = inject(TranslateService);
  private readonly conferenceAdminService = inject(ConferenceAdminService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly activityService = inject(ActivityService);
  private readonly conferenceExcelExportService = inject(ConferenceExcelExportService);
  readonly conference = signal<Conference | undefined>(undefined);
  readonly activities = signal<Activity[]>([]);
  readonly managedActivities = computed(() =>
    [...this.activities()]
      .filter((activity) => activity.registerParticipant !== false)
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
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
  readonly excelExporting = signal(false);
  readonly excelExportError = signal<string>('');
  readonly occupationRefreshing = signal(false);
  readonly occupationRefreshError = signal<string>('');
  readonly occupationRefreshSuccessAt = signal<string>('');
  readonly duplicateDialogVisible = signal(false);
  readonly duplicating = signal(false);
  readonly duplicateError = signal<string>('');
  readonly waitingDialogVisible = computed(() => this.deleting() || this.duplicating());
  readonly waitingMessageKey = computed(() =>
    this.deleting()
      ? 'CONFERENCE.MANAGE.DELETE_IN_PROGRESS'
      : 'CONFERENCE.MANAGE.DUPLICATE.IN_PROGRESS'
  );
  readonly duplicateForm = signal(
    this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      edition: [new Date().getFullYear(), [Validators.required]],
      startDate: ['', [Validators.required]],
      duplicateRooms: [true],
      duplicateTracks: [true],
      duplicatePlanningStructure: [true],
      duplicateActivities: [true],
      duplicateSponsors: [true],
    }, {
      asyncValidators: [this.uniqueConferenceNameEditionValidator()],
    })
  );
  readonly duplicateEndDate = computed(() => {
    const startDate = this.duplicateForm().get('startDate')?.value;
    const dayCount = this.conference()?.days?.length ?? 0;
    if (!startDate || dayCount <= 0) {
      return '';
    }
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      return '';
    }
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + Math.max(dayCount - 1, 0));
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

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

  async downloadExcel(event?: Event): Promise<void> {
    event?.preventDefault();
    const conference = this.conference();
    if (!conference || this.excelExporting()) {
      return;
    }

    this.excelExporting.set(true);
    this.excelExportError.set('');
    try {
      await this.conferenceExcelExportService.downloadConferenceWorkbook(conference);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : this.translateService.instant('CONFERENCE.MANAGE.EXCEL_EXPORT_ERROR');
      this.excelExportError.set(message || this.translateService.instant('CONFERENCE.MANAGE.EXCEL_EXPORT_ERROR'));
    } finally {
      this.excelExporting.set(false);
    }
  }

  async refreshOccupation(event?: Event): Promise<void> {
    event?.preventDefault();
    const conferenceId = this.conferenceId();
    if (!conferenceId || this.occupationRefreshing()) {
      return;
    }

    this.occupationRefreshing.set(true);
    this.occupationRefreshError.set('');
    this.occupationRefreshSuccessAt.set('');
    try {
      const report = await this.conferenceAdminService.refreshVoxxrinOccupation(conferenceId);
      this.occupationRefreshSuccessAt.set(String(report.refreshedAt ?? '').trim());
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.MANAGE.OCCUPATION_REFRESH_ERROR');
      this.occupationRefreshError.set(message || this.translateService.instant('CONFERENCE.MANAGE.OCCUPATION_REFRESH_ERROR'));
    } finally {
      this.occupationRefreshing.set(false);
    }
  }

  openDuplicateDialog(): void {
    const conference = this.conference();
    if (!conference) {
      return;
    }
    const sourceStartDate = this.getConferenceStartDate(conference);
    const startDate = this.computeNextStartDate(sourceStartDate);
    const nextEdition = Number.isFinite(Number(conference.edition)) ? Number(conference.edition) + 1 : new Date().getFullYear();
    this.duplicateForm().reset({
      name: conference.name,
      edition: nextEdition,
      startDate,
      duplicateRooms: true,
      duplicateTracks: true,
      duplicatePlanningStructure: true,
      duplicateActivities: true,
      duplicateSponsors: true,
    });
    this.duplicateForm().updateValueAndValidity();
    this.duplicateError.set('');
    this.duplicateDialogVisible.set(true);
  }

  cancelDuplicate(): void {
    this.duplicateDialogVisible.set(false);
    this.duplicateError.set('');
  }

  async confirmDuplicate(): Promise<void> {
    const conferenceId = this.conferenceId();
    const conference = this.conference();
    if (!conferenceId || !conference) {
      return;
    }

    const form = this.duplicateForm();
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const duplicatePlanningStructure = Boolean(form.get('duplicatePlanningStructure')?.value);
    const duplicateRooms = Boolean(form.get('duplicateRooms')?.value);
    if (duplicatePlanningStructure && !duplicateRooms) {
      this.duplicateError.set(this.translateService.instant('CONFERENCE.MANAGE.DUPLICATE.ROOMS_REQUIRED'));
      return;
    }

    const payload: DuplicateConferencePayload = {
      conferenceId,
      name: String(form.get('name')?.value ?? '').trim(),
      edition: Number(form.get('edition')?.value),
      startDate: String(form.get('startDate')?.value ?? '').trim(),
      duplicateRooms,
      duplicateTracks: Boolean(form.get('duplicateTracks')?.value),
      duplicatePlanningStructure,
      duplicateActivities: Boolean(form.get('duplicateActivities')?.value),
      duplicateSponsors: Boolean(form.get('duplicateSponsors')?.value),
    };

    try {
      this.duplicating.set(true);
      this.duplicateError.set('');
      const report = await this.conferenceAdminService.duplicateConference(payload);
      this.duplicateDialogVisible.set(false);
      await this.router.navigate(['/conference', report.conferenceId]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : this.translateService.instant('CONFERENCE.MANAGE.DUPLICATE.ERROR');
      this.duplicateError.set(message || this.translateService.instant('CONFERENCE.MANAGE.DUPLICATE.ERROR'));
    } finally {
      this.duplicating.set(false);
    }
  }

  private getConferenceStartDate(conference: Conference): string {
    const dayDates = (conference.days ?? [])
      .map((day) => String(day?.date ?? '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
    return dayDates.length > 0 ? dayDates[0] : '';
  }

  private computeNextStartDate(sourceStartDate: string): string {
    if (!sourceStartDate) {
      return '';
    }
    const source = new Date(`${sourceStartDate}T00:00:00`);
    if (Number.isNaN(source.getTime())) {
      return sourceStartDate;
    }

    const targetWeekday = source.getDay();
    const oneYearLater = new Date(source.getTime());
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const forwardOffset = (targetWeekday - oneYearLater.getDay() + 7) % 7;
    const backwardOffset = (oneYearLater.getDay() - targetWeekday + 7) % 7;
    const adjusted = new Date(oneYearLater.getTime());
    if (backwardOffset < forwardOffset) {
      adjusted.setDate(adjusted.getDate() - backwardOffset);
    } else {
      adjusted.setDate(adjusted.getDate() + forwardOffset);
    }

    const year = adjusted.getFullYear();
    const month = String(adjusted.getMonth() + 1).padStart(2, '0');
    const day = String(adjusted.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private uniqueConferenceNameEditionValidator(): AsyncValidatorFn {
    return (control: AbstractControl) => {
      const name = String(control.get('name')?.value ?? '').trim();
      const edition = Number(control.get('edition')?.value);
      if (!name || !Number.isFinite(edition)) {
        return of(null);
      }
      return from(this.conferenceService.existsByNameEdition(name, edition)).pipe(
        map((exists): ValidationErrors | null => (exists ? { nameEditionExists: true } : null)),
        catchError(() => of(null))
      );
    };
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
