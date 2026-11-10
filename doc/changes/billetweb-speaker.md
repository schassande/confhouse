# Billetweb Speaker Ticket Management

Last updated: 2026-11-10

## Objective

Manage Billetweb tickets for conference speakers through the existing server-side Billetweb integration. Administrators must be able to create, update, and delete a speaker ticket, create missing tickets in bulk, inspect ticket information, and automatically remove a ticket when a speaker is removed from their last session.

## Scope

### In scope

- Use `BilletwebConfig.ticketTypes.speaker.ticketTypeId` as the configured Billetweb ticket type for speakers.
- Represent the persisted ticket with `ParticipantBilletWebTicket`.
- Add the ticket reference to `ConferenceSpeaker` through a `ticketId` field.
- Add ticket filtering and bulk creation to the speaker management page.
- Add ticket display and individual actions to the speaker edit page.
- Delete the speaker ticket when deleting a speaker who has no other session.

### Out of scope

- Changes to the Billetweb configuration screen or ticket type selection rules.
- Automatic ticket creation for speakers outside the explicit individual or bulk actions.
- Processing more than one speaker/ticket in a single server-function invocation.

## Functional requirements

1. The server-side implementation shall use Billetweb API operations to create, update, and delete one speaker ticket per invocation.
2. On successful ticket creation or deletion, persist the `ParticipantBilletWebTicket.id` in `ConferenceSpeaker.ticketId`.
3. The speaker management page shall provide an in-memory filter with the values `With ticket`, `Without ticket`, and `All`.
4. The speaker management page shall provide a bulk action that creates tickets for the currently filtered speakers who do not have a ticket.
5. Bulk creation shall remain synchronous from the user perspective and shall execute at most 10 server-function calls in parallel, with one call per speaker.
6. When the speaker ticket configuration contains a valid `ticketTypeId`, the speaker edit page shall display a `Ticket` tab.
7. The `Ticket` tab shall display the ticket identifiers, management URL, and ticket download URL when available.
8. The `Ticket` tab shall provide `Create`, `Update`, and `Delete` actions for the speaker ticket.
9. When a speaker is removed from a session and has no other session, the system shall delete both the `ConferenceSpeaker` record and its Billetweb ticket.

## Business rules

- A speaker ticket is associated with the configured speaker ticket type from `BilletwebConfig.ticketTypes.speaker.ticketTypeId`.
- A ticket is considered present for speaker filtering when `ConferenceSpeaker.ticketId` references a persisted ticket.
- Bulk creation applies only to the speakers selected by the current in-memory filter and only to speakers without a ticket.
- The server function is responsible for validating the speaker and conference context rather than trusting a frontend-only ticket reference.
- Ticket deletion must not leave a dangling `ConferenceSpeaker.ticketId`.

## User interface and workflow

### Speaker management page

- Add the three-state ticket filter (`With ticket`, `Without ticket`, `All`).
- Apply the filter in memory to the already displayed speaker list.
- Add a mass-action bar with a button to create tickets for filtered speakers without tickets.
- Keep the mass operation synchronous and expose success and failure feedback consistent with existing speaker management actions.

### Speaker edit page

- Show the ticket tab only when a valid speaker ticket type is configured.
- Display all available ticket identifiers and links.
- Provide individual create, update, and delete actions.
- Display `Create` only when no ticket exists; display `Update` and `Delete` only when a ticket exists. Disable the relevant actions while an operation is running.
- Refresh the displayed speaker and ticket data after each successful action.

### Session edit page

- When removing a speaker from a session, determine whether another session still references that speaker.
- If no other session exists, delete the speaker ticket and the speaker projection.

## Data model and persistence

- Extend `ConferenceSpeaker` with an optional `ticketId?: string` field.
- The field stores the Firestore document identifier of a `ParticipantBilletWebTicket`.
- Update `doc/datamodel.md` to document the new field and its referential constraint.
- Reuse the existing `ParticipantBilletWebTicket` fields and ticket status model; no new ticket collection is required.
- Existing `ConferenceSpeaker` documents without `ticketId` remain valid and represent speakers without a ticket.

## Errors, validation, and permissions

- Validate the conference, speaker, ticket configuration, and ticket ownership on the server before changing Billetweb or Firestore data.
- Reject ticket creation when the speaker ticket type is absent or invalid.
- Consider the speaker ticket type valid when its trimmed value is non-empty; no additional Billetweb catalogue lookup is required before displaying the tab or authorizing an action.
- Handle Billetweb API failures without persisting a successful-looking local ticket reference.
- If `ConferenceSpeaker.ticketId` references a missing ticket document, report the inconsistency and do not create a replacement implicitly.
- Handle partial failures during bulk creation and report which speaker operations failed.
- Preserve tickets created successfully during bulk creation; do not perform a global rollback. Report a summary of successful and failed speaker operations, identifying failures per speaker.
- Display individual action errors using the existing application feedback conventions.
- Use the same authorization boundary as the existing administrator speaker-management and sponsor-ticket operations.
- Exact error messages, retry behavior, and confirmation dialogs: To be clarified.

