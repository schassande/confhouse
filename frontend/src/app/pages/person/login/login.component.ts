import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { UserSignService } from '../../../services/usersign.service';
import { RedirectService } from '../../../services/redirect.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ButtonModule],
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

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl?.startsWith('/')) {
      this.redirectService.set(returnUrl);
    }
  }

  async onSubmit() {
    this.submitted.set(true);
    this.error.set(null);
    this.success.set(null);
    
    if (this.form.valid) {
      this.loading.set(true);
      try {
        const formValue = this.form.value;
        
        // Call signup service login method
          const result = await this.usersignService.loginWithEmail(formValue.email, formValue.password);
        
        if (result) {
          // Navigate to stored returnUrl if present and safe, otherwise to home
          const returnUrl = this.redirectService.get();
          const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
          this.redirectService.clear();
          await this.router.navigateByUrl(target);
        } else {
          this.error.set('User not found in database');
        }
      } catch (err: any) {
        this.error.set(err?.message || 'An error occurred during login');
        console.error(err);
      } finally {
        this.loading.set(false);
      }
    }
  }

  async onGoogleLogin() {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const result = await this.usersignService.loginWithGoogle();
      if (result) {
        // Navigate to stored returnUrl if present and safe, otherwise to home
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else {
        this.error.set('User not found in database');
      }
    } catch (err: any) {
      this.error.set(err?.message || 'An error occurred during Google login');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async onGithubLogin() {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const result = await this.usersignService.loginWithGithub();
      if (result) {
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else {
        this.error.set('User not found in database');
      }
    } catch (err: any) {
      this.error.set(err?.message || 'An error occurred during GitHub login');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  navigateToSignup() {
    const returnUrl = this.redirectService.get();
    void this.router.navigate(['/signup'], {
      queryParams: returnUrl && returnUrl.startsWith('/') ? { returnUrl } : undefined
    });
  }

  async onResetPassword() {
    this.error.set(null);
    this.success.set(null);
    const email = this.form.get('email')?.value;
    if (!email) {
      this.error.set('Please enter your email to reset password');
      return;
    }
    try {
      await this.usersignService.sendPasswordReset(email);
      this.success.set('Password reset email sent. Check your inbox.');
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to send password reset email');
      console.error(err);
    }
  }
}
