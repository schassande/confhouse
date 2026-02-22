import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { DataViewModule } from 'primeng/dataview';

export interface UnallocatedSessionListItem {
  sessionId: string;
  title: string;
  speakersLabel: string;
  sessionTypeLabel: string;
  reviewAverage: number | null;
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
  readonly dropEnabled = input(false);
  readonly enableListScroll = input(true);

  readonly sessionSelected = output<string>();
  readonly sessionDragStarted = output<{ event: DragEvent; sessionId: string }>();
  readonly sessionDragEnded = output<void>();
  readonly listDropRequested = output<DragEvent>();

  isDropTarget = false;

  onItemClick(sessionId: string): void {
    this.sessionSelected.emit(sessionId);
  }

  onDragStart(event: DragEvent, sessionId: string): void {
    this.sessionDragStarted.emit({ event, sessionId });
  }

  onDragEnd(): void {
    this.sessionDragEnded.emit();
  }

  onDragOver(event: DragEvent): void {
    if (!this.dropEnabled()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragEnter(): void {
    if (!this.dropEnabled()) {
      return;
    }
    this.isDropTarget = true;
  }

  onDragLeave(): void {
    if (!this.dropEnabled()) {
      return;
    }
    this.isDropTarget = false;
  }

  onDrop(event: DragEvent): void {
    if (!this.dropEnabled()) {
      return;
    }
    event.preventDefault();
    this.isDropTarget = false;
    this.listDropRequested.emit(event);
  }
}
