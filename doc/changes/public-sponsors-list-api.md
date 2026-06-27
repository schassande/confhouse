# Public sponsors list API

Date: 2026-06-27

## Summary

Expose a public HTTP API that returns the confirmed sponsors of the current conference.

The endpoint is intended for public consumers, for example the conference website, and must not require authentication.

## Functional Need

External consumers need a stable JSON endpoint to display the sponsors already confirmed for the current conference.

The API must only expose sponsor data that is already intended to be public. It must not expose administrative fields, contact emails, payment data, document history, business events, ticket allocation, or internal workflow state.

## Endpoint

```text
GET /api/sponsors
```

The endpoint is public and open to everyone.

No request body is expected.

## Current Conference

The endpoint lists sponsors for the current conference only.

Implementation must reuse a shared current-conference resolver so future public APIs can share the same behavior.

Resolution order:

1. When platform single-conference mode is enabled, use `PlatformConfig.singleConferenceId`.
2. Otherwise, use the visible conference with the highest `Conference.edition`.

If the current conference cannot be resolved, the endpoint must return an explicit HTTP error instead of returning sponsors from another conference.

## Filtering Rules

Only sponsors matching all these conditions are returned:

- `Sponsor.conferenceId` matches the current conference id.
- `Sponsor.status` is exactly `CONFIRMED`.

Sponsors with any other status, including `POTENTIAL`, `CANDIDATE`, `WAITING_LIST`, `REJECTED`, or `CANCELED`, must not be returned.

## Response Contract

The response body is a JSON array.

```ts
interface PublicSponsorDto {
  name: string;
  sponsorTypeName: string;
  registrationDate?: string;
  description: {
    en: string;
    fr: string;
  };
  website: {
    en: string;
    fr: string;
  };
  logo: string;
  boothName?: string;
}
```

Example:

```json
[
  {
    "name": "Example Corp",
    "sponsorTypeName": "Gold",
    "registrationDate": "2026-02-12T09:30:00.000Z",
    "description": {
      "en": "Example Corp public description.",
      "fr": "Description publique de Example Corp."
    },
    "website": {
      "en": "https://example.com/en",
      "fr": "https://example.com/fr"
    },
    "logo": "https://example.com/logo.png",
    "boothName": "A12"
  }
]
```

## Field Mapping

- `name` comes from `Sponsor.name`.
- `sponsorTypeName` comes from the `SponsorType.name` whose `id` equals `Sponsor.sponsorTypeId` in `Conference.sponsoring.sponsorTypes[]`.
- `registrationDate` comes from `Sponsor.registrationDate` when present.
- `description.en` and `description.fr` come from `Sponsor.description.en` and `Sponsor.description.fr`.
- `website.en` and `website.fr` come from `Sponsor.website.en` and `Sponsor.website.fr`.
- `logo` comes from `Sponsor.logo`.
- `boothName` comes from `Sponsor.boothName` when present and non-empty.

## Missing Or Inconsistent Data

The endpoint must keep the response shape stable:

- Missing localized `description` values are returned as empty strings.
- Missing localized `website` values are returned as empty strings.
- Missing `registrationDate` is omitted.
- Missing or empty `boothName` is omitted.
- If `Sponsor.sponsorTypeId` does not match any configured sponsor type, `sponsorTypeName` is returned as an empty string and the issue is logged with the conference id and sponsor id.

## Ordering

Return sponsors in a deterministic order:

1. By sponsor type order in `Conference.sponsoring.sponsorTypes[]`.
2. Then by `Sponsor.registrationDate` ascending when available.
3. Then by `Sponsor.name` ascending.

This keeps public rendering predictable and follows the conference sponsor level configuration.

## Implementation Requirements

- Add a public HTTP function for `GET /api/sponsors`, exposed through the Firebase Hosting rewrite to `listPublicSponsors`.
- Keep the HTTP handler small and focused.
- Put the sponsor query and DTO mapping in reusable, typed functions.
- Validate the HTTP method and return `405` for non-GET requests.
- Query Firestore collection `sponsor` by `conferenceId` and `status`.
- Load the current `Conference` to resolve sponsor type names.
- Return only the `PublicSponsorDto` fields documented above.
- Add JSDoc for the public handler helper functions and reusable DTO types.
- Export the function from `functions/src/index.ts`.

## Error Handling

- `405` when the HTTP method is not `GET`.
- `404` or `500`, following existing backend conventions, when the current conference cannot be resolved.
- `500` for unexpected backend errors.

Error responses must not expose sensitive implementation details.

## Tests

Add backend tests covering:

- Only `CONFIRMED` sponsors are returned.
- Sponsors from another conference are excluded.
- `sponsorTypeName` is resolved from `Conference.sponsoring.sponsorTypes[]`.
- Missing optional fields are omitted or defaulted according to the response contract.
- Non-GET requests are rejected.
- The returned payload does not include private sponsor fields.

## Documentation Review

When implementing this change, update the relevant documentation in `/doc`:

- Document the new public endpoint and response payload.
- Update sponsor documentation if it already describes public sponsor exposure.
- Update developer/API documentation if it lists HTTP functions or public endpoints.
- No persisted data model change is expected, so `/doc/datamodel.md` only needs an update if implementation changes field semantics.

## Design Decision

The endpoint returns a narrow DTO instead of the persisted `Sponsor` document.

Reason: the persisted sponsor model contains internal workflow, billing, ticketing, administrator, document, and history fields. A dedicated public DTO gives consumers a stable contract while preventing accidental exposure of private operational data.

The current conference resolver uses `PlatformConfig.singleConferenceId` first, then the highest visible edition.

Reason: the platform configuration already provides the explicit current-conference pointer for single-conference deployments. The visible-edition fallback keeps the public endpoint deterministic when the platform is not locked to a single conference.
