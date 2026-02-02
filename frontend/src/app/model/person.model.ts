import { PersistentData } from "./persistant.model";

export interface SocialLink {
  /** Name of the social network (e.g., LinkedIn, Twitter) */
  network: string;
  /** URL to the social network profile */
  url: string;
}

export interface Person extends PersistentData {
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Email address */
  email: string;
  /** Company or organization */
  company: string;
  /** Short biography */
  bio: string;
  /** Reference or internal code */
  reference: string;
  /** URL to the person's photo */
  photoUrl: string;
  /** List of social network links */
  socialLinks: SocialLink[];
  /** Whether the person has an account in the system */
  hasAccount: boolean;
}
