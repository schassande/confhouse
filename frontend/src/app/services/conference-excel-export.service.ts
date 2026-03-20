import { Injectable, inject } from '@angular/core';
import { firstValueFrom, catchError, of } from 'rxjs';
import type { Workbook, Worksheet } from 'exceljs';
import { Conference, Day, Slot } from '@shared/model/conference.model';
import { Session, SessionAllocation } from '@shared/model/session.model';
import { Person } from '@shared/model/person.model';
import { Activity, ActivityParticipation } from '@shared/model/activity.model';
import { SlotType } from '@shared/model/slot-type.model';
import { SessionService } from './session.service';
import { SessionAllocationService } from './session-allocation.service';
import { SlotTypeService } from './slot-type.service';
import { PersonService } from './person.service';
import { ActivityService } from './activity.service';
import { ActivityParticipationService } from './activity-participation.service';

interface ActivityExportData {
  activity: Activity;
  participations: ActivityParticipation[];
}

@Injectable({ providedIn: 'root' })
export class ConferenceExcelExportService {
  private readonly sessionService = inject(SessionService);
  private readonly sessionAllocationService = inject(SessionAllocationService);
  private readonly slotTypeService = inject(SlotTypeService);
  private readonly personService = inject(PersonService);
  private readonly activityService = inject(ActivityService);
  private readonly activityParticipationService = inject(ActivityParticipationService);

  async downloadConferenceWorkbook(conference: Conference): Promise<void> {
    const workbook = await this.buildConferenceWorkbook(conference);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    this.downloadBlob(blob, this.buildFileName(conference));
  }

  private async buildConferenceWorkbook(conference: Conference): Promise<Workbook> {
    const { Workbook } = await import('exceljs');
    const [sessions, allocations, slotTypes, speakers, activities] = await Promise.all([
      firstValueFrom(this.sessionService.byConferenceId(conference.id)),
      firstValueFrom(this.sessionAllocationService.byConferenceId(conference.id)),
      firstValueFrom(this.slotTypeService.all()),
      firstValueFrom(this.personService.bySubmittedConferenceId(conference.id)),
      firstValueFrom(this.activityService.byConferenceId(conference.id)),
    ]);

    const activitiesData = await this.loadActivityExportData(conference.id, activities);
    const personById = await this.loadPersonMap(speakers, sessions, activitiesData);

    const workbook = new Workbook();
    workbook.creator = 'cfp-manager';
    workbook.created = new Date();
    workbook.modified = new Date();

    this.addGeneralSheet(workbook, conference);
    this.addSessionTypesSheet(workbook, conference);
    this.addRoomsSheet(workbook, conference);
    this.addTracksSheet(workbook, conference);
    this.addSessionsSheet(workbook, conference, sessions, personById);
    this.addSpeakersSheet(workbook, speakers);
    this.addPlanningSheet(workbook, conference, sessions, allocations, slotTypes, activities, personById);
    this.addActivitySheets(workbook, activitiesData, personById);

    return workbook;
  }

  private async loadActivityExportData(conferenceId: string, activities: Activity[]): Promise<ActivityExportData[]> {
    return Promise.all(
      (activities ?? []).map(async (activity) => ({
        activity,
        participations: await firstValueFrom(this.activityParticipationService.byActivityId(conferenceId, activity.id)),
      }))
    );
  }

  private async loadPersonMap(
    speakers: Person[],
    sessions: Session[],
    activitiesData: ActivityExportData[]
  ): Promise<Map<string, Person>> {
    const personById = new Map<string, Person>(
      (speakers ?? [])
        .filter((person) => !!String(person.id ?? '').trim())
        .map((person) => [String(person.id ?? '').trim(), person])
    );

    const personIdsToLoad = new Set<string>();
    (sessions ?? []).forEach((session) => {
      [session.speaker1Id, session.speaker2Id, session.speaker3Id]
        .map((speakerId) => String(speakerId ?? '').trim())
        .filter((speakerId) => !!speakerId && !personById.has(speakerId))
        .forEach((speakerId) => personIdsToLoad.add(speakerId));
    });
    (activitiesData ?? []).forEach((activityData) => {
      (activityData.participations ?? [])
        .map((participation) => String(participation.personId ?? '').trim())
        .filter((personId) => !!personId && !personById.has(personId))
        .forEach((personId) => personIdsToLoad.add(personId));
    });

    if (personIdsToLoad.size === 0) {
      return personById;
    }

    const loadedPeople = await Promise.all(
      Array.from(personIdsToLoad).map((personId) =>
        firstValueFrom(
          this.personService.byId(personId).pipe(catchError(() => of(undefined)))
        )
      )
    );
    loadedPeople.forEach((person) => {
      const personId = String(person?.id ?? '').trim();
      if (personId) {
        personById.set(personId, person as Person);
      }
    });

    return personById;
  }

