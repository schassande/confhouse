import { PersistentData } from "./persistant.model";


/**
 * Represents an activity in the conference (e.g., social event, workshop, etc.).
 */
export interface Activity extends PersistentData {
  /** Name of the activity */
  name: string;
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
  /** List of organizer person IDs */
  organizers: string[];
}

/**
 * Represents a specific attribute for an activity.
 */
export interface ActivityAttribute {
  /** Name of the attribute */
  attributeName: string;
  /** Type of the attribute (e.g., string, number, boolean) */
  attributeType: string;
  /** Minimum value (if applicable) */
  attributeMinValue?: number;
  /** Maximum value (if applicable) */
  attributeMaxValue?: number;
  /** Whether the attribute is required */
  attributeRequired: boolean;
}

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
  /** List of attribute values for this participation */
  attributes: {
    /** Name of the attribute */
    name: string;
    /** Value of the attribute */
    value: string;
  }[];
}
