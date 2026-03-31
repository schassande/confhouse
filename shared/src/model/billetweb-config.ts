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

/**
 * Store the information on a BilletWeb ticket of a conference participant.
 */
export interface ParticipantBilletWebTicket extends PersistentData {
  /** Identifier of the conference */
  conferenceId: string;
  /** Identifier of the person, peut être vide si le billet n'est pas encore attribué. */
  personId: string;
  /** The name of the ticket. It is the ticket type. */
  ticketName: string;
  /** Internal billetweb identifier of the ticket/product used in the API */
  ticketInternalId: string;
  /** External billetweb identifier of the ticket/product visible on ticket (UUID format) */
  ticketExtenalId: string;
  /** Status of the billetweb ticket */
  ticketStatus: 'NON_EXISTING' | 'CREATED' | 'DISABLED' | 'DELETED';
  /** The order identifier when the ticket has been created */
  orderId: string;
  /** The email of the person who ordered the ticket */
  orderEmail: string;
  /** Order date ISO */
  orderDate: string;
  /** the URL to download the ticket (product) */
  downloadURL: string;
  /** The URL to go on the manage page of the ticket */
  manageURL: string;
}
