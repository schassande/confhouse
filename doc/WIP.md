# Sponsor and Mailjet Implementation Plan

This document defines how the current specifications will be implemented in the codebase.

It is an implementation working document.
It translates the specifications from:

- `doc/sponsor.md`
- `doc/mailjet.md`
- `doc/datamodel.md`

into concrete technical work items, architecture decisions, and delivery steps.

## Goals

The implementation must achieve the following:

- keep sponsor configuration in `Conference.sponsoring`
- keep sponsor records in the `sponsor` collection
- support the sponsor lifecycle and payment lifecycle defined in `doc/sponsor.md`
- support sponsor business history through `Sponsor.businessEvents`
- support sponsor email sending through explicit backend actions
- support Mailjet as the generic transactional email service
- keep document generation and sending on the backend

## Implementation Principles

The implementation will follow these rules:

- keep business rules explicit in backend actions
- avoid state-change side effects for document sending
- update sponsor history only after successful business actions
- keep frontend responsibilities limited to user interaction and form editing
- keep backend responsibilities focused on authorization, orchestration, document generation, and persistence

## Target Workstreams

Implementation is split into six workstreams:

1. data model alignment
2. sponsor backend actions
3. generic Mailjet backend layer
4. document generation layer
5. sponsor back-office UI
6. sponsor self-service UI hardening

## Workstream 1: Data Model Alignment

### 1.1 Extend `Sponsor` TypeScript model

File:

- `frontend/src/app/model/conference.model.ts`

Changes:

- add `businessEvents?: SponsorBusinessEvent[]`
- add `documents?: SponsorDocuments`
- add `logistics?: SponsorLogistics`
- add TypeScript types for:
  - `SponsorBusinessEvent`
  - `SponsorBusinessEventType`
  - `SponsorDocuments`
  - `SponsorLogistics`

Initial event types:

- `ORDER_FORM_SENT`
- `INVOICE_SENT`
- `PAYMENT_REMINDER_SENT`
- `BOOTH_ASSIGNED`
- `BOOTH_CHANGED`
- `TICKETS_ALLOCATED`

### 1.2 Keep Firestore schema backward compatible

Rules:

- all new sponsor fields are not optional because the database is empty

## Workstream 2: Sponsor Backend Actions

Implementation will add explicit backend actions for sponsor business operations.

These actions must live in Firebase Functions.

### 2.1 Initial sponsor actions

The first backend actions to implement are:

- `updateSponsorStatus`
- `updateSponsorPaymentStatus`
- `assignSponsorBooth`
- `allocateSponsorTickets`
- `sendSponsorOrderForm`
- `sendSponsorInvoice`
- `sendSponsorPaymentReminder`
- `sendSponsorApplicationConfirmation`
- `sendSponsorAdministrativeSummary`

### 2.2 Action design rules

Each action must:

1. authenticate the caller
2. verify organizer authorization for the conference
3. load the sponsor and conference records
4. validate business preconditions
5. execute the requested business change
6. write business events when required
7. persist the final sponsor state
8. return a usable result to the frontend

### 2.3 Event-writing helpers

Add a sponsor helper layer in `functions/src/` to centralize:

- event append logic
- projection updates
- status transition validation
- payment transition validation

Expected helper responsibilities:

- `assertAllowedSponsorStatusTransition(...)`
- `assertAllowedSponsorPaymentStatusTransition(...)`
- `appendSponsorBusinessEvent(...)`
- `applySponsorDocumentProjection(...)`
- `applySponsorLogisticsProjection(...)`

This avoids duplicating the same rules in multiple HTTP functions.

## Workstream 3: Generic Mailjet Backend Layer

Implementation will introduce a generic Mailjet backend layer that is not sponsor-specific.

### 3.1 Mail service

Add a reusable service in `functions/src/` for:

- loading Mailjet credentials from backend secrets
- sending one transactional email
- sending one transactional email with attachments
- returning technical delivery identifiers

Expected responsibilities:

- `sendTransactionalEmail(...)`
- `sendTransactionalEmailWithAttachments(...)`

### 3.2 Message payload contract

Define an internal payload contract independent from Mailjet request details.

The contract should include:

- `messageType`
- `subject`
- `recipients`
- `templateId` or template reference
- `variables`
- `attachments`
- `metadata`

This keeps Mailjet isolated behind one service boundary.

### 3.3 Send history persistence

Add one persistence layer for technical email traces.

Initial choice:

- create a `mail_history` collection

Each trace should include:

- `messageType`
- `conferenceId` when available
- `sponsorId` when available
- `recipientEmails`
- `status`
- `mailjetMessageId`
- `triggeredBy`
- `createdAt`
- `sentAt`
- `error`
- `idempotenceKey`

