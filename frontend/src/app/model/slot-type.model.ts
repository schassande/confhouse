import { PersistentData } from "./persistant.model";

export interface SlotType {
  name: string;
  icon: string;
  color: string;
}
/**
 * Represents a type of slot (e.g., talk, workshop, break).
 */
export interface SlotType extends PersistentData {
  /** Name of the slot type */
  name: string;
  /** URL of the icon representing the slot type */
  icon: string;
  /** Color associated with the slot type */
  color: string;
}
