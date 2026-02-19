import { Component, computed, input, output, signal } from '@angular/core';
import { Day } from '../../../../../model/conference.model';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslateModule } from '@ngx-translate/core';

export interface DayToDayCopyRequest {
  sourceDayId: string;
  targetDayId: string;
}

@Component({
  selector: 'app-copy-day-to-day',
  imports: [
    ButtonModule,
    FormsModule,
    SelectModule,
    TranslateModule
  ],
  templateUrl: './copy-day-to-day.html',
  styleUrl: './copy-day-to-day.scss',
})
export class CopyDayToDay {
  days = input.required<Day[]>();
  copyRequested = output<DayToDayCopyRequest>();

  sourceDay = signal<Day | undefined>(undefined);
  targetDay = signal<Day | undefined>(undefined);

  readyToCopy = computed(() =>
    !!this.sourceDay()
    && !!this.targetDay()
    && this.sourceDay()!.id !== this.targetDay()!.id
  );

  onCopy() {
    if (!this.readyToCopy()) {
      return;
    }
    this.copyRequested.emit({
      sourceDayId: this.sourceDay()!.id,
      targetDayId: this.targetDay()!.id
    });
  }
}
