import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  private readonly signupService = inject(UserSignService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean | UrlTree> {
    await this.signupService.waitForAuthReady();
    const person = this.signupService.getCurrentPerson();
    if (person && person.isPlatformAdmin) return true;
    return this.router.parseUrl('/');
  }
}
