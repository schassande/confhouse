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
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DataViewModule } from 'primeng/dataview';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { firstValueFrom, forkJoin, take } from 'rxjs';
import { ActivityTicketFieldMapping, BilletwebConfig, ParticipantBilletWebTicket } from '@shared/model/billetweb-config';
import { Activity, ActivityAttribute, ActivityParticipation, AttributeType } from '@shared/model/activity.model';
import { Conference } from '@shared/model/conference.model';
import {
  Sponsor,
  SponsorBusinessEvent,
  SponsorCommunicationLanguage,
  SponsorPaymentStatus,
  SponsorStatus,
  SponsorType,
} from '@shared/model/sponsor.model';
import { Person } from '@shared/model/person.model';
import { ActivityParticipationService } from '../../../services/activity-participation.service';
import { ActivityService } from '../../../services/activity.service';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { ConferenceService } from '../../../services/conference.service';
import { ParticipantBilletwebTicketService } from '../../../services/participant-billetweb-ticket.service';
import { PersonService } from '../../../services/person.service';
import { ParticipantTicketFieldInput, SponsorService, SponsorTicketActionReport } from '../../../services/sponsor.service';
import { StepperModule } from 'primeng/stepper';

interface SelectOption {
  label: string;
  value: string;
}

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

interface SponsorTicketCustomFieldVm {
  activityId: string;
  activityAttributeName: string;
  billetwebCustomFieldId: string;
  attributeType: AttributeType;
  attributeRequired: boolean;
  attributeAllowedValues: string[];
  value: string;
}

interface SponsorParticipantTicketVm {
  ticket: ParticipantBilletWebTicket;
  firstName: string;
  lastName: string;
  email: string;
  customFields: SponsorTicketCustomFieldVm[];
}

type SponsorEditMode = 'create' | 'edit';
type SponsorEditNotice = 'saved' | 'deleted';

