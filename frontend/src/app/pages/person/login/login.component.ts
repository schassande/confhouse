import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SignupService } from '../../../services/signup.service';

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

  private readonly signupService = inject(SignupService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onSubmit() {
    this.submitted.set(true);
    this.error.set(null);
    
    if (this.form.valid) {
      this.loading.set(true);
      try {
        const formValue = this.form.value;
        
        // Call signup service login method
        const result = await this.signupService.loginWithEmail(formValue.email, formValue.password);
        
        if (result) {
          // Navigate to home
          await this.router.navigate(['/']);
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
    try {
      const result = await this.signupService.loginWithGoogle();
      if (result) {
        // Navigate to home page
        await this.router.navigate(['/']);
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

  navigateToSignup() {
    this.router.navigate(['/signup']);
  }
}
