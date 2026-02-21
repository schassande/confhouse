import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ConferenceService } from '../../../services/conference.service';
import { Conference, Day, Room } from '../../../model/conference.model';
import { ConferenceAdminService } from '../../../services/conference-admin.service';
import { PlanningPdfService } from '../../../services/planning-pdf.service';

@Component({
  selector: 'app-session-publish',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ButtonModule],
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
  private readonly _downloading = signal(false);
  private readonly _downloadError = signal<string>('');
  private readonly _pdfDownloading = signal(false);
  private readonly _pdfDownloadError = signal<string>('');

  readonly conference = computed(() => this._conference());
  readonly loading = computed(() => this._loading());
  readonly downloading = computed(() => this._downloading());
  readonly downloadError = computed(() => this._downloadError());
  readonly pdfDownloading = computed(() => this._pdfDownloading());
  readonly pdfDownloadError = computed(() => this._pdfDownloadError());

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

  async downloadVoxxrinDescriptor(): Promise<void> {
    const conferenceId = this.conference()?.id;
    if (!conferenceId || this._downloading()) {
      return;
    }

    this._downloading.set(true);
    this._downloadError.set('');
    try {
      await this.conferenceAdminService.downloadVoxxrinEventDescriptor(conferenceId);
    } catch (error: unknown) {
      this._downloadError.set(error instanceof Error
        ? error.message
        : this.translateService.instant('CONFERENCE.CONFIG.PUBLISH.DOWNLOAD_GENERIC_ERROR'));
    } finally {
      this._downloading.set(false);
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
      const zip = new JSZip();
      const dayBlob = await this.planningPdfService.generateDayPlanningBlob(conference, day);
      zip.file(this.planningPdfService.getDayPlanningFileName(conference, day), dayBlob);

      const rooms = this.enabledRooms(day);
      for (const room of rooms) {
        const roomBlob = await this.planningPdfService.generateRoomPlanningBlob(conference, day, room);
        zip.file(this.planningPdfService.getRoomPlanningFileName(conference, day, room), roomBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${this.baseZipName(conference)}_${this.sanitize(day.date)}.zip`);
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
      const zip = new JSZip();
      for (const day of conference.days ?? []) {
        const dayBlob = await this.planningPdfService.generateDayPlanningBlob(conference, day);
        zip.file(this.planningPdfService.getDayPlanningFileName(conference, day), dayBlob);
        for (const room of this.enabledRooms(day)) {
          const roomBlob = await this.planningPdfService.generateRoomPlanningBlob(conference, day, room);
          zip.file(this.planningPdfService.getRoomPlanningFileName(conference, day, room), roomBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${this.baseZipName(conference)}_all_days.zip`);
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
}