  private addGeneralSheet(workbook: Workbook, conference: Conference): void {
    const sheet = workbook.addWorksheet('general');
    sheet.columns = [
      { header: 'field', key: 'field', width: 38 },
      { header: 'value', key: 'value', width: 88 },
    ];
    this.styleHeader(sheet);

    const add = (field: string, value: unknown) => sheet.addRow({ field, value: this.stringifyValue(value) });
    add('conference.id', conference.id);
    add('conference.name', conference.name);
    add('conference.edition', conference.edition);
    add('conference.location', conference.location);
    add('conference.visible', conference.visible);
    add('conference.logo', conference.logo);
    add('conference.languages', conference.languages ?? []);
    add('conference.organizerEmails', conference.organizerEmails ?? []);
    add('conference.organizerEmailDomain', conference.organizerEmailDomain ?? '');
    add('conference.lastUpdated', conference.lastUpdated);
    add('conference.description', conference.description ?? {});
    add('conference.cfp.startDate', conference.cfp?.startDate ?? '');
    add('conference.cfp.endDate', conference.cfp?.endDate ?? '');
    add('conference.cfp.status', conference.cfp?.status ?? '');
    add('conference.sponsoring', conference.sponsoring ?? {});
    add('conference.dayCount', (conference.days ?? []).length);
    add('conference.roomCount', (conference.rooms ?? []).length);
    add('conference.trackCount', (conference.tracks ?? []).length);
    add('conference.sessionTypeCount', (conference.sessionTypes ?? []).length);
  }

  private addSessionTypesSheet(workbook: Workbook, conference: Conference): void {
    const sheet = workbook.addWorksheet('session-types');
    sheet.columns = [
      { header: 'id', key: 'id', width: 22 },
      { header: 'name', key: 'name', width: 32 },
      { header: 'durationMin', key: 'durationMin', width: 14 },
      { header: 'maxSpeakers', key: 'maxSpeakers', width: 14 },
      { header: 'visible', key: 'visible', width: 12 },
      { header: 'color', key: 'color', width: 14 },
      { header: 'icon', key: 'icon', width: 16 },
      { header: 'description', key: 'description', width: 48 },
    ];
    this.styleHeader(sheet);

    [...(conference.sessionTypes ?? [])]
      .sort((a, b) => this.compareText(a.name, b.name))
      .forEach((sessionType) => {
        sheet.addRow({
          id: sessionType.id,
          name: sessionType.name,
          durationMin: sessionType.duration,
          maxSpeakers: sessionType.maxSpeakers,
          visible: sessionType.visible,
          color: sessionType.color,
          icon: sessionType.icon,
          description: this.localizableText(sessionType.description),
        });
      });
  }

  private addRoomsSheet(workbook: Workbook, conference: Conference): void {
    const sheet = workbook.addWorksheet('rooms');
    sheet.columns = [
      { header: 'id', key: 'id', width: 20 },
      { header: 'name', key: 'name', width: 24 },
      { header: 'capacity', key: 'capacity', width: 12 },
      { header: 'isSessionRoom', key: 'isSessionRoom', width: 14 },
      { header: 'plan', key: 'plan', width: 40 },
    ];
    this.styleHeader(sheet);

    [...(conference.rooms ?? [])]
      .sort((a, b) => this.compareText(a.name, b.name))
      .forEach((room) => {
        sheet.addRow({
          id: room.id,
          name: room.name,
          capacity: room.capacity,
          isSessionRoom: room.isSessionRoom,
          plan: room.plan,
        });
      });
  }

  private addTracksSheet(workbook: Workbook, conference: Conference): void {
    const sheet = workbook.addWorksheet('tracks');
    sheet.columns = [
      { header: 'id', key: 'id', width: 22 },
      { header: 'name', key: 'name', width: 28 },
      { header: 'color', key: 'color', width: 14 },
      { header: 'icon', key: 'icon', width: 16 },
      { header: 'description', key: 'description', width: 48 },
    ];
    this.styleHeader(sheet);

    [...(conference.tracks ?? [])]
      .sort((a, b) => this.compareText(a.name, b.name))
      .forEach((track) => {
        sheet.addRow({
          id: track.id,
          name: track.name,
          color: track.color,
          icon: track.icon,
          description: this.localizableText(track.description),
        });
      });
  }

