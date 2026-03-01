import { PersistentData } from "./persistant.model";

/**
 * Represents a session (talk, workshop, etc.). 
 * It can be:
 * - a session registered by a speaker not yet submitted in the conference.
 * - a session submitted to a conference (with conference-specific info).
 */
export interface Session extends PersistentData {
  /** Title of the session */
  title: string;
  /** Abstract/summary  */
  abstract: string;
  /**  */
  references: string;
  /** Type of session (e.g., keynote, workshop) */
  sessionType: string;
  /** Speaker 1 id */
  speaker1Id: string;
  /** Optional Speaker 2 id */
  speaker2Id?: string;
  /** Optional Speaker 3 id */
  speaker3Id?: string;
  /** last date change. Format ISO 8601 YYYY-MM-DD */
  lastChangeDate: string;
  /** full text search field */
  search: string;
  /** Conference-specific information */
  conference?: {
    /** Conference ID */
    conferenceId: string;
    /** Status of the session in this conference */
    status: SessionStatus;
    /** id of the source session registered by the speaker */
    sourceSessionUuid?: string;
    /** identifier of the session Type for this conference */
    sessionTypeId: string;
    /** Track ID */
    trackId: string;
    /** Overridden fields for this session in this conference */
    overriddenFields: OverriddenField[];
    /** Feedback information */
    feedback?: SessionFeedback;
    /** Submit Date. Format ISO 8601 YYYY-MM-DD */
    submitDate: string;
    /** Level of the session */
    level: SessionLevel
    langs: string[];
    /** */
    conferenceHallId: string;
    review : {
      average: number;
      votes: number;
    },
    occupation?: number;
  }
}

export type SessionStatus = 'DRAFT' // La session est en cours de déclaration par le speaker dans l'application mais elle n'est pas soumises
  | 'SUBMITTED' // La session a été soumises / proposées  à la conference
  | 'REJECTED'  // Le comité/jury de la conférence a rejecté la proposition
  | 'WAITLISTED' // Le comité/jury de la conférence a décidé de garder cette proposition sur liste d'attente en cas d'annulation d'autres sessions acceptées
  | 'ACCEPTED'  // Le comité/jury de la conférence a accepté la proposition
  | 'SPEAKER_CONFIRMED' // Le speaker a confirmé sa participation
  | 'SCHEDULED' // // Le comité/jury de la conférence a planifié la session avant d'avoir la confirmation de la participation par le speaker
  | 'DECLINED_BY_SPEAKER' // Le Speaker a refusé de participation après que le comité/jury ait accepté la proposition.
  | 'PROGRAMMED' // La session est planifié dans le programme et le speaker a confirmé sa participation.
  | 'CANCELLED' // Après que la session ait été programmé (planifié + confirmation participation speaker), le speaker a du annulé sa participation
  ;
export type SessionLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Represents an overridden field for a session in a conference.
 */
export interface OverriddenField {
  /** Name of the overridden field */
  fieldName: string;
  /** Previous value of the field */
  oldValue: string;
}

/**
 * Feedback information for a session.
 */
export interface SessionFeedback {
  /** Public feedback URL */
  publicUrl: string;
  /** Private feedback URL */
  privateUrl: string;
  /** List of feedback details */
  details?: FeedbackDetail[];
}

/**
 * Detailed feedback entry for a session.
 */
export interface FeedbackDetail {
  /** Date of the feedback (ISO 8601) */
  date: string;
  /** Evaluation based on the number of stars */
  evaluation: number;
  /** List of bingos (special achievements or keywords) */
  bingos: string[];
  /** Additional comments */
  comment: string;
}

/**
 * Represents the allocation of a session to a specific slot, room, and day in a conference.
 */
export interface SessionAllocation extends PersistentData {
  /** Conference ID */
  conferenceId: string;
  /** Day ID */
  dayId: string;
  /** Slot ID */
  slotId: string;
  /** Room ID */
  roomId: string;
  /** Session ID */
  sessionId: string;
}