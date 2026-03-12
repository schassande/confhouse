import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { applyActionCode, reload } from 'firebase/auth';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { UserSignService } from '../../../services/usersign.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonModule, CardModule, MessageModule, ProgressSpinnerModule],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyEmailComponent {
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly userSignService = inject(UserSignService);
  private readonly translate = inject(TranslateService);

  /**
   * Starts the Firebase email verification flow from the action code found in the URL.
   */
  constructor() {
    void this.processVerification();
  }

  /**
   * Applies the Firebase email verification action code carried by the route.
   */
  async processVerification(): Promise<void> {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    const oobCode = this.route.snapshot.queryParamMap.get('oobCode');

    if (mode !== 'verifyEmail' || !oobCode) {
      this.error.set(this.translate.instant('AUTH.VERIFY_EMAIL.INVALID_LINK'));
      this.loading.set(false);
      return;
    }

    try {
      await applyActionCode(this.auth, oobCode);
      if (this.auth.currentUser) {
        await reload(this.auth.currentUser);
      }
      this.userSignService.clearPendingEmailVerification();
      this.success.set(this.translate.instant('AUTH.VERIFY_EMAIL.SUCCESS'));
    } catch (error) {
      this.error.set(this.translate.instant('AUTH.VERIFY_EMAIL.ERROR'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Sends the user to the login page after a verification attempt.
   */
  navigateToLogin(): void {
    const continueUrl = this.extractSafeContinueUrl(this.route.snapshot.queryParamMap.get('continueUrl'));
    const queryParams: Record<string, string> = { emailVerified: '1' };
    if (continueUrl !== '/login') {
      queryParams['returnUrl'] = continueUrl;
    }

    void this.router.navigate(['/login'], { queryParams });
  }

  /**
   * Converts Firebase continue URLs into a safe in-app route.
   * @param continueUrl Raw continue URL from Firebase action parameters.
   * @returns Safe local route.
   */
  private extractSafeContinueUrl(continueUrl: string | null): string {
    if (!continueUrl) {
      return '/login';
    }

    if (continueUrl.startsWith('/')) {
      return continueUrl.startsWith('/verify-email') || continueUrl.startsWith('/email-not-verified')
        ? '/login'
        : continueUrl;
    }

    try {
      const parsed = new URL(continueUrl);
      if (parsed.origin !== window.location.origin) {
        return '/login';
      }

      const safePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return safePath.startsWith('/verify-email') || safePath.startsWith('/email-not-verified')
        ? '/login'
        : safePath;
    } catch (error) {
      return '/login';
    }
  }
}
