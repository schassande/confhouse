import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlatformConfigService } from '../services/platform-config.service';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class ConferenceCreateGuard implements CanActivate {
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean | UrlTree> {
    await this.userSignService.waitForAuthReady();
    const person = this.userSignService.getCurrentPerson();
    if (!person) {
      return this.router.parseUrl('/login');
    }

    const platformConfig = await firstValueFrom(this.platformConfigService.getPlatformConfig());
    if (!platformConfig.onlyPlatformAdminCanCreateConference) {
      return true;
    }
    return person.isPlatformAdmin ? true : this.router.parseUrl('/');
  }
}
