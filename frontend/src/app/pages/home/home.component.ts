import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConferenceService } from '../../services/conference.service';
import { Conference } from '../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { UserSignService } from '../../services/usersign.service';
import { DataViewModule } from 'primeng/dataview';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, DataViewModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly conferenceService = inject(ConferenceService);
  private readonly usersignService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly _conferences = signal<Conference[] | undefined>(undefined);

  conferences = computed(() => this._conferences());
  person = computed(() => this.usersignService.person());


  constructor() {
    this.conferenceService.all().subscribe((confs: Conference[]) => this._conferences.set(confs));
  }

  conferenceToDates(conf: Conference): string[] {
    return conf.days.map(d => d.date);
  }

  openConference(conf: Conference): void {
    const email = this.person()?.email;
    const isOrganizer = !!email && conf.organizerEmails.includes(email);
    const route = isOrganizer ? ['/conference', conf.id, 'manage'] : ['/conference', conf.id];
    void this.router.navigate(route);
  }
}
