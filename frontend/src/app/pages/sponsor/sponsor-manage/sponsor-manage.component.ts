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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { firstValueFrom, forkJoin, take } from 'rxjs';
import { BilletwebConfig } from '@shared/model/billetweb-config';
import { Conference } from '@shared/model/conference.model';
import { BoothAllocationMode, Sponsor, SponsorType } from '@shared/model/sponsor.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { SponsorBoothAllocationService } from '../../../services/sponsor-booth-allocation.service';
import { ConferenceService } from '../../../services/conference.service';
import { SponsorService } from '../../../services/sponsor.service';
import {
  SponsorManageStateService,
  SponsorSortMode,
} from '../../../services/sponsor-manage-state.service';

interface SelectOption {
  label: string;
  value: string;
}

/** Number of confirmed sponsors for one configured sponsor type. */
interface ConfirmedSponsorCount {
  sponsorType: SponsorType;
  count: number;
}

/** Number of confirmed sponsors for one configured sponsor type. */
type SponsorTagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

type SponsorWorkflowState =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ORDER_FORM_SENT'
  | 'INVOICE_SENT'
  | 'PAID_INVOICE_SENT'
  | 'PAID'
  | 'TICKETS_CREATED'
  | 'CANCELED';

@Component({
  selector: 'app-sponsor-manage',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    ButtonModule,
    DataViewModule,
    InputTextModule,
    ToastModule,
    SelectModule,
    TagModule,
  ],
  providers: [MessageService],
  templateUrl: './sponsor-manage.component.html',
  styleUrl: './sponsor-manage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorManageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly conferenceService = inject(ConferenceService);
  private readonly billetwebConfigService = inject(BilletwebConfigService);
  private readonly sponsorService = inject(SponsorService);
  private readonly sponsorBoothAllocationService = inject(SponsorBoothAllocationService);
  private readonly sponsorManageStateService = inject(SponsorManageStateService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly billetwebConfig = signal<BilletwebConfig | undefined>(undefined);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly sponsors = signal<Sponsor[]>([]);
  readonly sponsorTypes = signal<SponsorType[]>([]);
  readonly allocationInProgressTypeId = signal<string | null>(null);
  private readonly initialManageState = this.sponsorManageStateService.getState(this.conferenceId());
  readonly selectedTypeId = signal<string>(this.initialManageState.typeId);
  readonly selectedSponsorStatus = signal<string>(this.initialManageState.sponsorStatus);
  readonly selectedPaymentStatus = signal<string>(this.initialManageState.paymentStatus);
  readonly selectedTicketState = signal<string>('ALL');
  readonly ticketActionInProgress = signal<string | null>(null);
  readonly selectedSortMode = signal<SponsorSortMode>(this.initialManageState.sortMode);
  readonly confirmedSponsorsByType = computed<ConfirmedSponsorCount[]>(() => {
    const sponsors = this.sponsors();
    return this.sponsorTypes().map((sponsorType) => ({
      sponsorType,
      count: sponsors.filter(
        (sponsor) => sponsor.sponsorTypeId === sponsorType.id && sponsor.status === 'CONFIRMED'
      ).length,
    }));
  });
  readonly autoAllocatableSponsorTypes = computed(() =>
    this.sponsorTypes().filter(
      (sponsorType) => sponsorType.boothAllocationMode !== 'MANUAL' && this.hasBooths(sponsorType)
    )
  );
  readonly typeFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_ALL'), value: 'ALL' },
    ...this.sponsorTypes().map((type) => ({ label: type.name, value: type.id })),
  ]);
  readonly sponsorStatusFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_STATUS_ALL'), value: 'ALL' },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_POTENTIAL'),
      value: 'POTENTIAL',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CANDIDATE'),
      value: 'CANDIDATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_WAITING_LIST'),
      value: 'WAITING_LIST',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CONFIRMED'),
      value: 'CONFIRMED',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_REJECTED'),
      value: 'REJECTED',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.STATUS_CANCELED'),
      value: 'CANCELED',
    },
  ]);
  readonly paymentFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_PAYMENT_ALL'), value: 'ALL' },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_PENDING'),
      value: 'PENDING',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_PAID'),
      value: 'PAID',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.PAYMENT_OVERDUE'),
      value: 'OVERDUE',
    },
  ]);
  readonly ticketStateFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_TICKETS_ALL'), value: 'ALL' },
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_TICKETS_TODO'), value: 'TODO' },
  ]);
  readonly pendingPaidTicketCount = computed(() =>
    this.sponsors().filter(
      (sponsor) => sponsor.status === 'CONFIRMED' && sponsor.paymentStatus === 'PAID' && sponsor.allTicketsCreated === 'TODO'
    ).length
  );
  readonly pendingUnpaidTicketCount = computed(() =>
    this.sponsors().filter(
      (sponsor) => sponsor.status === 'CONFIRMED' && sponsor.paymentStatus !== 'PAID' && sponsor.allTicketsCreated === 'TODO'
    ).length
  );
  readonly ticketEmailsOpen = computed(() => {
    const startDate = String(this.conference()?.sponsoring?.ticketStartDate ?? '').slice(0, 10);
    return !!startDate && startDate <= new Date().toISOString().slice(0, 10);
  });
  readonly sortOptions = computed<SelectOption[]>(() => [
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.SORT_NAME'),
      value: 'NAME',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.SORT_REGISTRATION_DATE'),
      value: 'REGISTRATION_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.SORT_CONFIRMATION_DATE'),
      value: 'CONFIRMATION_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.SORT_PAYMENT_DATE'),
      value: 'PAYMENT_DATE',
    },
    {
      label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.SORT_BOOTH'),
      value: 'BOOTH',
    },
  ]);
  readonly filteredSponsors = computed(() => {
    const selectedType = this.selectedTypeId();
    const selectedSponsorStatus = this.selectedSponsorStatus();
    const selectedPaymentStatus = this.selectedPaymentStatus();
    const selectedSortMode = this.selectedSortMode();
    return [...this.sponsors()]
      .filter((sponsor) => selectedType === 'ALL' || sponsor.sponsorTypeId === selectedType)
      .filter((sponsor) => selectedSponsorStatus === 'ALL' || sponsor.status === selectedSponsorStatus)
      .filter((sponsor) => selectedPaymentStatus === 'ALL' || sponsor.paymentStatus === selectedPaymentStatus)
      .filter((sponsor) => this.selectedTicketState() === 'ALL' || sponsor.allTicketsCreated === this.selectedTicketState())
      .sort((a, b) => this.compareSponsors(a, b, selectedSortMode));
  });
  readonly filteredCountLabel = computed(() =>
    this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.COUNT', {
      filtered: this.filteredSponsors().length,
      total: this.sponsors().length,
    })
  );

  ngOnInit(): void {
    this.loadPageData();
  }

  onFilterTypeChange(value: string): void {
    this.selectedTypeId.set(String(value ?? 'ALL'));
    this.saveManageState();
  }

  onFilterSponsorStatusChange(value: string): void {
    this.selectedSponsorStatus.set(String(value ?? 'ALL'));
    this.saveManageState();
  }

  onFilterPaymentStatusChange(value: string): void {
    this.selectedPaymentStatus.set(String(value ?? 'ALL'));
    this.saveManageState();
  }

  onSortModeChange(value: string): void {
    this.selectedSortMode.set(this.normalizeSortMode(value));
    this.saveManageState();
  }

  /** Changes the ticket completion filter. */
  onFilterTicketStateChange(value: string): void {
    this.selectedTicketState.set(String(value ?? 'ALL'));
  }

  /** Sends ticket-opening notifications to every eligible sponsor. */
  async onNotifyTickets(): Promise<void> {
    await this.sendTicketEmails('opened', this.sponsors());
  }

  /** Sends ticket reminders to every sponsor with pending tickets. */
  async onRemindTickets(): Promise<void> {
    await this.sendTicketEmails(
      'reminder',
      this.sponsors().filter((sponsor) => sponsor.paymentStatus === 'PAID' && sponsor.allTicketsCreated === 'TODO')
    );
  }

  /** Sends one ticket email per sponsor and reports the aggregate result. */
  private async sendTicketEmails(kind: 'opened' | 'reminder', sponsors: Sponsor[]): Promise<void> {
    if (!this.ticketEmailsOpen() || this.ticketActionInProgress()) {
      return;
    }
    this.ticketActionInProgress.set(kind);
    let success = 0;
    let failed = 0;
    try {
      for (const sponsor of sponsors) {
        try {
          const report = kind === 'opened'
            ? await this.sponsorService.sendSponsorTicketOpened(this.conferenceId(), sponsor.id)
            : await this.sponsorService.sendSponsorTicketReminder(this.conferenceId(), sponsor.id);
          this.applyUpdatedSponsors([report.sponsor]);
          success += 1;
        } catch (error) {
          console.error(`Unable to send sponsor ticket ${kind} email`, sponsor.id, error);
          failed += 1;
        }
      }
      this.messageService.add({
        severity: failed > 0 ? 'warn' : 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.TICKET_EMAIL_SUMMARY', { success, failed }),
      });
    } finally {
      this.ticketActionInProgress.set(null);
      this.cdr.markForCheck();
    }
  }

  onAddNew(): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'sponsors', 'manage', 'create']);
  }

  onEdit(sponsor: Sponsor): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'sponsors', 'manage', sponsor.id]);
  }

  onSponsorClick(sponsor: Sponsor): void {
    this.onEdit(sponsor);
  }

  async onAutoAllocateBooths(sponsorType: SponsorType): Promise<void> {
    if (sponsorType.boothAllocationMode === 'MANUAL') {
      return;
    }

    const allocation = this.sponsorBoothAllocationService.allocateForSponsorType(sponsorType, this.sponsors());
    if (allocation.processedSponsors.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.AUTO_ALLOCATE_NO_ELIGIBLE', {
          sponsorType: sponsorType.name,
        }),
      });
      return;
    }

    this.allocationInProgressTypeId.set(sponsorType.id);
    try {
      const updatedSponsors = await Promise.all(
        this.prepareSponsorsForAutoAllocationPersistence(allocation.processedSponsors).map(
          async (sponsor) => await firstValueFrom(this.sponsorService.save(sponsor))
        )
      );

      this.applyUpdatedSponsors(updatedSponsors);
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('COMMON.SUCCESS'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.AUTO_ALLOCATE_SUCCESS', {
          sponsorType: sponsorType.name,
          allocated: allocation.allocatedSponsors.length,
          total: allocation.processedSponsors.length,
        }),
      });

      if (allocation.unallocatedSponsors.length > 0) {
        this.messageService.add({
          severity: 'warn',
          summary: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.AUTO_ALLOCATE_UNALLOCATED_TITLE'),
          detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.AUTO_ALLOCATE_UNALLOCATED_DETAIL', {
            sponsors: allocation.unallocatedSponsors.map((sponsor) => sponsor.name).join(', '),
          }),
          life: 8000,
        });
      }
    } catch (error) {
      console.error('Error applying automatic sponsor booth allocation:', error);
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.AUTO_ALLOCATE_ERROR', {
          sponsorType: sponsorType.name,
        }),
      });
    } finally {
      this.allocationInProgressTypeId.set(null);
      this.cdr.markForCheck();
    }
  }

  sponsorTypeById(sponsorTypeId: string): SponsorType | undefined {
    return this.sponsorTypes().find((type) => type.id === sponsorTypeId);
  }

  boothAllocationModeLabel(mode: BoothAllocationMode): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_CONFIG.BOOTH_ALLOCATION_MODE_${mode}`);
  }

  hasBooths(sponsorType: SponsorType): boolean {
    return (sponsorType.boothNames ?? []).some((boothName) => !!String(boothName ?? '').trim());
  }

  isAllocationPending(sponsorTypeId: string): boolean {
    return this.allocationInProgressTypeId() === sponsorTypeId;
  }

  typeBadgeStyle(type: SponsorType | undefined): Record<string, string> {
    return {
      background: String(type?.color ?? '#334155'),
      color: String(type?.fontColor ?? '#ffffff'),
    };
  }

  /**
   * Returns the single workflow state displayed on the sponsor management card.
   *
   * @param sponsor Sponsor whose workflow state is displayed.
   * @returns The highest-priority state reached by the sponsor.
   */
  sponsorWorkflowState(sponsor: Sponsor): SponsorWorkflowState {
    if (sponsor.status === 'CANCELED') {
      return 'CANCELED';
    }
    if (sponsor.status !== 'CONFIRMED') {
      return 'PENDING';
    }
    if (sponsor.paymentStatus === 'PAID' && sponsor.allTicketsCreated === 'DONE') {
      return 'TICKETS_CREATED';
    }
    if (sponsor.paymentStatus === 'PAID') {
      return 'PAID';
    }
    if (sponsor.documents?.invoicePaidSentAt) {
      return 'PAID_INVOICE_SENT';
    }
    if (sponsor.documents?.invoiceSentAt) {
      return 'INVOICE_SENT';
    }
    if (sponsor.documents?.orderFormSentAt) {
      return 'ORDER_FORM_SENT';
    }
    return 'CONFIRMED';
  }

  /**
   * Returns the translated label for the sponsor workflow state.
   *
   * @param sponsor Sponsor whose state is displayed.
   * @returns Translated workflow label.
   */
  sponsorWorkflowStateLabel(sponsor: Sponsor): string {
    return this.translateService.instant(
      `CONFERENCE.SPONSOR_MANAGE.WORKFLOW_${this.sponsorWorkflowState(sponsor)}`
    );
  }

  /**
   * Returns the visual severity for the sponsor workflow state.
   *
   * @param sponsor Sponsor whose state is displayed.
   * @returns PrimeNG tag severity.
   */
  sponsorWorkflowStateSeverity(sponsor: Sponsor): SponsorTagSeverity {
    switch (this.sponsorWorkflowState(sponsor)) {
      case 'TICKETS_CREATED':
      case 'PAID':
        return 'success';
      case 'CANCELED':
        return 'danger';
      case 'PENDING':
      case 'CONFIRMED':
      case 'ORDER_FORM_SENT':
      case 'INVOICE_SENT':
      case 'PAID_INVOICE_SENT':
      default:
        return 'warn';
    }
  }

  /**
   * Loads sponsor list data for the organizer manage page.
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
        this.showNavigationNotice();
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
   * Displays one success notification carried by the current route query params.
   */
  private showNavigationNotice(): void {
    const notice = String(this.route.snapshot.queryParamMap.get('notice') ?? '').trim();
    if (notice === 'saved') {
      this.addNotice('CONFERENCE.CONFIG.SAVED');
      return;
    }

    if (notice === 'deleted') {
      this.addNotice('CONFERENCE.SPONSOR_MANAGE.DELETED');
    }
  }

  /**
   * Adds one translated success notice to the toast service.
   *
   * @param detailKey Translation key for the detail line.
   */
  private addNotice(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('COMMON.SUCCESS'),
      detail: this.translateService.instant(detailKey),
    });
  }

  /** Saves the current sponsor list criteria in the in-memory state service. */
  private saveManageState(): void {
    this.sponsorManageStateService.setState(this.conferenceId(), {
      typeId: this.selectedTypeId(),
      sponsorStatus: this.selectedSponsorStatus(),
      paymentStatus: this.selectedPaymentStatus(),
      sortMode: this.selectedSortMode(),
    });
  }

  /**
   * Reconciles several updated sponsors into the local list.
   *
   * @param sponsors Updated sponsors returned by the backend.
   */
  private applyUpdatedSponsors(sponsors: Sponsor[]): void {
    const updatedById = new Map(
      sponsors.map((sponsor) => [String(sponsor.id ?? '').trim(), sponsor] as const)
    );
    this.sponsors.set(
      this.sponsors().map((sponsor) => updatedById.get(String(sponsor.id ?? '').trim()) ?? sponsor)
    );
  }

  /**
   * Prepares sponsors before persisting one automatic booth allocation result.
   *
   * The frontend persistence path keeps business history unchanged, but refreshes the
   * booth projection so the organizer UI stays consistent with the new booth state.
   *
   * @param sponsors Sponsors processed by the allocation service.
   * @returns Sponsors ready to be saved.
   */
  private prepareSponsorsForAutoAllocationPersistence(sponsors: Sponsor[]): Sponsor[] {
    const boothAssignedAt = new Date().toISOString();
    return sponsors.map((sponsor) => ({
      ...sponsor,
      logistics: this.nextAutoAllocationLogistics(sponsor, boothAssignedAt),
    }));
  }

  /**
   * Updates booth logistics after an automatic allocation run.
   *
   * @param sponsor Sponsor to update.
   * @param boothAssignedAt Timestamp used for newly assigned booths.
   * @returns Updated logistics projection.
   */
  private nextAutoAllocationLogistics(sponsor: Sponsor, boothAssignedAt: string): Sponsor['logistics'] {
    const nextLogistics = { ...(sponsor.logistics ?? {}) };
    if (String(sponsor.boothName ?? '').trim()) {
      nextLogistics.boothAssignedAt = boothAssignedAt;
      return nextLogistics;
    }

    delete nextLogistics.boothAssignedAt;
    return Object.keys(nextLogistics).length > 0 ? nextLogistics : undefined;
  }

  /**
   * Compares two sponsors according to the selected sort mode.
   *
   * @param left First sponsor.
   * @param right Second sponsor.
   * @param sortMode Selected sort mode.
   * @returns Sort order for the sponsor list.
   */
  private compareSponsors(left: Sponsor, right: Sponsor, sortMode: SponsorSortMode): number {
    switch (sortMode) {
      case 'REGISTRATION_DATE':
        return this.compareOptionalDates(left.registrationDate, right.registrationDate)
          || this.compareSponsorNames(left, right);
      case 'CONFIRMATION_DATE':
        return this.compareBooleanWithTrueFirst(left.status !== 'CONFIRMED', right.status !== 'CONFIRMED')
          || this.compareOptionalDates(left.statusDate, right.statusDate)
          || this.compareSponsorNames(left, right);
      case 'PAYMENT_DATE':
        return this.compareBooleanWithTrueFirst(left.paymentStatus !== 'PAID', right.paymentStatus !== 'PAID')
          || this.compareOptionalDates(left.paymentStatusDate, right.paymentStatusDate)
          || this.compareSponsorNames(left, right);
      case 'BOOTH':
        return this.compareBooths(left, right) || this.compareSponsorNames(left, right);
      case 'NAME':
      default:
        return this.compareSponsorNames(left, right);
    }
  }

  /**
   * Compares sponsor names alphabetically.
   *
   * @param left First sponsor.
   * @param right Second sponsor.
   * @returns Alphabetical sort order.
   */
  private compareSponsorNames(left: Sponsor, right: Sponsor): number {
    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  }

  /**
   * Compares optional ISO dates with empty values first.
   *
   * @param leftDate First date.
   * @param rightDate Second date.
   * @returns Date sort order.
   */
  private compareOptionalDates(leftDate: string | undefined, rightDate: string | undefined): number {
    return String(leftDate ?? '').trim().localeCompare(String(rightDate ?? '').trim());
  }

  /**
   * Compares booleans by putting `true` values first.
   *
   * @param left First boolean.
   * @param right Second boolean.
   * @returns Boolean sort order.
   */
  private compareBooleanWithTrueFirst(left: boolean, right: boolean): number {
    return Number(right) - Number(left);
  }

  /**
   * Compares sponsors by booth order defined on their sponsor type.
   *
   * Sponsors without booth are displayed first.
   *
   * @param left First sponsor.
   * @param right Second sponsor.
   * @returns Booth sort order.
   */
  private compareBooths(left: Sponsor, right: Sponsor): number {
    const leftRank = this.boothSortRank(left);
    const rightRank = this.boothSortRank(right);
    return leftRank - rightRank;
  }

  /**
   * Returns the booth sort rank for one sponsor.
   *
   * @param sponsor Sponsor to rank.
   * @returns Rank derived from the sponsor type booth definition.
   */
  private boothSortRank(sponsor: Sponsor): number {
    const boothName = String(sponsor.boothName ?? '').trim();
    if (!boothName) {
      return -1;
    }

    const sponsorType = this.sponsorTypeById(sponsor.sponsorTypeId);
    const boothIndex = (sponsorType?.boothNames ?? []).findIndex(
      (configuredBoothName) => String(configuredBoothName ?? '').trim() === boothName
    );
    return boothIndex >= 0 ? boothIndex : Number.MAX_SAFE_INTEGER;
  }

  /**
   * Normalizes one sort mode.
   *
   * @param value Raw sort mode value.
   * @returns Supported sort mode.
   */
  private normalizeSortMode(value: unknown): SponsorSortMode {
    switch (value) {
      case 'REGISTRATION_DATE':
      case 'CONFIRMATION_DATE':
      case 'PAYMENT_DATE':
      case 'BOOTH':
      case 'NAME':
        return value;
      default:
        return 'NAME';
    }
  }
}
