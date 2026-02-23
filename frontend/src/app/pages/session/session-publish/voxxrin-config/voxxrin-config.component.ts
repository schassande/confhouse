import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { AccordionModule } from 'primeng/accordion';
import { ColorPickerModule } from 'primeng/colorpicker';
import { Conference } from '../../../../model/conference.model';
import { VoxxrinConfig, VoxxrinFloorPlan, VoxxrinThemeColors } from '../../../../model/voxxrin-config.model';
import { ConferenceService } from '../../../../services/conference.service';
import { ConferenceSecretService, VOXXRIN_SECRET_TOKEN_SECRET_NAME } from '../../../../services/conference-secret.service';
import { VoxxrinConfigService } from '../../../../services/voxxrin-config.service';

@Component({
  selector: 'app-voxxrin-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    InputTextModule,
    TextareaModule,
    CheckboxModule,
    InputNumberModule,
    ButtonModule,
    AccordionModule,
    ColorPickerModule,
  ],
  templateUrl: './voxxrin-config.component.html',
  styleUrls: ['./voxxrin-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoxxrinConfigComponent implements OnInit {
  readonly conference = input<Conference | undefined>(undefined);

  private readonly route = inject(ActivatedRoute);
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceSecretService = inject(ConferenceSecretService);
  private readonly fb = inject(FormBuilder);
  private readonly voxxrinConfigService = inject(VoxxrinConfigService);

  private persistedConfig: VoxxrinConfig | null = null;
  private persistedSecretToken = '';
  private readonly _conferenceFromRoute = signal<Conference | undefined>(undefined);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly currentForm = computed(() => this.form());
  protected readonly effectiveConference = computed(() => this.conference() ?? this._conferenceFromRoute());
  protected readonly floorPlans = signal<VoxxrinFloorPlan[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly conferenceNotFound = signal(false);

  async ngOnInit(): Promise<void> {
    const explicitConference = this.conference();
    if (explicitConference?.id) {
      await this.loadConfig(explicitConference.id);
      await this.loadSecretToken(explicitConference.id);
      this.loading.set(false);
      return;
    }

    const conferenceId = this.route.snapshot.paramMap.get('conferenceId');
    if (!conferenceId) {
      this.conferenceNotFound.set(true);
      this.floorPlans.set([]);
      this.initializeForm(this.buildForm(null));
      this.loading.set(false);
      return;
    }

    try {
      const conference = await firstValueFrom(this.conferenceService.byId(conferenceId));
      if (!conference) {
        this.conferenceNotFound.set(true);
        this.floorPlans.set([]);
        this.initializeForm(this.buildForm(null));
        this.loading.set(false);
        return;
      }
      this._conferenceFromRoute.set(conference);
      await this.loadConfig(conferenceId);
      await this.loadSecretToken(conferenceId);
    } catch (error) {
      console.error('Unable to load conference', error);
      this.conferenceNotFound.set(true);
      this.floorPlans.set([]);
      this.initializeForm(this.buildForm(null));
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    const form = this.form();
    if (!form) {
      return;
    }
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const conferenceId = this.effectiveConference()?.id;
    if (!conferenceId) {
      return;
    }

    const values = form.getRawValue();
    const existing = this.persistedConfig;
    const secretToken = String(values.connectionSecretToken ?? '').trim();

    const location = this.compactObject({
      country: String(values.locationCountry ?? '').trim(),
      city: this.clean(values.locationCity),
      address: this.clean(values.locationAddress),
      latitude: this.toOptionalNumber(values.locationLatitude),
      longitude: this.toOptionalNumber(values.locationLongitude),
    });

    const infos = this.compactObject({
      ...(existing?.infos ?? {}),
      eventDescription: this.clean(values.infosEventDescription),
      venuePicture: this.clean(values.infosVenuePicture),
      address: this.clean(values.infosAddress),
      floorPlans: this.floorPlans(),
    });

    const colors: VoxxrinThemeColors = {
      primaryHex: this.toHexColor(values.primaryHex),
      primaryContrastHex: this.toHexColor(values.primaryContrastHex),
      secondaryHex: this.toHexColor(values.secondaryHex),
      secondaryContrastHex: this.toHexColor(values.secondaryContrastHex),
      tertiaryHex: this.toHexColor(values.tertiaryHex),
      tertiaryContrastHex: this.toHexColor(values.tertiaryContrastHex),
      light: existing?.theming?.colors?.light,
      dark: existing?.theming?.colors?.dark,
    };
    const hasColorValues = this.hasValue(colors);
    const theming = hasColorValues || !!existing?.theming?.headingSrcSet?.length || !!existing?.theming?.customImportedFonts?.length
      || !!existing?.theming?.headingCustomStyles
      ? {
        ...(existing?.theming ?? {}),
        colors,
      }
      : undefined;

    const recording = this.compactObject({
      ...(existing?.features?.recording ?? {}),
      platform: this.clean(values.recordingPlatform),
      youtubeHandle: this.clean(values.recordingYoutubeHandle),
      ignoreVideosPublishedAfter: this.clean(values.recordingIgnoreAfter),
      recordedFormatIds: this.csvToArray(values.recordedFormatIds),
      notRecordedFormatIds: this.csvToArray(values.notRecordedFormatIds),
      recordedRoomIds: this.csvToArray(values.recordedRoomIds),
      notRecordedRoomIds: this.csvToArray(values.notRecordedRoomIds),
      excludeTitleWordsFromMatching: this.csvToArray(values.excludeTitleWords),
    });

    const ratings = this.compactObject({
      ...(existing?.features?.ratings ?? {}),
      scale: this.compactObject({
        ...(existing?.features?.ratings?.scale ?? {}),
        enabled: !!values.ratingsScaleEnabled,
        icon: values.ratingsScaleEnabled ? this.clean(values.ratingsScaleIcon) : undefined,
        labels: values.ratingsScaleEnabled ? this.linesToArray(values.ratingsScaleLabels) : [],
      }),
      bingo: this.compactObject({
        ...(existing?.features?.ratings?.bingo ?? {}),
        enabled: !!values.ratingsBingoEnabled,
        isPublic: values.ratingsBingoEnabled ? !!values.ratingsBingoIsPublic : undefined,
        choices: values.ratingsBingoEnabled ? this.parseBingoChoicesFromLabels(values.ratingsBingoChoices) : [],
      }),
      'free-text': this.compactObject({
        ...(existing?.features?.ratings?.['free-text'] ?? {}),
        enabled: !!values.ratingsFreeTextEnabled,
        maxLength: values.ratingsFreeTextEnabled ? this.toOptionalNumber(values.ratingsFreeTextMaxLength) : undefined,
      }),
    });

    const topRatedTalks = this.compactObject({
      ...(existing?.features?.topRatedTalks ?? {}),
      minimumNumberOfRatingsToBeConsidered: this.toOptionalNumber(values.topRatedMinRatings),
      minimumAverageScoreToBeConsidered: this.toOptionalNumber(values.topRatedMinAverage),
      numberOfDailyTopTalksConsidered: this.toOptionalNumber(values.topRatedDailyCount),
    });

    const features = this.compactObject({
      ...(existing?.features ?? {}),
      favoritesEnabled: !!values.favoritesEnabled,
      roomsDisplayed: !!values.roomsDisplayed,
      remindMeOnceVideosAreAvailableEnabled: !!values.remindMeOnceVideosAreAvailableEnabled,
      showInfosTab: !!values.showInfosTab,
      showRoomCapacityIndicator: !!values.showRoomCapacityIndicator,
      hideLanguages: this.csvToArray(values.hideLanguages),
      ratings,
      topRatedTalks,
      recording,
    });

    const payload: Partial<VoxxrinConfig> = {
      conferenceId,
      baseUrl: this.clean(values.connectionBaseUrl),
      eventId: this.clean(values.connectionEventId),
      eventFamily: this.clean(values.eventFamily),
      timezone: this.clean(values.timezone) ?? 'UTC',
      peopleDescription: this.clean(values.peopleDescription),
      websiteUrl: this.clean(values.websiteUrl),
      ticketsUrl: this.clean(values.ticketsUrl),
      headingSubTitle: this.clean(values.headingSubTitle),
      headingBackground: this.clean(values.headingBackground),
      keywords: this.csvToArray(values.keywords),
      location,
      infos,
      backgroundUrl: this.clean(values.backgroundUrl),
      theming,
      features,
    };

    // console.log('Saving Voxxrin config with payload', payload, 'and secret token', secretToken);
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.voxxrinConfigService.saveByConferenceId(conferenceId, payload));
      await firstValueFrom(
        this.conferenceSecretService.saveByConferenceAndName(
          conferenceId,
          VOXXRIN_SECRET_TOKEN_SECRET_NAME,
          secretToken
        )
      );
      // console.log('Saved Voxxrin config', saved);

      this.persistedSecretToken = secretToken;
      this.persistedConfig = saved;
      this.floorPlans.set([...(saved.infos?.floorPlans ?? [])]);
      this.initializeForm(this.buildForm(saved));
    } catch (error) {
      console.error('Unable to save Voxxrin config', error);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadConfig(conferenceId: string): Promise<void> {
    try {
      const config = await firstValueFrom(this.voxxrinConfigService.findByConferenceId(conferenceId));
      this.persistedConfig = config ?? null;
      this.floorPlans.set([...(config?.infos?.floorPlans ?? [])]);
      this.initializeForm(this.buildForm(config ?? null));
    } catch (error) {
      console.error('Unable to load Voxxrin config', error);
      this.floorPlans.set([]);
      this.initializeForm(this.buildForm(null));
    }
  }

  private async loadSecretToken(conferenceId: string): Promise<void> {
    try {
      const existingSecret = await firstValueFrom(
        this.conferenceSecretService.findByConferenceAndName(
          conferenceId,
          VOXXRIN_SECRET_TOKEN_SECRET_NAME
        )
      );
      this.persistedSecretToken = String(existingSecret?.secretValue ?? '');
      this.form()?.patchValue({ connectionSecretToken: this.persistedSecretToken }, { emitEvent: false });
    } catch (error) {
      console.error('Unable to load Voxxrin secret token', error);
    }
  }

  private buildForm(config: VoxxrinConfig | null): FormGroup {
    return this.fb.group({
      connectionBaseUrl: [config?.baseUrl ?? ''],
      connectionEventId: [config?.eventId ?? ''],
      connectionSecretToken: [this.persistedSecretToken],

      eventFamily: [config?.eventFamily ?? ''],
      timezone: [config?.timezone ?? 'UTC', [Validators.required]],
      websiteUrl: [config?.websiteUrl ?? ''],
      ticketsUrl: [config?.ticketsUrl ?? ''],
      peopleDescription: [config?.peopleDescription ?? ''],
      headingSubTitle: [config?.headingSubTitle ?? ''],
      headingBackground: [config?.headingBackground ?? ''],
      keywords: [this.arrayToCsv(config?.keywords)],

      locationCountry: [config?.location?.country ?? '', [Validators.required]],
      locationCity: [config?.location?.city ?? ''],
      locationAddress: [config?.location?.address ?? ''],
      locationLatitude: [this.toOptionalNumber(config?.location?.latitude), [Validators.min(-90), Validators.max(90)]],
      locationLongitude: [this.toOptionalNumber(config?.location?.longitude), [Validators.min(-180), Validators.max(180)]],

      infosEventDescription: [config?.infos?.eventDescription ?? ''],
      infosVenuePicture: [config?.infos?.venuePicture ?? ''],
      infosAddress: [config?.infos?.address ?? ''],
      infosFloorPlanLabel: [''],
      infosFloorPlanUrl: [''],

      backgroundUrl: [config?.backgroundUrl ?? '', [Validators.required]],
      primaryHex: [this.normalizeHexForControl(config?.theming?.colors?.primaryHex)],
      primaryContrastHex: [this.normalizeHexForControl(config?.theming?.colors?.primaryContrastHex)],
      secondaryHex: [this.normalizeHexForControl(config?.theming?.colors?.secondaryHex)],
      secondaryContrastHex: [this.normalizeHexForControl(config?.theming?.colors?.secondaryContrastHex)],
      tertiaryHex: [this.normalizeHexForControl(config?.theming?.colors?.tertiaryHex)],
      tertiaryContrastHex: [this.normalizeHexForControl(config?.theming?.colors?.tertiaryContrastHex)],

      favoritesEnabled: [config?.features?.favoritesEnabled ?? true],
      roomsDisplayed: [config?.features?.roomsDisplayed ?? true],
      remindMeOnceVideosAreAvailableEnabled: [config?.features?.remindMeOnceVideosAreAvailableEnabled ?? false],
      showInfosTab: [config?.features?.showInfosTab ?? true],
      showRoomCapacityIndicator: [config?.features?.showRoomCapacityIndicator ?? false],
      hideLanguages: [this.arrayToCsv(config?.features?.hideLanguages)],

      ratingsScaleEnabled: [config?.features?.ratings?.scale?.enabled ?? true],
      ratingsScaleIcon: [config?.features?.ratings?.scale?.icon ?? ''],
      ratingsScaleLabels: [this.arrayToLines(config?.features?.ratings?.scale?.labels)],
      ratingsBingoEnabled: [config?.features?.ratings?.bingo?.enabled ?? false],
      ratingsBingoIsPublic: [config?.features?.ratings?.bingo?.isPublic ?? false],
      ratingsBingoChoices: [this.formatBingoLabels(config?.features?.ratings?.bingo?.choices)],
      ratingsFreeTextEnabled: [config?.features?.ratings?.['free-text']?.enabled ?? false],
      ratingsFreeTextMaxLength: [config?.features?.ratings?.['free-text']?.maxLength ?? null],

      topRatedMinRatings: [config?.features?.topRatedTalks?.minimumNumberOfRatingsToBeConsidered ?? null],
      topRatedMinAverage: [config?.features?.topRatedTalks?.minimumAverageScoreToBeConsidered ?? null],
      topRatedDailyCount: [config?.features?.topRatedTalks?.numberOfDailyTopTalksConsidered ?? null],

      recordingPlatform: [config?.features?.recording?.platform ?? ''],
      recordingYoutubeHandle: [config?.features?.recording?.youtubeHandle ?? ''],
      recordingIgnoreAfter: [config?.features?.recording?.ignoreVideosPublishedAfter ?? ''],
      recordedFormatIds: [this.arrayToCsv(config?.features?.recording?.recordedFormatIds)],
      notRecordedFormatIds: [this.arrayToCsv(config?.features?.recording?.notRecordedFormatIds)],
      recordedRoomIds: [this.arrayToCsv(config?.features?.recording?.recordedRoomIds)],
      notRecordedRoomIds: [this.arrayToCsv(config?.features?.recording?.notRecordedRoomIds)],
      excludeTitleWords: [this.arrayToCsv(config?.features?.recording?.excludeTitleWordsFromMatching)],
    });
  }

  private clean(value: unknown): string | undefined {
    const text = String(value ?? '').trim();
    return text.length ? text : undefined;
  }

  private csvToArray(value: unknown): string[] {
    const text = String(value ?? '').trim();
    if (!text) {
      return [];
    }
    return text.split(',').map((entry) => entry.trim()).filter((entry) => !!entry);
  }

  private arrayToCsv(value: string[] | undefined): string {
    return (!value || !value.length) ? '' : value.join(', ');
  }

  private linesToArray(value: unknown): string[] {
    const text = String(value ?? '').trim();
    if (!text) {
      return [];
    }
    return text.split('\n').map((line) => line.trim()).filter((line) => !!line);
  }

  private arrayToLines(value: string[] | undefined): string {
    return (!value || !value.length) ? '' : value.join('\n');
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private compactObject<T extends object>(value: T): T | undefined {
    const entries = Object.entries(value).filter(([, current]) => {
      if (current === null || current === undefined) {
        return false;
      }
      if (typeof current === 'string') {
        return current.trim().length > 0;
      }
      if (Array.isArray(current)) {
        return current.length > 0;
      }
      if (typeof current === 'object') {
        return Object.keys(current).length > 0;
      }
      return true;
    });

    if (!entries.length) {
      return undefined;
    }
    return Object.fromEntries(entries) as T;
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.values(value).some((entry) => this.hasValue(entry));
    }
    return true;
  }

  private parseBingoChoicesFromLabels(value: unknown): { id: string; label: string }[] {
    const text = String(value ?? '').trim();
    if (!text) {
      return [];
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line)
      .map((label, index) => {
        const id = String(index + 1);
        return { id, label };
      })
      .filter((item) => !!item.id && !!item.label);
  }

  private formatBingoLabels(value: { id: string; label: string }[] | undefined): string {
      return (!value?.length) ? '' : value.map((item) => item.label).join('\n');
  }

  private initializeForm(form: FormGroup): void {
    this.form.set(form);
    this.bindRatingToggle('ratingsScaleEnabled', ['ratingsScaleIcon', 'ratingsScaleLabels']);
    this.bindRatingToggle('ratingsBingoEnabled', ['ratingsBingoIsPublic', 'ratingsBingoChoices']);
    this.bindRatingToggle('ratingsFreeTextEnabled', ['ratingsFreeTextMaxLength']);
  }

  private bindRatingToggle(toggleControlName: string, dependentControls: string[]): void {
    const form = this.form();
    const toggleControl = form?.get(toggleControlName);
    if (!form || !toggleControl) {
      return;
    }

    const applyState = (enabled: boolean) => {
      for (const controlName of dependentControls) {
        const control = form.get(controlName);
        if (!control) {
          continue;
        }
        if (enabled) {
          control.enable({ emitEvent: false });
        } else {
          control.disable({ emitEvent: false });
        }
      }
    };

    applyState(!!toggleControl.value);
    toggleControl.valueChanges.subscribe((enabled) => applyState(!!enabled));
  }

  protected addFloorPlan(): void {
    const form = this.form();
    if (!form) {
      return;
    }
    const label = this.clean(form.get('infosFloorPlanLabel')?.value);
    const pictureUrl = this.clean(form.get('infosFloorPlanUrl')?.value);
    if (!label || !pictureUrl) {
      return;
    }

    this.floorPlans.set([...this.floorPlans(), { label, pictureUrl }]);
    form.patchValue({ infosFloorPlanLabel: '', infosFloorPlanUrl: '' }, { emitEvent: false });
  }

  protected removeFloorPlan(index: number): void {
    const current = this.floorPlans();
    if (index < 0 || index >= current.length) {
      return;
    }
    this.floorPlans.set(current.filter((_, idx) => idx !== index));
  }

  protected floorPlanPreviewUrl(): string {
    const form = this.form();
    return String(form?.get('infosFloorPlanUrl')?.value ?? '').trim();
  }

  protected venuePicturePreviewUrl(): string {
    const form = this.form();
    return String(form?.get('infosVenuePicture')?.value ?? '').trim();
  }

  protected colorTextValue(controlName: string): string {
    const value = this.form()?.get(controlName)?.value;
    const hex = this.normalizeHexForControl(value);
    return hex ? `#${hex}` : '';
  }

  protected onColorTextInput(controlName: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    const hex = this.normalizeHexForControl(target.value);
    this.form()?.get(controlName)?.setValue(hex);
    target.value = hex ? `#${hex}` : '';
  }

  private normalizeHexForControl(value: unknown): string {
    const raw = String(value ?? '')
      .trim()
      .replace(/^#/, '')
      .replace(/[^0-9a-fA-F]/g, '')
      .slice(0, 6)
      .toUpperCase();
    return raw;
  }

  private toHexColor(value: unknown): string | undefined {
    const hex = this.normalizeHexForControl(value);
    if (hex.length !== 6) {
      return undefined;
    }
    return `#${hex}`;
  }
}
