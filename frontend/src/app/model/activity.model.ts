import { PersistentData } from "./persistant.model";


/**
 * Represents an activity in the conference (e.g., social event, workshop, etc.).
 */
export interface Activity extends PersistentData {
  /** Name of the activity */
  name: string;
  /** Icon CSS class (e.g., PrimeIcons class) */
  icon: string;
  /** Whether this activity allows participant registrations */
  registerParticipant: boolean;
  /** Linked activity slot id (optional) */
  slotId?: string;
  /** Start date and time (ISO 8601 string) */
  start: string;
  /** End date and time (ISO 8601 string) */
  end: string;
  /** Description of the activity */
  description: { [lang: string]: string };
  /** Conference ID */
  conferenceId: string;
  /** List of specific attributes for this activity */
  specificAttributes: ActivityAttribute[];
  /** List of participant types that can participate in this activity. This is a list of strings representing the types of participants (e.g., "SPEAKER", "ATTENDEE", "SPONSOR", "ORGANIZER"). The actual meaning of these types is defined by the conference organizers and can be used to categorize participants in the context of this activity. */
  participantTypes: ParticipantType[];
  /** Limited number of participants for this activity. */
  limitedParticipationNumber: {
    /** Global limit */
    total: number;
    /** Per participant type  */
    perParticipantType: { [participantType: string]: number };
  };
}
export type ParticipantType = 'SPEAKER' | 'ATTENDEE' | 'SPONSOR' | 'ORGANIZER';
/**
 * Represents a specific attribute for an activity.
 */
export interface ActivityAttribute {
  /** Name of the attribute */
  attributeName: string;
  /** Type of the attribute (e.g., string, number, boolean) */
  attributeType: AttributeType;
  /** For LIST type, the allowed values */
  attributeAllowedValues?: string[]; 
  /** Minimum value (if applicable) */
  attributeMinValue?: number;
  /** Maximum value (if applicable) */
  attributeMaxValue?: number;
  /** Whether the attribute is required */
  attributeRequired: boolean;
}
export type AttributeType = 'TEXT' | 'INTEGER' | 'LIST' | 'DATE' | 'BOOLEAN';

/**
 * Represents a participation record for an activity in a conference.
 * This is a persistent type.
 */
export interface ActivityParticipation extends PersistentData {
  /** Conference ID */
  conferenceId: string;
  /** Activity ID */
  activityId: string;
  /** Person ID */
  personId: string;
  /** Participant type at registration time */
  participantType: ParticipantType;
  /** Whether the person is currently registered for this activity.*/
  participation: boolean;
  /** List of attribute values for this participation */
  attributes: {
    /** Name of the attribute */
    name: string;
    /** Value of the attribute */
    value: string;
  }[];
}
