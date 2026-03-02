# TODO List

## Priority 1
- BilletWeb integration
  - Configuration (url, user, key, version, speaker ticket name, organizer ticket name)
  - Billetweb for speaker: Use API to create/delete the ticket of the speaker (https://www.billetweb.fr/bo/api.php#/api/event/:id/add_order)
  - Billetweb for organiser: Use API to create/delete the ticket of the organiser
- Cancel speaker.
- Speaker edit: when changing a speaker's unavailability, deallocate sessions from slots where the speaker is unavailable.

## Priority 2
- Default color list for tracks and session types.
- Dark theme.
- Drop Conference Hall dependency
  - Session submission by speakers
  - Session evaluation
  - Send emails via Mailjet
- Operations: planning organizer actions during the conference.
