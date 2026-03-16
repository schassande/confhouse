import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConferenceService } from '../services/conference.service';
import { ConferenceOrganizerService } from '../services/conference-organizer.service';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class ConferenceOrganizerGuard implements CanActivate {
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceOrganizerService = inject(ConferenceOrganizerService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    await this.userSignService.waitForAuthReady();
    const person = this.userSignService.getCurrentPerson();
    if (!person?.email) {
      return this.router.parseUrl('/login');
    }

    if (person.isPlatformAdmin) {
      return true;
    }

    const conferenceId = route.paramMap.get('conferenceId');
    if (!conferenceId) {
      return this.router.parseUrl('/');
    }

    const conference = await firstValueFrom(this.conferenceService.byId(conferenceId));
    if (!conference) {
      return this.router.parseUrl('/');
    }
    return this.conferenceOrganizerService.isConferenceOrganizer(conference, person.email)
      ? true
      : this.router.parseUrl('/');
  }
}
