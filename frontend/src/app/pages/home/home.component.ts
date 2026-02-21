import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConferenceService } from '../../services/conference.service';
import { Conference } from '../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { UserSignService } from '../../services/usersign.service';
import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';
import { PlatformConfigService } from '../../services/platform-config.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { buildDefaultPlatformConfig, PlatformConfig } from '../../model/platform-config.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, DataViewModule, ButtonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly conferenceService = inject(ConferenceService);
  private readonly usersignService = inject(UserSignService);
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly router = inject(Router);
  private readonly _conferences = signal<Conference[] | undefined>(undefined);
  private readonly _platformConfig = signal<PlatformConfig>(buildDefaultPlatformConfig());

  conferences = computed(() => this._conferences());
  person = computed(() => this.usersignService.person());
  canCreateConference = computed(() => {
    if (!this._platformConfig().onlyPlatformAdminCanCreateConference) {
      return true;
    }
    return !!this.person()?.isPlatformAdmin;
  });


  constructor() {
    this.conferenceService.all().subscribe((confs: Conference[]) => this._conferences.set(confs));
    this.platformConfigService
      .getPlatformConfig()
      .pipe(takeUntilDestroyed())
      .subscribe((platformConfig) => this._platformConfig.set(platformConfig));
  }

  conferenceDateRange(conf: Conference): { start?: string; end?: string } {
    const sortedDates = [...conf.days]
      .map((day) => day.date)
      .filter((date): date is string => !!date)
      .sort((a, b) => a.localeCompare(b));

    if (!sortedDates.length) {
      return {};
    }

    return { start: sortedDates[0], end: sortedDates[sortedDates.length - 1] };
  }

  cfpDateRange(conf: Conference): { start: string; end: string } | null {
    const start = String(conf.cfp?.startDate ?? '').trim();
    const end = String(conf.cfp?.endDate ?? '').trim();
    if (!start || !end) {
      return null;
    }

    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      return null;
    }

    return { start, end };
  }

  openConference(conf: Conference): void {
    const email = this.person()?.email;
    const isOrganizer = !!email && conf.organizerEmails.includes(email);
    const route = isOrganizer ? ['/conference', conf.id, 'manage'] : ['/conference', conf.id];
    void this.router.navigate(route);
  }

  createConference(): void {
    void this.router.navigate(['/conference/create']);
  }
}
