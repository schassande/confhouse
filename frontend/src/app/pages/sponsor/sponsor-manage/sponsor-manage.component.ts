import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { take } from 'rxjs';
import { Conference, Sponsor, SponsorType } from '../../../model/conference.model';
import { ConferenceService } from '../../../services/conference.service';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-sponsor-manage',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    DataViewModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    SelectModule,
  ],
  providers: [MessageService],
  templateUrl: './sponsor-manage.component.html',
  styleUrl: './sponsor-manage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorManageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly conferenceService = inject(ConferenceService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly loading = signal(true);

  readonly sponsors = signal<Sponsor[]>([]);
  readonly sponsorTypes = signal<SponsorType[]>([]);
  readonly selectedTypeId = signal<string>('ALL');

  readonly form = signal<FormGroup | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly dialogVisible = signal(false);
  readonly isEditing = computed(() => this.editingId() !== null);
  readonly currentEditingSponsor = computed(() => {
    const editId = this.editingId();
    if (!editId) {
      return undefined;
    }
    return this.sponsors().find((sponsor) => sponsor.id === editId);
  });

  readonly typeFilterOptions = computed<SelectOption[]>(() => [
    { label: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.FILTER_ALL'), value: 'ALL' },
    ...this.sponsorTypes().map((type) => ({ label: type.name, value: type.id })),
  ]);

  readonly sponsorTypeOptions = computed<SelectOption[]>(() =>
    this.sponsorTypes().map((type) => ({ label: type.name, value: type.id }))
  );

  readonly filteredSponsors = computed(() => {
    const selectedType = this.selectedTypeId();
    return [...this.sponsors()]
      .filter((sponsor) => selectedType === 'ALL' || sponsor.type?.id === selectedType)
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  });

  readonly filteredCountLabel = computed(() =>
    this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.COUNT', {
      filtered: this.filteredSponsors().length,
      total: this.sponsors().length,
    })
  );

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
      next: (conference) => {
        this.conference.set(conference);
        this.sponsorTypes.set(conference?.sponsoring?.sponsorTypes ?? []);
        this.sponsors.set(conference?.sponsoring?.sponsors ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading conference:', error);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onFilterTypeChange(value: string): void {
    this.selectedTypeId.set(String(value ?? 'ALL'));
  }

  onAddNew(): void {
    this.editingId.set(null);
    this.form.set(this.createForm());
    this.dialogVisible.set(true);
  }

  onEdit(sponsor: Sponsor): void {
    this.editingId.set(sponsor.id);
    this.form.set(this.createForm(sponsor));
    this.dialogVisible.set(true);
  }

  onSponsorClick(sponsor: Sponsor): void {
    this.onEdit(sponsor);
  }

  onCancel(): void {
    this.dialogVisible.set(false);
    this.form.set(null);
    this.editingId.set(null);
  }

  onDialogHide(): void {
    this.onCancel();
  }

  onDelete(sponsor: Sponsor): void {
    if (!confirm(this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.CONFIRM_DELETE'))) {
      return;
    }

    const updatedSponsors = this.sponsors().filter((item) => item.id !== sponsor.id);
    this.saveSponsors(updatedSponsors, this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.DELETED'));
  }

  onSave(): void {
    const form = this.form();
    if (!form || form.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.CONFIG.FORM_ERRORS'),
      });
      return;
    }

    const sponsorTypeId = String(form.value.typeId ?? '').trim();
    const sponsorType = this.sponsorTypes().find((type) => type.id === sponsorTypeId);
    if (!sponsorType) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('COMMON.ERROR'),
        detail: this.translateService.instant('CONFERENCE.SPONSOR_MANAGE.MISSING_TYPE'),
      });
      return;
    }

    const payload: Sponsor = {
      id: this.editingId() ?? `sponsor_${Date.now()}`,
      name: String(form.value.name ?? '').trim(),
      logo: String(form.value.logo ?? '').trim(),
      website: String(form.value.website ?? '').trim(),
      boothName: String(form.value.boothName ?? '').trim(),
      type: sponsorType,
      description: {
        EN: String(form.value.descriptionEn ?? '').trim(),
        FR: String(form.value.descriptionFr ?? '').trim(),
      },
      emails: this.parseEmails(form.value.emailsText),
    };

    const updatedSponsors = this.editingId()
      ? this.sponsors().map((item) => (item.id === payload.id ? payload : item))
      : [...this.sponsors(), payload];

    this.saveSponsors(updatedSponsors, this.translateService.instant('CONFERENCE.CONFIG.SAVED'));
  }

  typeBadgeStyle(type: SponsorType | undefined): Record<string, string> {
    return {
      background: String(type?.color ?? '#334155'),
      color: String(type?.fontColor ?? '#ffffff'),
    };
  }

  private createForm(sponsor?: Sponsor): FormGroup {
    return this.fb.group({
      name: [String(sponsor?.name ?? '').trim(), [Validators.required, Validators.minLength(2)]],
      typeId: [String(sponsor?.type?.id ?? '').trim(), [Validators.required]],
      logo: [String(sponsor?.logo ?? '').trim()],
      website: [String(sponsor?.website ?? '').trim()],
      boothName: [String(sponsor?.boothName ?? '').trim()],
      descriptionEn: [String(sponsor?.description?.['EN'] ?? sponsor?.description?.['en'] ?? '').trim()],
      descriptionFr: [String(sponsor?.description?.['FR'] ?? sponsor?.description?.['fr'] ?? '').trim()],
      emailsText: [Array.isArray(sponsor?.emails) ? sponsor?.emails.join('\n') : ''],
    });
  }

  private parseEmails(raw: string | undefined): string[] {
    return String(raw ?? '')
      .split(/\r?\n|,|;/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private saveSponsors(updatedSponsors: Sponsor[], successDetail: string): void {
    const conference = this.conference();
    if (!conference) {
      return;
    }

    const updatedConference: Conference = {
      ...conference,
      sponsoring: {
        sponsorTypes: conference.sponsoring?.sponsorTypes ?? [],
        sponsors: updatedSponsors,
        sponsorBoothMaps: conference.sponsoring?.sponsorBoothMaps ?? [],
      },
    };

    this.conferenceService.save(updatedConference).subscribe({
      next: (savedConference) => {
        this.conference.set(savedConference);
        this.sponsorTypes.set(savedConference.sponsoring?.sponsorTypes ?? []);
        this.sponsors.set(savedConference.sponsoring?.sponsors ?? []);
        this.onCancel();
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('COMMON.SUCCESS'),
          detail: successDetail,
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error saving sponsors:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('COMMON.ERROR'),
          detail: this.translateService.instant('CONFERENCE.CONFIG.UPDATE_ERROR'),
        });
      },
    });
  }
}
