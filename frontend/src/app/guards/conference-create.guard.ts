import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { map, Observable, of } from 'rxjs';
import { PlatformConfigService } from '../services/platform-config.service';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class ConferenceCreateGuard implements CanActivate {
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    const person = this.userSignService.getCurrentPerson();
    if (!person) {
      return of(this.router.parseUrl('/login'));
    }

    return this.platformConfigService.getPlatformConfig().pipe(
      map((platformConfig) => {
        if (!platformConfig.onlyPlatformAdminCanCreateConference) {
          return true;
        }
        return person.isPlatformAdmin ? true : this.router.parseUrl('/');
      })
    );
  }
}
