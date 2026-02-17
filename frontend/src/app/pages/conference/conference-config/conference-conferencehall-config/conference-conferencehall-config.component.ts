import { Component, input, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference, ExternalSystemConfig } from '../../../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

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
            class="w-full"
          />
          @if (form.get('token')?.invalid && form.get('token')?.touched) {
          <small class="error-message">
            {{ 'VALIDATION.REQUIRED' | translate }}
          </small>
          }
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
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly currentForm = computed(() => this.form());

  ngOnInit() {
    const conferenceHallConfig = this.getConferenceHallConfig();
    this.form.set(this.fb.group({
      conferenceHallName: [conferenceHallConfig?.parameters?.conferenceName ?? '', [Validators.required]],
      token: [conferenceHallConfig?.token ?? '', [Validators.required]],
    }));

    this.form()!.valueChanges.subscribe((values) => {
      const config = this.getOrCreateConferenceHallConfig();
      config.parameters = {
        ...(config.parameters ?? {}),
        conferenceName: values.conferenceHallName ?? '',
      };
      config.token = values.token ?? '';
    });
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
      token: '',
      parameters: {},
      lastCommunication: '',
    };

    conference.externalSystemConfigs.push(newConfig);
    return newConfig;
  }
}