## Workstream 4: Document Generation Layer

Implementation will generate official sponsor documents on the backend.

### 4.1 Initial document types

The first document types to implement are:

- order form PDF
- invoice PDF

### 4.2 Payload builders

Add pure backend builders that transform Firestore data into stable document payloads.

Expected functions:

- `buildSponsorOrderFormPayload(...)`
- `buildSponsorInvoicePayload(...)`

Payload contents should include:

- conference data
- sponsor data
- sponsor type data
- issuer data
- recipient data
- line items
- totals
- dates
- document identifiers

### 4.3 PDF rendering

Add a backend PDF renderer using `pdfmake`.

Expected functions:

- `renderSponsorOrderFormPdf(...)`
- `renderSponsorInvoicePdf(...)`

Template management rules:

- generated document templates are owned by the backend codebase
- they are not managed in Mailjet
- they must be versioned with the application source code
- they must be deterministic for a given business payload
- they must remain controlled by the application and not editable as arbitrary external HTML

Rendering structure:

1. build a stable business payload
2. map that payload to a backend-controlled document template
3. render the final PDF with `pdfmake`

The template layer may be implemented as:

- direct `pdfmake` document-definition builders
- or a small intermediate controlled template structure mapped to `pdfmake`

The following rules apply:

- the business payload is the source of truth
- template modules define presentation structure, not business decisions
- document numbering, totals, dates, and legal content come from backend business logic, not from the template itself
- any template evolution must remain backward-auditable through source control

Expected file structure:

- one payload builder per document type
- one renderer per document type
- optional shared layout helpers for headers, totals, legal sections, and branding

Examples:

- `buildSponsorOrderFormPayload(...)` + `renderSponsorOrderFormPdf(...)`
- `buildSponsorInvoicePayload(...)` + `renderSponsorInvoicePdf(...)`

### 4.4 Controlled template source

If needed for readability, add an intermediate controlled template representation before `pdfmake`.

The template must remain:

- application-controlled
- backend-rendered
- deterministic

It must not introduce arbitrary HTML-to-PDF conversion.

### 4.5 Developer template preview and testing

Implementation must provide a practical developer workflow for iterating on generated document templates.

The goal is to let a developer:

- build a stable document payload from fixture data
- render the generated document locally
- inspect the output quickly
- verify that renderer changes do not silently break document structure

#### Local preview workflow

Add a local preview mechanism for each generated document type.

Initial preview targets:

- sponsor order form
- sponsor invoice

The workflow should be:

1. load a fixture payload or fixture source data
2. build the business payload with the real payload builder
3. render the final PDF locally
4. write the output to a local non-committed directory
5. let the developer inspect the generated file

#### Fixture strategy

Add fixture files for realistic sponsor scenarios.

Expected fixture categories:

- minimal sponsor order form
- sponsor order form with multiple line items
- minimal sponsor invoice
- sponsor invoice with reminder context

Fixture data should be stored in a predictable location, for example:

- `functions/src/dev/fixtures/`

#### Preview scripts

Add developer-facing scripts to generate PDFs locally.

Examples:

- `npm run preview:sponsor-order-form`
- `npm run preview:sponsor-invoice`

Generated outputs should be written to a local working directory such as:

- `functions/tmp/generated-documents/`

This directory should not be treated as source-controlled business data.

#### Optional debug rendering

If useful during implementation, add an optional debug renderer that outputs:

- the normalized business payload as JSON
- or a lightweight HTML/debug preview

This debug output is for developer iteration only.
It is not part of the production rendering contract.

#### Test coverage for templates

Template implementation must be tested at several levels.

Add tests for:

- payload builder correctness
- renderer document-definition structure
- core sections expected in the output

Expected checks include:

- header presence
- sponsor identity presence
- totals presence
- legal section presence
- deterministic formatting for a fixed fixture

#### Snapshot strategy

Prefer snapshot-style testing on:

- normalized payloads
- or `pdfmake` document-definition objects

Avoid over-relying on raw binary PDF snapshots unless stability is good enough, because binary diffs are harder to maintain.

#### Rule for template changes

Any significant document template change should be validated through:

- local preview generation
- automated tests on payload and rendering structure

This is required to keep generated documents safe to evolve without regressions.

## Workstream 5: Sponsor Back-office UI

The organizer UI must expose the business actions defined in the sponsor specification.

### 5.1 Sponsor management screen

Current base:

- `frontend/src/app/pages/sponsor/sponsor-manage/`

Planned additions:

- explicit action buttons for:
  - send order form
  - send invoice
  - send reminder
  - send application confirmation
  - send administrative summary
  - assign booth
  - allocate tickets
- event history display
- projection display for:
  - `documents`
  - `logistics`

### 5.2 UI behavior rules

