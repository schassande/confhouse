import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { TranslateModule } from '@ngx-translate/core';
import { PlatformConfigService } from '../../../services/platform-config.service';

@Component({
  selector: 'app-platform-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CheckboxModule, TranslateModule],
  templateUrl: './platform-config.component.html',
  styleUrls: ['./platform-config.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformConfigComponent {
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isLoading = signal(true);
  readonly isLoading = computed(() => this._isLoading());

  private readonly _isSaving = signal(false);
  readonly isSaving = computed(() => this._isSaving());

  private readonly _saveStatus = signal<'idle' | 'success' | 'error'>('idle');
  readonly saveStatus = computed(() => this._saveStatus());

  onlyPlatformAdminCanCreateConference = false;

  constructor() {
    this.platformConfigService
      .getPlatformConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.onlyPlatformAdminCanCreateConference = config.onlyPlatformAdminCanCreateConference;
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

    this.platformConfigService
      .savePlatformConfig(this.onlyPlatformAdminCanCreateConference)
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
}
