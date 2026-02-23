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
  backgroundUrl?: string;

  /** Optional theme configuration specific to Voxxrin */
  theming?: VoxxrinThemingConfig;

  /** Optional feature flags and rating configuration */
  features?: VoxxrinFeaturesConfig;
}

export interface VoxxrinLocationConfig {
  country?: string;
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
/*
{
  "title": "Séminaire 4SH 2024",
  "headingTitle": "Séminaire 24",
  "headingSubTitle": null,
  "headingBackground": null,
  "description": "Une journée de partage",
  "days": [
    {
      "id": "jeudi",
      "localDate": "2024-06-06"
    },
    {
      "id": "vendredi",
      "localDate": "2024-06-07"
    }
  ],
  "timezone": "Europe/Paris",
  "keywords": [],
  "location": {
    "country": "France",
    "city": "Montréal (32250)",
    "address": "Domaine de Saint-Orens",
    "coords": {
      "latitude": 43.95077142518287,
      "longitude": 0.21110246870549704
    }
  },
  "peopleDescription": "100+ participants",
  "backgroundUrl": "https://res.cloudinary.com/du7q1xw75/image/upload/v1716939222/jthj59ixhdmfqgelmf0k.jpg",
  "logoUrl": "https://res.cloudinary.com/du7q1xw75/image/upload/v1716939369/yt2sh1nbs8php3akuzvl.png",
  "theming": {
    "colors": {
      "primaryHex": "#ED203D",
      "primaryContrastHex": "#ffffff",
      "secondaryHex": "#434446",
      "secondaryContrastHex": "#ffffff",
      "tertiaryHex": "#7B6AA7",
      "tertiaryContrastHex": "#ffffff"
    },
    "headingCustomStyles": null,
    "headingSrcSet": null,
    "customImportedFonts": null
  },
  "features": {
    "favoritesEnabled": false,
    "showInfosTab": true,
    "roomsDisplayed": true,
    "showRoomCapacityIndicator": false,
    "remindMeOnceVideosAreAvailableEnabled": false,
    "ratings": {
      "scale": {
        "enabled": true,
        "icon": "star",
        "labels": [
          "Je me suis endormi",
          "Passable",
          "C'était intéressant !",
          "La meilleure présentation de ma vie 🤩"
        ]
      },
      "bingo": {
        "enabled": true,
        "choices": [
          {
            "id": "too-long",
            "label": "C'était trop long"
          },
          {
            "id": "interesting",
            "label": "C'était intéressant"
          },
          {
            "id": "amazing-speakers",
            "label": "Les orateurs/rices était captivant(e)S"
          },
          {
            "id": "good-moment",
            "label": "J'ai passé un bon moment"
          }
        ]
      },
      "free-text": {
        "enabled": false,
        "maxLength": -1
      },
      "custom-scale": {
        "enabled": false,
        "choices": []
      }
    },
    "hideLanguages": []
  },
  "talkFormats": [
    {
      "id": "presentation50m",
      "title": "Présentation",
      "duration": "PT50m",
      "themeColor": "#165CE3"
    }
  ],
  "talkTracks": [
    {
      "id": "projects",
      "title": "Projets",
      "themeColor": "#EA7872"
    },
    {
      "id": "numbers",
      "title": "Chiffres",
      "themeColor": "#DA8DE0"
    }
  ],
  "supportedTalkLanguages": [
    {
      "id": "fr",
      "label": "FR",
      "themeColor": "#165CE3"
    }
  ],
  "rooms": [
    {
      "id": "room1",
      "title": "Un nom de room"
    },
    {
      "id": "hall",
      "title": "Hall"
    }
  ],
  "infos": {
    "floorPlans": [],
    "sponsors": [],
    "socialMedias": []
  },
  "formattings": {
    "talkFormatTitle": "with-duration",
    "parseMarkdownOn": []
  },
  "talks": [
    {
      "id": "1",
      "start": "2024-06-06T09:30:00+02:00",
      "end": "2024-06-06T10:20:00+02:00",
      "title": "Présentation des chiffres",
      "trackId": "numbers",
      "roomId": "room1",
      "formatId": "presentation50m",
      "langId": "fr",
      "assets": [],
      "summary": "",
      "tags": [],
      "speakers": [
        {
          "id": "xhn",
          "fullName": "Xavier Hanin",
          "photoUrl": "https://devoxxian-image-thumbnails.s3-eu-west-1.amazonaws.com/profile-be97eaa7-35a7-47cd-a206-1edf035dd483.jpeg",
          "companyName": "4SH",
          "bio": "",
          "social": []
        }
      ],
      "isOverflow": false
    }
  ],
  "breaks": [
    {
      "start": "2024-06-06T09:00:00+02:00",
      "end": "2024-06-06T09:30:00+02:00",
      "icon": "cafe",
      "title": "Petit dej'",
      "roomId": "hall"
    }
  ]
}
*/
