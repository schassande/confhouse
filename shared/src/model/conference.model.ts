import { PersistentData, WithId } from "./persistant.model";
import { SponsorType } from "./sponsor.model";

/**
 * Represents a conference event with all required fields and nested structures.
 */
export interface Conference extends PersistentData {
  /** Name of the conference */
  name: string;
  edition: number;
  /** Location of the conference */
  location: string;
  /** Conference website URL */
  website: string;
  /** URL to the conference logo */
  logo: string;
  /** Supported languages (e.g., ["FR", "EN"]) */
  languages: string[];
  /** Description in several languages. See the field languages for supported ones */
  description: { [lang: string]: string };
  visible: boolean;
  /** List of organizer email */
  organizerEmails: string[];
  /** Email domain for organizers */
  organizerEmailDomain?: string;
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
    website: string;
    status: string;
  };
  ticket?: {
    ticketTool: TicketTool;
    conferenceTicketTypes: ConferenceTicketType[];
  }
  sponsoring?: {
    sponsorTypes: SponsorType[];
    /** URLs of the sponsor booth maps */
    sponsorBoothMaps: string[];
    startDate: string; // ISO 8601
    endDate: string;   // ISO 8601
    /** Optional last day when sponsor self-service ticket administration remains editable. */
    ticketEndDate?: string;
    /** Last allocated sponsor acceptance number. */
    counter?: number;
    /** Legal entity name used as the issuer on generated sponsor documents. */
    legalEntity?: string;
    /** Postal address used as the issuer address on generated sponsor documents. */
    address?: string;
    /** Contact email used as the issuer email on generated sponsor documents. */
    email?: string;
    /** Optional email copied on all sponsor communications. */
    ccEmail?: string;
    /** VAT rate applied on generated sponsor documents, as a ratio such as 0.2. */
    vatRate?: number;
    /** Legal entity identifier used on generated sponsor documents, for example SIRET. */
    entityId?: string;
    /** Optional bank details rendered on sponsor order forms. */
    bankDetails?: {
      iban?: string;
      bic?: string;
    };
    /** Optional legal notes rendered on generated sponsor documents. */
    legalNotes?: string[];
  };
}

/** Supported ticketing tools. */
export type TicketTool = 'BILLET_WEB' ;

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
  isSessionRoom: boolean;
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
  overflowRoomIds: string[];
  sessionTypeId: string;
}

export type SlotError = 'BEFORE_DAY_BEGIN' 
  | 'AFTER_DAY_END'
  | 'ROOM_DISABLED'
  | 'OVERLAP_SLOT' 
  | 'WRONG_ROOM_TYPE' 
  | 'WRONG_DURATION' // duration != end - start
  | 'WRONG_DURATION_SESSION' // duration != session.duration
  | 'START_AFTER_END'
  | 'UNEXISTING_ROOM'
  | 'WRONG_SLOT_TYPE'
  | 'WRONG_SESSION_TYPE';

export interface ConferenceTicketType extends WithId {
  ticketTypeName: string;
  toolTicketTypeId: string;
  price: number;
  description: { [lang: string]: string };
}
