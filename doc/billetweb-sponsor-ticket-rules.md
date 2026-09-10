# BilletWeb sponsor ticket rules

## Scope
This note documents how sponsor ticket types are configured and reused across the sponsor workflow.

## Configuration source
- `BilletwebConfig.ticketTypes.sponsors` is the single source of truth for sponsor ticket types.
- The frontend finds the configuration by its `conferenceId` field. The backend also supports legacy documents whose document ID is the conference ID.
- Each entry stores:
  - `ticketTypeId`
  - `ticketTypeName`

## BilletWeb configuration UI
- The BilletWeb configuration page uses a PrimeNG `p-multiselect`.
- Selecting at least one sponsor ticket type is mandatory.
- If one sponsor level already references a sponsor ticket type in its quotas, that ticket type cannot be removed from the multiselect.

## Sponsor configuration UI
- Sponsor quota rows can only select values coming from `BilletwebConfig.ticketTypes.sponsors`.
- If no BilletWeb sponsor ticket type is configured, quota creation stays blocked until BilletWeb configuration is completed.

## Sponsor management UI
- Sponsor ticket allocation uses the same BilletWeb sponsor ticket catalog so labels stay consistent with quotas and persisted ticket ids.
- When BilletWeb is not configured, the sponsor edit page hides the ticket tab and does not call the allocation endpoint.
