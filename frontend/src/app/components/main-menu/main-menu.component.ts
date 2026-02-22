import { ChangeDetectionStrategy, Component, computed, signal, inject, effect } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserSignService } from '../../services/usersign.service';
import { firstValueFrom } from 'rxjs';
import { ConferenceManageContextService } from '../../services/conference-manage-context.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [RouterModule, AvatarModule, ButtonModule, TooltipModule, MenuModule, TranslateModule],
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainMenuComponent {
  private readonly signupService = inject(UserSignService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly conferenceManageContextService = inject(ConferenceManageContextService);

  person = computed(() => this.signupService.person());
  managedConferenceLogo = computed(() => this.conferenceManageContextService.conferenceLogo());
  managedConferenceManageRoute = computed(() => this.conferenceManageContextService.manageRoute());
  private readonly _avatarMenuItems = signal<MenuItem[]>([]);
  avatarMenuItems = computed(() => this._avatarMenuItems());
  private readonly _currentLang = signal(this.translate.currentLang || this.translate.getDefaultLang() || 'en');

  constructor() {
    void this.refreshMenuLabels();
    this.translate.onLangChange.subscribe(event => {
      this._currentLang.set(event.lang);
      void this.refreshMenuLabels();
    });
    // Rebuild avatar menu whenever person signal changes
    effect(() => {
      this.person();
      void this.setMenuItems();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        if (!this.isConferenceManagementRoute(event.urlAfterRedirects)) {
          this.conferenceManageContextService.clearContext();
        }
      });
  }

  private async setMenuItems() {
    const labels = await firstValueFrom(this.translate.get([
      'MENU.PROFILE',
      'MENU.LOGOUT',
      'LANGUAGE.EN',
      'LANGUAGE.FR',
      'MENU.ADMIN_PERSONS',
      'MENU.ADMIN_PLATFORM_CONFIG'
    ]));

    const items: MenuItem[] = [
      {
        label: labels['MENU.PROFILE'],
        icon: 'pi pi-cog',
        command: () => this.router.navigate(['/preference'])
      },
      {
        label: labels['MENU.LOGOUT'],
        icon: 'pi pi-sign-out',
        command: () => this.logout()
      }
    ];

    items.push({ separator: true });
    items.push(
      {
        label: labels['LANGUAGE.EN'],
        icon: 'assets/flags/en.svg',
        command: () => this.setLanguage('en')
      },
      {
        label: labels['LANGUAGE.FR'],
        icon: 'assets/flags/fr.svg',
        command: () => this.setLanguage('fr')
      }
    );

    const p = this.person();
    if (p && p.isPlatformAdmin) {
      items.push({ separator: true });
      items.push(
        { label: labels['MENU.ADMIN_PERSONS'], icon: 'pi pi-users', command: () => this.router.navigate(['/admin/persons']) },
        { label: labels['MENU.ADMIN_PLATFORM_CONFIG'], icon: 'pi pi-cog', command: () => this.router.navigate(['/admin/platform-config']) }
      );
    }

    this._avatarMenuItems.set(items);
  }


  async signupWithGoogleMenu() {
    try {
      await this.signupService.signupWithGoogle();
      // Redirigez ou affichez un message si besoin
    } catch (err) {
      // Gérez l'erreur (affichage, log, etc.)
      console.error(err);
    }
  }

  async logout(): Promise<boolean> {
    try {
      await this.signupService.disconnectUser();
    } catch (err) {
      console.error('Error during disconnect', err);
    }
    return this.router.navigate(['/']);
  }

  private async refreshMenuLabels() {
    await this.setMenuItems();
  }

  private setLanguage(lang: 'en' | 'fr') {
    void this.signupService.updatePreferredLanguage(lang).then(() => {
      this._currentLang.set(lang);
    }).catch((error) => {
      console.error('Error updating preferred language', error);
      void this.translate.use(lang);
      this._currentLang.set(lang);
    });
  }

  private isConferenceManagementRoute(url: string): boolean {
    const cleanUrl = String(url ?? '').split('?')[0].split('#')[0];
    const segments = cleanUrl.split('/').filter((segment) => segment.length > 0);
    if (segments.length < 3 || segments[0] !== 'conference' || !segments[1]) {
      return false;
    }

    const section = segments[2];
    if (
      section === 'manage'
      || section === 'config'
      || section === 'edit'
      || section === 'speakers'
      || section === 'allocation'
      || section === 'publish'
      || section === 'activities'
      || section === 'activity-participation'
    ) {
      return true;
    }

    if (section !== 'sessions') {
      return false;
    }

    if (segments.length === 3 || segments[3] === 'import') {
      return true;
    }

    return segments.length >= 5 && segments[4] === 'edit';
  }
}
