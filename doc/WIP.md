# Sponsor Evolution Work Plan

This document tracks the implementation plan and current progress for the sponsor evolutions requested on 2026-03-14.

## Current Status

- Current step: implementation completed for backend, frontend, and documentation updates; verified with local builds/tests.
- Last update: 2026-03-14
- Resume point: if needed, continue with manual end-to-end validation against a real Firebase project and production-like data.

## Requested Evolutions

1. Sponsor chooses their preferred email communication language from the sponsor registration form.
2. All sponsor emails and attached generated documents must use that sponsor-selected language.
3. Sponsor can download previously emailed documents from their sponsorship self-service page, with on-demand regeneration and no document storage.
4. When a sponsor is accepted, assign a number using `Conference.sponsoring.counter`, then derive accounting document order/invoice number as `<edition>-<numero>` with 2 digits.
5. Sponsor can define their own `Purchase Order` string from their information system; it must appear in order form and invoice when provided.
6. Conference sponsorship configuration can define one CC email; all sponsor communications must include it in CC.
7. Conference sponsorship configuration can define bank details (`IBAN`, `BIC`); order form must show them at the bottom when provided.

## Proposed Delivery Order

### 1. Data model and documentation alignment

- Extend `Conference.sponsoring` with:
  - `counter`
  - `ccEmail`
  - `bankDetails.iban`
  - `bankDetails.bic`
- Extend `Sponsor` with:
  - `communicationLanguage`
  - `purchaseOrder`
  - `acceptedNumber`
- Extend sponsor/document backend DTOs to carry:
  - communication locale
  - purchase order
  - computed document number
  - optional bank details
- Update sponsor documentation in:
  - `doc/sponsor.md`
  - `doc/datamodel.md` if needed

### 2. Backend business services

- Extract or extend sponsor business logic in backend services/helpers for:
  - sponsor locale resolution
  - sponsor acceptance numbering
  - document number computation
  - email recipient computation including CC
  - document payload generation
- Ensure numbering is assigned atomically when sponsor becomes accepted.
- Keep business logic out of Angular components.

### 3. Backend document/email pipeline

- Make sponsor email actions derive locale from sponsor data instead of organizer UI language.
- Localize:
  - email subject
  - email body
  - PDF labels/content
- Inject purchase order and bank details into generated payload/templates.
- Add sponsor-facing backend endpoints/actions to regenerate and download:
  - order form
  - invoice

### 4. Frontend sponsor self-service

- Update sponsor registration/configuration form to expose:
  - communication language selector
  - purchase order field
- Add download actions for generated documents on the sponsor self-service page.
- Use PrimeNG widgets only.
- Keep components thin and move business/data orchestration to Angular services.

### 5. Frontend organizer configuration

- Update sponsorship configuration screen to expose:
  - CC email
  - counter
  - bank IBAN
  - bank BIC
- Preserve existing sponsorship settings.

### 6. Tests and verification

- Update backend unit tests for:
  - numbering rules
  - localized payload generation
  - optional purchase order rendering
  - optional bank details rendering
  - CC recipient handling
- Update frontend tests if present, otherwise run targeted build/tests.

## Open Questions To Resolve Before Coding

- Which sponsor statuses count as "accepted" for numbering purposes:
  - only `CONFIRMED`
  - or also `WAITING_LIST`
- Must the acceptance number be assigned only once and then never change, even if the sponsor goes back to `CANDIDATE` or `CANCELED` and is later reconfirmed?
- Should sponsor communication language be limited to the conference languages, or strictly to the currently implemented document locales (`fr`, `en`)?
- Which documents must be downloadable from the sponsor page:
  - order form only
  - invoice only
  - both order form and invoice
- For sponsor-side download authorization, should any admin email on the sponsor be allowed to regenerate/download the documents?

## Implementation Notes

- Existing code currently passes locale from organizer UI to backend email/document actions. This will need to be inverted so locale comes from the sponsor record.
- Existing document templates only support `fr` and `en`.
- Existing Mailjet payload currently supports `To` only; CC support will require extending the mail contract and Mailjet request mapping.
- Sponsor self-service currently writes directly to Firestore through the generic save service; if acceptance numbering must be protected from sponsor-side writes, organizer-only transitions must remain backend-controlled.

## Progress Log

### 2026-03-14

- Reviewed current sponsor models, Angular sponsor pages, sponsor backend actions, Mailjet layer, and document builders/templates.
- Implemented shared model changes for:
  - sponsor communication language
  - sponsor purchase order
  - sponsor accepted number
  - conference sponsorship counter
  - conference sponsor CC email
  - conference bank details
- Implemented backend business/services changes for:
  - immutable acceptance number allocation on first `CONFIRMED`
  - accounting document number derivation `<edition>-<numero>`
  - sponsor-locale-based email/document generation
  - sponsor-side regenerated order form/invoice download endpoints
  - CC support in Mailjet payload
- Updated PDF payload builders and templates to include:
  - purchase order
  - bank details on order form
  - computed document number
- Updated Angular sponsor screens:
  - sponsor self-service page exposes language and purchase order
  - sponsor self-service page can download already sent documents
  - organizer sponsor config page exposes counter, CC email, IBAN, BIC
  - organizer sponsor manage page shows/edits language and purchase order and displays accepted number
- Updated documentation in `doc/sponsor.md` and `doc/datamodel.md`.
- Verification completed:
  - `functions`: `npm run build`
  - `functions`: `npm test`
  - `frontend`: `npm run build`
