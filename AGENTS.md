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
- File encoding is UTF8.

## Design Decisions

- Any non-trivial design choice must be made explicit.
- If several reasonable architectures exist, state the chosen option and why.
- When the choice is not clearly forced by the specification, confirm it with the user before implementation.
- Once validated, document the decision in the relevant `/doc` file or work log so it is traceable later.

## Shell Reliability

- In this repository, prefer the default PowerShell environment for command execution.
- Do not switch to Git Bash by default. In this Codex environment, `C:\Program Files\Git\bin\bash.exe` and related Git Bash shells are not reliable and can fail with low-level pipe errors.
- Before assuming an alternative shell will help, validate it with a minimal command in the current sandbox.
- When `apply_patch` fails, do not keep retrying blindly with the same large patch.
- First re-read the target file, then apply a smaller patch with tighter context.
- If a file is large, split the edit into several sequential `apply_patch` operations instead of one oversized patch.
- When a previous rewrite caused encoding damage, do not reuse terminal-rendered mojibake text as patch input. Reconstruct the intended UTF8 content explicitly before writing.

## Code Documentation

- Write JSDoc for functions, interfaces, type definitions, classes, and other reusable code contracts.
- Add or update JSDoc whenever a signature, responsibility, or usage expectation changes.
- Prefer concise, useful JSDoc that explains purpose, important parameters, return values, and notable constraints.

## Frontend

- For frontend-specific implementation guidance, also follow `frontend/AGENTS.md`.

## Server Functions

- For backend-specific implementation guidance under `/functions`, also follow `functions/AGENTS.md`.
