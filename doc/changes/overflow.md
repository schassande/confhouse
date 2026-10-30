# Display overflow rooms in schedules

Last updated: 2026-10-30

## Objective

Display room rebroadcasts (overflow rooms) consistently in the planning structure, session allocation view, and generated PDF schedules.

## Scope

### In scope

- Display every configured overflow room as a visual copy of its source room.
- Reflect the source room's time slots and allocated session content in all three outputs.
- Keep the existing persistent data model unchanged.

### Out of scope

- Editing overflow-room slots directly.
- Allocating a session independently to an overflow room.
- Changing the persisted representation of room rebroadcasts.

## Functional requirements

1. In the planning structure (`day-structure`), display overflow slots in the target room column at the source slot's time position. The slot is read-only and displays `overflow` together with the source room name.
2. In the session allocation page, display the overflow room's copied slot and source-room session content. The overflow slot is not clickable, cannot receive drag-and-drop, and cannot receive an independent allocation. It displays a small, centered `overflow` label at the bottom of the block.
3. When the source-room session is allocated, modified, or removed, the corresponding overflow-room display reflects the same current state.
4. In generated PDF schedules, render overflow rooms and the source room's content graphically.
5. When the source room has no allocated session, keep the overflow slot visible and display the `overflow` marker together with the source room name.
6. When several overflow rooms reference the same source room, project the source slot and session independently into every configured overflow room.
7. When source slots overlap in the source room, project all of them into each overflow room with the same overlap.

## Business rules

- The source room is the sole source of truth for overflow-room slot and session content.
- An overflow room is a presentation-only copy of its source room.
- Overflow-room slots must never create or update an independent session allocation.

## User interface and workflow

- Planning structure: overflow blocks use the same time positioning as regular slots, but are not editable.
- Session allocation: overflow blocks are neither interactive targets nor draggable allocation destinations.
- The visible overflow marker must include the source room name in the planning structure and the `overflow` text in the allocation block.

## Data model and persistence

No persistent data-model change is required. Existing room-rebroadcast configuration and session-allocation data must be read and projected into the affected views.

## Errors, validation, and permissions

No new error or permission behavior is specified. Overflow projections must not bypass the existing authorization rules for reading planning and allocation data.

## Compatibility and migration

Existing persisted data remains compatible. No migration is required.

## Technical specifications

- Inspect and reuse the existing room-rebroadcast representation and slot/session projection logic.
- Update the planning-structure component, session-allocation component, and planning-PDF generation path as applicable.
- Preserve regular-room behavior and derive overflow projections from source-room state rather than duplicated persistence.
- Add automated coverage for source allocation, modification, removal, non-interactivity, positioning, and PDF rendering.

## Acceptance criteria

- [ ] A configured overflow room appears in the planning structure at the correct room column and source-slot time position.
- [ ] The planning-structure overflow block is read-only and identifies the source room.
- [ ] The allocation page shows the source slot/session content in the overflow room with an overflow marker.
- [ ] Overflow blocks cannot be clicked, dragged onto, or independently allocated.
- [ ] Source allocation, modification, and removal are reflected in overflow displays.
- [ ] Generated PDFs include overflow rooms with the source-room content.
- [ ] No persistent data-model migration or schema change is introduced.

### List of new tests

- Planning-structure projection and positioning tests.
- Allocation-page projection, read-only behavior, and synchronization tests.
- PDF generation tests covering overflow rooms and source content.
- Regression tests confirming regular-room allocation behavior is unchanged.

## Open decisions

- Exact visual styling, localization keys, and PDF layout details for the `overflow` marker are to be clarified.
- Decision: an empty source slot remains visible in the overflow room with the `overflow` marker and source room name.
- Decision: every configured overflow target of a source room displays the same source projection.
- Decision: all overlapping source slots are displayed in overflow rooms with the same overlap.

## Spec analysis

### Readiness

Ready for implementation

### Verified impacts

| Area | Evidence | Expected impact |
|---|---|---|
| Planning structure | `frontend/src/app/pages/conference/conference-config/conference-planning-structure-config/day-structure/` | Project source-room slots into overflow-room columns as read-only blocks. |
| Session allocation | `frontend/src/app/pages/session/session-allocation/` | Project source allocations and disable interaction for overflow blocks. |
| PDF schedules | `frontend/src/app/services/planning-pdf.service.ts` | Include overflow rooms and source content in generated schedules. |
| Existing documentation | `doc/TODO.md`, `doc/datamodel.md`, `doc/voxxrin*.json*` | Review and update relevant documentation during implementation; no schema change is expected. |

### Remaining assumptions

- Existing persisted overflow-room configuration can identify each target room and its source room.
- Current views have sufficient source-room and slot data to derive the projection without persistence changes.
- Empty source slots remain visible with `overflow` and the source room name.
- Multiple overflow targets and overlapping source slots are projected without additional prioritization.

### Recommended implementation breakdown

1. Confirm the persisted overflow relation and existing projection contracts.
2. Implement a shared read-only overflow projection for planning and allocation views.
3. Extend PDF schedule rendering with overflow-room columns/blocks.
4. Add unit and integration coverage, then update relevant project documentation.

### Recommended checks

- Verify source-room allocation, edit, and deletion propagation.
- Verify multiple overflow targets and empty source slots.
- Verify overlapping source slots are all projected with the same overlap.
- Verify no drag-and-drop or click action can mutate an overflow slot.
- Verify generated PDFs visually and through automated assertions.
- Verify the persistent data model and existing documentation remain accurate.
