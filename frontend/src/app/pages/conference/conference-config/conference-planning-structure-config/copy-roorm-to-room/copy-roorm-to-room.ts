import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Room, Slot } from '@shared/model/conference.model';
import { ConferenceService } from '../../../../../services/conference.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-copy-roorm-to-room',
  imports: [
    ButtonModule,
    FormsModule,
    TranslateModule,
    SelectModule
  ],
  templateUrl: './copy-roorm-to-room.html',
  styleUrl: './copy-roorm-to-room.scss',
})
export class CopyRoormToRoom {

  private readonly conferenceService = inject(ConferenceService);
  private readonly translateService = inject(TranslateService);
  slots = input.required<Slot[]>();
  rooms = input.required<Room[]>();
  newSlots = output<Slot[]>();
  
  sourceRoom = signal<Room|undefined>(undefined);
  targetRoom = signal<Room|undefined>(undefined);
  readyToCopy = computed(() => {
    return this.sourceRoom() 
      && this.targetRoom() 
      && this.sourceRoom()!.isSessionRoom == this.targetRoom()!.isSessionRoom;
  });

  onCopy() {
    if (!this.readyToCopy()) {
      return;
    }
    const sourceRoomId = this.sourceRoom()!.id;
    const targetRoomId = this.targetRoom()!.id;
    const newSlots = this.slots().filter(slot => slot.roomId === sourceRoomId
        && (!slot.overflowRoomIds 
          || slot.overflowRoomIds.length === 0 
          || slot.overflowRoomIds.findIndex(rid=> rid === targetRoomId) < 0)
        // the target room is NOT already an overflow of the source room for this slot
      ).map(slot => {
        const newSlot: Slot = { ...slot,
          id:this.conferenceService.generateSlotId(),
          roomId: targetRoomId,
          overflowRoomIds: [] // don't copy overflow
        }
        return newSlot;
    });
    this.newSlots.emit(newSlots);
  }
}


