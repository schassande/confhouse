# TODO List

## Priority 1
- Activity with speaker & organizer : list the speakers and the organizers without answer
- RGPD
- BilletWeb integration
  - Billetweb for speaker: Use API to create/delete the ticket of the speaker (https://www.billetweb.fr/bo/api.php#/api/event/:id/add_order)
    - Store billetweb ticket in ConferenceSpeaker
    - In Speaker edition, add the view of the billetweb ticket (add/remove)
    - in Speaker list, 
      - add a filter of speaker with/without a ticket
      - Add an action to allocate a ticket to all speakers
    - When speaker/session removed/cancelled/... remove the ticket
  - Billetweb for organiser: Use API to create/delete the ticket of the organiser
  - Billetweb for sponsor: Use API to create/delete the ticket of the sponsor
- Edit Speaker: Cancel speaker by organizer
- Edit Speaker: s'assurer que la disponibilité est suffisante pour couvrir au moins un slot compatible pour chaque session du speaker.

## Priority 2
- Default color list for tracks and session types.
- Dark theme.
- Permit session su Conference Hall dependency
  - Session submission by speakers
  - Session evaluation
  - Send emails via Mailjet
- Operations: planning organizer actions during the conference.
