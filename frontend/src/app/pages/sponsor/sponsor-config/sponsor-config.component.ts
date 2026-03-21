import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { forkJoin, take } from 'rxjs';
import { BilletwebConfig } from '@shared/model/billetweb-config';
import { Conference } from '@shared/model/conference.model';
import { BoothAllocationMode, SponsorConferenceTicketQuota, SponsorType } from '@shared/model/sponsor.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { ConferenceService } from '../../../services/conference.service';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-sponsor-config',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    ColorPickerModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    ToastModule,
    SelectModule,
  ],
  providers: [MessageService],
  templateUrl: './sponsor-config.component.html',
  styleUrl: './sponsor-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorConfigComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly billetwebConfigService = inject(BilletwebConfigService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly billetwebConfig = signal<BilletwebConfig | undefined>(undefined);
  readonly loading = signal(true);
  readonly ticketTypeOptions = computed<SelectOption[]>(() =>
    (this.billetwebConfig()?.ticketTypes?.sponsors ?? []).map((ticketType) => ({
      label: ticketType.ticketTypeName,
      value: ticketType.ticketTypeId,
    }))
  );
  readonly boothAllocationModeOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_MANUAL'), value: 'MANUAL' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_RANDOM'), value: 'RANDOM' },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_REGISTRATION_DATE'),
      value: 'REGISTRATION_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_WISHES_DATE'),
      value: 'WISHES_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_CONFIRMATION_DATE'),
      value: 'CONFIRMATION_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_PAYMENT_DATE'),
      value: 'PAYMENT_DATE',
    },
  ]);

  readonly form = this.fb.group({
    startDate: [''],
    endDate: [''],
    counter: [0],
    legalEntity: [''],
    address: [''],
    email: [''],
    ccEmail: [''],
    vatRate: [0],
    entityId: [''],
    bankIban: [''],
    bankBic: [''],
    legalNotesText: [''],
    sponsorTypes: this.fb.array<FormGroup>([]),
    sponsorBoothMaps: this.fb.array<FormControl<string>>([]),
  });

  /**
   * Loads the conference and BilletWeb configuration for the current route.
   */
  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      conference: this.conferenceService.byId(conferenceId).pipe(take(1)),
      billetwebConfig: this.billetwebConfigService.findByConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, billetwebConfig }) => {
        this.conference.set(conference);
        this.billetwebConfig.set(billetwebConfig);
        this.initForm(conference);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading conference sponsor configuration:', error);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Returns the sponsor types form array.
   *
   * @returns Sponsor types form array.
   */
  get sponsorTypesArray(): FormArray<FormGroup> {
    return this.form.get('sponsorTypes') as FormArray<FormGroup>;
  }

  /**
   * Returns the sponsor booth maps form array.
   *
   * @returns Sponsor booth maps form array.
   */
  get sponsorBoothMapsArray(): FormArray<FormControl<string>> {
    return this.form.get('sponsorBoothMaps') as FormArray<FormControl<string>>;
  }

  /**
   * Returns the quotas form array for one sponsor type.
   *
   * @param index Sponsor type index.
   * @returns Quotas form array.
   */
  sponsorTypeQuotaArray(index: number): FormArray<FormGroup> {
    return this.sponsorTypesArray.at(index).get('conferenceTicketQuotas') as FormArray<FormGroup>;
  }

  /**
   * Adds one empty sponsor type card to the form.
   */
  addSponsorType(): void {
    this.sponsorTypesArray.push(this.createSponsorTypeGroup());
  }

  /**
   * Removes one sponsor type card from the form.
   *
   * @param index Sponsor type index.
   */
  removeSponsorType(index: number): void {
    this.sponsorTypesArray.removeAt(index);
  }

  /**
   * Adds one empty quota row to one sponsor type.
   *
   * @param sponsorTypeIndex Sponsor type index.
   */
  addConferenceTicketQuota(sponsorTypeIndex: number): void {
    this.sponsorTypeQuotaArray(sponsorTypeIndex).push(this.createConferenceTicketQuotaGroup());
  }

  /**
   * Removes one quota row from one sponsor type.
   *
   * @param sponsorTypeIndex Sponsor type index.
   * @param quotaIndex Quota row index.
   */
  removeConferenceTicketQuota(sponsorTypeIndex: number, quotaIndex: number): void {
    this.sponsorTypeQuotaArray(sponsorTypeIndex).removeAt(quotaIndex);
  }

  /**
   * Adds one booth map input to the form.
   */
  addBoothMap(): void {
    this.sponsorBoothMapsArray.push(this.fb.control('', { nonNullable: true }));
  }

  /**
   * Removes one booth map input from the form.
   *
   * @param index Booth map index.
   */
  removeBoothMap(index: number): void {
    this.sponsorBoothMapsArray.removeAt(index);
  }

  /**
   * Persists the sponsor configuration on the conference document.
   */
  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const conference = this.conference();
    if (!conference) {
      return;
    }

    const existingSponsorTypes = conference.sponsoring?.sponsorTypes ?? [];
    const sponsorTypes = this.sponsorTypesArray.controls
      .map((group, index) => this.mapSponsorType(group, existingSponsorTypes[index]))
      .filter((sponsorType) => sponsorType.name.length > 0);

    const sponsorBoothMaps = this.sponsorBoothMapsArray.controls
      .map((control) => String(control.value ?? '').trim())
      .filter((value) => value.length > 0);

    const payload: Conference = {
      ...conference,
      sponsoring: {
        startDate: this.normalizeDateValue(this.form.get('startDate')?.value),
        endDate: this.normalizeDateValue(this.form.get('endDate')?.value),
        counter: Math.max(0, Number(this.form.get('counter')?.value ?? 0)),
        legalEntity: String(this.form.get('legalEntity')?.value ?? '').trim() || undefined,
        address: String(this.form.get('address')?.value ?? '').trim() || undefined,
        email: String(this.form.get('email')?.value ?? '').trim() || undefined,
        ccEmail: String(this.form.get('ccEmail')?.value ?? '').trim() || undefined,
        vatRate: this.normalizeOptionalNumber(this.form.get('vatRate')?.value),
        entityId: String(this.form.get('entityId')?.value ?? '').trim() || undefined,
        bankDetails: {
          iban: String(this.form.get('bankIban')?.value ?? '').trim() || undefined,
          bic: String(this.form.get('bankBic')?.value ?? '').trim() || undefined,
        },
        legalNotes: this.parseMultilineValues(this.form.get('legalNotesText')?.value),
        sponsorTypes,
        sponsorBoothMaps,
      },
    };

    this.conferenceService.save(payload).subscribe({
      next: (savedConference) => {
        this.conference.set(savedConference);
        this.initForm(savedConference);
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.SAVED'),
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error saving sponsor configuration:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

  /**
   * Initializes the form from the current conference payload.
   *
   * @param conference Current conference payload.
   */
  private initForm(conference: Conference | undefined): void {
    this.sponsorTypesArray.clear();
    this.sponsorBoothMapsArray.clear();
    this.form.patchValue({
      startDate: this.normalizeDateValue(conference?.sponsoring?.startDate),
      endDate: this.normalizeDateValue(conference?.sponsoring?.endDate),
      counter: Math.max(0, Number(conference?.sponsoring?.counter ?? 0)),
      legalEntity: String(conference?.sponsoring?.legalEntity ?? '').trim(),
      address: String(conference?.sponsoring?.address ?? '').trim(),
      email: String(conference?.sponsoring?.email ?? '').trim(),
      ccEmail: String(conference?.sponsoring?.ccEmail ?? '').trim(),
      vatRate: Number(conference?.sponsoring?.vatRate ?? 0),
      entityId: String(conference?.sponsoring?.entityId ?? '').trim(),
      bankIban: String(conference?.sponsoring?.bankDetails?.iban ?? '').trim(),
      bankBic: String(conference?.sponsoring?.bankDetails?.bic ?? '').trim(),
      legalNotesText: Array.isArray(conference?.sponsoring?.legalNotes)
        ? conference!.sponsoring!.legalNotes!.join('\n')
        : '',
    });

    const sponsorTypes = conference?.sponsoring?.sponsorTypes ?? [];
    sponsorTypes.forEach((sponsorType) => this.sponsorTypesArray.push(this.createSponsorTypeGroup(sponsorType)));

    const boothMaps = conference?.sponsoring?.sponsorBoothMaps ?? [];
    boothMaps.forEach((boothMap) =>
      this.sponsorBoothMapsArray.push(this.fb.control(String(boothMap ?? ''), { nonNullable: true }))
    );
  }

  /**
   * Builds one sponsor type form group.
   *
   * @param sponsorType Existing sponsor type value.
   * @returns Sponsor type form group.
   */
  private createSponsorTypeGroup(sponsorType?: SponsorType): FormGroup {
    return this.fb.group({
      id: [String(sponsorType?.id ?? '').trim()],
      name: [String(sponsorType?.name ?? '').trim(), [Validators.required]],
      maxNumber: [Number(sponsorType?.maxNumber ?? 0)],
      price: [Number(sponsorType?.price ?? 0)],
      color: [String(sponsorType?.color ?? '#1f77b4').trim()],
      fontColor: [String(sponsorType?.fontColor ?? '#ffffff').trim()],
      descriptionEn: [
        String(sponsorType?.description?.['EN'] ?? sponsorType?.description?.['en'] ?? '').trim(),
      ],
      descriptionFr: [
        String(sponsorType?.description?.['FR'] ?? sponsorType?.description?.['fr'] ?? '').trim(),
      ],
      boothAllocationMode: [this.normalizeBoothAllocationMode(sponsorType?.boothAllocationMode)],
      boothNamesText: [Array.isArray(sponsorType?.boothNames) ? sponsorType?.boothNames.join('\n') : ''],
      conferenceTicketQuotas: this.fb.array<FormGroup>(
        (sponsorType?.conferenceTicketQuotas ?? []).map((quota) => this.createConferenceTicketQuotaGroup(quota))
      ),
    });
  }

  /**
   * Builds one sponsor ticket quota form group.
   *
   * @param quota Existing quota value.
   * @returns Sponsor ticket quota form group.
   */
  private createConferenceTicketQuotaGroup(quota?: SponsorConferenceTicketQuota): FormGroup {
    return this.fb.group({
      conferenceTicketTypeId: [String(quota?.conferenceTicketTypeId ?? '').trim(), [Validators.required]],
      quota: [Number(quota?.quota ?? 0), [Validators.min(0)]],
    });
  }

  /**
   * Maps one sponsor type form group back to the persisted model.
   *
   * @param group Sponsor type form group.
   * @param existing Existing sponsor type payload.
   * @returns Persisted sponsor type payload.
   */
  private mapSponsorType(group: FormGroup, existing?: SponsorType): SponsorType {
    const groupValue = group.getRawValue() as {
      id?: string;
      name?: string;
      maxNumber?: number;
      price?: number;
      color?: string;
      fontColor?: string;
      descriptionEn?: string;
      descriptionFr?: string;
      boothAllocationMode?: BoothAllocationMode;
      boothNamesText?: string;
      conferenceTicketQuotas?: Array<{
        conferenceTicketTypeId?: string;
        quota?: number;
      }>;
    };

    const parsedMaxNumber = Number(groupValue.maxNumber ?? 0);
    const parsedPrice = Number(groupValue.price ?? 0);
    const boothNames = String(groupValue.boothNamesText ?? '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const conferenceTicketQuotas = Array.isArray(groupValue.conferenceTicketQuotas)
      ? groupValue.conferenceTicketQuotas
          .map((quota) => ({
            conferenceTicketTypeId: String(quota?.conferenceTicketTypeId ?? '').trim(),
            quota: Math.max(0, Number(quota?.quota ?? 0)),
          }))
          .filter((quota) => quota.conferenceTicketTypeId.length > 0)
      : [];

    const id = String(groupValue.id ?? existing?.id ?? '').trim() || this.generateSponsorTypeId();

    return {
      id,
      name: String(groupValue.name ?? '').trim(),
      maxNumber: Number.isFinite(parsedMaxNumber) ? Math.max(0, parsedMaxNumber) : 0,
      price: Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : 0,
      color: String(groupValue.color ?? '').trim() || '#1f77b4',
      fontColor: String(groupValue.fontColor ?? '').trim() || '#ffffff',
      description: {
        EN: String(groupValue.descriptionEn ?? '').trim(),
        FR: String(groupValue.descriptionFr ?? '').trim(),
      },
      boothAllocationMode: this.normalizeBoothAllocationMode(groupValue.boothAllocationMode),
      boothNames,
      conferenceTicketQuotas,
    };
  }

  /**
   * Generates one client-side sponsor type identifier.
   *
   * @returns Sponsor type identifier.
   */
  private generateSponsorTypeId(): string {
    return `sponsor-type-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Splits one textarea value into persisted non-empty lines.
   *
   * @param value Raw textarea value.
   * @returns Non-empty lines or `undefined`.
   */
  private parseMultilineValues(value: unknown): string[] | undefined {
    const lines = String(value ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.length > 0 ? lines : undefined;
  }

  /**
   * Converts one optional numeric field to a persisted number.
   *
   * @param value Raw numeric input value.
   * @returns Parsed number or `undefined`.
   */
  private normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /**
   * Normalizes a date field for HTML date inputs and persistence.
   *
   * @param value Raw date value.
   * @returns ISO date string or empty string.
   */
  private normalizeDateValue(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }
    return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
  }

  /**
   * Normalizes one booth allocation mode with a persisted fallback.
   *
   * @param value Raw booth allocation mode value.
   * @returns Valid booth allocation mode.
   */
  private normalizeBoothAllocationMode(value: unknown): BoothAllocationMode {
    switch (value) {
      case 'RANDOM':
      case 'REGISTRATION_DATE':
      case 'WISHES_DATE':
      case 'CONFIRMATION_DATE':
      case 'PAYMENT_DATE':
      case 'MANUAL':
        return value;
      default:
        return 'MANUAL';
    }
  }
}


