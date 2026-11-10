# BilletWeb Custom Field Selector

Last updated: 2026-11-10

## Objective

Replace the free-text BilletWeb custom field ID input in the conference BilletWeb configuration with a PrimeNG selector populated from BilletWeb's custom field API. The user selects a field by name, while the corresponding field ID remains the persisted value in `billetwebCustomFieldId`.

## Scope

### In scope

- Add support for retrieving BilletWeb custom fields through the existing server-side BilletWeb proxy.
- Add a typed API-service method in `frontend/src/app/services/billetweb-api.service.ts`.
- Replace the custom field ID text input in the custom field mapping step of `BilletwebConfigComponent` with a PrimeNG selector.
- Keep persisting only the selected field ID in `ActivityTicketFieldMapping.billetwebCustomFieldId`.
- Keep existing activity and activity-attribute mapping behavior unchanged.

### Out of scope

- Changes to the persisted data model or Firestore migration.
- Changes to ticket creation, participant ticket synchronization, or custom field value handling.
- Direct browser-to-BilletWeb API calls.
- Changes to the BilletWeb credentials storage model.

## Functional requirements

1. The custom field mapping row shall display a selector instead of the current text input for `billetwebCustomFieldId`.
2. Selector options shall be loaded from BilletWeb's fields endpoint: `GET /api/fields?version=1`.
3. Each option shall expose the BilletWeb field name as its visible label and the BilletWeb field ID as its value.
4. Selecting an option shall update the reactive form control and save the selected ID in `billetwebCustomFieldId`.
5. Existing saved field IDs shall remain compatible with the form and shall not be lost when the configuration is edited.
6. If an existing saved field ID is absent from the latest API response, it shall remain visible in the form but the configuration cannot be saved until the user selects a currently available field.

## Business rules

- A custom field mapping continues to contain an activity ID, an activity attribute name, and a BilletWeb custom field ID.
- The selector must only allow values returned by the BilletWeb fields API, except where compatibility with an existing saved ID requires preserving the current value.
- An existing saved ID absent from the API response is a validation error and must block saving; it must not be silently removed.
- The BilletWeb API request must include the configured credentials (`userId`, `key`, and `keyVersion`).
- The fields API response is an array of objects with at least `id` and `name`; it may also contain `type`, `basic`, `disabled`, and `answers`.
- Every selector label shall include the field ID in parentheses after the field name, for example `Téléphone (5)`, even when field names are unique.
- Example response:

  ```json
  [
    { "id": 1, "name": "Email", "type": "text", "basic": 1, "disabled": 0 },
    { "id": 5, "name": "Téléphone", "type": "text", "basic": 1, "disabled": 0 },
    {
      "id": 4567,
      "name": "Taille de t-shirt",
      "type": "multiple",
      "basic": 0,
      "disabled": 0,
      "answers": ["S", "M", "L"]
    }
  ]
  ```

## User interface and workflow

- The selector belongs to the fourth step of the existing BilletWeb configuration stepper.
- The selector is disabled while the fields request is in progress.
- The selector shall provide a translated label, placeholder, and loading/empty state consistent with the existing BilletWeb configuration UI.
- Fields are loaded once for the current BilletWeb connection and reused by all mapping rows.
- If loading fields fails, the user shall receive an error through the existing configuration error display and shall not be able to select a field from an incomplete list.

## Data model and persistence

- `ActivityTicketFieldMapping.billetwebCustomFieldId` remains a string containing the BilletWeb field ID.
- No field name is added to the persisted mapping.
- Existing normalization and validation rules for non-empty mapping IDs remain applicable.

## Errors, validation, and permissions

- The request shall use the same authenticated frontend-to-function flow and organizer authorization as the existing BilletWeb API operations.
- Missing or invalid BilletWeb credentials shall be reported using the existing BilletWeb configuration error handling.
- A failed fields request shall not silently overwrite an existing persisted field ID.
- The selector shall not be considered valid when no field ID is selected for a mapping that is otherwise being saved.
- A mapping whose existing ID is absent from the loaded options shall be invalid until the user selects an available field.

## Compatibility and migration

- No data migration is required.
- Existing configurations containing valid `billetwebCustomFieldId` values must remain editable and savable.
- The existing `fetchBilletweb` endpoint currently supports `events` and `tickets`; its operation contract must be extended for fields without breaking those operations.

## Technical specifications

- Add a `fields` operation to the server-side BilletWeb proxy in `functions/src/ticket/billetweb/fetch.ts`.
- Use BilletWeb endpoint `/api/fields?version=1`, preserving the configured API base URL and adding the configured credentials according to the existing proxy convention.
- Define typed field response contracts in the frontend service and, where applicable, in the function proxy normalization code.
- Add a `listFields` method to `BilletwebApiService`, using the existing authenticated request to `fetchBilletweb`.
- Add component state for the field list and its loading lifecycle, load it from the current BilletWeb credentials, and expose translated selector options.
- Update the custom field mapping template and reactive-form setup in `BilletwebConfigComponent`.
- Add or update translations and tests for successful loading, loading disablement, selection persistence, API failure, and existing-value compatibility.
- Follow the frontend formatting and JSDoc conventions in `frontend/AGENTS.md`.

## Acceptance criteria

- [ ] The custom field ID text input is replaced by a PrimeNG selector.
- [ ] The selector displays BilletWeb field names and stores the selected IDs.
- [ ] Fields are retrieved through `billetweb-api.service.ts` and the server-side proxy, never directly from the browser.
- [ ] Credentials are included in the BilletWeb API request.
- [ ] The selector is disabled while fields are loading.
- [ ] API failures are visible to the organizer and do not erase an existing saved ID.
- [ ] Existing BilletWeb configurations remain compatible.
- [ ] Existing events and ticket loading behavior is unchanged.

### List of new tests

- BilletWeb API service sends the `fields` operation and maps the response.
- The proxy accepts `fields`, calls the expected BilletWeb endpoint, and normalizes field options.
- The component disables field selectors during loading and re-enables them after completion.
- A selected field ID is included in the saved custom field mapping.
- Existing saved IDs absent from the fields response remain visible but block saving until replaced.
- Field-loading failures are displayed without clearing the current persisted mapping.

## Open decisions

- The fields response contract is confirmed: use numeric or stringified `id` as the option value and `name` as the visible label; other properties are optional metadata.
- Field labels shall always be formatted as `<name> (<id>)`.
- An existing saved ID absent from a refreshed API response remains displayed but is invalid and blocks saving until replaced.

## Verified impacts

| Area | Evidence | Expected impact |
|---|---|---|
| Frontend configuration UI | `frontend/src/app/pages/conference/billetweb-config/billetweb-config.component.ts` and `.html` | Replace the mapping text input and add field loading state/options. |
| Frontend BilletWeb service | `frontend/src/app/services/billetweb-api.service.ts` | Add a typed `listFields` operation using the existing authenticated proxy call. |
| Server proxy | `functions/src/ticket/billetweb/fetch.ts` | Add and normalize the `fields` operation while preserving `events` and `tickets`. |
| Persistence | `shared/src/model/billetweb-config.ts`, `frontend/src/app/services/billetweb-config.service.ts` | Keep the existing string field ID and normalization unchanged. |
| Documentation | `doc/billetweb-config-requirements.md` | Review/update the configuration documentation when implementation is completed. |

## Readiness

Ready for implementation.
