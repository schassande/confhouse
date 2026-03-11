import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of, switchMap, take } from 'rxjs';
import { ConferenceService } from '../services/conference.service';
import { ConferenceManageContextService } from '../services/conference-manage-context.service';
import { ConferenceOrganizerService } from '../services/conference-organizer.service';
import { PlatformConfigService } from '../services/platform-config.service';
import { UserSignService } from '../services/usersign.service';

@Injectable({ providedIn: 'root' })
export class ConferenceManageContextGuard implements CanActivate {
  private readonly conferenceService = inject(ConferenceService);
  private readonly conferenceManageContextService = inject(ConferenceManageContextService);
  private readonly conferenceOrganizerService = inject(ConferenceOrganizerService);
  private readonly platformConfigService = inject(PlatformConfigService);
  private readonly userSignService = inject(UserSignService);
  private readonly router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    // console.log('ConferenceManageContextGuard#canActivate BEGIN');
    const conferenceId = route.paramMap.get('conferenceId');
    if (!conferenceId) {
      // console.log('ConferenceManageContextGuard#canActivate no conferenceId in route');
      this.conferenceManageContextService.clearContext();
      return of(true);
    }
    return this.platformConfigService.getPlatformConfig().pipe(
      take(1),
      switchMap((platformConfig) => {
        const singleConferenceId = String(platformConfig.singleConferenceId ?? '').trim();
        if (
          platformConfig.onlyPlatformAdminCanCreateConference
          && singleConferenceId
          && conferenceId !== singleConferenceId
        ) {
          // console.log('ConferenceManageContextGuard#canActivate conferenceId != singleConferenceId');
          this.conferenceManageContextService.clearContext();
          return of(this.router.parseUrl(`/conference/${singleConferenceId}`));
        }

        return this.conferenceService.byId(conferenceId).pipe(
          take(1),
          map((conference) => {
            if (!conference) {
              // console.log('ConferenceManageContextGuard#canActivate conference not found for id', conferenceId);
              this.conferenceManageContextService.clearContext();
              return true;
            }
            const isOrganizer = this.conferenceOrganizerService.isConferenceOrganizer(
              conference,
              this.userSignService.person()?.email
            );
            
            // console.log('ConferenceManageContextGuard#canActivate conference found for id', conferenceId, conference);
            this.conferenceManageContextService.setContext(
              conferenceId, 
              conference.logo ?? '', 
              conference.name + ' ' + conference.edition,
              isOrganizer);
            return true;
          }),
          catchError((err) => {
            //console.log('ConferenceManageContextGuard#canActivate error', conferenceId, err);
            this.conferenceManageContextService.clearContext();
            return of(true);
          })
        );
      })
    );
  }
}
