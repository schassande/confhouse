# Server Functions Rules

These instructions apply to everything under `/functions`.

## Architecture

- Keep HTTP handlers small and focused.
- Expose each public HTTP function from its own file.
- Group related HTTP endpoints in a dedicated subdirectory when they share a domain, for example `src/http/sponsor-ticket/`.
- Keep backend files modular; a file over 1000 lines is unacceptable and must be split before the work is considered complete.
- Put reusable business logic in dedicated modules such as helpers, services, or domain-focused files.
- Avoid duplicating validation, mapping, formatting, or workflow logic across endpoints.
- Prefer explicit, typed transformations between transport payloads and persisted data.

## Documentation

- Any server-side functional or technical change must include a documentation review in `/doc`.
- Update the relevant documentation when an endpoint, payload, scheduled job, import/export flow, or integration behavior changes.
- Update `/doc/datamodel.md` whenever persisted data structures or field semantics change.

## API & Contracts

- Document request/response shape changes when they affect consumers.
- Preserve backward compatibility when possible.
- If a breaking change is necessary, document it explicitly in `/doc`.
- Check frontend impact when changing an HTTP action consumed by the Angular app.

## Typing & JSDoc

- Public HTTP handlers and extracted business callbacks must use explicit parameter and return types.
- Do not rely on an untyped callback parameter when the value carries business context; extract a named typed function or introduce a dedicated interface/type alias.
- JSDoc must document the real contract of non-trivial parameters. If a parameter is a context object, either type it explicitly or describe its fields in the JSDoc. Prefer explicit typing.
- When a closure passed to a helper becomes substantial, prefer extracting it into a named typed function instead of leaving the logic inline.

## Data & Validation

- Validate all external inputs at the boundary.
- Do not trust frontend-provided data without verification.
- Keep Firestore reads and writes explicit and easy to trace.
- Prefer strongly typed models over loosely shaped objects.

## Errors & Logging

- Return clear server errors that help diagnose issues without exposing sensitive details.
- Log enough operational context to investigate failures.
- Never log secrets, tokens, or sensitive personal data.

## Integrations & Secrets

- Centralize access to external services configuration and secrets.
- Do not hardcode credentials, tokens, or environment-specific values.
- Document any new external integration or secret requirement in `/doc`.

## Tests

- Add or update tests for non-trivial business logic changes.
- Add a regression test when fixing a bug in reusable logic.
- Keep fixtures and test data aligned with the current business rules.
