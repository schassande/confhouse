import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { take } from 'rxjs';
import { Conference, SponsorType } from '../../../model/conference.model';
import { ConferenceService } from '../../../services/conference.service';

@Component({
  selector: 'app-sponsor-config',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    ToastModule,
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
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly loading = signal(true);

  readonly form = this.fb.group({
    sponsorTypes: this.fb.array<FormGroup>([]),
    sponsorBoothMaps: this.fb.array<FormControl<string>>([]),
  });

  ngOnInit(): void {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }

    this.conferenceService.byId(conferenceId).pipe(take(1)).subscribe({
      next: (conference) => {
        this.conference.set(conference);
        this.initForm(conference);
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

  get sponsorTypesArray(): FormArray<FormGroup> {
    return this.form.get('sponsorTypes') as FormArray<FormGroup>;
  }

  get sponsorBoothMapsArray(): FormArray<FormControl<string>> {
    return this.form.get('sponsorBoothMaps') as FormArray<FormControl<string>>;
  }

  addSponsorType(): void {
    this.sponsorTypesArray.push(this.createSponsorTypeGroup());
  }

  removeSponsorType(index: number): void {
    this.sponsorTypesArray.removeAt(index);
  }

  addBoothMap(): void {
    this.sponsorBoothMapsArray.push(this.fb.control('', { nonNullable: true }));
  }

  removeBoothMap(index: number): void {
    this.sponsorBoothMapsArray.removeAt(index);
  }

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
        sponsorTypes,
        sponsors: conference.sponsoring?.sponsors ?? [],
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

  private initForm(conference: Conference | undefined): void {
    this.sponsorTypesArray.clear();
    this.sponsorBoothMapsArray.clear();

    const sponsorTypes = conference?.sponsoring?.sponsorTypes ?? [];
    sponsorTypes.forEach((sponsorType) => this.sponsorTypesArray.push(this.createSponsorTypeGroup(sponsorType)));

    const boothMaps = conference?.sponsoring?.sponsorBoothMaps ?? [];
    boothMaps.forEach((boothMap) => this.sponsorBoothMapsArray.push(this.fb.control(String(boothMap ?? ''), { nonNullable: true })));
  }

  private createSponsorTypeGroup(sponsorType?: SponsorType): FormGroup {
    return this.fb.group({
      id: [String(sponsorType?.id ?? '').trim()],
      name: [String(sponsorType?.name ?? '').trim(), [Validators.required]],
      maxNumber: [Number(sponsorType?.maxNumber ?? 0)],
      color: [String(sponsorType?.color ?? '#1f77b4').trim()],
      fontColor: [String(sponsorType?.fontColor ?? '#ffffff').trim()],
      descriptionEn: [String(sponsorType?.description?.['EN'] ?? sponsorType?.description?.['en'] ?? '').trim()],
      descriptionFr: [String(sponsorType?.description?.['FR'] ?? sponsorType?.description?.['fr'] ?? '').trim()],
      boothNamesText: [Array.isArray(sponsorType?.boothNames) ? sponsorType?.boothNames.join('\n') : ''],
    });
  }

  private mapSponsorType(group: FormGroup, existing?: SponsorType): SponsorType {
    const groupValue = group.getRawValue() as {
      id?: string;
      name?: string;
      maxNumber?: number;
      color?: string;
      fontColor?: string;
      descriptionEn?: string;
      descriptionFr?: string;
      boothNamesText?: string;
    };

    const parsedMaxNumber = Number(groupValue.maxNumber ?? 0);
    const boothNames = String(groupValue.boothNamesText ?? '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const id = String(groupValue.id ?? existing?.id ?? '').trim() || this.generateSponsorTypeId();

    return {
      id,
      name: String(groupValue.name ?? '').trim(),
      maxNumber: Number.isFinite(parsedMaxNumber) ? Math.max(0, parsedMaxNumber) : 0,
      color: String(groupValue.color ?? '').trim() || '#1f77b4',
      fontColor: String(groupValue.fontColor ?? '').trim() || '#ffffff',
      description: {
        EN: String(groupValue.descriptionEn ?? '').trim(),
        FR: String(groupValue.descriptionFr ?? '').trim(),
      },
      boothNames,
    };
  }

  private generateSponsorTypeId(): string {
    return `sponsor-type-${Math.random().toString(36).slice(2, 10)}`;
  }
}
