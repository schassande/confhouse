import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConferenceService } from '../../../services/conference.service';
import { Conference, Day, Room } from '../../../model/conference.model';
import { ConferenceAdminService } from '../../../services/conference-admin.service';
import { PlanningPdfService } from '../../../services/planning-pdf.service';

@Component({
  selector: 'app-session-publish',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ButtonModule, DialogModule, ProgressSpinnerModule],
  templateUrl: './session-publish.component.html',
  styleUrls: ['./session-publish.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPublishComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceAdminService = inject(ConferenceAdminService);
  private readonly planningPdfService = inject(PlanningPdfService);
  private readonly translateService = inject(TranslateService);

  private readonly _conference = signal<Conference | undefined>(undefined);
  private readonly _loading = signal(true);
  private readonly _pdfDownloading = signal(false);
  private readonly _pdfDownloadError = signal<string>('');
  private readonly _voxxrinRefreshing = signal(false);
  private readonly _voxxrinRefreshError = signal<string>('');
  private readonly _voxxrinRefreshResult = signal<unknown | null>(null);

  readonly conference = computed(() => this._conference());
  readonly loading = computed(() => this._loading());
  readonly pdfDownloading = computed(() => this._pdfDownloading());
  readonly pdfDownloadError = computed(() => this._pdfDownloadError());
  readonly voxxrinRefreshing = computed(() => this._voxxrinRefreshing());
  readonly voxxrinRefreshError = computed(() => this._voxxrinRefreshError());
  readonly voxxrinRefreshResult = computed(() => this._voxxrinRefreshResult());
  readonly voxxrinDownloadUrl = computed(() => {
    const conferenceId = this.conference()?.id;
    return conferenceId
      ? this.conferenceAdminService.getVoxxrinEventDescriptorPublicUrl(conferenceId)
      : '';
  });
  private jsZipModulePromise?: Promise<unknown>;

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (!conferenceId) {
      this._loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).subscribe({
      next: (conf) => {
        this._conference.set(conf);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  async publishToVoxxrin(): Promise<void> {
    const conferenceId = this.conference()?.id;
    if (!conferenceId || this._voxxrinRefreshing()) {
      return;
    }

    this._voxxrinRefreshing.set(true);
    this._voxxrinRefreshError.set('');
    this._voxxrinRefreshResult.set(null);
    try {
      const response = await this.conferenceAdminService.refreshVoxxrinSchedule(conferenceId);
      this._voxxrinRefreshResult.set(response?.voxxrinResponse ?? response ?? {});
    } catch (error: unknown) {
      this._voxxrinRefreshError.set(
        error instanceof Error
          ? error.message
          : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.VOXXRIN_REFRESH_ERROR')
      );
    } finally {
      this._voxxrinRefreshing.set(false);
    }
  }

  enabledRooms(day: Day): Room[] {
    const conference = this.conference();
    if (!conference) {
      return [];
    }
    const disabledRoomIds = new Set(day.disabledRoomIds ?? []);
    return conference.rooms.filter((room) => room.isSessionRoom && !disabledRoomIds.has(room.id));
  }

  async downloadDayPlanning(day: Day, event?: Event): Promise<void> {
    event?.preventDefault();
    const conference = this.conference();
    if (!conference || this._pdfDownloading()) {
      return;
    }

    this._pdfDownloading.set(true);
    this._pdfDownloadError.set('');
    try {
      await this.planningPdfService.downloadDayPlanning(conference, day);
    } catch (error: unknown) {
      this._pdfDownloadError.set(error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.PDF_GENERATION_ERROR'));
    } finally {
      this._pdfDownloading.set(false);
    }
  }

  async downloadRoomPlanning(day: Day, room: Room, event?: Event): Promise<void> {
    event?.preventDefault();
    const conference = this.conference();
    if (!conference || this._pdfDownloading()) {
      return;
    }

    this._pdfDownloading.set(true);
    this._pdfDownloadError.set('');
    try {
      await this.planningPdfService.downloadRoomPlanning(conference, day, room);
    } catch (error: unknown) {
      this._pdfDownloadError.set(error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.PDF_GENERATION_ERROR'));
    } finally {
      this._pdfDownloading.set(false);
    }
  }

  async downloadDayPlanningZip(day: Day, event?: Event): Promise<void> {
    event?.preventDefault();
    const conference = this.conference();
    if (!conference || this._pdfDownloading()) {
      return;
    }

    this._pdfDownloading.set(true);
    this._pdfDownloadError.set('');
    try {
      const zip = await this.createZip();
      const dayBlob = await this.planningPdfService.generateDayPlanningBlob(conference, day);
      zip.file(this.planningPdfService.getDayPlanningFileName(conference, day), dayBlob);

      const rooms = this.enabledRooms(day);
      for (const room of rooms) {
        const roomBlob = await this.planningPdfService.generateRoomPlanningBlob(conference, day, room);
        zip.file(this.planningPdfService.getRoomPlanningFileName(conference, day, room), roomBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      this.downloadBlob(zipBlob, `${this.baseZipName(conference)}_${this.sanitize(day.date)}.zip`);
    } catch (error: unknown) {
      this._pdfDownloadError.set(error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.PDF_ZIP_ERROR'));
    } finally {
      this._pdfDownloading.set(false);
    }
  }

  async downloadConferencePlanningZip(event?: Event): Promise<void> {
    event?.preventDefault();
    const conference = this.conference();
    if (!conference || this._pdfDownloading()) {
      return;
    }

    this._pdfDownloading.set(true);
    this._pdfDownloadError.set('');
    try {
      const zip = await this.createZip();
      for (const day of conference.days ?? []) {
        const dayBlob = await this.planningPdfService.generateDayPlanningBlob(conference, day);
        zip.file(this.planningPdfService.getDayPlanningFileName(conference, day), dayBlob);
        for (const room of this.enabledRooms(day)) {
          const roomBlob = await this.planningPdfService.generateRoomPlanningBlob(conference, day, room);
          zip.file(this.planningPdfService.getRoomPlanningFileName(conference, day, room), roomBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      this.downloadBlob(zipBlob, `${this.baseZipName(conference)}_all_days.zip`);
    } catch (error: unknown) {
      this._pdfDownloadError.set(error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.PDF_ZIP_ERROR'));
    } finally {
      this._pdfDownloading.set(false);
    }
  }

  dayLabel(dateIso: string): string {
    const date = new Date(`${dateIso}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return dateIso;
    }
    const locale = this.translateService.currentLang
      || this.translateService.getDefaultLang()
      || ((typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US');
    const weekdayRaw = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    const weekday = weekdayRaw.length > 0
      ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}`
      : weekdayRaw;
    return `${weekday} ${dateIso}`;
  }

  private baseZipName(conference: Conference): string {
    return `${this.sanitize(conference.name)}_${this.sanitize(String(conference.edition ?? ''))}_planning`;
  }

  private sanitize(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private async createZip(): Promise<{
    file: (name: string, data: Blob) => void;
    generateAsync: (options: { type: 'blob' }) => Promise<Blob>;
  }> {
    if (!this.jsZipModulePromise) {
      this.jsZipModulePromise = import('jszip');
    }
    const moduleAny = await this.jsZipModulePromise as { default?: new () => unknown };
    const JSZipCtor = moduleAny.default ?? (moduleAny as unknown as new () => unknown);
    return new JSZipCtor() as {
      file: (name: string, data: Blob) => void;
      generateAsync: (options: { type: 'blob' }) => Promise<Blob>;
    };
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
