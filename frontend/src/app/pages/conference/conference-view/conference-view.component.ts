import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { TranslateService } from '@ngx-translate/core';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TranslateModule } from '@ngx-translate/core';
import { Activity, ParticipantType } from '../../../model/activity.model';
import { ActivityService } from '../../../services/activity.service';
import { UserSignService } from '../../../services/usersign.service';

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
  private readonly activityService = inject(ActivityService);
  private readonly userSignService = inject(UserSignService);
  private readonly _conference = signal<Conference | undefined>(undefined);
  private readonly _activities = signal<Activity[]>([]);
  private translateService = inject(TranslateService);
  lang = computed(() => this.translateService.getCurrentLang());
  currentPerson = computed(() => this.userSignService.getCurrentPerson());

  constructor() {
    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (conferenceId) {
      this.conferenceService.byId(conferenceId).subscribe((conf: Conference | undefined) => this._conference.set(conf));
      this.activityService.byConferenceId(conferenceId).subscribe((activities) => this._activities.set(activities ?? []));
    }
  }

  conference = computed(() => this._conference());

  private readonly userRoles = computed<ParticipantType[]>(() => {
    const person = this.currentPerson();
    const conference = this.conference();
    if (!person || !conference) {
      return [];
    }
    const roles = new Set<ParticipantType>(['ATTENDEE']);
    if (person.isSpeaker) {
      roles.add('SPEAKER');
    }
    if (conference.organizerEmails?.includes(person.email)) {
      roles.add('ORGANIZER');
    }
    return Array.from(roles);
  });

  visibleActivities = computed(() => {
    const roles = new Set(this.userRoles());
    return this._activities()
      .filter((activity) => {
        const allowed = activity.participantTypes ?? [];
        if (allowed.length === 0) {
          return true;
        }
        if (allowed.every((role) => role === 'ORGANIZER')) {
          return false;
        }
        return allowed.some((role) => roles.has(role));
      })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  });
}
