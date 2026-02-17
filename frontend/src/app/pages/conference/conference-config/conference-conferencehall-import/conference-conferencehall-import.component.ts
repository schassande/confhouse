import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Conference } from '../../../../model/conference.model';
import { ConferenceHallImportReport, ConferenceHallService } from '../../../../services/conference-hall.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-conference-conferencehall-import',
  imports: [CommonModule, ButtonModule, TranslateModule],
  templateUrl: './conference-conferencehall-import.component.html',
  styleUrls: ['./conference-conferencehall-import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceConferencehallImportComponent {
  readonly conference = input.required<Conference>();
  private readonly conferenceHallService = inject(ConferenceHallService);

  readonly loading = signal(false);
  readonly report = signal<ConferenceHallImportReport | null>(null);
  readonly error = signal<string | null>(null);

  readonly lastImportAt = computed(() => {
    const config = this.conference().externalSystemConfigs.find(
      (item) => item.systemName === 'CONFERENCE_HALL' && item.env === 'PROD'
    );
    return config?.lastCommunication || '';
  });

  async runImport(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const report = await this.conferenceHallService.importConference(this.conference());
      this.report.set(report);
    } catch (error: any) {
      this.error.set(error?.message ?? 'Conference Hall import failed');
    } finally {
      this.loading.set(false);
    }
  }
}
