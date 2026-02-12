import { PersistentData, WithId } from "./persistant.model";

/**
 * Represents a conference event with all required fields and nested structures.
 */
export interface Conference extends PersistentData {
  /** Name of the conference */
  name: string;
  /** Location of the conference */
  location: string;
  /** URL to the conference logo */
  logo: string;
  /** Supported languages (e.g., ["FR", "EN"]) */
  languages: string[];
  /** Description in several languages. See the field languages for supported ones */
  description: { [lang: string]: string };
  visible: boolean;
  /** List of organizer email */
  organizerEmails: string[];
  /** List of tracks */
  tracks: Track[];
  /** List of rooms */
  rooms: Room[];
  /** List of session types */
  sessionTypes: SessionType[];
  /** Planning structure: list of days */
  days: Day[];
  /** CFP (Call for Papers) information */
  cfp: {
    startDate: string; // ISO 8601
    endDate: string;   // ISO 8601
    status: string;
  };
  /** configuration of the external systems (conferencehall, voxxrin) */
  externalSystemConfigs: ExternalSystemConfig[];
}

/** Track of the conference (e.g., a theme or topic). */
export interface Track extends WithId {
  name: string;
  description: { [lang: string]: string };
  color: string;
  icon: string;
}

/** Room where sessions are held. */
export interface Room extends WithId {
  name: string;
  capacity: number;
  plan: string;
}

/** Type of session (e.g., keynote, workshop). */
export interface SessionType extends WithId {
  name: string;
  duration: number; // in minutes
  description: { [lang: string]: string };
  icon: string;
  color: string;
  visible: boolean;
  maxSpeakers: number;
}


/** A day in the conference schedule. */
export interface Day extends WithId {
  dayIndex: number;
  date: string; // ISO 8601
  slots: Slot[];
  disabledRoomIds: string[];
  beginTime: string; // ISO 8601 time '09:00'
  endTime: string; // ISO 8601 time '18:00'
}

/** A slot in the schedule. */
export interface Slot extends WithId {
  startTime: string; // ISO 8601 time '14:00'
  endTime: string;   // ISO 8601 time '14:45'
  duration: number;  // in minutes
  slotTypeId: string;
  roomId: string;
  sessionTypeId: string;
}

/** Conference Hall integration info. */
export interface ExternalSystemConfig {
  systemName: string;
  env: string;
  url: string;
  id: string;
  token: string;
}
