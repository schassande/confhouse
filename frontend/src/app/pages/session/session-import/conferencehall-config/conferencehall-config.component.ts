import { Component, input, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference } from '@shared/model/conference.model';
import { ConferenceHallConfig, SessionTypeMapping } from '@shared/model/conferencehall.model';
import { TranslateModule } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ConferenceHallConfigService } from '../../../../services/conference-hall-config.service';
import { CONFERENCE_HALL_TOKEN_SECRET_NAME, ConferenceSecretService } from '../../../../services/conference-secret.service';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';


@Component({
  selector: 'app-conferencehall-config',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InputTextModule],
  templateUrl: './conferencehall-config.component.html',
  styleUrls: ['./conferencehall-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferencehallConfigComponent implements OnInit {
  readonly conference = input.required<Conference>();

  private readonly fb = inject(FormBuilder);
  private readonly conferenceHallConfigService = inject(ConferenceHallConfigService);
  private readonly conferenceSecretService = inject(ConferenceSecretService);
  private persistedConferenceHallToken = '';
  private persistedConferenceHallConfig: ConferenceHallConfig | null = null;
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly currentForm = computed(() => this.form());

  async ngOnInit() {
    const conferenceHallConfig = await this.loadConferenceHallConfig();
    const sessionTypeFormatMapping = this.buildSessionTypeFormatMappingGroup(
      conferenceHallConfig?.sessionTypeMappings,
    );
    this.form.set(this.fb.group({
      conferenceHallName: [conferenceHallConfig?.conferenceName ?? '', [Validators.required]],
      token: ['', [Validators.required]],
      sessionTypeFormatMapping,
    }));

    this.form()!.valueChanges
      .pipe(debounceTime(400))
      .subscribe((values) => this.saveConferenceHallConfigIfChanged(values));

    this.form()!.get('token')?.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
      )
      .subscribe((value) => this.saveConferenceHallTokenIfChanged(String(value ?? '')));

    await this.loadConferenceHallToken();
  }

  private async loadConferenceHallConfig(): Promise<ConferenceHallConfig | null> {
    const conferenceId = this.conference().id;
    if (!conferenceId) {
      return null;
    }
    try {
      const config = await firstValueFrom(this.conferenceHallConfigService.findByConferenceId(conferenceId));
      this.persistedConferenceHallConfig = config ?? null;
      return config ?? null;
    } catch (error) {
      console.error('Unable to load Conference Hall config', error);
      return null;
    }
  }

  private buildSessionTypeFormatMappingGroup(existingMapping: SessionTypeMapping[] | undefined): FormGroup {
    const controls: Record<string, any> = {};
    const mapping = this.normalizeSessionTypeFormatMapping(existingMapping);
    for (const sessionType of this.conference().sessionTypes ?? []) {
      controls[sessionType.id] = [mapping[sessionType.id] ?? ''];
    }
    return this.fb.group(controls);
  }

  private normalizeSessionTypeFormatMapping(rawMapping: SessionTypeMapping[] | Record<string, unknown> | undefined): Record<string, string> {
    if (!rawMapping || typeof rawMapping !== 'object') {
      return {};
    }
    const normalized: Record<string, string> = {};
    if (Array.isArray(rawMapping)) {
      for (const item of rawMapping) {
        const sessionTypeId = String(item?.sessionTypeId ?? '').trim();
        if (!sessionTypeId) {
          continue;
        }
        normalized[sessionTypeId] = String(item?.conferenceHallFormat ?? '').trim();
      }
      return normalized;
    }
    for (const [sessionTypeId, conferenceHallFormat] of Object.entries(rawMapping)) {
      const key = String(sessionTypeId ?? '').trim();
      if (!key) {
        continue;
      }
      normalized[key] = String(conferenceHallFormat ?? '').trim();
    }
    return normalized;
  }

  private sanitizeSessionTypeFormatMapping(rawMapping: any): Record<string, string> {
    const normalized = this.normalizeSessionTypeFormatMapping(rawMapping);
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (value) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private toSessionTypeMappings(rawMapping: any): SessionTypeMapping[] {
    return Object.entries(this.sanitizeSessionTypeFormatMapping(rawMapping))
      .map(([sessionTypeId, conferenceHallFormat]) => ({
        sessionTypeId,
        conferenceHallFormat,
      }));
  }

  private saveConferenceHallConfigIfChanged(values: any): void {
    const conferenceId = this.conference().id;
    if (!conferenceId) {
      return;
    }

    const conferenceName = String(values?.conferenceHallName ?? '').trim();
    const sessionTypeMappings = this.toSessionTypeMappings(values?.sessionTypeFormatMapping);
    const currentConfig = this.persistedConferenceHallConfig;
    if (
      currentConfig
      && currentConfig.conferenceName === conferenceName
      && JSON.stringify(currentConfig.sessionTypeMappings ?? []) === JSON.stringify(sessionTypeMappings)
    ) {
      return;
    }

    this.conferenceHallConfigService
      .saveByConferenceId(conferenceId, {
        conferenceName,
        sessionTypeMappings,
      })
      .subscribe({
        next: (saved) => {
          this.persistedConferenceHallConfig = saved;
        },
        error: (error) => console.error('Unable to save Conference Hall config', error),
      });
  }

  private async loadConferenceHallToken(): Promise<void> {
    const conferenceId = this.conference().id;
    if (!conferenceId || !this.form()) {
      return;
    }
    try {
      const existingSecret = await firstValueFrom(
        this.conferenceSecretService.findByConferenceAndName(
          conferenceId,
          CONFERENCE_HALL_TOKEN_SECRET_NAME
        )
      );
      this.persistedConferenceHallToken = String(existingSecret?.secretValue ?? '');
      this.form()!.patchValue({ token: this.persistedConferenceHallToken }, { emitEvent: false });
    } catch (error) {
      console.error('Unable to load Conference Hall token secret', error);
    }
  }

  private saveConferenceHallTokenIfChanged(secretValue: string): void {
    if (secretValue === this.persistedConferenceHallToken) {
      return;
    }
    const conferenceId = this.conference().id;
    if (!conferenceId) {
      return;
    }
    this.conferenceSecretService
      .saveByConferenceAndName(conferenceId, CONFERENCE_HALL_TOKEN_SECRET_NAME, secretValue)
      .subscribe({
        next: () => {
          this.persistedConferenceHallToken = secretValue;
        },
        error: (error) => console.error('Unable to save Conference Hall token secret', error),
      });
  }
}


