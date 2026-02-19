import { PersistentData } from "./persistant.model";

export type SubmitSource = 'CONFERENCE_HALL' | 'MANUAL';

/** A speaker at a conference */
export interface ConferenceSpeaker extends PersistentData {
  /** identifier of the conference where the Speaker attends */
  conferenceId: string;
  /** Identifier of the person */
  personId: string;
  /** List of identifier of slots where the speaker CANNOT attend during the conference */
  unavailableSlotsId: string[];
  /** List of the session accepted in the conference */
  sessionIds: string[];
  /** Indicate where the session of the speaker has been submitted */
  source: SubmitSource;
  /** Identifier of the speaker from the source */
  sourceId: string;
}
