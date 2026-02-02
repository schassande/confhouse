import { PersistentData, WithId } from "./persistant.model";

/**
 * Represents a conference event with all required fields and nested structures.
 */
export interface Conference extends PersistentData {
  /** Name of the conference */
  name: string;
  /** List of dates (ISO 8601 strings) */
  dates: string[];
  /** Location of the conference */
  location: string;
  /** URL to the conference logo */
  logo: string;
  /** Supported languages (e.g., ["FR", "EN"]) */
  languages: string[];
  /** Description in several languages. See the field languages for supported ones */
  description: { [lang: string]: string };
  visible: boolean;
  /** List of organizer IDs */
  organizerIds: string[];
  /** List of tracks */
  tracks: Track[];
  /** List of rooms */
  rooms: Room[];
  /** List of session types */
  sessionTypes: SessionType[];
  /** Planning structure: list of days */
  planning: Day[];
  /** CFP (Call for Papers) information */
  cfp: {
    startDate: string; // ISO 8601
    endDate: string;   // ISO 8601
    status: string;
  };
  /** configuration of the external systems (conferencehall, voxxrin) */
  externalSystemConfigs: ExternalSystemConfig[];
  /** Planning structure skeleton, one element per day of the conference */
  planningStructure: DayPlanningStructure[]
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
}


/** Planning structure for a specific day. */
export interface  DayPlanningStructure {
  dayId: string;
  slots: PlanningSlot[];
}

/** A day in the conference schedule. */
export interface Day extends WithId {
  dayIndex: number;
  date: string; // ISO 8601
  name: string;
  slots: Slot[];
}

/** A slot in the schedule. */
export interface Slot extends WithId {
  startTime: string; // ISO 8601 time
  endTime: string;   // ISO 8601 time
  duration: number;  // in minutes
  slotType: string;
  sessionType: string;
}

/** Conference Hall integration info. */
export interface ExternalSystemConfig {
  systemName: string;
  env: string;
  url: string;
  id: string;
  token: string;
}


/** Planning skeleton: a list of slots. */
export interface PlanningSlot extends WithId {
  startTime: string; // ISO 8601 time
  duration: number;  // in minutes
  endTime: string;   // ISO 8601 time
  slotType: string;
}
