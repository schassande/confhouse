import { ChangeDetectionStrategy, Component, computed, signal, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SignupService } from '../../services/signup.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [RouterModule, AvatarModule, ButtonModule, TooltipModule, MenuModule, TranslateModule],
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainMenuComponent {
  private readonly signupService = inject(SignupService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  person = computed(() => this.signupService.person());
  private readonly _avatarMenuItems = signal<MenuItem[]>([]);
  avatarMenuItems = computed(() => this._avatarMenuItems());

  private readonly _languageMenuItems = signal<MenuItem[]>([]);
  languageMenuItems = computed(() => this._languageMenuItems());
  private readonly _currentLang = signal(this.translate.currentLang || this.translate.getDefaultLang() || 'en');
  currentFlagPath = computed(() => (this._currentLang() === 'fr' ? 'assets/flags/fr.svg' : 'assets/flags/en.svg'));

  constructor() {
    void this.refreshMenuLabels();
    this.translate.onLangChange.subscribe(event => {
      this._currentLang.set(event.lang);
      void this.refreshMenuLabels();
    });
  }

  private async setMenuItems() {
    const labels = await firstValueFrom(this.translate.get(['MENU.PROFILE', 'MENU.LOGOUT']));
    this._avatarMenuItems.set([
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
    ]);
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

  logout() {
    this.signupService.disconnectUser();
    this.router.navigate(['/']);
  }

  private async setLanguageMenuItems() {
    const labels = await firstValueFrom(this.translate.get(['LANGUAGE.EN', 'LANGUAGE.FR']));
    this._languageMenuItems.set([
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
    ]);
  }

  private async refreshMenuLabels() {
    await Promise.all([this.setMenuItems(), this.setLanguageMenuItems()]);
  }

  private setLanguage(lang: 'en' | 'fr') {
    this.translate.use(lang);
    this._currentLang.set(lang);
  }
}
