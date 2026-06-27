# Sponsor manager notification on sponsor creation

Date: 2026-06-26

## Summary

The application sends an internal Mailjet notification to the sponsor manager when a new sponsor document is created.

The notification is independent from the sponsor-facing application confirmation email.

## Functional Decisions

- The trigger is the creation of a new `Sponsor` document in Firestore.
- Only initial creation sends the notification.
- Updates to an existing sponsor do not send this notification.
- The notification is asynchronous and does not block sponsor registration.
- Mailjet failures are logged but are not visible to the sponsor and do not rollback registration.
- No `SponsorBusinessEvent` is recorded for this notification.
- No additional application idempotency is required beyond the Firestore `onCreate` trigger.
- The email content is rendered by a Mailjet template.
- The Mailjet template contains the FR and EN wording.
- The notification is independent from `SPONSOR_APPLICATION_CONFIRMATION`.

## Recipient

The recipient is `Conference.sponsoring.email`.

`Conference.sponsoring.ccEmail` remains reserved for copies of sponsor communications and is not used as the notification recipient.

If `Conference.sponsoring.email` is missing or empty, the backend logs the configuration issue and skips the notification.

## Template

`SponsorTypeTemplateEmail` now supports:

```ts
interface SponsorTypeTemplateEmail {
  emailManagerNotificationTemplateId?: string;
}
```

The template is resolved from the `SponsorType` matching `Sponsor.sponsorTypeId` in `Conference.sponsoring.sponsorTypes[]`.

If no template is configured, the backend logs the configuration issue and skips the notification. There is no server-rendered fallback for this internal notification.

## Mailjet Variables

The backend sends these variables to the Mailjet template:

- `conferenceName`
- `conferenceEdition`
- `sponsorId`
- `sponsorName`
- `sponsorTypeId`
- `sponsorTypeName`
- `submissionDate`
- `sponsorAdminUrl`

`submissionDate` uses `Sponsor.registrationDate` when present, otherwise the backend processing time.

`sponsorAdminUrl` is built from the server `ADMIN_BASE_URL` environment variable and the route:

```text
/conference/{conferenceId}/sponsors/manage/{sponsorId}
```

If `ADMIN_BASE_URL` is missing or empty, the backend logs the configuration issue and skips the notification.

## Implementation

- Shared model:
  - `shared/src/model/sponsor.model.ts`
  - added `SponsorTypeTemplateEmail.emailManagerNotificationTemplateId`

- Frontend:
  - `frontend/src/app/pages/sponsor/sponsor-config/sponsor-config.component.ts`
  - `frontend/src/app/pages/sponsor/sponsor-config/sponsor-config.component.html`
  - `frontend/src/assets/i18n/fr.json`
  - `frontend/src/assets/i18n/en.json`
  - added configuration field for the manager notification template

- Backend:
  - `functions/src/sponsor/communication/notify-manager-on-sponsor-create.ts`
  - `functions/src/index.ts`
  - added Firestore `onDocumentCreated` trigger exported as `notifyManagerOnSponsorCreate`
  - reused `MailjetService`, `MAILJET_SECRETS`, and `TransactionalEmailPayload`
  - no direct Mailjet API call was added outside the existing service

- Tests:
  - `functions/src/tests/sponsor-manager-notification.test.ts`
  - covers admin URL construction and Mailjet payload variables

- Documentation:
  - `doc/sponsor.md`
  - `doc/datamodel.md`
  - `doc/mailjet.md`
  - `doc/dev.md`

## Verification

- `npm --prefix functions test`
- `npm --prefix frontend run build`
