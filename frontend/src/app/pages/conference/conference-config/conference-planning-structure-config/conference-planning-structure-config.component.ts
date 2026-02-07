import { Component, input, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conference } from '../../../../model/conference.model';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-conference-planning-structure-config',
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="planning-structure-config">
      <p>{{ 'CONFERENCE.CONFIG.PLANNING_STRUCTURE.TITLE' | translate }} - {{ conference().name }}</p>
    </div>
  `,
  styleUrls: ['./conference-planning-structure-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferencePlanningStructureConfigComponent {
  readonly conference = input.required<Conference>();
  /*
  days = computed(() => this.conference().planning || []);
  day = signal(this.days()[0]);
  
  addSlot() {
  }
  previousDay() {
    const currentIndex = this.days().indexOf(this.day()); 
    if (currentIndex > 0) {
      this.day.set(this.days()[currentIndex - 1]);
    } else {
      this.day.set(this.days()[this.days().length - 1]);
    }
  }
  nextDay() {
    const currentIndex = this.days().indexOf(this.day());
    if (currentIndex < this.days().length - 1) {
      this.day.set(this.days()[currentIndex + 1]);
    } else {
      this.day.set(this.days()[0]);
    }
  }
    */
}
