import { PersistentData } from "./persistant.model";

/** Billetweb configuration for a conference */
export interface BilletwebConfig extends PersistentData {
  apiUrl: string;
  // key is stored in a secret.
  /** identifier of the user in billetweb */
  userId: string;
  /** key version for the authentication */
  keyVersion: string;
 
  /** Conference ID */
  conferenceId: string;
  /** Billetweb event ID */
  eventId: string;
  /** Ticket types in billerweb */
  ticketTypes: {
    /** Ticket types in billerweb for a speaker */
    speaker: BilletwebTicketType;
    /** Ticket types in billerweb for an organizer */
    organizer: BilletwebTicketType;
    /** Ticket types in billerweb available for sponsors */
    sponsors: BilletwebTicketType[];
  }
  /** Mapping between BilletWeb custom fields and activity participation attributes */
  customFieldMappings?: ActivityTicketFieldMapping[];
}

/** represent a ticket type in billetweb */
export interface BilletwebTicketType {
  /** Name of the ticket type in billetweb */
  ticketTypeName: string;
  /** Id of the ticket type in billetweb */
  ticketTypeId: string;
}

/**
 * Conf House creates ticket in billetweb. Ticket creation can require custom field.
 * This objet defines the mapping between an attribut from an activity to the custom
 * field of the billetweb ticket 
 */
export interface ActivityTicketFieldMapping {
  /** Identifier of the activity exposing the source attribute */
  activityId: string;
  /** Name of the activity-specific attribute copied into BilletWeb */
  activityAttributeName: string;
  /** BilletWeb custom field identifier receiving the activity attribute value */
  billetwebCustomFieldId: string;
}
