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
}

/** represent a ticket type in billetweb */
export interface BilletwebTicketType {
  /** Name of the ticket type in billetweb */
  ticketTypeName: string;
  /** Id of the ticket type in billetweb */
  ticketTypeId: string;
}
