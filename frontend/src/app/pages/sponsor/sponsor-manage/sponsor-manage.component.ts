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
import { ToastModule } from 'primeng/toast';
import { forkJoin, take } from 'rxjs';
import { BilletwebConfig } from '@shared/model/billetweb-config';
import { Conference } from '@shared/model/conference.model';
import { Sponsor, SponsorPaymentStatus, SponsorStatus, SponsorType } from '@shared/model/sponsor.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { ConferenceService } from '../../../services/conference.service';
import { SponsorService } from '../../../services/sponsor.service';

interface SelectOption {
  label: string;
  value: string;
}

type SponsorManageNotice = 'saved' | 'deleted';

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
  readonly selectedTypeId = signal<string>('ALL');
  readonly typeFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_ALL'), value: 'ALL' },
    ...this.sponsorTypes().map((type) => ({ label: type.name, value: type.id })),
  ]);
  readonly filteredSponsors = computed(() => {
    const selectedType = this.selectedTypeId();
    return [...this.sponsors()]
      .filter((sponsor) => selectedType === 'ALL' || sponsor.sponsorTypeId === selectedType)
      .sort((a, b) => {
        const leftDate = String(a.registrationDate ?? '').trim();
        const rightDate = String(b.registrationDate ?? '').trim();
        const dateCompare = leftDate.localeCompare(rightDate);
        return dateCompare !== 0 ? dateCompare : String(a.name ?? '').localeCompare(String(b.name ?? ''));
      });
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

  onAddNew(): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'sponsors', 'manage', 'create']);
  }

  onEdit(sponsor: Sponsor): void {
    void this.router.navigate(['/conference', this.conferenceId(), 'sponsors', 'manage', sponsor.id]);
  }

  onSponsorClick(sponsor: Sponsor): void {
    this.onEdit(sponsor);
  }

  sponsorTypeById(sponsorTypeId: string): SponsorType | undefined {
    return this.sponsorTypes().find((type) => type.id === sponsorTypeId);
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
}
