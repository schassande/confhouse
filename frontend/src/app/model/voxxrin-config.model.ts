import { PersistentData } from "./persistant.model";

/**
 * Voxxrin-only publication settings.
 * Do not duplicate data that already exists in other persistent entities:
 * - Conference: name/edition, description, dates/days, logo, languages, tracks, rooms, sessionTypes, sponsors
 * - Session/Allocation: schedule content
 */
export interface VoxxrinConfig extends PersistentData {
  /** Target conference for this publication config */
  conferenceId: string;

  /** Voxxrin API base URL (for example https://api-demo.voxxr.in) */
  baseUrl?: string;

  /** Voxxrin event identifier */
  eventId?: string;

  /** Optional family/category used by Voxxrin (ex: "devoxx") */
  eventFamily?: string;

  /** IANA timezone (ex: "Europe/Brussels") */
  timezone: string;

  /** Optional text for Voxxrin "people" page */
  peopleDescription?: string;

  /** Optional conference website shown in Voxxrin */
  websiteUrl?: string;

  /** Optional ticketing URL shown in Voxxrin */
  ticketsUrl?: string;

  /** Optional subtitle displayed in event header */
  headingSubTitle?: string;

  /** Optional CSS background used on event header */
  headingBackground?: string;

  /** Optional search keywords/tags for Voxxrin */
  keywords: string[];

  /** Optional extra location details not covered by Conference.location */
  location?: VoxxrinLocationConfig;

  /** Optional extra info tab content */
  infos?: VoxxrinInfosConfig;

  /** Optional social links for the event (deprecated location, use infos.socialMedias) */
  socialMedias?: VoxxrinSocialMedia[];

  /** Optional formatting settings for rendered content */
  formattings?: VoxxrinFormattingsConfig;

  /** Optional visual assets specific to Voxxrin */
  backgroundUrl: string;

  /** Optional theme configuration specific to Voxxrin */
  theming?: VoxxrinThemingConfig;

  /** Optional feature flags and rating configuration */
  features?: VoxxrinFeaturesConfig;
}

export interface VoxxrinLocationConfig {
  country: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface VoxxrinInfosConfig {
  eventDescription?: string;
  venuePicture?: string;
  address?: string;
  floorPlans?: VoxxrinFloorPlan[];
  socialMedias?: VoxxrinSocialMedia[];
}

export interface VoxxrinFloorPlan {
  label: string;
  pictureUrl: string;
}

export interface VoxxrinSocialMedia {
  type: string;
  href: string;
}

export interface VoxxrinFormattingsConfig {
  talkFormatTitle?: VoxxrinTalkFormatTitleMode;
  parseMarkdownOn?: VoxxrinMarkdownTarget[];
}

export type VoxxrinTalkFormatTitleMode = 'with-duration' | 'without-duration';

export type VoxxrinMarkdownTarget = 'speaker-bio' | 'talk-summary';

export interface VoxxrinThemingConfig {
  colors: VoxxrinThemeColors;
  headingSrcSet?: VoxxrinHeadingImageSource[];
  headingCustomStyles?: VoxxrinHeadingCustomStyles;
  customImportedFonts?: VoxxrinImportedFont[];
}

export interface VoxxrinHeadingImageSource {
  url: string;
  descriptor: string;
}

export interface VoxxrinHeadingCustomStyles {
  title?: string;
  subTitle?: string;
  banner?: string;
}

export interface VoxxrinImportedFont {
  provider: 'google-fonts';
  family: string;
}

export interface VoxxrinThemeColors {
  secondaryContrastHex?: string;
  tertiaryHex?: string;
  tertiaryContrastHex?: string;
  secondaryHex?: string;
  primaryHex?: string;
  primaryContrastHex?: string;
  light?: VoxxrinThemeColorSet;
  dark?: VoxxrinThemeColorSet;
}

export interface VoxxrinThemeColorSet {
  secondaryContrastHex?: string;
  tertiaryHex?: string;
  tertiaryContrastHex?: string;
  secondaryHex?: string;
  primaryHex?: string;
  primaryContrastHex?: string;
}

export interface VoxxrinFeaturesConfig {
  favoritesEnabled?: boolean;
  roomsDisplayed?: boolean;
  remindMeOnceVideosAreAvailableEnabled?: boolean;
  showInfosTab?: boolean;
  hideLanguages?: string[];
  showRoomCapacityIndicator?: boolean;
  ratings?: VoxxrinRatingsConfig;
  topRatedTalks?: VoxxrinTopRatedTalksConfig;
  recording?: VoxxrinRecordingConfig;
}

export interface VoxxrinRatingsConfig {
  scale?: VoxxrinScaleRatingConfig;
  bingo?: VoxxrinBingoRatingConfig;
  'free-text'?: VoxxrinFreeTextRatingConfig;
}

export interface VoxxrinScaleRatingConfig {
  enabled: boolean;
  icon?: string;
  labels?: string[];
}

export interface VoxxrinBingoRatingConfig {
  enabled: boolean;
  isPublic?: boolean;
  choices?: VoxxrinLabelChoice[];
}

export interface VoxxrinFreeTextRatingConfig {
  enabled: boolean;
  maxLength?: number;
}

export interface VoxxrinLabelChoice {
  id: string;
  label: string;
}

export interface VoxxrinTopRatedTalksConfig {
  minimumNumberOfRatingsToBeConsidered?: number;
  minimumAverageScoreToBeConsidered?: number;
  numberOfDailyTopTalksConsidered?: number;
}

export interface VoxxrinRecordingConfig {
  platform?: string;
  youtubeHandle?: string;
  ignoreVideosPublishedAfter?: string;
  recordedFormatIds?: string[];
  notRecordedFormatIds?: string[];
  recordedRoomIds?: string[];
  notRecordedRoomIds?: string[];
  excludeTitleWordsFromMatching?: string[];
}
