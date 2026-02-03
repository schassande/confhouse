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
  /** Abstract/summary in French and English */
  abstract: { [lang: string]: string };
  /** Type of session (e.g., keynote, workshop) */
  sessionType: string;
  /** Speaker 1 id */
  speaker1Id: string;
  /** Optional Speaker 2 id */
  speaker2Id?: string;
  /** Optional Speaker 3 id */
  speaker3Id?: string;
  /** Conference-specific information */
  conference?: {
    /** Conference ID */
    conferenceId: string;
    /** Status of the session in this conference */
    status: string;
    /** id of the source session registered by the speaker */
    sourceSessionUuid?: string;
    /** identifier of the session Type for this conference */
    sessionTypeId: string;
    /** Track ID */
    trackId: string;
    /** Overridden fields for this session in this conference */
    overriddenFields: OverriddenField[];
    /** Whether the session is scheduled */
    scheduled: boolean;
    /** Feedback information */
    feedback?: SessionFeedback;
  }
}

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
  /** Allocation status */
  status: string;
}