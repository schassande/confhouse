import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { forkJoin, take } from 'rxjs';
import { BilletwebConfig } from '@shared/model/billetweb-config';
import { Conference } from '@shared/model/conference.model';
import {
  ConferenceTicket,
  Sponsor,
  SponsorBusinessEvent,
  SponsorCommunicationLanguage,
  SponsorPaymentStatus,
  SponsorStatus,
  SponsorType,
} from '@shared/model/sponsor.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { ConferenceService } from '../../../services/conference.service';
import { SponsorService } from '../../../services/sponsor.service';

interface SelectOption {
  label: string;
  value: string;
}

type SponsorEditMode = 'create' | 'edit';
type SponsorEditNotice = 'saved' | 'deleted';

@Component({
  selector: 'app-sponsor-edit',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    SelectModule,
    TabsModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './sponsor-edit.component.html',
  styleUrl: './sponsor-edit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly billetwebConfigService = inject(BilletwebConfigService);
  private readonly sponsorService = inject(SponsorService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly sponsorId = computed(() => this.route.snapshot.paramMap.get('sponsorId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly billetwebConfig = signal<BilletwebConfig | undefined>(undefined);
  readonly sponsors = signal<Sponsor[]>([]);
  readonly sponsorTypes = signal<SponsorType[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly actionInProgress = signal<string | null>(null);
  readonly mode = signal<SponsorEditMode>('create');
  readonly form = signal<FormGroup | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly isEditing = computed(() => this.mode() === 'edit' && this.editingId() !== null);
  readonly currentEditingSponsor = computed(() => {
    const editId = this.editingId();
    if (!editId) {
      return undefined;
    }
    return this.sponsors().find((sponsor) => sponsor.id === editId);
  });
  readonly currentBusinessEvents = computed<SponsorBusinessEvent[]>(() =>
    this.sponsorService.getSortedBusinessEvents(this.currentEditingSponsor())
  );
  readonly languageCodes = computed(() => this.conference()?.languages ?? ['EN', 'FR']);
  readonly logoPreviewUrl = computed(() => String(this.form()?.get('logo')?.value ?? '').trim());
  readonly pageTitleKey = computed(() =>
    this.isEditing() ? 'CONFERENCE.SPONSOR_MANAGE.EDIT' : 'CONFERENCE.SPONSOR_MANAGE.ADD'
  );
  readonly sponsorStatusOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_POTENTIAL'), value: 'POTENTIAL' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CANDIDATE'), value: 'CANDIDATE' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CONFIRMED'), value: 'CONFIRMED' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_REJECTED'), value: 'REJECTED' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CANCELED'), value: 'CANCELED' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_WAITING_LIST'), value: 'WAITING_LIST' },
  ]);
  readonly paymentStatusOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_PENDING'), value: 'PENDING' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_PAID'), value: 'PAID' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_OVERDUE'), value: 'OVERDUE' },
  ]);
  readonly conferenceTicketStatusOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.TICKET_REQUESTED'), value: 'REQUESTED' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.TICKET_CREATED'), value: 'CREATED' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.TICKET_SENT'), value: 'SENT' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.TICKET_CANCELED'), value: 'CANCELED' },
  ]);
  readonly sponsorTypeOptions = computed<SelectOption[]>(() =>
    this.sponsorTypes().map((type) => ({ label: type.name, value: type.id }))
  );
  readonly conferenceTicketTypeOptions = computed<SelectOption[]>(() =>
    (this.billetwebConfig()?.ticketTypes?.sponsors ?? []).map((type) => ({
      label: type.ticketTypeName,
      value: type.ticketTypeId,
    }))
  );
  readonly communicationLanguageOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('LANGUAGE.FR'), value: 'fr' },
    { label: this.translateService.instant('LANGUAGE.EN'), value: 'en' },
  ]);

  ngOnInit(): void {
    this.initializeMode();
    this.loadPageData();
  }

  get conferenceTicketsArray(): FormArray<FormGroup> {
    return (this.form()?.get('conferenceTickets') as FormArray<FormGroup>) ?? this.fb.array<FormGroup>([]);
  }

  onCancel(): void {
    this.navigateToManageList();
  }

  onDelete(sponsor: Sponsor): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.CONFIRM_DELETE'),
      header: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.DELETE'),
      acceptLabel: this.translateService.instant('COMMON.REMOVE'),
      rejectLabel: this.translateService.instant('COMMON.CANCEL'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.sponsorService.delete(sponsor.id).then(
          () => {
            this.navigateToManageList('deleted');
            this.cdr.markForCheck();
          },
          (error) => {
            console.error('Error deleting sponsor:', error);
            this.messageService.add({
              severity: 'error',
              summary: this.translateService.instant('COMMON.ERROR'),
              detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
            });
          }
        );
      },
    });
  }

  onSave(): void {
    const form = this.form();
    if (!form || form.invalid) {
      form?.markAllAsTouched();
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const sponsorTypeId = String(form.value.sponsorTypeId ?? '').trim();
    const sponsorType = this.sponsorTypes().find((type) => type.id === sponsorTypeId);
    if (!sponsorType) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.MISSING_TYPE'),
      });
      return;
    }

    const editingSponsor = this.currentEditingSponsor();
    const payload: Sponsor = {
      id: this.editingId() ?? '',
      lastUpdated: editingSponsor?.lastUpdated ?? '',
      conferenceId: this.conferenceId(),
      name: String(form.value.name ?? '').trim(),
      status: editingSponsor?.status ?? this.normalizeSponsorStatus(form.value.status),
      statusDate: editingSponsor?.statusDate ?? this.nowIsoDateTime(),
      paymentStatus: editingSponsor?.paymentStatus ?? this.normalizePaymentStatus(form.value.paymentStatus),
      paymentStatusDate: editingSponsor?.paymentStatusDate ?? this.nowIsoDateTime(),
      description: this.extractLocalizedValues(form, 'description'),
      sponsorTypeId,
      communicationLanguage: this.normalizeCommunicationLanguage(form.value.communicationLanguage),
      purchaseOrder: String(form.value.purchaseOrder ?? '').trim() || undefined,
      address: String(form.value.address ?? '').trim() || undefined,
      registrationDate: editingSponsor?.registrationDate ?? this.nowIsoDateTime(),
      acceptedNumber: editingSponsor?.acceptedNumber,
      invoiceDueDate: this.normalizeOptionalDate(form.value.invoiceDueDate),
      logo: String(form.value.logo ?? '').trim(),
      website: this.extractLocalizedValues(form, 'website'),
      boothName: editingSponsor?.boothName ?? String(form.value.boothName ?? '').trim(),
      boothWishes: this.parseList(form.value.boothWishesText),
      boothWishesDate: this.normalizeDateTime(form.value.boothWishesDate),
      adminEmails: this.parseList(form.value.adminEmailsText),
      conferenceTickets: editingSponsor?.conferenceTickets ?? this.extractConferenceTickets(form),
      businessEvents: editingSponsor?.businessEvents,
      documents: editingSponsor?.documents,
      logistics: editingSponsor?.logistics,
    };

    this.sponsorService.save(payload).subscribe({
      next: () => {
        this.navigateToManageList('saved');
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error saving sponsor:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }

  /**
   * Applies one explicit sponsor status update through the backend action layer.
   */
  async onApplyStatus(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    const form = this.form();
    if (!sponsor || !form) {
      return;
    }
    await this.runSponsorAction('status', async () =>
      await this.sponsorService.updateSponsorStatus(
        this.conferenceId(),
        sponsor.id,
        this.normalizeSponsorStatus(form.value.status),
        this.nowIsoDateTime()
      )
    );
  }

  /**
   * Applies one explicit sponsor payment status update through the backend action layer.
   */
  async onApplyPaymentStatus(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    const form = this.form();
    if (!sponsor || !form) {
      return;
    }
    await this.runSponsorAction('payment', async () =>
      await this.sponsorService.updateSponsorPaymentStatus(
        this.conferenceId(),
        sponsor.id,
        this.normalizePaymentStatus(form.value.paymentStatus),
        this.nowIsoDateTime()
      )
    );
  }

  /**
   * Applies one explicit booth assignment through the backend action layer.
   */
  async onAssignBooth(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    const form = this.form();
    if (!sponsor || !form) {
      return;
    }
    await this.runSponsorAction('booth', async () =>
      await this.sponsorService.assignSponsorBooth(
        this.conferenceId(),
        sponsor.id,
        String(form.value.boothName ?? '').trim()
      )
    );
  }

  /**
   * Applies one explicit sponsor ticket allocation through the backend action layer.
   */
  async onAllocateTickets(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    const form = this.form();
    if (!sponsor || !form) {
      return;
    }
    await this.runSponsorAction('tickets', async () =>
      await this.sponsorService.allocateSponsorTickets(
        this.conferenceId(),
        sponsor.id,
        this.extractConferenceTickets(form) ?? []
      )
    );
  }

  /**
   * Sends the sponsor order form email through the backend action layer.
   */
  async onSendOrderForm(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor) {
      return;
    }
    await this.runSponsorAction('mail-order-form', async () =>
      await this.sponsorService.sendSponsorOrderForm(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Sends the sponsor invoice email through the backend action layer.
   */
  async onSendInvoice(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor) {
      return;
    }
    await this.runSponsorAction('mail-invoice', async () =>
      await this.sponsorService.sendSponsorInvoice(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Sends the sponsor payment reminder email through the backend action layer.
   */
  async onSendPaymentReminder(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor) {
      return;
    }
    await this.runSponsorAction('mail-reminder', async () =>
      await this.sponsorService.sendSponsorPaymentReminder(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Sends the sponsor application confirmation email through the backend action layer.
   */
  async onSendApplicationConfirmation(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor) {
      return;
    }
    await this.runSponsorAction('mail-confirmation', async () =>
      await this.sponsorService.sendSponsorApplicationConfirmation(this.conferenceId(), sponsor.id)
    );
  }

  /**
   * Sends the sponsor administrative summary email through the backend action layer.
   */
  async onSendAdministrativeSummary(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor) {
      return;
    }
    await this.runSponsorAction('mail-summary', async () =>
      await this.sponsorService.sendSponsorAdministrativeSummary(this.conferenceId(), sponsor.id)
    );
  }

  isActionPending(actionKey: string): boolean {
    return this.actionInProgress() === actionKey;
  }

  addConferenceTicket(): void {
    const form = this.form();
    if (!form) {
      return;
    }
    (form.get('conferenceTickets') as FormArray<FormGroup>).push(this.createConferenceTicketGroup());
  }

  removeConferenceTicket(index: number): void {
    const form = this.form();
    if (!form) {
      return;
    }
    (form.get('conferenceTickets') as FormArray<FormGroup>).removeAt(index);
  }

  localizedFieldLabel(prefix: 'DESCRIPTION' | 'WEBSITE', language: string): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.${prefix}`, {
      language: language.toUpperCase(),
    });
  }

  businessEventLabel(eventType: SponsorBusinessEvent['type']): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.EVENT_${eventType}`);
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
   * Initializes page mode from the current route.
   */
  private initializeMode(): void {
    const rawMode = String(this.route.snapshot.data['mode'] ?? '').trim();
    this.mode.set(rawMode === 'edit' ? 'edit' : 'create');
  }

  /**
   * Loads all data needed by the organizer sponsor editor.
   */
  private loadPageData(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loadError.set('CONFERENCE.NOT_FOUND');
      this.loading.set(false);
      return;
    }

    forkJoin({
      conference: this.conferenceService.byId(conferenceId).pipe(take(1)),
      billetwebConfig: this.billetwebConfigService.findByConferenceId(conferenceId).pipe(take(1)),
      sponsors: this.sponsorService.byConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, billetwebConfig, sponsors }) => {
        if (!conference) {
          this.loadError.set('CONFERENCE.NOT_FOUND');
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }

        this.conference.set(conference);
        this.billetwebConfig.set(billetwebConfig);
        this.sponsorTypes.set(conference.sponsoring?.sponsorTypes ?? []);
        this.sponsors.set(sponsors);
        this.initializeEditorState();
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading conference sponsors:', error);
        this.loadError.set('CONFERENCE.CONFIG.UPDATE_ERROR');
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Initializes the form based on whether we create or edit a sponsor.
   */
  private initializeEditorState(): void {
    if (this.mode() === 'create') {
      this.form.set(this.createForm());
      this.editingId.set(null);
      return;
    }

    const sponsorId = String(this.sponsorId() ?? '').trim();
    const sponsor = this.sponsors().find((item) => item.id === sponsorId);
    if (!sponsor) {
      this.loadError.set('CONFERENCE.NOT_FOUND');
      return;
    }

    this.editingId.set(sponsor.id);
    this.form.set(this.createForm(sponsor));
  }

  private createForm(sponsor?: Sponsor): FormGroup {
    const controls: Record<string, unknown> = {
      name: [String(sponsor?.name ?? '').trim(), [Validators.required, Validators.minLength(2)]],
      sponsorTypeId: [String(sponsor?.sponsorTypeId ?? '').trim(), [Validators.required]],
      status: [String(sponsor?.status ?? 'POTENTIAL').trim(), [Validators.required]],
      paymentStatus: [String(sponsor?.paymentStatus ?? 'PENDING').trim(), [Validators.required]],
      communicationLanguage: [this.normalizeCommunicationLanguage(sponsor?.communicationLanguage)],
      purchaseOrder: [String(sponsor?.purchaseOrder ?? '').trim()],
      address: [String(sponsor?.address ?? '').trim()],
      invoiceDueDate: [this.normalizeDateInputValue(sponsor?.invoiceDueDate)],
      logo: [String(sponsor?.logo ?? '').trim()],
      boothName: [String(sponsor?.boothName ?? '').trim()],
      boothWishesText: [Array.isArray(sponsor?.boothWishes) ? sponsor.boothWishes.join('\n') : ''],
      boothWishesDate: [this.normalizeDateTimeInputValue(sponsor?.boothWishesDate ?? new Date().toISOString())],
      adminEmailsText: [Array.isArray(sponsor?.adminEmails) ? sponsor.adminEmails.join('\n') : ''],
      conferenceTickets: this.fb.array<FormGroup>(
        (sponsor?.conferenceTickets ?? []).map((ticket) => this.createConferenceTicketGroup(ticket))
      ),
    };

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

    return this.fb.group(controls);
  }

  private createConferenceTicketGroup(ticket?: ConferenceTicket): FormGroup {
    return this.fb.group({
      conferenceTicketTypeId: [String(ticket?.conferenceTicketTypeId ?? '').trim(), [Validators.required]],
      email: [String(ticket?.email ?? '').trim()],
      ticketId: [String(ticket?.ticketId ?? '').trim()],
      status: [String(ticket?.status ?? 'REQUESTED').trim(), [Validators.required]],
    });
  }

  private extractLocalizedValues(form: FormGroup, fieldPrefix: 'description' | 'website'): Record<string, string> {
    return this.languageCodes().reduce<Record<string, string>>((acc, language) => {
      const value = String(form.get(`${fieldPrefix}_${language}`)?.value ?? '').trim();
      if (value.length > 0) {
        acc[language.toUpperCase()] = value;
      }
      return acc;
    }, {});
  }

  private extractConferenceTickets(form: FormGroup): ConferenceTicket[] | undefined {
    const values = (form.get('conferenceTickets') as FormArray<FormGroup>).getRawValue() as Array<{
      conferenceTicketTypeId?: string;
      email?: string;
      ticketId?: string;
      status?: ConferenceTicket['status'];
    }>;

    const tickets = values
      .map((ticket) => ({
        conferenceTicketTypeId: String(ticket?.conferenceTicketTypeId ?? '').trim(),
        email: String(ticket?.email ?? '').trim(),
        ticketId: String(ticket?.ticketId ?? '').trim(),
        status: this.normalizeConferenceTicketStatus(ticket?.status),
      }))
      .filter((ticket) => ticket.conferenceTicketTypeId.length > 0 || ticket.email.length > 0 || ticket.ticketId.length > 0);

    return tickets.length > 0 ? tickets : undefined;
  }

  private parseList(raw: string | undefined): string[] {
    return String(raw ?? '')
      .split(/\r?\n|,|;/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private normalizeDateTime(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length > 0) {
      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  }

  private normalizeDateInputValue(value: unknown): string {
    const normalized = String(value ?? '').trim();
    return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
  }

  private normalizeDateTimeInputValue(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private normalizeOptionalDate(value: unknown): string | undefined {
    const normalized = this.normalizeDateInputValue(value);
    return normalized || undefined;
  }

  private nowIsoDateTime(): string {
    return new Date().toISOString();
  }

  private normalizeSponsorStatus(value: unknown): SponsorStatus {
    const normalized = String(value ?? '').trim();
    const allowed: SponsorStatus[] = [
      'POTENTIAL',
      'CANDIDATE',
      'CONFIRMED',
      'REJECTED',
      'CANCELED',
      'WAITING_LIST',
    ];
    return allowed.includes(normalized as SponsorStatus) ? (normalized as SponsorStatus) : 'POTENTIAL';
  }

  private normalizePaymentStatus(value: unknown): SponsorPaymentStatus {
    const normalized = String(value ?? '').trim();
    const allowed: SponsorPaymentStatus[] = ['PENDING', 'PAID', 'OVERDUE'];
    return allowed.includes(normalized as SponsorPaymentStatus) ? (normalized as SponsorPaymentStatus) : 'PENDING';
  }

  private normalizeConferenceTicketStatus(value: unknown): ConferenceTicket['status'] {
    const normalized = String(value ?? '').trim();
    const allowed: ConferenceTicket['status'][] = ['REQUESTED', 'CREATED', 'SENT', 'CANCELED'];
    return allowed.includes(normalized as ConferenceTicket['status'])
      ? (normalized as ConferenceTicket['status'])
      : 'REQUESTED';
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
   * Executes one backend sponsor action and reconciles the returned sponsor in the UI.
   *
   * @param actionKey UI action key.
   * @param action Backend action callback.
   */
  private async runSponsorAction(actionKey: string, action: () => Promise<{ sponsor: Sponsor }>): Promise<void> {
    this.actionInProgress.set(actionKey);
    try {
      const report = await action();
      this.applyUpdatedSponsor(report.sponsor);
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.ACTION_SUCCESS'),
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error running sponsor action:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.ACTION_ERROR'),
      });
    } finally {
      this.actionInProgress.set(null);
      this.cdr.markForCheck();
    }
  }

  /**
   * Reconciles one updated sponsor payload in local state and refreshes the form.
   *
   * @param sponsor Updated sponsor.
   */
  private applyUpdatedSponsor(sponsor: Sponsor): void {
    this.sponsors.set(this.sponsors().map((item) => (item.id === sponsor.id ? sponsor : item)));
    if (this.editingId() === sponsor.id) {
      this.form.set(this.createForm(sponsor));
    }
  }

  /**
   * Navigates back to the sponsor list and optionally carries a transient notice.
   *
   * @param notice Optional notice identifier.
   */
  private navigateToManageList(notice?: SponsorEditNotice): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'sponsors', 'manage'], {
      queryParams: notice ? { notice } : undefined,
    });
  }
}
