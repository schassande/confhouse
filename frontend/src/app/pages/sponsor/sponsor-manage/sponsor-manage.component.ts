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
import { BoothAllocationMode, Sponsor, SponsorPaymentStatus, SponsorStatus, SponsorType } from '@shared/model/sponsor.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { SponsorBoothAllocationService } from '../../../services/sponsor-booth-allocation.service';
import { ConferenceService } from '../../../services/conference.service';
import { SponsorService } from '../../../services/sponsor.service';

interface SelectOption {
  label: string;
  value: string;
}

type SponsorTagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
type SponsorSortMode = 'NAME' | 'REGISTRATION_DATE' | 'CONFIRMATION_DATE' | 'PAYMENT_DATE' | 'BOOTH';

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
  readonly selectedTypeId = signal<string>('ALL');
  readonly selectedSponsorStatus = signal<string>('ALL');
  readonly selectedPaymentStatus = signal<string>('ALL');
  readonly selectedSortMode = signal<SponsorSortMode>('NAME');
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
  }

  onFilterSponsorStatusChange(value: string): void {
    this.selectedSponsorStatus.set(String(value ?? 'ALL'));
  }

  onFilterPaymentStatusChange(value: string): void {
    this.selectedPaymentStatus.set(String(value ?? 'ALL'));
  }

  onSortModeChange(value: string): void {
    this.selectedSortMode.set(this.normalizeSortMode(value));
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

  sponsorStatusLabel(status: SponsorStatus): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.STATUS_${status}`);
  }

  paymentStatusLabel(status: SponsorPaymentStatus): string {
    return this.translateService.instant(`CONFERENCE.SPONSOR_MANAGE.PAYMENT_${status}`);
  }

  sponsorStatusSeverity(status: SponsorStatus): SponsorTagSeverity {
    switch (status) {
      case 'CONFIRMED':
        return 'success';
      case 'CANDIDATE':
      case 'WAITING_LIST':
        return 'warn';
      case 'REJECTED':
      case 'CANCELED':
        return 'danger';
      case 'POTENTIAL':
      default:
        return 'secondary';
    }
  }

  paymentStatusSeverity(status: SponsorPaymentStatus): SponsorTagSeverity {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'OVERDUE':
        return 'danger';
      case 'PENDING':
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
