import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConferenceService } from '../../services/conference.service';
import { Conference } from '../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterModule, TableModule, ButtonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly conferenceService = inject(ConferenceService);
  private readonly _conferences = signal<Conference[] | undefined>(undefined);

  conferences = computed(() => this._conferences());

  constructor() {
    this.conferenceService.all().subscribe((confs: Conference[]) => this._conferences.set(confs));
  }

}
