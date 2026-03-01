# TODO List

## Priority 1
- Show ratings for speaker:
  - GET {{baseUrl}}/api/events/{{eventId}}/dailyRatings/stats?token={{secretToken}}
  - GET {{baseUrl}}/api/events/{{eventId}}/talks/{{talkId}}/feedbacks?token={{secretToken}}&updatedSince={{updatedSinceISODatetime}}
  - GET {{baseUrl}}/api/events/{{eventId}}/talksEditors?token={{secretToken}}&baseUrl={{voxxrinInstanceBaseUrl}}
- page config voxxrin: bouton de retour vers voxxrin publish
- Cancel speaker.
- Speaker edit: when changing a speaker's unavailability, deallocate sessions from slots where the speaker is unavailable.

## Priority 2
- Default color list for tracks and session types.
- Dark theme.
- Drop Conference Hall dependency
  - Session submission by speakers
  - Session evaluation
  - Send emails.
- Operations: planning organizer actions during the conference.
