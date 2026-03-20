import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { Conference } from '@shared/model/conference.model';
import { ConferenceHallConfigService } from '../../../../services/conference-hall-config.service';
import {
  ConferenceHallImportReport,
  ConferenceHallResetReport,
  ConferenceHallService,
} from '../../../../services/conference-hall.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-conferencehall-import',
  imports: [CommonModule, ButtonModule, ConfirmDialogModule, TranslateModule],
  providers: [ConfirmationService],
  templateUrl: './conferencehall-import.component.html',
  styleUrls: ['./conferencehall-import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferencehallImportComponent implements OnInit {
  readonly conference = input.required<Conference>();
  private readonly conferenceHallService = inject(ConferenceHallService);
  private readonly conferenceHallConfigService = inject(ConferenceHallConfigService);
  private readonly translateService = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly conferenceHallLastImportAt = signal('');

  readonly importLoading = signal(false);
  readonly resetLoading = signal(false);
  readonly loading = computed(() => this.importLoading() || this.resetLoading());
  readonly report = signal<ConferenceHallImportReport | null>(null);
  readonly resetReport = signal<ConferenceHallResetReport | null>(null);
  readonly importExecutionTimeSeconds = signal<number | null>(null);
  readonly resetExecutionTimeSeconds = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  readonly lastImportAt = computed(() => {
    return this.conferenceHallLastImportAt();
  });

  async ngOnInit(): Promise<void> {
    await this.refreshConferenceHallConfig();
  }

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
      this.conferenceHallLastImportAt.set(report.importedAt ?? '');
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

  private async refreshConferenceHallConfig(): Promise<void> {
    const conferenceId = this.conference().id;
    if (!conferenceId) {
      this.conferenceHallLastImportAt.set('');
      return;
    }
    try {
      const config = await firstValueFrom(this.conferenceHallConfigService.findByConferenceId(conferenceId));
      this.conferenceHallLastImportAt.set(config?.lastCommunication ?? '');
    } catch (error) {
      console.error('Unable to load Conference Hall config', error);
      this.conferenceHallLastImportAt.set('');
    }
  }
}


