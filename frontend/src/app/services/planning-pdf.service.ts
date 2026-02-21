import { Injectable, inject } from '@angular/core';
import { firstValueFrom, forkJoin, map, of, take, catchError } from 'rxjs';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import * as pdfMake from 'pdfmake/build/pdfmake';
import { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { TranslateService } from '@ngx-translate/core';
import { Conference, Day, Room, Track } from '../model/conference.model';
import { Session, SessionAllocation } from '../model/session.model';
import { PersonService } from './person.service';
import { SessionAllocationService } from './session-allocation.service';
import { SessionService } from './session.service';
import { SlotType } from '../model/slot-type.model';
import { SlotTypeService } from './slot-type.service';

interface ExportData {
  sessionsById: Map<string, Session>;
  allocationsByRoomAndSlot: Map<string, SessionAllocation>;
  allocationsBySlotId: Map<string, SessionAllocation>;
  slotTypeById: Map<string, SlotType>;
  speakerNameById: Map<string, string>;
}

interface AllocatedSlotView {
  slotId: string;
  startMinute: number;
  endMinute: number;
  duration: number;
  title: string;
  fillColor: string;
  session: Session | undefined;
  track: Track | undefined;
}

@Injectable({ providedIn: 'root' })
export class PlanningPdfService {
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly personService = inject(PersonService);
  private readonly slotTypeService = inject(SlotTypeService);
  private readonly translateService = inject(TranslateService);
  private readonly baseRowStepMinutes = 15;

  constructor() {
    const api = this.pdfMakeApi();
    const fontsModule = pdfFonts as unknown as {
      default?: Record<string, string>;
      vfs?: Record<string, string>;
      pdfMake?: { vfs?: Record<string, string> };
    };
    const vfs = fontsModule.default ?? fontsModule.vfs ?? fontsModule.pdfMake?.vfs ?? {};
    if (typeof api.addVirtualFileSystem === 'function') {
      api.addVirtualFileSystem(vfs);
    } else {
      api.vfs = vfs;
    }
  }

  async downloadDayPlanning(conference: Conference, day: Day): Promise<void> {
    const blob = await this.generateDayPlanningBlob(conference, day);
    this.downloadBlob(blob, this.getDayPlanningFileName(conference, day));
  }

  async generateDayPlanningBlob(conference: Conference, day: Day): Promise<Blob> {
    const enabledRooms = this.enabledRoomsForDayPlanning(conference, day);
    const data = await this.loadExportData(conference.id, day.id);
    const trackById = this.trackById(conference);
    const slotsByRoom = this.computeAllocatedSlotsByRoom(day, enabledRooms, data, trackById, true);
    const legendTracks = this.legendTracksFromRoomSlots(conference, slotsByRoom);

    const docDefinition = this.buildDayPlanningDoc(conference, day, enabledRooms, slotsByRoom, legendTracks);
    return this.createPdfBlob(docDefinition);
  }

  async downloadRoomPlanning(conference: Conference, day: Day, room: Room): Promise<void> {
    const blob = await this.generateRoomPlanningBlob(conference, day, room);
    this.downloadBlob(blob, this.getRoomPlanningFileName(conference, day, room));
  }

  async generateRoomPlanningBlob(conference: Conference, day: Day, room: Room): Promise<Blob> {
    const data = await this.loadExportData(conference.id, day.id);
    const trackById = this.trackById(conference);
    const slotsByRoom = this.computeAllocatedSlotsByRoom(day, [room], data, trackById, false);
    const roomSlots = slotsByRoom.get(room.id) ?? [];
    const legendTracks = this.legendTracksFromSlots(conference, roomSlots);

    const docDefinition = this.buildRoomDayDoc(conference, day, room, roomSlots, legendTracks, data.speakerNameById);
    return this.createPdfBlob(docDefinition);
  }

  getDayPlanningFileName(conference: Conference, day: Day): string {
    return this.fileName(conference, day);
  }

  getRoomPlanningFileName(conference: Conference, day: Day, room: Room): string {
    return this.fileName(conference, day, room);
  }

  private async loadExportData(conferenceId: string, dayId: string): Promise<ExportData> {
    const [sessions, allocations] = await Promise.all([
      firstValueFrom(this.sessionService.byConferenceId(conferenceId)),
      firstValueFrom(this.sessionAllocationService.byConferenceId(conferenceId)),
    ]);
    const slotTypes = await firstValueFrom(this.slotTypeService.all());

    const dayAllocations = allocations.filter((allocation) => allocation.dayId === dayId);
    const allocationsByRoomAndSlot = new Map<string, SessionAllocation>(
      dayAllocations.map((allocation) => [this.allocationKey(allocation.roomId, allocation.slotId), allocation])
    );
    const allocationsBySlotId = new Map<string, SessionAllocation>(
      dayAllocations.map((allocation) => [allocation.slotId, allocation])
    );
    const sessionsById = new Map<string, Session>(sessions.filter((session) => !!session.id).map((session) => [session.id, session]));
    const slotTypeById = new Map<string, SlotType>(
      slotTypes.filter((slotType) => !!slotType.id).map((slotType) => [String(slotType.id).trim(), slotType])
    );

    const sessionIds = Array.from(new Set(dayAllocations.map((allocation) => allocation.sessionId)));
    const speakerIds = Array.from(
      new Set(
        sessionIds
          .map((sessionId) => sessionsById.get(sessionId))
          .filter((session): session is Session => !!session)
          .flatMap((session) => [session.speaker1Id, session.speaker2Id, session.speaker3Id])
          .filter((speakerId): speakerId is string => !!speakerId)
      )
    );

    const speakerNameById = await this.loadSpeakerNames(speakerIds);
    return { sessionsById, allocationsByRoomAndSlot, allocationsBySlotId, slotTypeById, speakerNameById };
  }

  private async loadSpeakerNames(speakerIds: string[]): Promise<Map<string, string>> {
    if (speakerIds.length === 0) {
      return new Map();
    }

    const entries = await firstValueFrom(
      forkJoin(
        speakerIds.map((speakerId) =>
          this.personService.byId(speakerId).pipe(
            take(1),
            map((person) => [speakerId, person ? `${person.firstName} ${person.lastName}`.trim() : 'Unknown speaker'] as const),
            catchError(() => of([speakerId, 'Unknown speaker'] as const))
          )
        )
      )
    );

    return new Map(entries);
  }

  private buildDayPlanningDoc(
    conference: Conference,
    day: Day,
    rooms: Room[],
    slotsByRoom: Map<string, AllocatedSlotView[]>,
    legendTracks: Track[]
  ): TDocumentDefinitions {
    const rowStepMinutes = this.selectRowStepMinutes(day.beginTime, day.endTime, 'landscape');
    const startMinute = this.toMinutes(day.beginTime);
    const endMinute = this.toMinutes(day.endTime);
    const totalRows = Math.max(1, Math.ceil((endMinute - startMinute) / rowStepMinutes));
    const rowHeight = this.computeRowHeight(totalRows, 'landscape');
    const body = this.buildDayPlanningBody(rooms, slotsByRoom, startMinute, endMinute, rowStepMinutes, rowHeight);
    const legend = this.buildLegendContent(legendTracks);

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [16, 14, 16, 14],
      content: [
        {
          columns: [
            { width: '*', text: `${conference.name} ${conference.edition}`.trim(), style: 'header' },
            { width: 'auto', stack: legend, alignment: 'right' },
          ],
          columnGap: 8,
        },
        { text: `Planning du ${this.localizedDayLabel(day.date)}`, style: 'subHeader' },
        {
          table: {
            headerRows: 1,
            widths: [48, ...rooms.map(() => '*')],
            body,
            heights: (rowIndex: number) => (rowIndex === 0 ? rowHeight + 2 : rowHeight),
          },
          layout: this.timelineTableLayout(1, 1),
          margin: [0, 4, 0, 4],
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true },
        subHeader: { fontSize: 11, color: '#374151', margin: [0, 2, 0, 4] },
        timeCell: { fontSize: 8, color: '#334155', alignment: 'center' },
        headerCell: { alignment: 'center', margin: [0, 2, 0, 0] },
        slotTitle: { fontSize: 8, bold: true, margin: [0, 0, 0, 0], alignment: 'center' },
      },
      defaultStyle: {
        fontSize: 9,
      },
    };
  }

  private buildRoomDayDoc(
    conference: Conference,
    day: Day,
    room: Room,
    roomSlots: AllocatedSlotView[],
    legendTracks: Track[],
    speakerNameById: Map<string, string>
  ): TDocumentDefinitions {
    const rowStepMinutes = this.selectRowStepMinutes(day.beginTime, day.endTime, 'portrait');
    const startMinute = this.toMinutes(day.beginTime);
    const endMinute = this.toMinutes(day.endTime);
    const totalRows = Math.max(1, Math.ceil((endMinute - startMinute) / rowStepMinutes));
    const rowHeight = this.computeRowHeight(totalRows, 'portrait');
    const body = this.buildRoomPlanningBody(roomSlots, startMinute, endMinute, speakerNameById, room.name, rowStepMinutes, rowHeight);
    const legend = this.buildLegendContent(legendTracks);

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [16, 14, 16, 14],
      content: [
        {
          columns: [
            { width: '*', text: `${conference.name} ${conference.edition}`.trim(), style: 'header' },
            { width: 'auto', stack: legend, alignment: 'right' },
          ],
          columnGap: 8,
        },
        { text: `Planning du ${this.localizedDayLabel(day.date)} - Salle ${room.name}`, style: 'subHeader' },
        {
          table: {
            headerRows: 1,
            widths: [58, '*'],
            body,
            heights: (rowIndex: number) => (rowIndex === 0 ? rowHeight + 2 : rowHeight),
          },
          layout: this.timelineTableLayout(1, 1),
          margin: [0, 4, 0, 4],
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true },
        subHeader: { fontSize: 11, color: '#374151', margin: [0, 2, 0, 4] },
        timeCell: { fontSize: 8, color: '#334155', alignment: 'center' },
        headerCell: { alignment: 'center', margin: [0, 2, 0, 0] },
        slotTitle: { fontSize: 9, bold: true, margin: [0, 0, 0, 1], alignment: 'center' },
        slotSpeakers: { fontSize: 8, color: '#111827', alignment: 'center' },
        levelText: { fontSize: 7, color: '#334155', margin: [0, 1, 0, 0], alignment: 'center' },
      },
      defaultStyle: {
        fontSize: 9,
      },
    };
  }

  private buildDayPlanningBody(
    rooms: Room[],
    slotsByRoom: Map<string, AllocatedSlotView[]>,
    startMinute: number,
    endMinute: number,
    rowStepMinutes: number,
    rowHeight: number
  ): TableCell[][] {
    const totalRows = Math.max(1, Math.ceil((endMinute - startMinute) / rowStepMinutes));
    const slotByRoomAndRow = new Map<string, Map<number, AllocatedSlotView>>();
    rooms.forEach((room) => {
      const byRow = new Map<number, AllocatedSlotView>();
      (slotsByRoom.get(room.id) ?? []).forEach((slot) => {
        const rowIndex = this.minuteToRowIndex(slot.startMinute, startMinute, totalRows, rowStepMinutes);
        const existing = byRow.get(rowIndex);
        if (!existing || slot.startMinute < existing.startMinute) {
          byRow.set(rowIndex, slot);
        }
      });
      slotByRoomAndRow.set(room.id, byRow);
    });

    const body: TableCell[][] = [];
    const roomHeaderCells: TableCell[] = rooms.map((room): TableCell => ({
      text: room.name,
      bold: true,
      fillColor: '#F1F5F9',
      style: 'headerCell',
      margin: [0, this.verticalTextOffset(rowHeight + 2, 10), 0, 0],
    }));
    const headerRow: TableCell[] = [
      { text: 'Heure', bold: true, fillColor: '#F1F5F9', style: 'headerCell', margin: [0, this.verticalTextOffset(rowHeight + 2, 10), 0, 0] },
      ...roomHeaderCells,
    ];
    body.push(headerRow);

    const roomSkipCounts = new Map<string, number>();
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
      const row: TableCell[] = [];
      const minute = startMinute + rowIndex * rowStepMinutes;
      const label = minute % 60 === 0 ? this.formatMinute(minute) : '';
      row.push({ text: label, style: 'timeCell', margin: [0, this.verticalTextOffset(rowHeight, 8), 0, 0] });

      rooms.forEach((room) => {
        const remaining = roomSkipCounts.get(room.id) ?? 0;
        if (remaining > 0) {
          row.push({});
          roomSkipCounts.set(room.id, remaining - 1);
          return;
        }

        const slot = slotByRoomAndRow.get(room.id)?.get(rowIndex);
        if (!slot) {
          row.push({ text: '' });
          return;
        }

        const rowSpan = this.computeRowSpan(slot.duration, totalRows, rowIndex, rowStepMinutes);
        roomSkipCounts.set(room.id, rowSpan - 1);
        const fillColor = slot.fillColor;
        row.push({
          text: slot.title,
          rowSpan,
          fillColor: slot.fillColor,
          color: this.textColorFor(fillColor),
          alignment: 'center',
          margin: [0, this.verticalTextOffset(rowSpan * rowHeight, 8), 0, 0],
          border: [true, true, true, true],
          borderColor: ['#9CA3AF', '#9CA3AF', '#9CA3AF', '#9CA3AF'],
          style: 'slotTitle',
        });
      });

      body.push(row);
    }

    return body;
  }

  private buildRoomPlanningBody(
    roomSlots: AllocatedSlotView[],
    startMinute: number,
    endMinute: number,
    speakerNameById: Map<string, string>,
    roomName: string,
    rowStepMinutes: number,
    rowHeight: number
  ): TableCell[][] {
    const totalRows = Math.max(1, Math.ceil((endMinute - startMinute) / rowStepMinutes));
    const byRow = new Map<number, AllocatedSlotView>();
    roomSlots.forEach((slot) => {
      const rowIndex = this.minuteToRowIndex(slot.startMinute, startMinute, totalRows, rowStepMinutes);
      const existing = byRow.get(rowIndex);
      if (!existing || slot.startMinute < existing.startMinute) {
        byRow.set(rowIndex, slot);
      }
    });
    const body: TableCell[][] = [
      [
        { text: 'Heure', bold: true, fillColor: '#F1F5F9', style: 'headerCell', margin: [0, this.verticalTextOffset(rowHeight + 2, 10), 0, 0] },
        { text: roomName, bold: true, fillColor: '#F1F5F9', style: 'headerCell', margin: [0, this.verticalTextOffset(rowHeight + 2, 10), 0, 0] },
      ],
    ];

    let skip = 0;
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
      const row: TableCell[] = [];
      const minute = startMinute + rowIndex * rowStepMinutes;
      const label = minute % 60 === 0 ? this.formatMinute(minute) : '';
      row.push({ text: label, style: 'timeCell', margin: [0, this.verticalTextOffset(rowHeight, 8), 0, 0] });

      if (skip > 0) {
        row.push({});
        skip -= 1;
        body.push(row);
        continue;
      }

      const slot = byRow.get(rowIndex);
      if (!slot) {
        row.push({ text: '' });
        body.push(row);
        continue;
      }

      const session = slot.session;
      if (!session) {
        row.push({ text: '' });
        body.push(row);
        continue;
      }
      const speakers = this.sessionSpeakers(session, speakerNameById);
      const level = String(session.conference?.level ?? '').trim();
      const fillColor = slot.fillColor;
      const rowSpan = this.computeRowSpan(slot.duration, totalRows, rowIndex, rowStepMinutes);
      skip = rowSpan - 1;

      row.push({
        rowSpan,
        fillColor,
        color: this.textColorFor(fillColor),
        margin: [2, this.verticalTextOffset(rowSpan * rowHeight, 20), 2, 0],
        alignment: 'center',
        border: [true, true, true, true],
        borderColor: ['#9CA3AF', '#9CA3AF', '#9CA3AF', '#9CA3AF'],
        stack: [
          { text: session.title, style: 'slotTitle' },
          { text: speakers, style: 'slotSpeakers' },
          {
            text: level,
            style: 'levelText',
          },
        ],
      });
      body.push(row);
    }

    return body;
  }

  private buildLegendContent(legendTracks: Track[]): Content[] {
    if (legendTracks.length === 0) {
      return [];
    }

    const row: TableCell[] = legendTracks.map((track) => {
      const background = track.color ?? '#E2E8F0';
      return {
        text: track.name,
        bold: true,
        color: this.textColorFor(background),
        fillColor: background,
        margin: [6, 3, 6, 3],
      };
    });

    return [{
      table: {
        widths: legendTracks.map(() => 'auto'),
        body: [row],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 0],
    }];
  }

  private timelineTableLayout(paddingTop = 0, paddingBottom = 0) {
    return {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => '#CBD5E1',
      vLineColor: () => '#CBD5E1',
      paddingLeft: () => 1,
      paddingRight: () => 1,
      paddingTop: () => paddingTop,
      paddingBottom: () => paddingBottom,
    };
  }

  private enabledRooms(conference: Conference, day: Day): Room[] {
    const disabled = new Set(day.disabledRoomIds ?? []);
    return conference.rooms.filter((room) => room.isSessionRoom && !disabled.has(room.id));
  }

  private enabledRoomsForDayPlanning(conference: Conference, day: Day): Room[] {
    const disabled = new Set(day.disabledRoomIds ?? []);
    return conference.rooms.filter((room) => !disabled.has(room.id));
  }

  private computeAllocatedSlotsByRoom(
    day: Day,
    rooms: Room[],
    data: ExportData,
    trackById: Map<string, Track>,
    includeNonSessionSlots: boolean
  ): Map<string, AllocatedSlotView[]> {
    const roomIds = new Set(rooms.map((room) => room.id));
    const result = new Map<string, AllocatedSlotView[]>();
    rooms.forEach((room) => result.set(room.id, []));

    day.slots
      .filter((slot) => roomIds.has(slot.roomId))
      .forEach((slot) => {
        const allocation = data.allocationsByRoomAndSlot.get(this.allocationKey(slot.roomId, slot.id))
          ?? data.allocationsBySlotId.get(slot.id);
        const slotType = data.slotTypeById.get(String(slot.slotTypeId ?? '').trim());
        const isSessionSlot = !!slotType?.isSession;

        if (!isSessionSlot && includeNonSessionSlots) {
          const nonSessionTitle = this.slotTypeLabel(slotType, slot.slotTypeId);
          result.get(slot.roomId)?.push({
            slotId: slot.id,
            startMinute: this.toMinutes(slot.startTime),
            endMinute: this.toMinutes(slot.endTime),
            duration: slot.duration,
            title: nonSessionTitle,
            fillColor: slotType?.color ?? '#E2E8F0',
            session: undefined,
            track: undefined,
          });
          return;
        }

        if (!allocation || !isSessionSlot) {
          return;
        }
        const session = data.sessionsById.get(allocation.sessionId);
        if (!session) {
          return;
        }
        const trackId = String(session.conference?.trackId ?? '').trim().toLowerCase();
        const track = trackById.get(trackId);
        const fillColor = track?.color ?? '#E2E8F0';
        result.get(slot.roomId)?.push({
          slotId: slot.id,
          startMinute: this.toMinutes(slot.startTime),
          endMinute: this.toMinutes(slot.endTime),
          duration: slot.duration,
          title: session.title,
          fillColor,
          session,
          track,
        });
      });

    result.forEach((slots, roomId) => {
      slots.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
      result.set(roomId, slots);
    });

    return result;
  }

  private slotTypeLabel(slotType: SlotType | undefined, fallbackId: string): string {
    if (!slotType) {
      return fallbackId;
    }
    return slotType.name?.['FR']
      ?? slotType.name?.['EN']
      ?? Object.values(slotType.name ?? {}).find((value) => !!value)
      ?? fallbackId;
  }

  private trackById(conference: Conference): Map<string, Track> {
    return new Map(
      (conference.tracks ?? []).map((track) => [String(track.id ?? '').trim().toLowerCase(), track])
    );
  }

  private legendTracksFromRoomSlots(conference: Conference, slotsByRoom: Map<string, AllocatedSlotView[]>): Track[] {
    const orderedTracks = conference.tracks ?? [];
    const usedTrackIds = new Set<string>();
    slotsByRoom.forEach((slots) => {
      slots.forEach((slot) => {
        if (slot.track) {
          usedTrackIds.add(String(slot.track.id).trim().toLowerCase());
        }
      });
    });
    const used = orderedTracks.filter((track) => usedTrackIds.has(String(track.id).trim().toLowerCase()));
    return used.length > 0 ? used : orderedTracks;
  }

  private legendTracksFromSlots(conference: Conference, slots: AllocatedSlotView[]): Track[] {
    const orderedTracks = conference.tracks ?? [];
    const usedTrackIds = new Set(
      slots
        .map((slot) => String(slot.track?.id ?? '').trim().toLowerCase())
        .filter((id) => !!id)
    );
    const used = orderedTracks.filter((track) => usedTrackIds.has(String(track.id).trim().toLowerCase()));
    return used.length > 0 ? used : orderedTracks;
  }

  private sessionSpeakers(session: Session, speakerNameById: Map<string, string>): string {
    const names = [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .filter((id): id is string => !!id)
      .map((id) => speakerNameById.get(id) ?? 'Unknown speaker')
      .filter((name, index, values) => values.indexOf(name) === index);
    return names.join(', ');
  }

  private computeRowSpan(duration: number, totalRows: number, rowIndex: number, rowStepMinutes: number): number {
    const requestedRows = Math.max(1, Math.ceil(duration / rowStepMinutes));
    const remainingRows = Math.max(1, totalRows - rowIndex);
    return Math.min(requestedRows, remainingRows);
  }

  private minuteToRowIndex(minute: number, startMinute: number, totalRows: number, rowStepMinutes: number): number {
    const raw = Math.floor((minute - startMinute) / rowStepMinutes);
    return Math.max(0, Math.min(totalRows - 1, raw));
  }

  private selectRowStepMinutes(startTime: string, endTime: string, orientation: 'landscape' | 'portrait'): number {
    const duration = Math.max(1, this.toMinutes(endTime) - this.toMinutes(startTime));
    const targets = orientation === 'landscape' ? 22 : 28;
    const candidates = [5, 10, this.baseRowStepMinutes, 20, 30, 45, 60];
    for (const step of candidates) {
      if (Math.ceil(duration / step) <= targets) {
        return step;
      }
    }
    return 60;
  }

  private computeRowHeight(totalRows: number, orientation: 'landscape' | 'portrait'): number {
    const availableHeight = orientation === 'landscape' ? 445 : 670;
    const h = Math.floor(availableHeight / Math.max(2, totalRows + 1));
    return Math.max(8, Math.min(34, h));
  }

  private localizedDayLabel(dateIso: string): string {
    const date = new Date(`${dateIso}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return dateIso;
    }
    const locale = this.translateService.currentLang
      || this.translateService.getDefaultLang()
      || ((typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US');
    const dayNameRaw = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    const dayName = dayNameRaw.length > 0
      ? `${dayNameRaw.charAt(0).toUpperCase()}${dayNameRaw.slice(1)}`
      : dayNameRaw;
    return `${dayName} ${dateIso}`;
  }

  private verticalTextOffset(cellHeight: number, fontSize: number): number {
    return Math.max(0, Math.floor((cellHeight - fontSize) / 2) - 1);
  }

  private allocationKey(roomId: string, slotId: string): string {
    return `${roomId}::${slotId}`;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = String(time ?? '').split(':').map((value) => Number(value));
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  }

  private formatMinute(totalMinutes: number): string {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private textColorFor(backgroundColor: string): string {
    const normalized = String(backgroundColor ?? '').trim();
    const shortHexMatch = normalized.match(/^#([0-9a-fA-F]{3})$/);
    const fullHexMatch = normalized.match(/^#([0-9a-fA-F]{6})$/);

    let r = 226;
    let g = 232;
    let b = 240;

    if (shortHexMatch) {
      const hex = shortHexMatch[1];
      r = parseInt(`${hex[0]}${hex[0]}`, 16);
      g = parseInt(`${hex[1]}${hex[1]}`, 16);
      b = parseInt(`${hex[2]}${hex[2]}`, 16);
    } else if (fullHexMatch) {
      const hex = fullHexMatch[1];
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
  }

  private fileName(conference: Conference, day: Day, room?: Room): string {
    const conferenceName = this.sanitizeForFileName(conference.name);
    const edition = this.sanitizeForFileName(String(conference.edition ?? ''));
    const dayValue = this.sanitizeForFileName(day.date);
    const roomValue = room ? `_${this.sanitizeForFileName(room.name)}` : '';
    return `${conferenceName}_${edition}_${dayValue}${roomValue}.pdf`;
  }

  private sanitizeForFileName(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private pdfMakeApi(): {
    createPdf: (def: TDocumentDefinitions) => { download: (fileName?: string) => void };
    vfs?: Record<string, string>;
    addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  } {
    const moduleAny = pdfMake as unknown as {
      default?: unknown;
      pdfMake?: unknown;
      createPdf?: unknown;
    };
    const api = (moduleAny.default ?? moduleAny.pdfMake ?? moduleAny) as {
      createPdf?: unknown;
      vfs?: Record<string, string>;
      addVirtualFileSystem?: (vfs: Record<string, string>) => void;
    };
    if (typeof api.createPdf !== 'function') {
      throw new Error('PDF engine initialization error: createPdf is unavailable.');
    }
    return api as {
      createPdf: (def: TDocumentDefinitions) => { download: (fileName?: string) => void };
      vfs?: Record<string, string>;
      addVirtualFileSystem?: (vfs: Record<string, string>) => void;
    };
  }

  private createPdfBlob(def: TDocumentDefinitions): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const pdf = this.pdfMakeApi().createPdf(def) as {
          getBlob?: ((cb: (blob: Blob) => void) => void) | (() => Promise<Blob>);
        };
        if (!pdf.getBlob) {
          reject(new Error('PDF blob API unavailable.'));
          return;
        }
        const maybePromise = (pdf.getBlob as ((cb: (blob: Blob) => void) => unknown))(resolve);
        if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
          (maybePromise as Promise<Blob>).then(resolve).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