## Compatibility and migration

- This is a backward-compatible additive data-model change: `ConferenceSpeaker.ticketId` is optional.
- No migration is required for existing speaker documents; missing fields mean no ticket is linked.
- Existing sponsor Billetweb ticket workflows must remain unchanged.

## Technical specifications

- Add dedicated server HTTP functions for speaker ticket create/update/delete, reusing the existing Billetweb client and ticket persistence helpers where their contracts match.
- Follow the sponsor ticket integration conventions: use the speaker first name, last name, and email; use the configured speaker ticket name/type; reuse the shared Billetweb create/update client operations; and persist the returned ticket fields. Speaker tickets do not submit sponsor-specific activity field inputs.
- Each public function shall process exactly one speaker/ticket request.
- Add typed frontend service methods and typed request/response contracts for the speaker ticket operations.
- Implement bulk creation with a bounded concurrency of 10 and await all filtered operations before completing the UI action.
- Update shared speaker models, Firestore mapping, speaker list/edit components, session-removal workflow, and related tests.
- Add JSDoc for new public functions, interfaces, type definitions, and reusable service contracts.
- Review and update the relevant documentation, including `doc/datamodel.md` and Billetweb integration documentation.

## Acceptance criteria

- An administrator can create, update, and delete one speaker ticket from the speaker edit page when a valid speaker ticket type is configured.
- Successful operations display the expected Billetweb identifiers and links and persist or clear `ConferenceSpeaker.ticketId` correctly.
- The speaker list can be filtered by ticket presence without a new server query.
- Bulk creation creates tickets only for filtered speakers without tickets, uses no more than 10 concurrent calls, waits for completion, and reports failures.
- The ticket tab is hidden when the speaker ticket type is not configured or invalid.
- Removing a speaker from their last session deletes both the speaker projection and linked Billetweb ticket.
- Existing speakers without `ticketId` continue to load and can receive a ticket.
- Existing sponsor ticket workflows and tests remain unaffected.

### List of new tests

- Shared model and Firestore mapping tests for optional `ConferenceSpeaker.ticketId`.
- Server tests for speaker ticket create, update, delete, validation, authorization, and Billetweb failure handling.
- Frontend tests for ticket filtering, ticket-tab visibility, individual actions, and refresh behavior.
- Bulk-action tests proving filtering, bounded concurrency of 10, synchronous completion, and partial-failure reporting.
- Session-removal tests proving ticket deletion only when no other session remains.
- Regression tests for existing sponsor ticket operations.

## Open decisions

- None.

## Spec analysis

### Readiness

Ready for implementation

### Summary

The requested workflow is sufficiently specified and aligns with the existing Billetweb ticket integration. The sponsor implementation confirms the identity payload, shared API operations, returned ticket fields, and persistence conventions. Remaining implementation details can follow existing application conventions without changing the functional contract.

### Verified impacts

| Area | Evidence | Expected impact |
|---|---|---|
| Shared model | `shared/src/model/speaker.model.ts`, `shared/src/model/billetweb-config.ts` | Add optional `ConferenceSpeaker.ticketId` and reuse `ParticipantBilletWebTicket`. |
| Server integration | `functions/src/ticket/billetweb/client.ts`, `functions/src/ticket/sponsor/` | Add speaker-specific one-ticket handlers and reuse common Billetweb operations. |
| Frontend | `frontend/src/app/pages/conference/conference-speaker-edit/` and speaker management components | Add filter, ticket tab, actions, service contracts, and state refresh. |
| Session workflow | `functions/src/conference/speakers/session-action.ts` and related frontend service | Trigger ticket deletion when the last session reference is removed. |
| Documentation | `doc/datamodel.md`, Billetweb documentation | Document the new persisted reference and workflow. |

### Remaining assumptions

- Existing administrator authorization and Billetweb credential handling are reused.
- Existing ticket status and URL fields are sufficient for the speaker UI.
- Speaker ticket creation follows the sponsor conventions: first name, last name, email, configured ticket name/type, shared Billetweb client operations, and persistence of the returned ticket fields.

### Recommended implementation breakdown

1. Extend the shared model and persistence documentation.
2. Implement and test server-side speaker ticket operations.
3. Implement speaker edit-page ticket actions and display.
4. Implement speaker-list filtering and bounded bulk creation.
5. Integrate last-session speaker cleanup.
6. Run shared, server, frontend, and regression tests.

### Recommended checks

- Verify Firestore read/write behavior for old and new `ConferenceSpeaker` documents.
- Verify Billetweb API failure rollback/consistency behavior.
- Verify bulk concurrency never exceeds 10.
- Verify deletion does not remove a ticket while another session still references the speaker.
- Verify documentation remains consistent with the final contracts.

