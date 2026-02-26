# TODO List

## Priority 1
- Voxxrin publication: 
  - Waiting for Voxxrin details to get an env to use a single crawler with an online config file (Firebase Storage). File is already produced.
  - Tu peux trigger le crawling sur l'environnement de démo :
  curl --request POST --url 'https://api-demo.voxxr.in/api/crawlers/snc27-test/refreshScheduleRequest?token=eventOrganizer%3Asnowcamp%3A9f378527-a5ec-46ac-95ab-c1107d98ed5e'
  - L'event est visible dans les "past events" ici : https://app-demo.voxxr.in/event-selector (date au 03-05 fevrier 2026 au lieu du 13-16 janvier 2027 ;-))

- Page home pour les speakers

- Cancel speaker.

- Speaker edit: when changing a speaker's unavailability, deallocate sessions from slots where the speaker is unavailable.

- talk statistics
  - Download from Voxxrin: Public events: GET {{baseUrl}}/api/events/{{eventId}}/talksStats?token={{secretToken}}
  - show statistics result in session-allocation

- Show ratings for speaker:
  - GET {{baseUrl}}/api/events/{{eventId}}/dailyRatings/stats?token={{secretToken}}
  - GET {{baseUrl}}/api/events/{{eventId}}/talks/{{talkId}}/feedbacks?token={{secretToken}}&updatedSince={{updatedSinceISODatetime}}
  - GET {{baseUrl}}/api/events/{{eventId}}/talksEditors?token={{secretToken}}&baseUrl={{voxxrinInstanceBaseUrl}}


## Priority 2
- Default color list for tracks and session types.
- Dark theme.
- Drop Conference Hall dependency
  - Session submission by speakers
  - Session evaluation
  - Send emails.
- Operations: planning organizer actions during the conference.
