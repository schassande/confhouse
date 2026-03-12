import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { UserSignService } from '../../../services/usersign.service';

@Component({
  selector: 'app-email-not-verified',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonModule, CardModule, MessageModule],
  templateUrl: './email-not-verified.component.html',
  styleUrls: ['./email-not-verified.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmailNotVerifiedComponent {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly email = signal<string | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userSignService = inject(UserSignService);
  private readonly translate = inject(TranslateService);

  /**
   * Initializes the screen with the email carried by the verification flow.
   */
  constructor() {
    const email = this.route.snapshot.queryParamMap.get('email') || this.userSignService.getPendingVerificationEmail();
    this.email.set(email);
  }

  /**
   * Requests a new Firebase verification email using the pending verification context.
   */
  async resendVerificationEmail(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      await this.userSignService.resendEmailVerification();
      this.success.set(this.translate.instant('AUTH.EMAIL_NOT_VERIFIED.RESEND_SUCCESS'));
    } catch (error: any) {
      this.error.set(error?.message || this.translate.instant('AUTH.EMAIL_NOT_VERIFIED.RESEND_ERROR'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Returns the user to the login page.
   */
  navigateToLogin(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || this.userSignService.getPendingVerificationContinueUrl();
    void this.router.navigate(['/login'], {
      queryParams: returnUrl?.startsWith('/') && returnUrl !== '/login' ? { returnUrl } : undefined
    });
  }
}
