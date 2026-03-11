import { PersistentData, WithId } from "./persistant.model";

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

export interface SponsorType extends WithId {
  /** Name of the sponsor type (e.g., "Gold", "Silver") */
  name: string;
  /** Description in several languages. See the field languages of the conference for supported ones */
  description: { [lang: string]: string };
  /** Maximum number of sponsors allowed for this type */
  maxNumber: number;
  /** Price of the sponsor type */
  price: number;
  /** Color associated with this sponsor type (e.g., for display purposes) */
  color: string;
  /** Font color associated with this sponsor type (e.g., for display purposes) */
  fontColor: string;
  /** List of possible booth names for sponsors of this type */
  boothNames: string[];
  /** List of conference ticket quotas for sponsors of this type */
  conferenceTicketQuotas: SponsorConferenceTicketQuota[]
}
/** Definition of a conference ticket quota for sponsors. */
export interface SponsorConferenceTicketQuota {
  /** ID of the conference ticket type */
  conferenceTicketTypeId: string;
  /** Maximum number of tickets available for this quota */
  quota: number;
}  

export type SponsorStatus = 'POTENTIAL' | 'CANDIDATE' |'CONFIRMED' | 'REJECTED' | 'CANCELED'| 'WAITING_LIST';
export type SponsorPaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';
/**
 * Represents a sponsor of the conference with all required fields and nested structures.
 */
export interface Sponsor extends PersistentData {
  conferenceId: string;
  /** Name of the sponsor */
  name: string;
  /** Status of the sponsor */
  status: SponsorStatus;
  /** Date when the status was last updated, ISO 8601 */
  statusDate: string;
  /** Status of the payment */
  paymentStatus: SponsorPaymentStatus;
  /** Date when the payment status was last updated, ISO 8601 */
  paymentStatusDate: string;
  /** Description in several languages. See the field languages of the conference for supported ones */
  description: { [lang: string]: string };
  /** ID of the sponsor type. See the field sponsorTypes of the conference for supported ones */
  sponsorTypeId: string;
  /** URL to the sponsor logo */
  logo: string;
  /** Website URLs in different languages. See the field languages of the conference for supported ones */
  website: { [lang: string]: string };
  /** Name of the booth allocated to the sponsor */
  boothName: string;
  /** List of preferred booth names. Values must be the name of the booths defined in the conference for the corresponding sponsor type */
  boothWishes: string[];
  /** Date when the booth wishes were submitted, ISO 8601 */
  boothWishesDate: string;
  /** List of admin emails */
  adminEmails: string[];
  /** List of conference tickets for the sponsor */
  conferenceTickets?: ConferenceTicket[];
}
/** Represents a conference ticket. */
export interface ConferenceTicket {
  conferenceTicketTypeId: string;
  email: string;
  ticketId: string;
  status: 'REQUESTED' | 'CREATED' |'SENT' | 'CANCELED';
}
