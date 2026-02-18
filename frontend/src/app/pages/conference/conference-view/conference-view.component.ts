import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { TranslateService } from '@ngx-translate/core';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-conference-view',
  standalone: true,
  imports: [CommonModule, RouterModule, CardModule, TagModule, TranslateModule],
  templateUrl: './conference-view.component.html',
  styleUrls: ['./conference-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceViewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly _conference = signal<Conference | undefined>(undefined);
  private translateService = inject(TranslateService);
  lang = computed(() => this.translateService.getCurrentLang());

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (conferenceId) {
      this.conferenceService.byId(conferenceId).subscribe((conf: Conference | undefined) => this._conference.set(conf));
    }
  }

  conference = computed(() => this._conference());
}