@Component({
  selector: 'app-sponsor-edit',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    ConfirmDialogModule,
    DataViewModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    SelectModule,
    TagModule,
    TabsModule,
    StepperModule
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
  private readonly activityService = inject(ActivityService);
  private readonly activityParticipationService = inject(ActivityParticipationService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly billetwebConfigService = inject(BilletwebConfigService);
  private readonly participantBilletwebTicketService = inject(ParticipantBilletwebTicketService);
  private readonly personService = inject(PersonService);
  private readonly sponsorService = inject(SponsorService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly sponsorId = computed(() => this.route.snapshot.paramMap.get('sponsorId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly activities = signal<Activity[]>([]);
  readonly billetwebConfig = signal<BilletwebConfig | undefined>(undefined);
  readonly sponsors = signal<Sponsor[]>([]);
  readonly sponsorTypes = signal<SponsorType[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly actionInProgress = signal<string | null>(null);
  readonly documentAction = signal<'order-form' | 'invoice' | 'paid-invoice' | null>(null);
  readonly ticketActionInProgress = signal<string | null>(null);
  readonly mode = signal<SponsorEditMode>('create');
  readonly form = signal<FormGroup | null>(null);
  readonly participantTicketCards = signal<SponsorParticipantTicketVm[]>([]);
  readonly ticketSectionLoading = signal(false);
  readonly ticketSectionError = signal('');
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
  readonly sponsorTypeOptions = computed<SelectOption[]>(() =>
    this.sponsorTypes().map((type) => ({ label: type.name, value: type.id }))
  );
  readonly communicationLanguageOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('LANGUAGE.FR'), value: 'fr' },
    { label: this.translateService.instant('LANGUAGE.EN'), value: 'en' },
  ]);
  readonly canManageTickets = computed(() =>
    !!this.currentEditingSponsor()?.id && this.currentEditingSponsor()?.status === 'CONFIRMED'
  );
  readonly isSponsorTypeLocked = computed(() => this.currentEditingSponsor()?.status === 'CONFIRMED');
  readonly step = signal<number>(1);

  ngOnInit(): void {
    this.initializeMode();
    this.loadPageData();
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

    const rawValue = form.getRawValue();
    const sponsorTypeId = String(rawValue.sponsorTypeId ?? '').trim();
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
      name: String(rawValue.name ?? '').trim(),
      status: editingSponsor?.status ?? this.normalizeSponsorStatus(rawValue.status),
      statusDate: editingSponsor?.statusDate ?? this.nowIsoDateTime(),
      paymentStatus: editingSponsor?.paymentStatus ?? this.normalizePaymentStatus(rawValue.paymentStatus),
      paymentStatusDate: editingSponsor?.paymentStatusDate ?? this.nowIsoDateTime(),
      description: this.extractLocalizedValues(form, 'description'),
      sponsorTypeId,
      communicationLanguage: this.normalizeCommunicationLanguage(rawValue.communicationLanguage),
      purchaseOrder: String(rawValue.purchaseOrder ?? '').trim() || undefined,
      address: String(rawValue.address ?? '').trim() || undefined,
      registrationDate: editingSponsor?.registrationDate ?? this.nowIsoDateTime(),
      acceptedNumber: editingSponsor?.acceptedNumber,
      invoiceDueDate: this.normalizeOptionalDate(rawValue.invoiceDueDate),
      logo: String(rawValue.logo ?? '').trim(),
      website: this.extractLocalizedValues(form, 'website'),
      boothName: editingSponsor?.boothName ?? String(rawValue.boothName ?? '').trim(),
      boothWishes: this.parseList(rawValue.boothWishesText),
      boothWishesDate: this.normalizeDateTime(rawValue.boothWishesDate),
      adminEmails: this.parseList(rawValue.adminEmailsText),
      businessEvents: editingSponsor?.businessEvents,
      documents: editingSponsor?.documents,
      logistics: editingSponsor?.logistics,
      participantTicketIds: editingSponsor?.participantTicketIds ?? [],
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
    if (!sponsor || !this.canManageTickets()) {
      return;
    }
    await this.runTicketAction('tickets', async () =>
      await this.sponsorService.allocateSponsorTickets(this.conferenceId(), sponsor.id)
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
   * Downloads the regenerated sponsor order form when it was previously sent.
   */
  async onDownloadOrderForm(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
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
    const sponsor = this.currentEditingSponsor();
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
    const sponsor = this.currentEditingSponsor();
    if (!sponsor?.id || !sponsor.documents?.invoicePaidSentAt) {
      return;
    }

    await this.downloadSponsorDocument('paid-invoice', () =>
      this.sponsorService.downloadSponsorPaidInvoice(this.conferenceId(), sponsor.id)
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
   * Sends the sponsor paid invoice email through the backend action layer.
   */
  async onSendPaidInvoice(): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor || sponsor.paymentStatus !== 'PAID') {
      return;
    }
    await this.runSponsorAction('mail-paid-invoice', async () =>
      await this.sponsorService.sendSponsorPaidInvoice(this.conferenceId(), sponsor.id)
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

  isDocumentActionPending(action: 'order-form' | 'invoice' | 'paid-invoice'): boolean {
    return this.documentAction() === action;
  }

  isTicketActionPending(ticketId: string, action: 'upsert' | 'send' | 'delete'): boolean {
    return this.ticketActionInProgress() === `${action}:${ticketId}`;
  }

  participantTicketStatusLabel(status: ParticipantBilletWebTicket['ticketStatus']): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.PARTICIPANT_TICKET_${status}`);
  }

  participantTicketStatusSeverity(status: ParticipantBilletWebTicket['ticketStatus']): TagSeverity {
    switch (status) {
    case 'CREATED':
      return 'success';
    case 'NON_EXISTING':
      return 'secondary';
    case 'DISABLED':
      return 'warn';
    case 'DELETED':
      return 'danger';
    default:
      return 'secondary';
    }
  }

  canSubmitParticipantTicket(ticket: SponsorParticipantTicketVm): boolean {
    return this.canManageTickets()
      && ticket.firstName.trim().length > 0
      && ticket.lastName.trim().length > 0
      && ticket.email.trim().length > 0;
  }

  canDeleteParticipantTicket(ticket: SponsorParticipantTicketVm): boolean {
    return this.canManageTickets() && ticket.ticket.ticketStatus === 'CREATED';
  }

  canSendParticipantTicket(ticket: SponsorParticipantTicketVm): boolean {
    return this.canManageTickets()
      && ticket.ticket.ticketStatus === 'CREATED'
      && String(ticket.ticket.orderId ?? '').trim().length > 0
      && String(ticket.ticket.orderEmail ?? '').trim().length > 0;
  }

  participantTicketSubmitLabel(ticket: SponsorParticipantTicketVm): string {
    return this.translateService.instant(
      ticket.ticket.ticketStatus === 'NON_EXISTING'
        ? 'CONFERENCE.SPONSOR_MANAGE.CREATE_PARTICIPANT_TICKET'
        : 'CONFERENCE.SPONSOR_MANAGE.UPDATE_PARTICIPANT_TICKET'
    );
  }

  customFieldOptions(field: SponsorTicketCustomFieldVm): SelectOption[] {
    return (field.attributeAllowedValues ?? []).map((value) => ({ label: value, value }));
  }

  updateParticipantTicketField(
    ticketId: string,
    field: 'firstName' | 'lastName' | 'email',
    value: string
  ): void {
    this.participantTicketCards.update((tickets) =>
      tickets.map((ticket) => ticket.ticket.id === ticketId ? { ...ticket, [field]: value } : ticket)
    );
  }

  updateParticipantTicketCustomField(
    ticketId: string,
    fieldKey: string,
    value: string
  ): void {
    this.participantTicketCards.update((tickets) =>
      tickets.map((ticket) =>
        ticket.ticket.id !== ticketId
          ? ticket
          : {
            ...ticket,
            customFields: ticket.customFields.map((field) =>
              `${field.activityId}::${field.activityAttributeName}::${field.billetwebCustomFieldId}` === fieldKey
                ? { ...field, value }
                : field
            ),
          }
      )
    );
  }

  async onUpsertParticipantTicket(ticket: SponsorParticipantTicketVm): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor || !this.canSubmitParticipantTicket(ticket)) {
      return;
    }

    await this.runTicketAction(`upsert:${ticket.ticket.id}`, async () =>
      await this.sponsorService.upsertSponsorParticipantTicket(
        this.conferenceId(),
        sponsor.id,
        ticket.ticket.id,
        ticket.firstName.trim(),
        ticket.lastName.trim(),
        ticket.email.trim(),
        ticket.customFields.map((field) => this.toParticipantTicketFieldInput(field))
      )
    );
  }

  async onDeleteParticipantTicket(ticket: SponsorParticipantTicketVm): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor || !this.canDeleteParticipantTicket(ticket)) {
      return;
    }

    await this.runTicketAction(`delete:${ticket.ticket.id}`, async () =>
      await this.sponsorService.deleteSponsorParticipantTicket(
        this.conferenceId(),
        sponsor.id,
        ticket.ticket.id
      )
    );
  }

  async onSendParticipantTicket(ticket: SponsorParticipantTicketVm): Promise<void> {
    const sponsor = this.currentEditingSponsor();
    if (!sponsor || !this.canSendParticipantTicket(ticket)) {
      return;
    }

    await this.runTicketAction(`send:${ticket.ticket.id}`, async () =>
      await this.sponsorService.sendSponsorParticipantTicket(
        this.conferenceId(),
        sponsor.id,
        ticket.ticket.id
      )
    );
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
      activities: this.activityService.byConferenceId(conferenceId).pipe(take(1)),
      billetwebConfig: this.billetwebConfigService.findByConferenceId(conferenceId).pipe(take(1)),
      sponsors: this.sponsorService.byConferenceId(conferenceId).pipe(take(1)),
    }).subscribe({
      next: ({ conference, activities, billetwebConfig, sponsors }) => {
        if (!conference) {
          this.loadError.set('CONFERENCE.NOT_FOUND');
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }

        this.conference.set(conference);
        this.activities.set(activities ?? []);
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
      this.participantTicketCards.set([]);
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
    void this.refreshParticipantTickets();
    if (sponsor.paymentStatus === 'PAID') {
      this.step.set(3);
    } else if (sponsor.documents?.orderFormSentAt) {
      this.step.set(2);
    } else {
      this.step.set(1);
    }
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

    const form = this.fb.group(controls);
    if (sponsor?.status === 'CONFIRMED') {
      form.get('sponsorTypeId')?.disable({ emitEvent: false });
    }
    return form;
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

  /**
   * Reloads the participant ticket cards of the edited sponsor from the persisted model.
   */
  private async refreshParticipantTickets(report?: SponsorTicketActionReport): Promise<void> {
    const sponsor = report?.sponsor ?? this.currentEditingSponsor();
    console.log('[SponsorEdit] refreshParticipantTickets:start', {
      conferenceId: this.conferenceId(),
      sponsorId: sponsor?.id,
      sponsorStatus: sponsor?.status,
      participantTicketIds: sponsor?.participantTicketIds ?? [],
      report,
    });

    if (!sponsor?.id || sponsor.status !== 'CONFIRMED') {
      console.log('[SponsorEdit] refreshParticipantTickets:skipped', {
        reason: !sponsor?.id ? 'missing-sponsor-id' : 'sponsor-not-confirmed',
        sponsorId: sponsor?.id,
        sponsorStatus: sponsor?.status,
      });
      this.participantTicketCards.set([]);
      this.ticketSectionError.set('');
      return;
    }

    this.ticketSectionLoading.set(true);
    this.ticketSectionError.set('');
    try {
      const synchronizedReport = report?.participantTickets
        ? report
        : await this.sponsorService.allocateSponsorTickets(this.conferenceId(), sponsor.id);

      console.log('[SponsorEdit] refreshParticipantTickets:synchronizedReport', {
        sponsorId: sponsor.id,
        inputParticipantTicketIds: sponsor.participantTicketIds ?? [],
        synchronizedSponsor: synchronizedReport.sponsor,
        synchronizedParticipantTickets: synchronizedReport.participantTickets ?? [],
      });

      this.applyUpdatedSponsor(synchronizedReport.sponsor);
      const participantTickets = synchronizedReport.participantTickets
        ?? await this.participantBilletwebTicketService.byIds(synchronizedReport.sponsor.participantTicketIds ?? []);

      console.log('[SponsorEdit] refreshParticipantTickets:loadedTickets', {
        sponsorId: sponsor.id,
        requestedIds: synchronizedReport.sponsor.participantTicketIds ?? [],
        loadedIds: participantTickets.map((ticket) => ticket.id),
        loadedTickets: participantTickets,
      });

      const viewModels = await Promise.all(
        participantTickets.map(async (ticket) => await this.buildParticipantTicketVm(ticket))
      );

      console.log('[SponsorEdit] refreshParticipantTickets:viewModels', {
        sponsorId: sponsor.id,
        viewModelCount: viewModels.length,
        viewModels,
      });

      this.participantTicketCards.set(viewModels);
    } catch (error) {
      console.error('Error loading participant tickets:', error);
      this.ticketSectionError.set('CONFERENCE.SPONSOR_MANAGE.PARTICIPANT_TICKETS_LOAD_ERROR');
      this.participantTicketCards.set([]);
    } finally {
      this.ticketSectionLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  private async buildParticipantTicketVm(ticket: ParticipantBilletWebTicket): Promise<SponsorParticipantTicketVm> {
    const personId = String(ticket.personId ?? '').trim();
    const person = personId
      ? await firstValueFrom(this.personService.byId(personId).pipe(take(1)))
      : undefined;
    const participations = personId
      ? await firstValueFrom(this.activityParticipationService.byConferenceAndPersonId(this.conferenceId(), personId).pipe(take(1)))
      : [];

    const viewModel: SponsorParticipantTicketVm = {
      ticket,
      firstName: String(person?.firstName ?? '').trim(),
      lastName: String(person?.lastName ?? '').trim(),
      email: String(person?.email ?? '').trim(),
      customFields: this.buildParticipantTicketCustomFields(participations),
    };

    console.log('[SponsorEdit] buildParticipantTicketVm', {
      ticketId: ticket.id,
      personId,
      person,
      participations,
      viewModel,
    });

    return viewModel;
  }

  private buildParticipantTicketCustomFields(participations: ActivityParticipation[]): SponsorTicketCustomFieldVm[] {
    const participationsByActivity = new Map<string, ActivityParticipation>(
      (participations ?? []).map((participation) => [String(participation.activityId ?? '').trim(), participation])
    );
    const attributesByActivity = new Map<string, Map<string, ActivityAttribute>>();
    for (const activity of this.conferenceActivities()) {
      attributesByActivity.set(
        String(activity.id ?? '').trim(),
        new Map(
          (activity.specificAttributes ?? []).map((attribute) => [
            String(attribute.attributeName ?? '').trim(),
            attribute,
          ])
        )
      );
    }

    return this.ticketFieldMappings().map((mapping) => {
      const activityId = String(mapping.activityId ?? '').trim();
      const attributeName = String(mapping.activityAttributeName ?? '').trim();
      const attribute = attributesByActivity.get(activityId)?.get(attributeName);
      const participation = participationsByActivity.get(activityId);
      const value = participation?.attributes?.find((item) => String(item.name ?? '').trim() === attributeName)?.value ?? '';
      return {
        activityId,
        activityAttributeName: attributeName,
        billetwebCustomFieldId: String(mapping.billetwebCustomFieldId ?? '').trim(),
        attributeType: attribute?.attributeType ?? 'TEXT',
        attributeRequired: !!attribute?.attributeRequired,
        attributeAllowedValues: attribute?.attributeAllowedValues ?? [],
        value: String(value ?? ''),
      };
    });
  }

  private conferenceActivities(): Activity[] {
    return this.activities();
  }

  private ticketFieldMappings(): ActivityTicketFieldMapping[] {
    return Array.isArray(this.billetwebConfig()?.customFieldMappings)
      ? this.billetwebConfig()?.customFieldMappings ?? []
      : [];
  }

  private toParticipantTicketFieldInput(field: SponsorTicketCustomFieldVm): ParticipantTicketFieldInput {
    return {
      activityId: field.activityId,
      activityAttributeName: field.activityAttributeName,
      billetwebCustomFieldId: field.billetwebCustomFieldId,
      value: this.normalizeCustomFieldValue(field),
    };
  }

  private normalizeCustomFieldValue(field: SponsorTicketCustomFieldVm): string {
    if (field.attributeType === 'BOOLEAN') {
      return String(field.value).toLowerCase() === 'true' ? 'true' : 'false';
    }
    return String(field.value ?? '').trim();
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
      if (report.sponsor.status === 'CONFIRMED') {
        await this.refreshParticipantTickets();
      } else {
        this.participantTicketCards.set([]);
      }
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
   * Executes one sponsor ticket action and reconciles the updated ticket cards in the UI.
   *
   * @param actionKey UI action key.
   * @param action Backend action callback.
   */
  private async runTicketAction(
    actionKey: string,
    action: () => Promise<SponsorTicketActionReport>
  ): Promise<void> {
    this.ticketActionInProgress.set(actionKey);
    try {
      const report = await action();
      this.applyUpdatedSponsor(report.sponsor);
      if (report.participantTickets) {
        await this.refreshParticipantTickets(report);
      } else if (report.participantTicket) {
        await this.refreshParticipantTickets();
      }
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.ACTION_SUCCESS'),
      });
    } catch (error) {
      console.error('Error running participant ticket action:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.ACTION_ERROR'),
      });
    } finally {
      this.ticketActionInProgress.set(null);
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
      this.applyUpdatedSponsor(response.sponsor);
      this.sponsorService.saveDownloadedDocument(response.document);
    } catch (error) {
      console.error('Error downloading sponsor document:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.DOCUMENT_DOWNLOAD_ERROR'),
      });
    } finally {
      this.documentAction.set(null);
      this.cdr.markForCheck();
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
