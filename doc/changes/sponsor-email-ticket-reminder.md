# Sponsor ticket email notification and reminder

Last updated: 2026-10-19

## Objective

Allow conference administrators to notify sponsors when sponsor ticket self-service opens and to remind sponsors who have not created all their allocated tickets.

Emails must be sent through the existing backend Mailjet integration using templates configured per sponsorship level.

## Scope

### In scope

- Add `Conference.sponsoring.ticketStartDate`.
- Add Mailjet template identifiers for ticket-opening notifications and ticket reminders to `SponsorType.templateEmail`.
- Add organizer actions for one sponsor or all eligible sponsors.
- Add ticket-status filtering, badges, and summary statistics to sponsor management.
- Show per-sponsor ticket email actions and last-send dates in the sponsor ticket tab.
- Record successful ticket notification and reminder emails in sponsor business history.
- Maintain persisted `Sponsor.allTicketsCreated` derived from quotas and `participantTicketIds`.

### Out of scope

- Changing the existing BilletWeb ticket creation workflow.
- Replacing Mailjet or introducing another email provider.
- Defining Mailjet template content beyond variables required by the existing sponsor email integration.

## Functional requirements

1. When the ticket self-service window is open, an administrator can send a ticket-opening notification to one sponsor or all eligible sponsors.
2. When the window is open, an administrator can send a ticket reminder to one sponsor or all eligible sponsors that have not created all allocated tickets.
3. Ticket emails are sent by the backend through Mailjet using the sponsor type template.
4. The sponsor list provides a filter for sponsors whose `allTicketsCreated` is `TODO`.
5. The sponsor list displays a `Tickets` badge when `allTicketsCreated` is `DONE`.
6. The sponsor list displays the number of sponsors with `allTicketsCreated = TODO`.
7. The sponsor ticket tab provides separate notification and reminder actions and displays the last successful send date for each email type.

## Business rules

- The ticket self-service window is open when `ticketStartDate` is today or earlier. The exact timezone and date representation are to be clarified.
- Only conference administrators can trigger these actions.
- The reminder targets sponsors that have not created all allocated tickets.
- Successful sends record `TICKET_OPENED` or `TICKET_REMINDER` in `Sponsor.businessEvents`.
- Failed sends must not create success events or update last-send projections.
- `allTicketsCreated` is recalculated whenever a sponsor ticket is created or deleted.
- Values are `NO_TICKET`, `TODO`, and `DONE`.
- `NO_TICKET` means the sponsor has no ticket quota.
- `TODO` means the sponsor has at least one quota and has not created all allocated tickets, including the case where zero tickets have been created.
- `DONE` means all tickets authorized by the sponsor type are created.
- Authorized count comes from `SponsorType.conferenceTicketQuotas`; created count comes from `Sponsor.participantTicketIds` and referenced `ParticipantBilletWebTicket` records.

## User interface and workflow

On the sponsor management page, when the window is open, administrators see:

- `Notify tickets available`, sending the opening notification according to the final bulk-action rule.
- `Remind tickets`, sending reminders to sponsors who have not created all tickets.
- A filter for `allTicketsCreated = TODO`.
- A `Tickets` badge for `allTicketsCreated = DONE`.
- A statistic for sponsors with `allTicketsCreated = TODO`.

On the sponsor edit page ticket tab, administrators see an opening-notification action and last-send date, plus a reminder action and last-send date.

If a template or recipient email is missing, that sponsor is skipped, the failure is logged, and other eligible sends continue.

## Data model and persistence

Required changes:

- `Conference.sponsoring.ticketStartDate?: string`.
- `SponsorTypeTemplateEmail.emailTicketOpenedTemplateId?: string`.
- `SponsorTypeTemplateEmail.emailTicketReminderTemplateId?: string`.
- `SponsorBusinessEventType` values `TICKET_OPENED` and `TICKET_REMINDER`.
- `Sponsor.allTicketsCreated: 'NO_TICKET' | 'TODO' | 'DONE'`.
- Persisted projections `Sponsor.ticketOpenedEmailSentAt?: string` and `Sponsor.ticketReminderEmailSentAt?: string` for the last successful send of each email type.

The existing `Sponsor.businessEvents` history remains the audit source. Projection timestamps are updated only after a successful send.

## Errors, validation, and permissions

- Backend endpoints validate conference, sponsor, administrator authorization, sponsor type, ticket opening date, recipient addresses, and Mailjet template before sending.
- The backend recomputes eligibility from persisted data.
- Errors must not expose Mailjet credentials or sensitive provider details.
- Bulk sends continue after individual failures and return a per-sponsor summary of successes, skipped sponsors, and failures.

