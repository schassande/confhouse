

import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { UserSignService } from '../../../services/usersign.service';
import { Person } from '../../../model/person.model';
import { RedirectService } from '../../../services/redirect.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ButtonModule],
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

  async onSubmit() {
    this.submitted.set(true);
    this.error.set(null);
    
    if (this.form.valid) {
      this.loading.set(true);
      try {
        const formValue = this.form.value;
        
        // Validate passwords match
        if (formValue.password !== formValue.confirm) {
          this.error.set('Passwords do not match');
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
        const result = await this.signupService.signupWithEmail(person, formValue.password);
        
        if (result) {
          const returnUrl = this.redirectService.get();
          const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
          this.redirectService.clear();
          await this.router.navigateByUrl(target);
        } else {
          this.error.set('Signup failed');
        }
      } catch (err: any) {
        this.error.set(err?.message || 'An error occurred during signup');
        console.error(err);
      } finally {
        this.loading.set(false);
      }
    }
  }

  async onGoogleSignup() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.signupService.signupWithGoogle();
      if (result) {
        const returnUrl = this.redirectService.get();
        const target = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
        this.redirectService.clear();
        await this.router.navigateByUrl(target);
      } else {
        this.error.set('Google signup failed');
      }
    } catch (err: any) {
      this.error.set(err?.message || 'An error occurred during Google signup');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
