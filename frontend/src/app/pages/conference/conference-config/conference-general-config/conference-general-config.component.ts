import { ChangeDetectionStrategy, Component, input, inject, OnInit, signal, computed, ChangeDetectorRef, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Conference } from '../../../../model/conference.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConferenceService } from '../../../../services/conference.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

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

  // Outputs
  readonly saveRequested = output<Conference>();
  readonly cancelRequested = output<void>();

  // Private injects
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  // State
  protected readonly form = signal<FormGroup | null>(null);
  private readonly formValueTrigger = signal<number>(0);
  readonly languageOptions = signal([
    { label: 'Français', value: 'FR' },
    { label: 'English', value: 'EN' },
    { label: 'Español', value: 'ES' },
    { label: 'Deutsch', value: 'DE' },
    { label: 'Italiano', value: 'IT' },
  ]);

  // Computed
  protected readonly currentForm = computed(() => this.form());
  readonly organizerEmails = computed(() => {
    this.formValueTrigger();
    return this.currentForm()?.get('organizerEmails')?.value || [];
  });
  readonly dates = computed(() => {
    this.formValueTrigger();
    const formDates = this.currentForm()?.get('dates')?.value || [];
    console.log('Current dates in form:', formDates);
    return formDates;
  });
  readonly sortedDates = computed(() => {
    const dateList = this.dates();
    if (!Array.isArray(dateList)) return [];
    // Sort dates chronologically (assuming ISO date format or valid date strings)
    return [...dateList].sort((a: string, b: string) => {
      const dateA = new Date(a).getTime();
      const dateB = new Date(b).getTime();
      return dateA - dateB;
    });
  });

  ngOnInit() {
    this.initializeForm();
  }

  private initializeForm() {
    const conf = this.conference();
    const formGroup = this.fb.group({
      name: [conf.name, [Validators.required, Validators.minLength(3)]],
      dates: [conf.dates, [Validators.required]],
      location: [conf.location, [Validators.required]],
      logo: [conf.logo, []],
      languages: [conf.languages, [Validators.required]],
      visible: [conf.visible, []],
      organizerEmails: [conf.organizerEmails, [Validators.required]],
    });
    this.form.set(formGroup);
  }

  onSave() {
    const currentForm = this.currentForm();
    if (!currentForm || currentForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const updatedConference: Conference = {
      ...this.conference(),
      ...currentForm.value,
    };

    this.saveRequested.emit(updatedConference);
  }

  onCancel() {
    this.cancelRequested.emit();
    this.initializeForm();
  }

  addOrganizerEmail(email: string) {
    const currentForm = this.currentForm();
    if (!currentForm) return;

    const emails = currentForm.get('organizerEmails')?.value || [];
    if (email && !emails.includes(email)) {
      currentForm.patchValue({
        organizerEmails: [...emails, email],
      });
      // Trigger computed signal recalculation
      this.formValueTrigger.update(v => v + 1);
      this.cdr.markForCheck();
    }
  }

  removeOrganizerEmail(email: string) {
    const currentForm = this.currentForm();
    if (!currentForm) return;

    const emails = currentForm.get('organizerEmails')?.value || [];
    currentForm.patchValue({
      organizerEmails: emails.filter((e: string) => e !== email),
    });
    // Trigger computed signal recalculation
    this.formValueTrigger.update(v => v + 1);
    this.cdr.markForCheck();
  }

  addDate(date: string) {
    const currentForm = this.currentForm();
    if (!currentForm) return;

    const dates = currentForm.get('dates')?.value || [];
    if (date && !dates.includes(date)) {
      currentForm.patchValue({
        dates: [...dates, date].sort(),
      });
      // Trigger computed signal recalculation
      this.formValueTrigger.update(v => v + 1);
      this.cdr.markForCheck();
      console.log('New dates:', currentForm.get('dates')?.value);
    }
  }

  onAddDate(input: HTMLInputElement) {
    const dateValue = input.value;
    if (dateValue) {
      this.addDate(dateValue);
    }
  }

  removeDate(date: string) {
    const currentForm = this.currentForm();
    if (!currentForm) return;

    const dates = currentForm.get('dates')?.value || [];
    currentForm.patchValue({
      dates: dates.filter((d: string) => d !== date),
    });
    // Trigger computed signal recalculation
    this.formValueTrigger.update(v => v + 1);
    this.cdr.markForCheck();
  }
}
