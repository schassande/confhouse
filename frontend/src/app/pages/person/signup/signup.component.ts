

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
import { Person } from '@shared/model/person.model';
import { RedirectService } from '../../../services/redirect.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ButtonModule, CardModule, InputTextModule, MessageModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupComponent {
  readonly form: FormGroup;
  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly signupService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly redirectService = inject(RedirectService);
  private readonly translate = inject(TranslateService);

  /**
   * Builds the sign-up form and restores a safe return URL from the current route.
   */
  constructor() {
    this.form = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]]
    });

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl?.startsWith('/')) {
      this.redirectService.set(returnUrl);
    }
  }

  /**
   * Creates an email/password account or redirects the user to the verification flow.
   */
  async onSubmit() {
    this.submitted.set(true);
    this.error.set(null);
    
    if (this.form.valid) {
      this.loading.set(true);
      try {
        const formValue = this.form.value;
        
        // Validate passwords match
        if (formValue.password !== formValue.confirm) {
          this.error.set(this.translate.instant('SIGNUP.ERRORS.PASSWORD_MISMATCH'));
          this.loading.set(false);
          return;
        }

        // Create Person object
        const person: Person = {
          id: '',
          lastUpdated: Date.now().toString(),
          firstName: formValue.firstName,
          lastName: formValue.lastName,
          email: formValue.email,
          search: '',
          hasAccount: true,
          isSpeaker: false,
          preferredLanguage: 'en',
          isPlatformAdmin: false
        };

        // Call signup service
        const result = await this.signupService.signupWithEmail(person, formValue.password, this.redirectService.get());
        
        if (result.person && !result.requiresEmailVerification) {
          const returnUrl = this.redirectService.get();
          const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
          this.redirectService.clear();
          await this.router.navigateByUrl(target);
        }
      } catch (err: any) {
        this.error.set(err?.message || this.translate.instant('SIGNUP.ERRORS.GENERIC'));
        console.error(err);
      } finally {
        this.loading.set(false);
      }
    }
  }

  /**
   * Starts the Google sign-up flow and redirects to the original target when successful.
   */
  async onGoogleSignup() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.signupService.signupWithGoogle();
      if (result.person && !result.requiresEmailVerification) {
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else {
        this.error.set(this.translate.instant('SIGNUP.ERRORS.GOOGLE_FAILED'));
      }
    } catch (err: any) {
      this.error.set(err?.message || this.translate.instant('SIGNUP.ERRORS.GOOGLE_FAILED'));
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}


