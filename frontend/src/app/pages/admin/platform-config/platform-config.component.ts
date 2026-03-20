import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { TranslateModule } from '@ngx-translate/core';
import { PlatformConfigService } from '../../../services/platform-config.service';
import { SlotTypeService } from '../../../services/slot-type.service';
import { ConferenceService } from '../../../services/conference.service';
import { Conference } from '@shared/model/conference.model';

interface ConferenceOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-platform-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CheckboxModule, SelectModule, TranslateModule],
  templateUrl: './platform-config.component.html',
  styleUrls: ['./platform-config.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformConfigComponent {
  private readonly slotTypeService = inject(SlotTypeService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isLoading = signal(true);
  readonly isLoading = computed(() => this._isLoading());

  private readonly _isSaving = signal(false);
  readonly isSaving = computed(() => this._isSaving());

  private readonly _saveStatus = signal<'idle' | 'success' | 'error'>('idle');
  readonly saveStatus = computed(() => this._saveStatus());

  private readonly _conferenceOptions = signal<ConferenceOption[]>([]);
  readonly conferenceOptions = computed(() => this._conferenceOptions());

  onlyPlatformAdminCanCreateConference = false;
  singleConferenceId = '';
  readonly canSave = computed(() => {
    if (this.isSaving()) {
      return false;
    }
    if (!this.onlyPlatformAdminCanCreateConference) {
      return true;
    }
    return !!String(this.singleConferenceId ?? '').trim();
  });

  constructor() {
    // Ensure slot types are initialized
    this.slotTypeService.init().subscribe();

    this.conferenceService
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conferences) => this._conferenceOptions.set(this.toConferenceOptions(conferences ?? [])));

    this.platformConfigService
      .getPlatformConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.onlyPlatformAdminCanCreateConference = config.onlyPlatformAdminCanCreateConference;
          this.singleConferenceId = String(config.singleConferenceId ?? '').trim();
          this._isLoading.set(false);
        },
        error: () => {
          this._isLoading.set(false);
          this._saveStatus.set('error');
        },
      });
  }

  save(): void {
    this._isSaving.set(true);
    this._saveStatus.set('idle');

    const singleConferenceId = this.onlyPlatformAdminCanCreateConference
      ? String(this.singleConferenceId ?? '').trim()
      : '';

    this.platformConfigService
      .savePlatformConfig(this.onlyPlatformAdminCanCreateConference, singleConferenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._isSaving.set(false);
          this._saveStatus.set('success');
        },
        error: () => {
          this._isSaving.set(false);
          this._saveStatus.set('error');
        },
      });
  }

  onOnlyPlatformAdminCanCreateConferenceChange(enabled: boolean): void {
    if (!enabled) {
      this.singleConferenceId = '';
    }
  }

  private toConferenceOptions(conferences: Conference[]): ConferenceOption[] {
    return [...conferences]
      .sort((a, b) => this.conferenceLabel(a).localeCompare(this.conferenceLabel(b)))
      .map((conference) => ({
        label: this.conferenceLabel(conference),
        value: String(conference.id ?? ''),
      }));
  }

  private conferenceLabel(conference: Conference): string {
    const name = String(conference.name ?? '').trim();
    const edition = String(conference.edition ?? '').trim();
    if (name && edition) {
      return `${name} ${edition}`;
    }
    return name || edition || String(conference.id ?? '');
  }
}


