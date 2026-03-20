import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Workbook, Worksheet } from 'exceljs';
import { Activity, ActivityParticipation } from '@shared/model/activity.model';
import { Person } from '@shared/model/person.model';
import { ConferenceSpeaker } from '@shared/model/speaker.model';
import { ConferenceSpeakerService } from './conference-speaker.service';
import { PersonService } from './person.service';

/**
 * Read model used to display one conference speaker who has not answered an activity participation request yet.
 */
export interface SpeakerNonRespondentRow {
  /** Conference speaker projection. */
  conferenceSpeaker: ConferenceSpeaker;
  /** Resolved person document when available. */
  person?: Person;
  /** Human readable display name. */
  displayName: string;
  /** Speaker email when known. */
  email: string;
}

/**
 * Export row for the activity participation workbook.
 */
export interface ActivityParticipantExportRow {
  /** First name. */
  firstName: string;
  /** Last name. */
  lastName: string;
  /** Localized status label. */
  statusLabel: string;
  /** Attribute values indexed by attribute name. */
  attributesByName: Record<string, string>;
}

/**
 * Provides optimized speaker participation reporting for activities.
 */
@Injectable({ providedIn: 'root' })
export class ActivitySpeakerParticipationService {
  private readonly conferenceSpeakerService = inject(ConferenceSpeakerService);
  private readonly personService = inject(PersonService);

  /**
   * Loads all conference speakers and submitted speaker persons once, then computes speakers with no participation response.
   *
   * @param conferenceId Conference identifier.
   * @param activity Activity to inspect.
   * @param participations Activity participations already loaded by the page.
   * @returns Display rows for speakers who have not answered yet.
   */
  async loadNonRespondedSpeakerRows(
    conferenceId: string,
    activity: Activity | undefined,
    participations: ActivityParticipation[]
  ): Promise<SpeakerNonRespondentRow[]> {
    if (!this.isSpeakerParticipationEnabled(activity)) {
      return [];
    }

    const [conferenceSpeakers, submittedSpeakerPersons] = await Promise.all([
      firstValueFrom(this.conferenceSpeakerService.byConferenceId(conferenceId)),
      firstValueFrom(this.personService.bySubmittedConferenceId(conferenceId)),
    ]);

    return this.computeNonRespondedSpeakerRows(
      conferenceSpeakers ?? [],
      submittedSpeakerPersons ?? [],
      participations ?? []
    );
  }

  /**
   * Generates and downloads the activity participants workbook with one single sheet.
   *
   * @param fileName Target file name.
   * @param activity Current activity definition.
   * @param rows Rows to export.
   * @param headers Localized column headers.
   */
  async downloadParticipantsWorkbook(
    fileName: string,
    activity: Activity,
    rows: ActivityParticipantExportRow[],
    headers: { firstName: string; lastName: string; status: string }
  ): Promise<void> {
    const workbook = await this.buildParticipantsWorkbook(activity, rows, headers);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    this.downloadBlob(blob, fileName);
  }

  /**
   * Indicates whether speaker follow-up is relevant for the activity.
   *
   * @param activity Activity to inspect.
   * @returns `true` when the activity targets speakers.
   */
  isSpeakerParticipationEnabled(activity: Activity | undefined): boolean {
    return (activity?.participantTypes ?? []).includes('SPEAKER');
  }

