import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { Conference } from '../../../../model/conference.model';
import {
  ConferenceHallImportReport,
  ConferenceHallResetReport,
  ConferenceHallService,
} from '../../../../services/conference-hall.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-conferencehall-import',
  imports: [CommonModule, ButtonModule, ConfirmDialogModule, TranslateModule],
  providers: [ConfirmationService],
  templateUrl: './conferencehall-import.component.html',
  styleUrls: ['./conferencehall-import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferencehallImportComponent {
  readonly conference = input.required<Conference>();
  private readonly conferenceHallService = inject(ConferenceHallService);
  private readonly translateService = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly importLoading = signal(false);
  readonly resetLoading = signal(false);
  readonly loading = computed(() => this.importLoading() || this.resetLoading());
  readonly report = signal<ConferenceHallImportReport | null>(null);
  readonly resetReport = signal<ConferenceHallResetReport | null>(null);
  readonly importExecutionTimeSeconds = signal<number | null>(null);
  readonly resetExecutionTimeSeconds = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  readonly lastImportAt = computed(() => {
    const config = this.conference().externalSystemConfigs.find(
      (item) => item.systemName === 'CONFERENCE_HALL' && item.env === 'PROD'
    );
    return config?.lastCommunication || '';
  });

  async runImport(): Promise<void> {
    const startedAt = performance.now();
    try {
      this.importLoading.set(true);
      this.error.set(null);
      this.resetReport.set(null);
      this.importExecutionTimeSeconds.set(null);
      this.resetExecutionTimeSeconds.set(null);
      const report = await this.conferenceHallService.importConference(this.conference());
      this.importExecutionTimeSeconds.set((performance.now() - startedAt) / 1000);
      this.report.set(report);
    } catch (error: any) {
      this.error.set(error?.message ?? 'Conference Hall import failed');
    } finally {
      this.importLoading.set(false);
    }
  }

  runReset(): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('CONFERENCE.CONFIG.CONFERENCEHALL.IMPORT.CONFIRM_RESET'),
      header: this.translateService.instant('CONFERENCE.CONFIG.CONFERENCEHALL.IMPORT.RESET_BUTTON'),
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
        void this.executeReset();
      },
    });
  }

  private async executeReset(): Promise<void> {
    const startedAt = performance.now();
    try {
      this.resetLoading.set(true);
      this.error.set(null);
      this.report.set(null);
      this.importExecutionTimeSeconds.set(null);
      this.resetExecutionTimeSeconds.set(null);
      const report = await this.conferenceHallService.resetConferenceImport(this.conference());
      this.resetExecutionTimeSeconds.set((performance.now() - startedAt) / 1000);
      this.resetReport.set(report);
    } catch (error: any) {
      this.error.set(error?.message ?? 'Conference Hall reset failed');
    } finally {
      this.resetLoading.set(false);
    }
  }
}
