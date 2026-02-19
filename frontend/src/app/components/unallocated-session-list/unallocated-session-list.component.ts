import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { DataViewModule } from 'primeng/dataview';

export interface UnallocatedSessionListItem {
  sessionId: string;
  title: string;
  speakersLabel: string;
  sessionTypeLabel: string;
  backgroundColor: string;
  textColor: string;
}

@Component({
  selector: 'app-unallocated-session-list',
  standalone: true,
  imports: [CommonModule, DataViewModule, TranslateModule],
  templateUrl: './unallocated-session-list.component.html',
  styleUrl: './unallocated-session-list.component.scss',
})
export class UnallocatedSessionListComponent {
  readonly items = input.required<UnallocatedSessionListItem[]>();
  readonly countKey = input('SESSION.ALLOCATION.COUNT');
  readonly emptyKey = input('SESSION.ALLOCATION.NO_UNALLOCATED');
  readonly draggable = input(false);

  readonly sessionSelected = output<string>();
  readonly sessionDragStarted = output<{ event: DragEvent; sessionId: string }>();
  readonly sessionDragEnded = output<void>();

  onItemClick(sessionId: string): void {
    this.sessionSelected.emit(sessionId);
  }

  onDragStart(event: DragEvent, sessionId: string): void {
    this.sessionDragStarted.emit({ event, sessionId });
  }

  onDragEnd(): void {
    this.sessionDragEnded.emit();
  }
}
