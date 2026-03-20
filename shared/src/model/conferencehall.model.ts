import { PersistentData } from "./persistant.model";

/** Conference Hall or voxxrin integration info. */
export interface ConferenceHallConfig extends PersistentData {
  conferenceId: string;
  conferenceName: string;
  sessionTypeMappings: SessionTypeMapping[];
  lastCommunication: string; // date time ISO
}

export interface SessionTypeMapping {
  sessionTypeId: string;
  conferenceHallFormat: string;
}
