

import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SignupService } from '../../../services/signup.service';
import { Person } from '../../../model/person.model';

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

  private readonly signupService = inject(SignupService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]]
    });
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
          hasAccount: true,
          preferredLanguage: 'en'
        };

        // Call signup service
        const result = await this.signupService.signupWithEmail(person, formValue.password);
        
        if (result) {
          // Navigate to home or preference page
          await this.router.navigate(['/']);
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
        // Navigate to home page
        await this.router.navigate(['/']);
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
