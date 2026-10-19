---
name: angular-formatting
description: Apply the project’s conventional formatting rules whenever creating or modifying Angular, TypeScript, HTML, or component CSS code under frontend.
---

# Angular formatting rules

Use this skill for every frontend Angular code change, including `.ts`, `.html`, and component stylesheet content. Preserve behavior and existing project conventions; formatting changes must not become an opportunity for an unrelated refactor.

## Base rules

- Use UTF-8, spaces (never tabs), two spaces per indentation level, a final newline, and no trailing whitespace.
- Use single quotes in TypeScript and double quotes only where required by HTML syntax or existing Angular conventions.
- Keep one import per line. Group imports in this order: Angular, third-party libraries, project models, then relative project imports.
- Prefer a readable line length of about 120 characters. Break long imports, decorators, calls, object literals, unions, and expressions across lines with trailing commas where valid.
- Use spaces around operators, after commas, around type separators (`string | undefined`), and inside object/type literals (`{ id: string }`).
- Keep declarations and statements one per line. Do not place multiple fields, injections, signals, or statements on one line.

## TypeScript and Angular

- Keep a predictable class order: inputs/outputs and public constants, injected dependencies, other state, computed values/effects, constructor, public methods, then private methods/helpers.
- Put each decorator property on its own line when the decorator has more than one property. Keep arrays and object literals vertically readable.
- Add concise JSDoc to every TypeScript method, whether public or private, as well as reusable functions, interfaces, type definitions, classes, and public contracts. Update it when responsibility or signature changes.
- Prefer modern Angular patterns (`standalone` imports, signals, `input()`/`output()`, `OnPush`, and native template control flow) when applicable, while matching nearby code and avoiding unrelated migrations.
- Keep methods short and focused. Do not change behavior merely to satisfy line length.

## Templates and styles

- Format inline templates like external HTML: use one element/attribute or meaningful interpolation per line when a line becomes difficult to scan; indent nested blocks by two spaces.
- Put Angular control-flow blocks (`@if`, `@for`, `@switch`) on readable lines and preserve whitespace around their bodies. Keep event bindings and complex expressions legible.
- For component CSS, use one selector block per logical rule group, one declaration per line, consistent spacing after colons, and readable media-query blocks.
- Do not alter template text, binding expressions, selectors, CSS values, or accessibility attributes as part of formatting.

## Workflow and verification

1. Inspect the applicable `.editorconfig`, `AGENTS.md`, and local style around the target file.
2. Apply the smallest formatting-only change. Prefer a repository formatter if one is configured; otherwise format carefully by hand.
3. Review the diff for semantic changes, whitespace/encoding damage, and accidental file-wide churn.
4. Run the narrowest available validation (Angular build, type-check, lint, or tests) appropriate to the touched code.
5. Review `/doc` for functional or technical impact. If formatting only has no documentation impact, explicitly report that existing documentation remains accurate.