The frontend must:

- never call Mailjet directly
- never fabricate success state locally
- refresh sponsor data after backend actions
- display action results from backend responses
- show failures without writing local fake state

## Workstream 6: Sponsor Self-service UI Hardening

The sponsor self-service form already exists and must be aligned with the specifications.

Current base:

- `frontend/src/app/pages/sponsor/sponsor-application/`

Planned hardening:

- enforce sponsorship period constraints
- keep sponsor-created records in `CANDIDATE`
- preserve organizer-only fields from sponsor-side edits
- keep booth preference updates consistent with `boothWishesDate`

## Authorization Model

Implementation will use two authorization modes:

- sponsor-side access
- organizer-side access

### Sponsor-side access

Sponsor-side actions are limited to:

- create or update own sponsor application
- edit own descriptive data
- update own booth wishes while allowed

Authorization source:

- authenticated user email
- match with `Sponsor.adminEmails`

### Organizer-side access

Organizer-side actions are required for:

- status changes
- payment status changes
- booth assignment
- ticket allocation
- all email sends

Authorization source:

- authenticated user
- organizer membership on the conference

## Transition Validation

Status changes and payment changes must be validated on the backend.

### Sponsor status validation

The backend must reject any transition not defined in `doc/sponsor.md`.

Examples:

- `CANDIDATE -> CONFIRMED` is allowed
- `CONFIRMED -> WAITING_LIST` is not allowed

### Payment status validation

The backend must reject any transition not defined in `doc/sponsor.md`.

Examples:

- `PENDING -> PAID` is allowed
- `PAID -> OVERDUE` is not allowed unless the specification is later extended

## Event and Projection Update Rules

The implementation must keep one clear rule:

- business events are written only when the corresponding action actually succeeds

Examples:

- successful invoice email -> add `INVOICE_SENT`
- failed invoice email -> do not add `INVOICE_SENT`
- successful booth assignment -> add `BOOTH_ASSIGNED` or `BOOTH_CHANGED`

Projection updates must follow the same rule:

- update `documents.invoiceSentAt` only after successful invoice send
- update `logistics.boothAssignedAt` only after successful booth assignment

## Idempotence Strategy

### Generic email idempotence

The Mailjet layer will accept an `idempotenceKey` from the calling domain and store it in `mail_history`.

### Sponsor document idempotence

The sponsor domain will compute keys for official document sends.

Initial rules:

- order form: one logical key per sponsor and document revision
- invoice: one logical key per sponsor and invoice identifier or billing revision
- reminder: resend allowed, but every send remains individually traced

The exact invoice numbering strategy can be finalized later without blocking the first implementation pass.

## Testing Strategy

Implementation must include tests at three levels.

### Unit tests

Add unit tests for:

- status transition validation
- payment transition validation
- business event append logic
- projection update logic
- document payload builders

### Integration tests

Add integration tests for:

- sponsor backend actions
- Mailjet service abstraction with mocked provider calls
- Firestore persistence of sponsor events and mail history

### UI tests

Add focused UI tests for:

- sponsor management actions
- sponsor application period restrictions
- refresh behavior after backend actions

## Delivery Order

The implementation order will be:

1. extend the TypeScript sponsor model
2. add backend validation helpers for status and payment transitions
3. add sponsor event and projection helper functions
4. add generic Mailjet service and `mail_history`
5. add order form and invoice payload builders and PDF renderers
6. add sponsor email backend actions
7. update sponsor management UI to trigger those actions
8. harden sponsor self-service UI rules
9. add tests and cleanup

## Out of Scope for First Pass

The following items are intentionally left out of the first implementation pass:

- arbitrary template editing by organizers
- generic document designer
- advanced Mailjet webhook exploitation
- large-scale migration of historical sponsor records
- full BilletWeb automation for sponsor tickets
- invoice numbering policy finalization beyond what is required for idempotence

## Expected Files to Touch

The implementation will likely affect:

- `frontend/src/app/model/conference.model.ts`
- `frontend/src/app/services/sponsor.service.ts`
- `frontend/src/app/pages/sponsor/sponsor-manage/*`
- `frontend/src/app/pages/sponsor/sponsor-application/*`
- `functions/src/common/*`
- `functions/src/http/*`
- `functions/src/` sponsor and mail services

Additional files may be created for:

- Mailjet service
- sponsor action handlers
- document payload builders
- PDF renderers
- test coverage

## Final Implementation Rule

The implementation must stay faithful to the specifications:

- `doc/mailjet.md` defines generic email behavior
- `doc/sponsor.md` defines sponsor business behavior
- `doc/datamodel.md` defines persistent data structure

When implementation choices are ambiguous, backend explicitness and auditability take priority over automation by side effect.
