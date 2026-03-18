# Frontend Rules

These instructions apply to everything under `/frontend`.

## Scope

- Follow the repository-wide rules from `/AGENTS.md`.
- Use this file for frontend-specific implementation guidance.

## Documentation

- Any functional, UX, or technical frontend change must include a documentation review in `/doc`.
- Update the relevant documentation when screens, user flows, configuration, or operating steps change.
- If no documentation update is needed for a change, explicitly verify that the existing documentation is still accurate.
- If a frontend change impacts backend contracts, verify that the corresponding backend and documentation are still accurate.

## Angular Direction

- Prefer modern Angular patterns and current Angular best practices.
- Use standalone APIs over `NgModules`.
- Do not set `standalone: true` inside `@Component`, `@Directive`, or `@Pipe` decorators.
- Favor signals for local state and derived state when they improve clarity.
- Use native template control flow such as `@if`, `@for`, and `@switch`.
- Prefer clean, efficient, and maintainable code over framework cleverness.

## Architecture

- Keep components focused on a single responsibility.
- Put complex logic in services or dedicated helper functions instead of growing component classes.
- Keep transport, mapping, state, and view logic clearly separated.
- Reuse existing models and services before introducing new abstractions.
- Avoid speculative refactors while implementing a focused change.

## Components

- Use `ChangeDetectionStrategy.OnPush` unless there is a clear reason not to.
- Prefer explicit inputs and outputs with Angular's function-based APIs when applicable.
- Use `input()` instead of decorator-based inputs when appropriate.
- Use `output()` instead of decorator-based outputs when appropriate.
- Prefer inline templates only for very small components.
- For non-trivial components, keep the logic in the `.ts` file, the template in the `.html` file, and the styles in the `.css` file.
- If a component grows in complexity, move reusable logic to a service.
- For shared or reusable UI patterns, prefer composition over duplication.
- In a class, keep a consistent ordering such as fields, constructor, public methods, then private methods.

## Forms & State

- Prefer reactive forms for complex forms and validation-heavy screens.
- Use signals for local component state.
- Use `computed()` for derived state.
- Keep state transformations explicit, predictable, and easy to test.
- Do not use `mutate` on signals; use `update` or `set` instead.
- Avoid mixing several state management styles in the same feature without a good reason.
- Use typed models whenever possible.

## Templates & Styling

- Keep templates readable and avoid embedding complex logic.
- Do not assume globals such as `new Date()` are available in templates.
- Do not write arrow functions in templates.
- Use the async pipe to handle observables.
- Prefer PrimeNG as the first choice for graphical widgets and common UI building blocks when it fits the need.
- Only introduce custom widgets or another UI library when PrimeNG does not provide a suitable solution or when there is a clear project-specific reason.
- Prefer class and style bindings over `ngClass` and `ngStyle`.
- When using external templates or styles, use paths relative to the component TypeScript file.
- Keep styling aligned with the existing design patterns of the application.
- Build responsive layouts that work on desktop and mobile.

## Services & Dependency Injection

- Keep services focused on a single responsibility.
- Use Angular dependency injection rather than manual instantiation.
- Use `inject()` instead of constructor injection when it improves consistency with the surrounding code.
- Use `providedIn: 'root'` for singleton services when appropriate.
- Never instantiate a service with `new`.
- When calling backend endpoints, make request and response contracts explicit and typed.

## TypeScript

- Use strict type checking.
- Prefer type inference when the type is obvious.
- Avoid `any`; use `unknown` when the type is uncertain.

## Accessibility & UX

- Frontend changes should pass accessibility checks appropriate to the feature.
- Maintain keyboard navigation, labels, focus states, and sufficient contrast.
- Aim for WCAG AA expectations for interactive flows.

## Performance

- Optimize change detection and unnecessary recomputation.
- Use `NgOptimizedImage` for static images when applicable.
- Remember that `NgOptimizedImage` does not work for inline base64 images.
- Prefer simple, traceable optimizations over premature micro-optimizations.

## Quality

- After a frontend modification, check that the application still compiles.
- Add or update tests for non-trivial UI or state-management changes when the project area already supports testing.
- When fixing a bug, prefer adding protection against regressions.

## Project Conventions

- Keep naming consistent with the current project vocabulary.
- Check frontend impact when backend contracts change, and vice versa.
- Use existing documentation files in `/doc` when possible instead of creating duplicates.

## References

- Angular Essentials: https://angular.dev/essentials/components
- Signals: https://angular.dev/essentials/signals
- Templates: https://angular.dev/essentials/templates
- Dependency Injection: https://angular.dev/essentials/dependency-injection
- Style Guide: https://angular.dev/style-guide