  private addSessionsSheet(
    workbook: Workbook,
    conference: Conference,
    sessions: Session[],
    personById: Map<string, Person>
  ): void {
    const trackById = new Map((conference.tracks ?? []).map((track) => [track.id, track]));
    const sessionTypeById = new Map((conference.sessionTypes ?? []).map((sessionType) => [sessionType.id, sessionType]));
    const sheet = workbook.addWorksheet('sessions');
    sheet.columns = [
      { header: 'id', key: 'id', width: 30 },
      { header: 'title', key: 'title', width: 46 },
      { header: 'status', key: 'status', width: 18 },
      { header: 'submitDate', key: 'submitDate', width: 14 },
      { header: 'lastChangeDate', key: 'lastChangeDate', width: 14 },
      { header: 'sessionTypeId', key: 'sessionTypeId', width: 22 },
      { header: 'sessionType', key: 'sessionType', width: 24 },
      { header: 'trackId', key: 'trackId', width: 20 },
      { header: 'track', key: 'track', width: 24 },
      { header: 'level', key: 'level', width: 14 },
      { header: 'langs', key: 'langs', width: 18 },
      { header: 'speaker1', key: 'speaker1', width: 28 },
      { header: 'speaker2', key: 'speaker2', width: 28 },
      { header: 'speaker3', key: 'speaker3', width: 28 },
      { header: 'speakerIds', key: 'speakerIds', width: 42 },
      { header: 'reviewAverage', key: 'reviewAverage', width: 14 },
      { header: 'reviewVotes', key: 'reviewVotes', width: 12 },
      { header: 'conferenceHallId', key: 'conferenceHallId', width: 22 },
      { header: 'abstract', key: 'abstract', width: 60 },
      { header: 'references', key: 'references', width: 48 },
    ];
    this.styleHeader(sheet);

    [...(sessions ?? [])]
      .sort((a, b) => this.compareText(a.title, b.title))
      .forEach((session) => {
        const track = trackById.get(String(session.conference?.trackId ?? '').trim());
        const sessionType = sessionTypeById.get(String(session.conference?.sessionTypeId ?? '').trim());
        const speakerIds = this.sessionSpeakerIds(session);
        const speakers = speakerIds.map((speakerId) => this.personDisplay(personById.get(speakerId), speakerId));
        sheet.addRow({
          id: session.id,
          title: session.title,
          status: session.conference?.status ?? '',
          submitDate: session.conference?.submitDate ?? '',
          lastChangeDate: session.lastChangeDate ?? '',
          sessionTypeId: session.conference?.sessionTypeId ?? '',
          sessionType: sessionType?.name ?? session.sessionType ?? '',
          trackId: session.conference?.trackId ?? '',
          track: track?.name ?? '',
          level: session.conference?.level ?? '',
          langs: (session.conference?.langs ?? []).join(', '),
          speaker1: speakers[0] ?? '',
          speaker2: speakers[1] ?? '',
          speaker3: speakers[2] ?? '',
          speakerIds: speakerIds.join(', '),
          reviewAverage: session.conference?.review?.average ?? '',
          reviewVotes: session.conference?.review?.votes ?? '',
          conferenceHallId: session.conference?.conferenceHallId ?? '',
          abstract: session.abstract ?? '',
          references: session.references ?? '',
        });
      });
  }

