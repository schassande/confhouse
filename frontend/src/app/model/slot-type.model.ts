import { PersistentData } from "./persistant.model";

/**
 * Represents a type of slot (e.g., talk, workshop, break).
 */
export interface SlotType extends PersistentData {
  /** Name of the slot type in multiple languages */
  name: { [lang: string]: string };  
  /** URL of the icon representing the slot type */
  icon: string;
  /** Color associated with the slot type */
  color: string;
  /** Description in several languages */
  description: { [lang: string]: string };
  /** Whether this slot type corresponds to a session (talk/workshop) or not (break, etc.) */
  isSession: boolean; 
}
