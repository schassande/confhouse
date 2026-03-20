import { Component, Input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { SessionStatus } from '@shared/model/session.model';
import {
  getSessionStatusSeverity,
  getSessionStatusTranslationKey,
  SessionStatusTagSeverity,
} from '@shared/model/session-status.utils';

@Component({
  selector: 'app-session-status-badge',
  imports: [TagModule, TranslateModule],
  templateUrl: './session-status-badge.component.html',
})
export class SessionStatusBadgeComponent {
  @Input() status?: SessionStatus | string | null;

  get labelKey(): string {
    return getSessionStatusTranslationKey(this.status ?? undefined);
  }

  get severity(): SessionStatusTagSeverity {
    return getSessionStatusSeverity(this.status ?? undefined);
  }
}


