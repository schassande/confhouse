import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { map, Observable, of, take } from 'rxjs';
import { ConferenceService } from '../services/conference.service';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class ConferenceOrganizerGuard implements CanActivate {
  private readonly conferenceService = inject(ConferenceService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const person = this.userSignService.getCurrentPerson();
    if (!person?.email) {
      return of(this.router.parseUrl('/login'));
    }

    if (person.isPlatformAdmin) {
      return of(true);
    }

    const conferenceId = route.paramMap.get('conferenceId');
    if (!conferenceId) {
      return of(this.router.parseUrl('/'));
    }

    return this.conferenceService.byId(conferenceId).pipe(
      take(1),
      map((conference) => {
        if (!conference) {
          return this.router.parseUrl('/');
        }
        return conference.organizerEmails.includes(person.email) ? true : this.router.parseUrl('/');
      })
    );
  }
}