## Compatibility and migration

- Conferences without `ticketStartDate` retain current behavior until configured.
- Sponsor types without new template identifiers remain readable.
- Existing sponsors require a migration or lazy/backfill strategy for `allTicketsCreated` and new send-date projections.
- Existing sponsor email workflows remain compatible.

## Technical specifications

- Reuse existing sponsor Mailjet template resolution and backend communication services.
- Add typed backend actions under the existing sponsor communication area; keep handlers small and authorize in the backend.
- Recalculate `allTicketsCreated` in the ticket create/delete workflows using quotas and persisted ticket references.
- Update shared models, backend mappings, frontend models, translations, and Firestore/documentation contracts.
- Add tests for date gating, authorization, eligibility, event/projection updates, single sends, bulk sends, partial failures, missing configuration, and ticket create/delete recalculation.

## Acceptance criteria

- An administrator cannot trigger either action before the configured opening date.
- An administrator can send each email type to one eligible sponsor and the successful send is visible in history.
- Bulk actions send only to eligible sponsors and report failures according to the specified policy.
- The correct sponsor-type Mailjet template is selected.
- Filter, badge, and TODO statistic reflect persisted ticket state.
- `allTicketsCreated` remains correct after ticket creation and deletion.
- Last successful send dates do not advance on failed sends.
- Non-administrators cannot invoke the actions.
- Existing sponsor email workflows continue to work.

### List of new tests

- Ticket opening date gate and boundary tests.
- Administrator authorization tests.
- Template resolution tests for both new email types.
- Quota/status tests for `NO_TICKET`, `TODO`, and `DONE`.
- Ticket create/delete recalculation tests.
- Single-send success/failure tests.
- Bulk eligibility, partial-failure, and retry tests.
- Business-event and last-send projection tests.
- Frontend filter, badge, statistic, accessibility, and error-state tests.

## Open decisions

- `ticketStartDate` uses ISO `YYYY-MM-DD` and is compared in the conference timezone.
- Bulk actions target all eligible sponsors automatically; they do not depend on list selection.
- Reminders are sent only when `allTicketsCreated = TODO`; sponsors with `NO_TICKET` are excluded.
- `TODO` includes both zero-ticket and partial completion.
- Missing template or recipient: skip and log the sponsor-level failure; continue other sends.

## Spec analysis

### Readiness

Ready for implementation

### Summary

The feature adds ticket-opening and reminder emails, date gating, persisted ticket-completion state, organizer list indicators, and audit/projection updates. All required behavior decisions were resolved during analysis.

### Verified impacts

| Area | Evidence | Expected impact |
|---|---|---|
| Shared model | `shared/src/model/sponsor.model.ts` | Add template identifiers, event types, completion state, and send-date projections. |
| Sponsor backend | `functions/src/sponsor/communication/` and existing Mailjet helpers | Add authorized single/bulk actions, eligibility, event recording, projections, and per-sponsor results. |
| Ticket backend | `functions/src/ticket/sponsor/` | Recalculate `allTicketsCreated` after ticket creation and deletion. |
| Frontend | `frontend/src/app/pages/sponsor/sponsor-manage/` and sponsor edit ticket UI | Add actions, filter, badge, statistic, dates, translations, and error reporting. |
| Documentation | `doc/sponsor.md`, `doc/datamodel.md`, and Mailjet documentation | Document fields, workflows, endpoints, and configuration. |

### Remaining assumptions

- The conference timezone is available through the existing conference/platform configuration.
- Existing sponsor email recipients and administrator authorization helpers are reusable.

### Recommended implementation breakdown

1. Extend shared models and persisted-data documentation.
2. Add date and template configuration support.
3. Add ticket eligibility and completion-state helpers.
4. Implement single/bulk backend actions with authorization, Mailjet, history, projections, and results.
5. Integrate recalculation into ticket create/delete workflows.
6. Add organizer UI actions, indicators, timestamps, translations, and error reporting.
7. Add backend/frontend tests and verify existing sponsor email workflows.

### Recommended checks

- Run backend tests for date boundaries, authorization, quota states, failures, and bulk summaries.
- Run frontend tests and compile checks for sponsor management and ticket screens.
- Verify compatibility for existing conferences and sponsors.
- Verify Mailjet configuration and the conference-timezone boundary.
- Confirm `doc/sponsor.md` and `doc/datamodel.md` match the final persisted fields.
