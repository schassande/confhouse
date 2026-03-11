import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UserSignService } from '../services/usersign.service';
import { RedirectService } from '../services/redirect.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly redirectService = inject(RedirectService);

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const person = this.userSignService.getCurrentPerson();
    if (person) return true;

    if (state?.url) {
      this.redirectService.set(state.url);
      return this.router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }

    return this.router.parseUrl('/login');
  }
}
