import { ChangeDetectionStrategy, Component, input, inject, OnInit, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, AsyncValidatorFn, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Conference } from '@shared/model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConferenceService } from '../../../../services/conference.service';
import { ConferenceOrganizerService } from '../../../../services/conference-organizer.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { catchError, from, map, of } from 'rxjs';

@Component({
  selector: 'app-conference-general-config',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    InputGroupModule,
    InputGroupAddonModule,
    MultiSelectModule,
    ToggleButtonModule,
    CardModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './conference-general-config.component.html',
  styleUrls: ['./conference-general-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceGeneralConfigComponent implements OnInit {
  // Inputs
  readonly conference = input.required<Conference>();
  readonly formValidityChange = output<boolean>();

  // Private injects
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceOrganizerService = inject(ConferenceOrganizerService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  // State
  protected readonly form = signal<FormGroup | null>(null);
  readonly languageOptions = signal([
    { label: 'Français', value: 'FR' },
    { label: 'English', value: 'EN' },
    { label: 'Español', value: 'ES' },
    { label: 'Deutsch', value: 'DE' },
    { label: 'Italiano', value: 'IT' },
  ]);
  private dummy = signal<number>(0);
  // Computed
  protected readonly currentForm = computed(() => this.form());
  readonly organizerEmails = computed(() => {
    this.dummy();
    return this.currentForm()?.get('organizerEmails')?.value || [];
  });

  ngOnInit() {
    const conf = this.conference();
    this.form.set(this.fb.group({
      name:            [conf.name,            [Validators.required, Validators.minLength(3)]],
      edition:         [conf.edition,            [Validators.required]],
      location:        [conf.location,        [Validators.required]],
      website:         [conf.website ?? '',   []],
      cfpStartDate:    [this.toDateInput(conf.cfp?.startDate), []],
      cfpEndDate:      [this.toDateInput(conf.cfp?.endDate), []],
      cfpWebsite:      [conf.cfp?.website ?? '', []],
      logo:            [conf.logo,            []],
      languages:       [conf.languages,       [Validators.required]],
      visible:         [conf.visible,         [Validators.required]],
      organizerEmails: [conf.organizerEmails, [Validators.required]],
      organizerEmailDomain: [conf.organizerEmailDomain ?? '', []],
    }, {
      asyncValidators: [this.uniqueConferenceNameEditionValidator(conf.id)],
    }));
    this.formValidityChange.emit(this.form()!.valid && !this.form()!.pending);
    this.form()!.statusChanges.subscribe(() => {
      this.formValidityChange.emit(this.form()!.valid && !this.form()!.pending);
    });
    this.form()!.valueChanges.subscribe((values) => {
      const c = this.conference();
      c.name = values.name;
      c.edition = values.edition;
      c.location = values.location;
      c.website = values.website;
      c.cfp = {
        startDate: this.fromDateInput(values.cfpStartDate),
        endDate: this.fromDateInput(values.cfpEndDate),
        website: String(values.cfpWebsite ?? '').trim(),
        status: c.cfp?.status || 'closed',
      };
      c.logo = values.logo;
      c.languages = values.languages;
      c.visible = values.visible;
      c.organizerEmails = values.organizerEmails;
      c.organizerEmailDomain = this.conferenceOrganizerService.normalizeDomain(values.organizerEmailDomain) || undefined;
    });
  }

  private toDateInput(value: string | undefined): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }
    return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
  }

  private fromDateInput(value: unknown): string {
    return String(value ?? '').trim();
  }

  private uniqueConferenceNameEditionValidator(currentConferenceId: string): AsyncValidatorFn {
    return (control: AbstractControl) => {
      const name = String(control.get('name')?.value ?? '').trim();
      const edition = Number(control.get('edition')?.value);
      if (!name || !Number.isFinite(edition)) {
        return of(null);
      }
      return from(this.conferenceService.existsByNameEdition(name, edition, currentConferenceId)).pipe(
        map((exists): ValidationErrors | null => (exists ? { nameEditionExists: true } : null)),
        catchError(() => of(null))
      );
    };
  }

  addOrganizerEmail(email: string) {
    console.log('add', email);
    let emails = this.currentForm()!.get('organizerEmails')?.value || [];
    if (email && !emails.includes(email)) {
      emails = [...emails, email];
      console.log('email added', emails);
      this.currentForm()!.get('organizerEmails')!.setValue(emails);
      this.dummy.set(this.dummy() + 1);
    }
  }

  removeOrganizerEmail(email: string) {
    console.log('remove', email);
    let emails = this.currentForm()!.get('organizerEmails')?.value || [];
    emails = emails.filter((e: string) => e !== email);
    console.log('email added', emails);
    this.currentForm()!.get('organizerEmails')!.setValue(emails)
    this.dummy.set(this.dummy() + 1);
  }
}


