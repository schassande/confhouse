import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { UserSignService } from '../../../services/usersign.service';
import { RedirectService } from '../../../services/redirect.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ButtonModule, CardModule, InputTextModule, MessageModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  readonly form: FormGroup;
  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  private readonly usersignService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly redirectService = inject(RedirectService);
  private readonly translate = inject(TranslateService);

  /**
   * Builds the login form and restores route context from query parameters.
   */
  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl?.startsWith('/')) {
      this.redirectService.set(returnUrl);
    }

    if (this.route.snapshot.queryParamMap.get('emailVerified') === '1') {
      this.success.set(this.translate.instant('LOGIN.EMAIL_VERIFIED'));
    }
  }

  /**
   * Authenticates the user with email/password and redirects to the stored target.
   */
  async onSubmit() {
    this.submitted.set(true);
    this.error.set(null);
    this.success.set(null);
    
    if (this.form.valid) {
      this.loading.set(true);
      try {
        const formValue = this.form.value;
        
        // Call signup service login method
        const result = await this.usersignService.loginWithEmail(formValue.email, formValue.password, this.redirectService.get());
        
        if (result.person && !result.requiresEmailVerification) {
          // Navigate to stored returnUrl if present and safe, otherwise to home
          const returnUrl = this.redirectService.get();
          const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
          this.redirectService.clear();
          await this.router.navigateByUrl(target);
        } else if (!result.requiresEmailVerification) {
          this.error.set(this.translate.instant('LOGIN.ERRORS.USER_NOT_FOUND'));
        }
      } catch (err: any) {
        this.error.set(err?.message || this.translate.instant('LOGIN.ERRORS.GENERIC'));
        console.error(err);
      } finally {
        this.loading.set(false);
      }
    }
  }

  /**
   * Authenticates the user with Google and redirects to the stored target.
   */
  async onGoogleLogin() {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const result = await this.usersignService.loginWithGoogle();
      if (result.person && !result.requiresEmailVerification) {
        // Navigate to stored returnUrl if present and safe, otherwise to home
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else if (!result.requiresEmailVerification) {
        this.error.set(this.translate.instant('LOGIN.ERRORS.USER_NOT_FOUND'));
      }
    } catch (err: any) {
      this.error.set(err?.message || this.translate.instant('LOGIN.ERRORS.GENERIC'));
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Authenticates the user with GitHub and redirects to the stored target.
   */
  async onGithubLogin() {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const result = await this.usersignService.loginWithGithub();
      if (result.person && !result.requiresEmailVerification) {
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else if (!result.requiresEmailVerification) {
        this.error.set(this.translate.instant('LOGIN.ERRORS.USER_NOT_FOUND'));
      }
    } catch (err: any) {
      this.error.set(err?.message || this.translate.instant('LOGIN.ERRORS.GENERIC'));
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Opens the sign-up page while preserving the current safe return URL.
   */
  navigateToSignup() {
    const returnUrl = this.redirectService.get();
    void this.router.navigate(['/signup'], {
      queryParams: returnUrl && returnUrl.startsWith('/') ? { returnUrl } : undefined
    });
  }

  /**
   * Sends a Firebase password reset email for the current form email.
   */
  async onResetPassword() {
    this.error.set(null);
    this.success.set(null);
    const email = this.form.get('email')?.value;
    if (!email) {
      this.error.set(this.translate.instant('LOGIN.ERRORS.RESET_EMAIL_REQUIRED'));
      return;
    }
    try {
      await this.usersignService.sendPasswordReset(email);
      this.success.set(this.translate.instant('LOGIN.RESET_SENT'));
    } catch (err: any) {
      this.error.set(err?.message || this.translate.instant('LOGIN.ERRORS.RESET_FAILED'));
      console.error(err);
    }
  }
}
