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
  /** Whether the person has an account in the system */
  hasAccount: boolean;
  /** Whether the person is a platform administrator (default false on creation) */
  isPlatformAdmin?: boolean;
  /** Whether the person is a speaker profile */
  isSpeaker: boolean;
  /** Preferred language for communication and interface */
  preferredLanguage: string;
  /** Search field: concatenation of lastName, firstName, email, speaker.company (space-separated, lowercase) */
  search: string;
  speaker?: {
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
    /** Speaker identifier from conference Hall */
    conferenceHallId?: string;
    /** List of conferences where the speaker submitted a session */
    submittedConferenceIds: string[];
  };
}