  private addSpeakersSheet(workbook: Workbook, speakers: Person[]): void {
    const sheet = workbook.addWorksheet('speakers');
    sheet.columns = [
      { header: 'id', key: 'id', width: 28 },
      { header: 'firstName', key: 'firstName', width: 18 },
      { header: 'lastName', key: 'lastName', width: 18 },
      { header: 'email', key: 'email', width: 32 },
      { header: 'hasAccount', key: 'hasAccount', width: 12 },
      { header: 'preferredLanguage', key: 'preferredLanguage', width: 16 },
      { header: 'company', key: 'company', width: 24 },
      { header: 'reference', key: 'reference', width: 20 },
      { header: 'conferenceHallId', key: 'conferenceHallId', width: 20 },
      { header: 'submittedConferenceIds', key: 'submittedConferenceIds', width: 38 },
      { header: 'socialLinks', key: 'socialLinks', width: 48 },
      { header: 'bio', key: 'bio', width: 56 },
    ];
    this.styleHeader(sheet);

    [...(speakers ?? [])]
      .sort((a, b) =>
        this.compareText(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`)
      )
      .forEach((speaker) => {
        sheet.addRow({
          id: speaker.id,
          firstName: speaker.firstName,
          lastName: speaker.lastName,
          email: speaker.email,
          hasAccount: speaker.hasAccount,
          preferredLanguage: speaker.preferredLanguage,
          company: speaker.speaker?.company ?? '',
          reference: speaker.speaker?.reference ?? '',
          conferenceHallId: speaker.speaker?.conferenceHallId ?? '',
          submittedConferenceIds: (speaker.speaker?.submittedConferenceIds ?? []).join(', '),
          socialLinks: this.stringifyValue(speaker.speaker?.socialLinks ?? []),
          bio: speaker.speaker?.bio ?? '',
        });
      });
  }

  private addPlanningSheet(
    workbook: Workbook,
    conference: Conference,
    sessions: Session[],
    allocations: SessionAllocation[],
    slotTypes: SlotType[],
    activities: Activity[],
    personById: Map<string, Person>
  ): void {
    const sheet = workbook.addWorksheet('planning');
    sheet.columns = [
      { header: 'dayIndex', key: 'dayIndex', width: 10 },
      { header: 'dayDate', key: 'dayDate', width: 14 },
      { header: 'dayId', key: 'dayId', width: 20 },
      { header: 'slotId', key: 'slotId', width: 22 },
      { header: 'startTime', key: 'startTime', width: 10 },
      { header: 'endTime', key: 'endTime', width: 10 },
      { header: 'durationMin', key: 'durationMin', width: 12 },
      { header: 'roomId', key: 'roomId', width: 16 },
      { header: 'room', key: 'room', width: 20 },
      { header: 'roomDisabled', key: 'roomDisabled', width: 12 },
      { header: 'slotTypeId', key: 'slotTypeId', width: 20 },
      { header: 'slotType', key: 'slotType', width: 18 },
      { header: 'slotIsSession', key: 'slotIsSession', width: 12 },
      { header: 'slotSessionTypeId', key: 'slotSessionTypeId', width: 20 },
      { header: 'slotSessionType', key: 'slotSessionType', width: 22 },
      { header: 'allocated', key: 'allocated', width: 10 },
      { header: 'allocationId', key: 'allocationId', width: 24 },
      { header: 'allocatedSessionId', key: 'allocatedSessionId', width: 30 },
      { header: 'allocatedSessionTitle', key: 'allocatedSessionTitle', width: 46 },
      { header: 'allocatedSessionStatus', key: 'allocatedSessionStatus', width: 18 },
      { header: 'allocatedTrack', key: 'allocatedTrack', width: 20 },
      { header: 'speaker1', key: 'speaker1', width: 24 },
      { header: 'speaker2', key: 'speaker2', width: 24 },
      { header: 'speaker3', key: 'speaker3', width: 24 },
      { header: 'activityId', key: 'activityId', width: 20 },
      { header: 'activityName', key: 'activityName', width: 28 },
    ];
    this.styleHeader(sheet);

    const roomById = new Map((conference.rooms ?? []).map((room) => [room.id, room]));
    const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
    const trackById = new Map((conference.tracks ?? []).map((track) => [track.id, track]));
    const slotTypeById = new Map((slotTypes ?? []).map((slotType) => [String(slotType.id ?? '').trim(), slotType]));
    const sessionTypeById = new Map((conference.sessionTypes ?? []).map((sessionType) => [sessionType.id, sessionType]));
    const activityBySlotId = new Map(
      (activities ?? [])
        .filter((activity) => !!String(activity.slotId ?? '').trim())
        .map((activity) => [String(activity.slotId ?? '').trim(), activity])
    );
    const allocationByKey = new Map(
      (allocations ?? []).map((allocation) => [this.allocationKey(allocation.dayId, allocation.slotId, allocation.roomId), allocation])
    );
    const allocationByDayAndSlot = new Map(
      (allocations ?? []).map((allocation) => [this.daySlotKey(allocation.dayId, allocation.slotId), allocation])
    );

    this.sortedDays(conference.days).forEach((day) => {
      const disabledRoomIds = new Set((day.disabledRoomIds ?? []).map((roomId) => String(roomId ?? '').trim()));
      this.sortedSlots(day.slots).forEach((slot) => {
        const roomId = String(slot.roomId ?? '').trim();
        const slotId = String(slot.id ?? '').trim();
        const dayId = String(day.id ?? '').trim();
        const allocation =
          allocationByKey.get(this.allocationKey(dayId, slotId, roomId))
          ?? allocationByDayAndSlot.get(this.daySlotKey(dayId, slotId));
        const session = allocation ? sessionById.get(String(allocation.sessionId ?? '').trim()) : undefined;
        const track = session ? trackById.get(String(session.conference?.trackId ?? '').trim()) : undefined;
        const sessionType = sessionTypeById.get(String(slot.sessionTypeId ?? '').trim());
        const slotType = slotTypeById.get(String(slot.slotTypeId ?? '').trim());
        const room = roomById.get(roomId);
        const activity = activityBySlotId.get(slotId);
        const speakerIds = session ? this.sessionSpeakerIds(session) : [];
        const speakers = speakerIds.map((speakerId) => this.personDisplay(personById.get(speakerId), speakerId));

        sheet.addRow({
          dayIndex: day.dayIndex,
          dayDate: day.date,
          dayId: day.id,
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMin: slot.duration,
          roomId,
          room: room?.name ?? '',
          roomDisabled: disabledRoomIds.has(roomId),
          slotTypeId: slot.slotTypeId,
          slotType: this.localizableText(slotType?.name),
          slotIsSession: slotType?.isSession ?? false,
          slotSessionTypeId: slot.sessionTypeId,
          slotSessionType: sessionType?.name ?? '',
          allocated: !!allocation,
          allocationId: allocation?.id ?? '',
          allocatedSessionId: allocation?.sessionId ?? '',
          allocatedSessionTitle: session?.title ?? '',
          allocatedSessionStatus: session?.conference?.status ?? '',
          allocatedTrack: track?.name ?? '',
          speaker1: speakers[0] ?? '',
          speaker2: speakers[1] ?? '',
          speaker3: speakers[2] ?? '',
          activityId: activity?.id ?? '',
          activityName: activity?.name ?? '',
        });
      });
    });
  }

  private addActivitySheets(workbook: Workbook, activitiesData: ActivityExportData[], personById: Map<string, Person>): void {
    const usedNames = new Set<string>(workbook.worksheets.map((sheet) => sheet.name));
    [...(activitiesData ?? [])]
      .sort((a, b) => this.compareText(a.activity.name, b.activity.name))
      .forEach((activityData, index) => {
        const activity = activityData.activity;
        const sheetName = this.nextSheetName(
          String(activity.name ?? '').trim() || `activity_${index + 1}`,
          usedNames
        );
        const sheet = workbook.addWorksheet(sheetName);

        const configuredAttributes = (activity.specificAttributes ?? [])
          .map((attribute) => String(attribute.attributeName ?? '').trim())
          .filter((attributeName) => !!attributeName);
        const participationAttributeNames = Array.from(
          new Set(
            (activityData.participations ?? [])
              .flatMap((participation) => participation.attributes ?? [])
              .map((attribute) => String(attribute.name ?? '').trim())
              .filter((attributeName) => !!attributeName)
          )
        );
        const attributeNames = Array.from(new Set([...configuredAttributes, ...participationAttributeNames]));

        const baseColumns = [
          { header: 'participationId', key: 'participationId', width: 28 },
          { header: 'personId', key: 'personId', width: 26 },
          { header: 'firstName', key: 'firstName', width: 18 },
          { header: 'lastName', key: 'lastName', width: 18 },
          { header: 'email', key: 'email', width: 30 },
          { header: 'participantType', key: 'participantType', width: 16 },
          { header: 'attributesJson', key: 'attributesJson', width: 40 },
        ];
        const attributeColumns = attributeNames.map((attributeName) => ({
          header: attributeName,
          key: this.attributeColumnKey(attributeName),
          width: 24,
        }));
        sheet.columns = [...baseColumns, ...attributeColumns];
        this.styleHeader(sheet);

        (activityData.participations ?? [])
          .slice()
          .sort((a, b) => {
            const personA = personById.get(String(a.personId ?? '').trim());
            const personB = personById.get(String(b.personId ?? '').trim());
            return this.compareText(
              `${personA?.lastName ?? ''} ${personA?.firstName ?? ''}`,
              `${personB?.lastName ?? ''} ${personB?.firstName ?? ''}`
            );
          })
          .forEach((participation) => {
            const person = personById.get(String(participation.personId ?? '').trim());
            const row: Record<string, unknown> = {
              participationId: participation.id,
              personId: participation.personId,
              firstName: person?.firstName ?? '',
              lastName: person?.lastName ?? '',
              email: person?.email ?? '',
              participantType: participation.participantType,
              attributesJson: this.stringifyValue(participation.attributes ?? []),
            };

            const attributeValueByName = new Map(
              (participation.attributes ?? []).map((attribute) => [String(attribute.name ?? '').trim(), attribute.value ?? ''])
            );
            attributeNames.forEach((attributeName) => {
              row[this.attributeColumnKey(attributeName)] = attributeValueByName.get(attributeName) ?? '';
            });
            sheet.addRow(row);
          });
      });
  }

  private styleHeader(sheet: Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (sheet.columnCount > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount },
      };
    }
  }

  private sortedDays(days: Day[] | undefined): Day[] {
    return [...(days ?? [])].sort((a, b) =>
      (a.dayIndex ?? 0) - (b.dayIndex ?? 0)
      || this.compareText(a.date, b.date)
    );
  }

  private sortedSlots(slots: Slot[] | undefined): Slot[] {
    return [...(slots ?? [])].sort((a, b) =>
      this.compareText(a.startTime, b.startTime)
      || this.compareText(a.endTime, b.endTime)
      || this.compareText(a.roomId, b.roomId)
      || this.compareText(a.id, b.id)
    );
  }

  private sessionSpeakerIds(session: Session): string[] {
    return [session.speaker1Id, session.speaker2Id, session.speaker3Id]
      .map((speakerId) => String(speakerId ?? '').trim())
      .filter((speakerId) => !!speakerId);
  }

  private personDisplay(person: Person | undefined, fallbackId: string): string {
    if (!person) {
      return fallbackId;
    }
    const fullName = `${String(person.firstName ?? '').trim()} ${String(person.lastName ?? '').trim()}`.trim();
    if (person.email) {
      return fullName ? `${fullName} <${person.email}>` : person.email;
    }
    return fullName || fallbackId;
  }

  private localizableText(value: { [lang: string]: string } | undefined): string {
    if (!value) {
      return '';
    }
    const fr = String(value['FR'] ?? '').trim();
    const en = String(value['EN'] ?? '').trim();
    if (fr && en) {
      return `FR: ${fr} | EN: ${en}`;
    }
    if (fr || en) {
      return fr || en;
    }
    const first = Object.values(value).find((entry) => !!String(entry ?? '').trim());
    return String(first ?? '').trim();
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.stringifyValue(item)).join(', ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private compareText(a: unknown, b: unknown): number {
    return String(a ?? '').localeCompare(String(b ?? ''));
  }

  private allocationKey(dayId: string, slotId: string, roomId: string): string {
    return `${String(dayId ?? '').trim()}|${String(slotId ?? '').trim()}|${String(roomId ?? '').trim()}`;
  }

  private daySlotKey(dayId: string, slotId: string): string {
    return `${String(dayId ?? '').trim()}|${String(slotId ?? '').trim()}`;
  }

  private attributeColumnKey(attributeName: string): string {
    return `attr_${attributeName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  }

  private nextSheetName(baseName: string, usedNames: Set<string>): string {
    const sanitized = String(baseName ?? '')
      .replace(/[\\/*?:[\]]/g, '_')
      .replace(/'+/g, '')
      .trim();
    const stem = (sanitized || 'sheet').slice(0, 31);
    let candidate = stem;
    let index = 2;
    while (usedNames.has(candidate)) {
      const suffix = `_${index}`;
      candidate = `${stem.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
      index += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }

  private buildFileName(conference: Conference): string {
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      this.pad2(now.getMonth() + 1),
      this.pad2(now.getDate()),
    ].join('')
      + '_'
      + [this.pad2(now.getHours()), this.pad2(now.getMinutes()), this.pad2(now.getSeconds())].join('');
    const conferenceName = this.fileSafe(conference.name);
    const edition = this.fileSafe(String(conference.edition ?? ''));
    return `${conferenceName}_${edition}_${timestamp}.xlsx`;
  }

  private pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  private fileSafe(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
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

