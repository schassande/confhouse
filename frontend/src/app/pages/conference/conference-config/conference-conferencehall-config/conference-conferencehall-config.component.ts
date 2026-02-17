import { Component, input, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, ExternalSystemConfig } from '../../../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { CONFERENCE_HALL_TOKEN_SECRET_NAME, ConferenceSecretService } from '../../../../services/conference-secret.service';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';


@Component({
  selector: 'app-conference-conferencehall-config',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InputTextModule],
  template: `
    <div class="conferencehall-config">
      @if (currentForm(); as form) {
      <form [formGroup]="form" class="config-form">
        <div class="form-section">
          <label for="conferenceHallName" class="form-label">
            {{ 'CONFERENCE.CONFIG.CONFERENCEHALL.CONFERENCE_NAME' | translate }}
          </label>
          <input
            id="conferenceHallName"
            pInputText
            formControlName="conferenceHallName"
            type="text"
            class="w-full"
          />
          @if (form.get('conferenceHallName')?.invalid && form.get('conferenceHallName')?.touched) {
          <small class="error-message">
            {{ 'VALIDATION.REQUIRED' | translate }}
          </small>
          }
        </div>

        <div class="form-section">
          <label for="token" class="form-label">
            {{ 'CONFERENCE.CONFIG.CONFERENCEHALL.TOKEN' | translate }}
          </label>
          <input
            id="token"
            pInputText
            formControlName="token"
            type="text"
            autocomplete="off"
            class="w-full"
          />
          @if (form.get('token')?.invalid && form.get('token')?.touched) {
          <small class="error-message">
            {{ 'VALIDATION.REQUIRED' | translate }}
          </small>
          }
        </div>

        <div class="form-section format-mapping-section">
          <label class="form-label">
            Mapping formats
          </label>
          <div class="mapping-table-container">
            @if (conference().sessionTypes.length) {
            <div class="mapping-table" formGroupName="sessionTypeFormatMapping">
              <div class="mapping-header">Type de session</div>
              <div class="mapping-header">Format Conference Hall</div>
              @for (sessionType of conference().sessionTypes; track sessionType.id) {
              <div class="mapping-cell mapping-session-type">{{ sessionType.name }}</div>
              <div class="mapping-cell">
                <input
                  pInputText
                  [formControlName]="sessionType.id"
                  type="text"
                  class="w-full"
                  [placeholder]="'Ex: Quickie, Deep Dive...'"
                />
              </div>
              }
            </div>
            } @else {
            <small>Aucun type de session configure.</small>
            }
          </div>
        </div>
      </form>
      }
    </div>
  `,
  styleUrls: ['./conference-conferencehall-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceConferencehallConfigComponent implements OnInit {
  readonly conference = input.required<Conference>();

  private readonly fb = inject(FormBuilder);
  private readonly conferenceSecretService = inject(ConferenceSecretService);
  private persistedConferenceHallToken = '';
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly currentForm = computed(() => this.form());

  async ngOnInit() {
    const conferenceHallConfig = this.getConferenceHallConfig();
    const sessionTypeFormatMapping = this.buildSessionTypeFormatMappingGroup(
      conferenceHallConfig?.parameters?.sessionTypeFormatMapping,
    );
    this.form.set(this.fb.group({
      conferenceHallName: [conferenceHallConfig?.parameters?.conferenceName ?? '', [Validators.required]],
      token: ['', [Validators.required]],
      sessionTypeFormatMapping,
    }));

    this.form()!.valueChanges.subscribe((values) => {
      const config = this.getOrCreateConferenceHallConfig();
      config.parameters = {
        ...(config.parameters ?? {}),
        conferenceName: values.conferenceHallName ?? '',
        sessionTypeFormatMapping: this.sanitizeSessionTypeFormatMapping(values.sessionTypeFormatMapping),
      };
    });

    this.form()!.get('token')?.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
      )
      .subscribe((value) => this.saveConferenceHallTokenIfChanged(String(value ?? '')));

    await this.loadConferenceHallToken();
  }

  private getConferenceHallConfig(): ExternalSystemConfig | undefined {
    return (this.conference().externalSystemConfigs ?? []).find(
      (config) => config.systemName === 'CONFERENCE_HALL' && config.env === 'PROD',
    );
  }

  private getOrCreateConferenceHallConfig(): ExternalSystemConfig {
    const conference = this.conference();
    if (!conference.externalSystemConfigs) {
      conference.externalSystemConfigs = [];
    }

    const existingConfig = this.getConferenceHallConfig();
    if (existingConfig) {
      return existingConfig;
    }

    const newConfig: ExternalSystemConfig = {
      id: 'conference-hall-prod',
      systemName: 'CONFERENCE_HALL',
      env: 'PROD',
      url: '',
      parameters: {},
      lastCommunication: '',
    };

    conference.externalSystemConfigs.push(newConfig);
    return newConfig;
  }

  private buildSessionTypeFormatMappingGroup(existingMapping: any): FormGroup {
    const controls: Record<string, any> = {};
    const mapping = this.normalizeSessionTypeFormatMapping(existingMapping);
    for (const sessionType of this.conference().sessionTypes ?? []) {
      controls[sessionType.id] = [mapping[sessionType.id] ?? ''];
    }
    return this.fb.group(controls);
  }

  private normalizeSessionTypeFormatMapping(rawMapping: any): Record<string, string> {
    if (!rawMapping || typeof rawMapping !== 'object') {
      return {};
    }
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawMapping)) {
      if (!key) {
        continue;
      }
      normalized[key] = String(value ?? '').trim();
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
