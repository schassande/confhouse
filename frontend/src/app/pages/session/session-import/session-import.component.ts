import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Conference } from '../../../model/conference.model';
import { ConferenceService } from '../../../services/conference.service';
import { ConferencehallConfigComponent } from './conferencehall-config/conferencehall-config.component';
import { ConferencehallImportComponent } from './conferencehall-import/conferencehall-import.component';

@Component({
  selector: 'app-session-import',
  imports: [CommonModule, TranslateModule, ConferencehallConfigComponent, ConferencehallImportComponent],
  templateUrl: './session-import.component.html',
  styleUrls: ['./session-import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionImportComponent {
  readonly conference = input<Conference | undefined>(undefined);
  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly _conferenceFromRoute = signal<Conference | undefined>(undefined);
  private readonly _loading = signal(true);

  readonly effectiveConference = computed(() => this.conference() ?? this._conferenceFromRoute());
  readonly loading = computed(() => (this.conference() ? false : this._loading()));

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (!conferenceId) {
      this._loading.set(false);
      return;
    }
    this.conferenceService.byId(conferenceId).subscribe({
      next: (conf) => {
        this._conferenceFromRoute.set(conf);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }
}
