import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { OrderListModule } from 'primeng/orderlist';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { Conference } from '@shared/model/conference.model';
import { ConferenceTicket, Sponsor, SponsorBusinessEvent, SponsorCommunicationLanguage, SponsorType } from '@shared/model/sponsor.model';
import { ConferenceService } from '../../../services/conference.service';
import { SponsorService } from '../../../services/sponsor.service';
import { UserSignService } from '../../../services/usersign.service';

interface SelectOption {
  label: string;
  value: string;
}

interface BoothWishItem {
  name: string;
}

/**
 * Allows an authenticated sponsor admin to create or edit a sponsorship application.
 */
@Component({
  selector: 'app-sponsor-application',
  standalone: true,
  imports: [
    ButtonModule,
    CommonModule,
    InputTextModule,
    OrderListModule,
    ReactiveFormsModule,
    RouterModule,
    SelectModule,
    TabsModule,
    TextareaModule,
    ToastModule,
    TranslateModule,
  ],
  providers: [MessageService],
  templateUrl: './sponsor-application.component.html',
  styleUrl: './sponsor-application.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorApplicationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly sponsorService = inject(SponsorService);
  private readonly userSignService = inject(UserSignService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  readonly conferenceId = computed(() => String(this.route.snapshot.paramMap.get('conferenceId') ?? '').trim());
  readonly currentPerson = computed(() => this.userSignService.getCurrentPerson());
  readonly conference = signal<Conference | undefined>(undefined);
  readonly existingSponsor = signal<Sponsor | undefined>(undefined);
  readonly sponsorTypes = computed(() => this.conference()?.sponsoring?.sponsorTypes ?? []);
  readonly boothMapUrls = computed(() => this.conference()?.sponsoring?.sponsorBoothMaps ?? []);
  readonly languageCodes = computed(() => this.conference()?.languages ?? ['EN', 'FR']);
  readonly sponsorTypeOptions = computed<SelectOption[]>(() =>
    this.sponsorTypes().map((type) => ({ label: type.name, value: type.id }))
  );
  readonly sponsorType = computed<string>(() =>
    this.sponsorTypes().find((type) => type.id === this.existingSponsor()!.sponsorTypeId )?.name ?? ''
  );
  readonly communicationLanguageOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('LANGUAGE.FR'), value: 'fr' },
    { label: this.translateService.instant('LANGUAGE.EN'), value: 'en' },
  ]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly documentAction = signal<'order-form' | 'invoice' | 'paid-invoice' | null>(null);
  readonly adminEmailsVersion = signal(0);
  readonly boothWishItemsState = signal<BoothWishItem[]>([]);
  readonly selectedBoothWishItems = signal<BoothWishItem[]>([]);
  readonly form = signal<FormGroup | null>(null);
  readonly formGroup = computed(() => this.form());
  readonly isEditing = computed(() => !!this.existingSponsor()?.id);
  readonly isSponsoringPeriodOpen = computed(() => this.isWithinSponsoringPeriod(this.conference()));
  readonly logoPreviewUrl = signal('');
  readonly boothWishItems = computed(() => this.boothWishItemsState());
  readonly currentBusinessEvents = computed<SponsorBusinessEvent[]>(() =>
    this.sponsorService.getSortedBusinessEvents(this.existingSponsor())
  );
  readonly adminEmails = computed(() => {
    this.adminEmailsVersion();
    return this.adminEmailsControlValue();
  });

  constructor() {
    this.loadData();
  }

  /**
   * Loads the conference and the sponsor application managed by the current user.
   */
  private loadData(): void {
    const conferenceId = this.conferenceId();
    const email = String(this.currentPerson()?.email ?? '').trim();
    if (!conferenceId || !email) {
      this.loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
      next: (conference) => {
        this.conference.set(conference);
        if (!conference) {
          this.loading.set(false);
          return;
        }

        this.sponsorService.byConferenceIdAndAdminEmail(conferenceId, email).pipe(take(1)).subscribe({
          next: (sponsor) => {
            this.existingSponsor.set(sponsor);
            const form = this.createForm(sponsor);
            this.applyFormInteractivity(form);
            this.form.set(form);
            this.loading.set(false);
          },
          error: (error) => {
            console.error('Error loading sponsor application:', error);
            const form = this.createForm();
            this.applyFormInteractivity(form);
            this.form.set(form);
            this.loading.set(false);
          },
        });
      },
      error: (error) => {
        console.error('Error loading conference for sponsor application:', error);
        this.showError('CONFERENCE.SPONSOR_APPLICATION.LOAD_ERROR');
        this.loading.set(false);
      },
    });
  }

  /**
   * Creates the editable form with sponsor defaults.
   *
   * @param sponsor Existing sponsor when editing.
   * @returns Reactive form instance.
   */
  private createForm(sponsor?: Sponsor): FormGroup {
    const controls: Record<string, unknown> = {
      name: [String(sponsor?.name ?? '').trim(), [Validators.required, Validators.minLength(2)]],
      sponsorTypeId: [String(sponsor?.sponsorTypeId ?? '').trim(), [Validators.required]],
      communicationLanguage: [this.normalizeCommunicationLanguage(sponsor?.communicationLanguage)],
      purchaseOrder: [String(sponsor?.purchaseOrder ?? '').trim()],
      address: [String(sponsor?.address ?? '').trim()],
      logo: [String(sponsor?.logo ?? '').trim()],
      adminEmails: [this.computeInitialAdminEmails(sponsor?.adminEmails)],
    };

    this.boothWishItemsState.set(
      this.computeInitialBoothWishes(String(sponsor?.sponsorTypeId ?? '').trim(), sponsor?.boothWishes)
    );
    this.selectedBoothWishItems.set([]);

    this.languageCodes().forEach((language) => {
      controls[`description_${language}`] = [
        String(
          sponsor?.description?.[language]
            ?? sponsor?.description?.[language.toUpperCase()]
            ?? sponsor?.description?.[language.toLowerCase()]
            ?? ''
        ).trim(),
      ];
      controls[`website_${language}`] = [
        String(
          sponsor?.website?.[language]
            ?? sponsor?.website?.[language.toUpperCase()]
            ?? sponsor?.website?.[language.toLowerCase()]
            ?? ''
        ).trim(),
      ];
    });

    const form = this.fb.group(controls);
    this.logoPreviewUrl.set(String(form.get('logo')?.value ?? '').trim());
    form.get('logo')?.valueChanges.subscribe((value) => {
      this.logoPreviewUrl.set(String(value ?? '').trim());
    });
    form.get('sponsorTypeId')?.valueChanges.subscribe((value) =>
      this.syncBoothWishesForSponsorType(String(value ?? '').trim())
    );
    return form;
  }

  /**
   * Computes the initial ordered booth wishes for a sponsor type.
   *
   * @param sponsorTypeId Selected sponsor type.
   * @param boothWishes Existing booth wishes.
   * @returns Ordered booth wishes matching the sponsor type.
   */
  private computeInitialBoothWishes(sponsorTypeId: string, boothWishes?: string[]): BoothWishItem[] {
    const sponsorType = this.sponsorTypeById(sponsorTypeId);
    const availableBooths = sponsorType?.boothNames ?? [];
    if (availableBooths.length === 0) {
      return [];
    }

    const normalizedExisting = (boothWishes ?? []).map((value) => String(value ?? '').trim()).filter((value) => !!value);
    const prioritized = normalizedExisting.filter((value) => availableBooths.includes(value));
    const remaining = availableBooths.filter((value) => !prioritized.includes(value));
    return [...prioritized, ...remaining].map((name) => ({ name }));
  }

  /**
   * Ensures the editable booth wishes stay aligned with the selected sponsor type.
   *
   * @param sponsorTypeId Selected sponsor type identifier.
   */
  private syncBoothWishesForSponsorType(sponsorTypeId: string): void {
    const currentValue = this.boothWishesControlValue();
    this.boothWishItemsState.set(this.computeInitialBoothWishes(sponsorTypeId, currentValue));
    this.selectedBoothWishItems.set([]);
  }

  /**
   * Applies sponsor type changes coming from the select component.
   *
   * @param sponsorTypeId Selected sponsor type identifier.
   */
  onSponsorTypeChange(sponsorTypeId: string): void {
    this.syncBoothWishesForSponsorType(String(sponsorTypeId ?? '').trim());
  }

  /**
   * Synchronizes the form state after a booth order change in the order list widget.
   *
   * @param event PrimeNG reorder event.
   */
  onBoothWishesReorder(event: { value?: BoothWishItem[] } | undefined): void {
    if (Array.isArray(event?.value) && event.value.length > 0) {
      this.boothWishItemsState.set([...event.value]);
      this.selectedBoothWishItems.update((selected) =>
        selected
          .map((item) => event.value?.find((candidate) => candidate.name === item.name))
          .filter((item): item is BoothWishItem => !!item)
          .slice(-1)
      );
      return;
    }

    this.boothWishItemsState.update((items) => [...items]);
  }

  /**
   * Restricts the order list selection to a single item.
   *
   * @param selection Current selection emitted by PrimeNG.
   */
  onBoothWishSelectionChange(selection: BoothWishItem[] | BoothWishItem | null | undefined): void {
    const items = Array.isArray(selection) ? selection : selection ? [selection] : [];
    this.selectedBoothWishItems.set(items.slice(-1));
  }

  /**
   * Builds the initial admin email list and always keeps the current user present.
   *
   * @param adminEmails Existing admin emails.
   * @returns Normalized admin email list.
   */
  private computeInitialAdminEmails(adminEmails?: string[]): string[] {
    const currentEmail = String(this.currentPerson()?.email ?? '').trim();
    const values = (adminEmails ?? [])
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter((value) => !!value);
    if (currentEmail && !values.includes(currentEmail.toLowerCase())) {
      values.push(currentEmail.toLowerCase());
    }
    return Array.from(new Set(values));
  }

  /**
   * Resolves one sponsor type by identifier.
   *
   * @param sponsorTypeId Sponsor type identifier.
   * @returns Matching sponsor type.
   */
  sponsorTypeById(sponsorTypeId: string): SponsorType | undefined {
    return this.sponsorTypes().find((type) => type.id === sponsorTypeId);
  }

  /**
   * Builds the translated label of a localized field.
   *
   * @param prefix Translation prefix.
   * @param language Language code.
   * @returns Localized label.
   */
  localizedFieldLabel(prefix: 'DESCRIPTION' | 'WEBSITE', language: string): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_APPLICATION.${prefix}`, {
      language: language.toUpperCase(),
    });
  }

  /**
   * Returns the translated label for one sponsor business event.
   *
   * @param eventType Business event type.
   * @returns Translated label.
   */
  businessEventLabel(eventType: SponsorBusinessEvent['type']): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.EVENT_${eventType}`);
  }

  /**
   * Returns the translated label for one sponsor ticket lifecycle status.
   *
   * @param status Ticket lifecycle status.
   * @returns Translated label.
   */
  conferenceTicketStatusLabel(status: ConferenceTicket['status']): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.TICKET_${status}`);
  }

  formatLocalDateTime(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '-';
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    const locale = this.translateService.currentLang || navigator.language || 'fr-FR';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  }

  /**
   * Returns the ordered booth wishes currently stored in the form.
   *
   * @returns Ordered booth wishes.
   */
  private boothWishesControlValue(): string[] {
    return this.boothWishItems()
      .map((value) =>
        typeof value === 'string'
          ? String(value ?? '').trim()
          : String((value as BoothWishItem | undefined)?.name ?? '').trim()
      )
      .filter((value) => !!value);
  }

  /**
   * Returns the admin emails currently stored in the form.
   *
   * @returns Admin emails list.
   */
  private adminEmailsControlValue(): string[] {
    const values = this.formGroup()?.get('adminEmails')?.value;
    return Array.isArray(values)
      ? values.map((value) => String(value ?? '').trim().toLowerCase()).filter((value) => !!value)
      : [];
  }

  /**
   * Adds one admin email to the editable list.
   *
   * @param email Email to add.
   */
  addAdminEmail(email: string): void {
    if (!this.isSponsoringPeriodOpen()) {
      return;
    }
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    const nextEmails = Array.from(new Set([...this.adminEmailsControlValue(), normalizedEmail]));
    this.formGroup()?.get('adminEmails')?.setValue(nextEmails);
    this.adminEmailsVersion.update((value) => value + 1);
  }

  /**
   * Removes one admin email from the editable list.
   *
   * @param email Email to remove.
   */
  removeAdminEmail(email: string): void {
    if (!this.isSponsoringPeriodOpen()) {
      return;
    }
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const nextEmails = this.adminEmailsControlValue().filter((value) => value !== normalizedEmail);
    this.formGroup()?.get('adminEmails')?.setValue(nextEmails);
    this.adminEmailsVersion.update((value) => value + 1);
  }

  /**
   * Persists the sponsor application with default values on first creation.
   */
  onSave(): void {
    const form = this.formGroup();
    const conference = this.conference();
    if (!form || !conference) {
      return;
    }

    if (!this.isSponsoringPeriodOpen()) {
      this.showError('CONFERENCE.SPONSOR_APPLICATION.PERIOD_CLOSED');
      return;
    }

    if (form.invalid) {
      form.markAllAsTouched();
      this.showError('CONFERENCE.CONFIG.FORM_ERRORS');
      return;
    }

    const sponsorTypeId = String(form.get('sponsorTypeId')?.value ?? '').trim();
    const sponsorType = this.sponsorTypeById(sponsorTypeId);
    if (!sponsorType) {
      this.showError('CONFERENCE.SPONSOR_MANAGE.MISSING_TYPE');
      return;
    }

    const editingSponsor = this.existingSponsor();
    const boothWishes = this.boothWishesControlValue();
    const boothWishesDate = this.computeBoothWishesDate(editingSponsor, boothWishes);
    const adminEmails = this.computeInitialAdminEmails(this.adminEmailsControlValue());
    const now = this.nowIsoDate();
    const payload: Sponsor = {
      id: String(editingSponsor?.id ?? '').trim(),
      lastUpdated: String(editingSponsor?.lastUpdated ?? '').trim(),
      conferenceId: conference.id,
      name: String(form.get('name')?.value ?? '').trim(),
      status: this.resolveSelfServiceStatus(editingSponsor),
      statusDate: editingSponsor?.statusDate ?? now,
      paymentStatus: editingSponsor?.paymentStatus ?? 'PENDING',
      paymentStatusDate: editingSponsor?.paymentStatusDate ?? now,
      description: this.extractLocalizedValues('description'),
      sponsorTypeId,
      communicationLanguage: this.normalizeCommunicationLanguage(form.get('communicationLanguage')?.value),
      purchaseOrder: String(form.get('purchaseOrder')?.value ?? '').trim() || undefined,
      address: String(form.get('address')?.value ?? '').trim() || undefined,
      registrationDate: editingSponsor?.registrationDate ?? now,
      acceptedNumber: editingSponsor?.acceptedNumber,
      logo: String(form.get('logo')?.value ?? '').trim(),
      website: this.extractLocalizedValues('website'),
      boothName: editingSponsor?.boothName ?? '',
      boothWishes,
      boothWishesDate,
      adminEmails,
      conferenceTickets: editingSponsor?.conferenceTickets,
      businessEvents: editingSponsor?.businessEvents,
      documents: editingSponsor?.documents,
      logistics: editingSponsor?.logistics,
    };

    this.saving.set(true);
    this.sponsorService.save(payload).pipe(take(1)).subscribe({
      next: (savedSponsor) => {
        this.existingSponsor.set(savedSponsor);
        const nextForm = this.createForm(savedSponsor);
        this.applyFormInteractivity(nextForm);
        this.form.set(nextForm);
        this.saving.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: this.translateService.instant('CONFERENCE.SPONSOR_APPLICATION.SAVE_SUCCESS'),
        });
      },
      error: (error) => {
        console.error('Error saving sponsor application:', error);
        this.saving.set(false);
        this.showError('CONFERENCE.SPONSOR_APPLICATION.SAVE_ERROR');
      },
    });
  }

  /**
   * Navigates back to the conference view.
   */
  goBack(): void {
    void this.router.navigate(['/conference', this.conferenceId()]);
  }

  /**
   * Extracts localized form values for one field prefix.
   *
   * @param fieldPrefix Localized field prefix.
   * @returns Localized value map.
   */
  private extractLocalizedValues(fieldPrefix: 'description' | 'website'): Record<string, string> {
    return this.languageCodes().reduce<Record<string, string>>((acc, language) => {
      const value = String(this.formGroup()?.get(`${fieldPrefix}_${language}`)?.value ?? '').trim();
      if (value) {
        acc[language.toUpperCase()] = value;
      }
      return acc;
    }, {});
  }

  /**
   * Computes the booth wishes date based on actual changes.
   *
   * @param sponsor Existing sponsor.
   * @param boothWishes Current booth wishes.
   * @returns Booth wishes date to persist.
   */
  private computeBoothWishesDate(sponsor: Sponsor | undefined, boothWishes: string[]): string {
    if (!sponsor) {
      return this.nowIsoDate();
    }

    const previous = JSON.stringify(sponsor.boothWishes ?? []);
    const next = JSON.stringify(boothWishes);
    return previous === next ? String(sponsor.boothWishesDate ?? '').trim() || this.nowIsoDate() : this.nowIsoDate();
  }

  /**
   * Returns the current timestamp in ISO date-time format.
   *
   * @returns Date-time formatted as ISO 8601.
   */
  private nowIsoDate(): string {
    return new Date().toISOString();
  }

  /**
   * Returns today's date in ISO date format.
   *
   * @returns Date formatted as `YYYY-MM-DD`.
   */
  private todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Downloads the regenerated sponsor order form when it was previously sent.
   */
  async onDownloadOrderForm(): Promise<void> {
    const sponsor = this.existingSponsor();
    if (!sponsor?.id || !sponsor.documents?.orderFormSentAt) {
      return;
    }
    await this.downloadSponsorDocument('order-form', () =>
      this.sponsorService.downloadSponsorOrderForm(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Downloads the regenerated sponsor invoice when it was previously sent.
   */
  async onDownloadInvoice(): Promise<void> {
    const sponsor = this.existingSponsor();
    if (!sponsor?.id || !sponsor.documents?.invoiceSentAt) {
      return;
    }
    await this.downloadSponsorDocument('invoice', () =>
      this.sponsorService.downloadSponsorInvoice(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Downloads the regenerated sponsor paid invoice when it was previously sent.
   */
  async onDownloadPaidInvoice(): Promise<void> {
    const sponsor = this.existingSponsor();
    if (!sponsor?.id || !sponsor.documents?.invoicePaidSentAt) {
      return;
    }
    await this.downloadSponsorDocument('paid-invoice', () =>
      this.sponsorService.downloadSponsorPaidInvoice(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Returns whether sponsor self-service is currently allowed for the conference.
   *
   * @param conference Loaded conference.
   * @returns `true` when create/update is inside the sponsoring period.
   */
  private isWithinSponsoringPeriod(conference: Conference | undefined): boolean {
    const startDate = String(conference?.sponsoring?.startDate ?? '').trim();
    const endDate = String(conference?.sponsoring?.endDate ?? '').trim();
    const today = this.todayIsoDate();
    if (!startDate && !endDate) {
      return true;
    }
    if (startDate && today < startDate) {
      return false;
    }
    if (endDate && today > endDate) {
      return false;
    }
    return true;
  }

  /**
   * Applies the correct read-only state to the self-service form.
   *
   * @param form Sponsor self-service form.
   */
  private applyFormInteractivity(form: FormGroup): void {
    if (this.isWithinSponsoringPeriod(this.conference())) {
      form.enable({ emitEvent: false });
      return;
    }
    form.disable({ emitEvent: false });
  }

  /**
   * Resolves the persisted sponsor status for sponsor-side self-service saves.
   *
   * @param sponsor Existing sponsor.
   * @returns Status to persist.
   */
  private resolveSelfServiceStatus(sponsor: Sponsor | undefined): Sponsor['status'] {
    const currentStatus = String(sponsor?.status ?? '').trim();
    if (!currentStatus) {
      return 'CANDIDATE';
    }
    if (currentStatus === 'POTENTIAL' || currentStatus === 'CANDIDATE') {
      return 'CANDIDATE';
    }
    return sponsor?.status ?? 'CANDIDATE';
  }

  /**
   * Normalizes one sponsor communication language to the supported set.
   *
   * @param value Raw language value.
   * @returns Supported communication language.
   */
  private normalizeCommunicationLanguage(value: unknown): SponsorCommunicationLanguage {
    return String(value ?? '').trim().toLowerCase() === 'fr' ? 'fr' : 'en';
  }

  /**
   * Downloads one sponsor document through the backend and saves it locally.
   *
   * @param action Current document action key.
   * @param callback Backend callback.
   */
  private async downloadSponsorDocument(
    action: 'order-form' | 'invoice' | 'paid-invoice',
    callback: () => Promise<{ sponsor: Sponsor; document: { filename: string; contentType: string; base64Content: string } }>
  ): Promise<void> {
    this.documentAction.set(action);
    try {
      const response = await callback();
      this.existingSponsor.set(response.sponsor);
      this.sponsorService.saveDownloadedDocument(response.document);
    } catch (error) {
      console.error('Error downloading sponsor document:', error);
      this.showError('CONFERENCE.SPONSOR_APPLICATION.DOCUMENT_DOWNLOAD_ERROR');
    } finally {
      this.documentAction.set(null);
    }
  }

  /**
   * Returns whether one document action is currently running.
   *
   * @param action Document action key.
   * @returns `true` when the action is running.
   */
  isDocumentActionPending(action: 'order-form' | 'invoice' | 'paid-invoice'): boolean {
    return this.documentAction() === action;
  }

  /**
   * Displays a translated error toast.
   *
   * @param detailKey Translation key for the error message.
   */
  private showError(detailKey: string): void {
    this.messageService.add({
      severity: 'error',
      summary: this.translateService.instant('COMMON.ERROR'),
      detail: this.translateService.instant(detailKey),
    });
  }
}