  /**
   * Computes missing speaker responses by comparing conference speakers and existing activity participations.
   *
   * @param conferenceSpeakers All conference speakers of the conference.
   * @param submittedSpeakerPersons Submitted speakers loaded in one batch.
   * @param participations Existing activity participations for the activity.
   * @returns Sorted display rows for speakers with no response.
   */
  private computeNonRespondedSpeakerRows(
    conferenceSpeakers: ConferenceSpeaker[],
    submittedSpeakerPersons: Person[],
    participations: ActivityParticipation[]
  ): SpeakerNonRespondentRow[] {
    const respondedPersonIds = new Set(
      (participations ?? [])
        .map((participation) => String(participation.personId ?? '').trim())
        .filter((personId) => !!personId)
    );
    const personsById = new Map(
      (submittedSpeakerPersons ?? [])
        .filter((person) => !!String(person.id ?? '').trim())
        .map((person) => [String(person.id ?? '').trim(), person] as const)
    );

    return (conferenceSpeakers ?? [])
      .filter((conferenceSpeaker) => {
        const personId = String(conferenceSpeaker.personId ?? '').trim();
        return !!personId && !respondedPersonIds.has(personId);
      })
      .map((conferenceSpeaker) => this.toSpeakerNonRespondentRow(conferenceSpeaker, personsById))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  /**
   * Converts one conference speaker projection into a display row.
   *
   * @param conferenceSpeaker Conference speaker projection.
   * @param personsById Submitted speaker persons indexed by id.
   * @returns Display row.
   */
  private toSpeakerNonRespondentRow(
    conferenceSpeaker: ConferenceSpeaker,
    personsById: Map<string, Person>
  ): SpeakerNonRespondentRow {
    const personId = String(conferenceSpeaker.personId ?? '').trim();
    const person = personsById.get(personId);
    const firstName = String(person?.firstName ?? '').trim();
    const lastName = String(person?.lastName ?? '').trim();

    return {
      conferenceSpeaker,
      person,
      displayName: [firstName, lastName].filter((value) => !!value).join(' ').trim() || personId,
      email: String(person?.email ?? '').trim(),
    };
  }

  /**
   * Builds the workbook used for the export.
   *
   * @param activity Current activity.
   * @param rows Rows to export.
   * @param headers Localized base headers.
   * @returns Excel workbook.
   */
  private async buildParticipantsWorkbook(
    activity: Activity,
    rows: ActivityParticipantExportRow[],
    headers: { firstName: string; lastName: string; status: string }
  ): Promise<Workbook> {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    workbook.creator = 'cfp-manager';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(this.buildSheetName(activity));
    const attributeNames = (activity.specificAttributes ?? [])
      .map((attribute) => String(attribute.attributeName ?? '').trim())
      .filter((attributeName) => !!attributeName);

    sheet.columns = [
      { header: headers.firstName, key: 'firstName', width: 20 },
      { header: headers.lastName, key: 'lastName', width: 20 },
      { header: headers.status, key: 'status', width: 18 },
      ...attributeNames.map((attributeName) => ({
        header: attributeName,
        key: this.attributeColumnKey(attributeName),
        width: 24,
      })),
    ];
    this.styleHeader(sheet);

    (rows ?? []).forEach((row) => {
      const worksheetRow: Record<string, string> = {
        firstName: String(row.firstName ?? '').trim(),
        lastName: String(row.lastName ?? '').trim(),
        status: String(row.statusLabel ?? '').trim(),
      };
      attributeNames.forEach((attributeName) => {
        worksheetRow[this.attributeColumnKey(attributeName)] = String(row.attributesByName[attributeName] ?? '').trim();
      });
      sheet.addRow(worksheetRow);
    });

    return workbook;
  }

  /**
   * Styles the header row and enables autofilter.
   *
   * @param sheet Worksheet to format.
   */
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

  /**
   * Computes a valid worksheet name from the activity.
   *
   * @param activity Current activity.
   * @returns Worksheet name.
   */
  private buildSheetName(activity: Activity): string {
    const rawName = String(activity.name ?? '').trim() || 'activity';
    return rawName
      .replace(/[\\/*?:[\]]/g, '_')
      .replace(/'+/g, '')
      .slice(0, 31);
  }

  /**
   * Builds a safe column key for one activity attribute.
   *
   * @param attributeName Attribute name.
   * @returns Stable worksheet column key.
   */
  private attributeColumnKey(attributeName: string): string {
    return `attr_${attributeName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  }

  /**
   * Downloads a blob through a temporary anchor element.
   *
   * @param blob File content.
   * @param fileName Target file name.
   */
  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

