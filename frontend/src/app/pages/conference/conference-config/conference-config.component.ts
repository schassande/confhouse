import { ChangeDetectionStrategy, Component, inject, signal, computed, CUSTOM_ELEMENTS_SCHEMA, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '../../../model/conference.model';
import { TranslateService } from '@ngx-translate/core';
import { UserSignService } from '../../../services/usersign.service';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ConferenceGeneralConfigComponent } from './conference-general-config/conference-general-config.component';
import { ConferenceTracksConfigComponent } from './conference-tracks-config/conference-tracks-config.component';
import { ConferenceSessionTypesConfigComponent } from './conference-session-types-config/conference-session-types-config.component';
import { ConferencePlanningStructureConfigComponent } from './conference-planning-structure-config/conference-planning-structure-config.component';
import { ConferenceRoomsConfigComponent } from './conference-rooms-config/conference-rooms-config.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

type ConfigSection = 'general' | 'session-types' | 'tracks' | 'rooms' | 'planning-structure';

@Component({
  selector: 'app-conference-config',
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    ToastModule,
    TranslateModule,
    ConferenceGeneralConfigComponent,
    ConferenceRoomsConfigComponent,
    ConferenceTracksConfigComponent,
    ConferenceSessionTypesConfigComponent,
    ConferencePlanningStructureConfigComponent,
  ],
  providers: [MessageService],
  templateUrl: './conference-config.component.html',
  styleUrls: ['./conference-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConferenceConfigComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateService = inject(TranslateService);
  private readonly messageService = inject(MessageService);
  
  private readonly _conference = signal<Conference | undefined>(undefined);
  private readonly _loading = signal(true);
  private readonly _creatingConference = signal(false);
  readonly section = signal<ConfigSection>('general');
  
  readonly conference = computed(() => this._conference());
  readonly loading = computed(() => this._loading());
  readonly lang = computed(() => this.translateService.getCurrentLang());
  readonly sectionTitle = computed(() => {
    switch (this.section()) {
      case 'general':
        return this.translateService.instant('CONFERENCE.CONFIG.GENERAL.TAB');
      case 'session-types':
        return this.translateService.instant('CONFERENCE.CONFIG.SESSION_TYPES.TAB');
      case 'tracks':
        return this.translateService.instant('CONFERENCE.CONFIG.TRACKS.TAB');
      case 'rooms':
        return this.translateService.instant('CONFERENCE.CONFIG.ROOMS.TAB');
      case 'planning-structure':
        return this.translateService.instant('CONFERENCE.CONFIG.PLANNING_STRUCTURE.TAB');
      default:
        return this.translateService.instant('CONFERENCE.CONFIG.GENERAL.TAB');
    }
  });
  readonly cancelLink = computed(() => {
    const conferenceId = this.conference()?.id;
    return conferenceId ? ['/conference', conferenceId, 'manage'] : ['/'];
  });

  constructor() {
  }

  ngOnInit() {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.section.set(this.parseSection(data['section']));
      });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = params.get('conferenceId');
        if (id) {
          this.loadConference(id);
          return;
        }
        this.createConferenceIfNeeded();
      });
  }

  onSave() {
    const conference = this.conference();
    if (!conference) {
      return;
    }
    const sanitizedConference: Conference = {
      ...conference,
    };
    this.conferenceService.save(sanitizedConference).subscribe({
      next: (saved) => {
        this._conference.set(saved);
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.SAVED'),
        });
      },
      error: (err) => {
        console.error('Error saving conference:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

  private parseSection(value: unknown): ConfigSection {
    if (value === 'session-types' || value === 'tracks' || value === 'rooms' || value === 'planning-structure') {
      return value;
    }
    return 'general';
  }

  private loadConference(conferenceId: string): void {
    this._loading.set(true);
    this.conferenceService.byId(conferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conf: Conference | undefined) => {
          this._conference.set(conf);
          this._loading.set(false);
        },
        error: () => {
          this._loading.set(false);
        }
      });
  }

  private createConferenceIfNeeded(): void {
    if (this._creatingConference() || this._conference()) {
      return;
    }

    this._creatingConference.set(true);
    this._loading.set(true);
    const lang = this.translateService.getCurrentLang() || 'EN';
    const rand4 = Math.floor(1000 + Math.random() * 9000);
    const currentPerson = this.userSignService.getCurrentPerson();
    const defaultConf: Conference = {
      id: '',
      lastUpdated: new Date().getTime().toString(),
      name: `New Conference ${rand4}`,
      edition: new Date().getFullYear(),
      days: [],
      location: '',
      logo: '',
      languages: [lang.toUpperCase()],
      description: { [lang]: 'New conference description' },
      visible: false,
      organizerEmails: currentPerson && currentPerson.email ? [currentPerson.email] : [],
      tracks: [],
      rooms: [],
      sessionTypes: [],
      cfp: { startDate: '', endDate: '', status: 'closed' },
    };

    this.conferenceService.save(defaultConf).subscribe({
      next: (created: Conference) => {
        this._conference.set(created);
        this._loading.set(false);
        this._creatingConference.set(false);
        void this.router.navigate(['/conference', created.id, 'config', 'general'], {
          replaceUrl: true,
        });
      },
      error: () => {
        this._loading.set(false);
        this._creatingConference.set(false);
      }
    });
  }
}
