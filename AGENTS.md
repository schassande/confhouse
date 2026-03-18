# Project Rules

## Scope

These instructions apply to the whole repository.

## Documentation

- Project documentation lives in `/doc`.
- Any functional or technical change must include a documentation review.
- Update the relevant file(s) in `/doc` whenever behavior, data model, configuration, workflows, or operating steps change.
- If no documentation update is needed for a change, explicitly verify that the existing documentation is still accurate.

## Change Hygiene

- Prefer keeping code changes and documentation changes in the same update.
- When introducing a new feature or configuration, add or update the corresponding documentation before considering the work complete.
- Use existing documentation files in `/doc` when possible instead of creating duplicates.

## Code Documentation

- Write JSDoc for functions, interfaces, type definitions, classes, and other reusable code contracts.
- Add or update JSDoc whenever a signature, responsibility, or usage expectation changes.
- Prefer concise, useful JSDoc that explains purpose, important parameters, return values, and notable constraints.

## Frontend

- For frontend-specific implementation guidance, also follow `frontend/AGENTS.md`.

## Server Functions

- For backend-specific implementation guidance under `/functions`, also follow `functions/AGENTS.md`.
