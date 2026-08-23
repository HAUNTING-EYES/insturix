# Stage 1.5 Manual UI Truthfulness V1

**Status:** `CURRENT_TRUTH_GUARD_ONLY`
**Scope:** records the live editor's present control flow; it does not migrate the editor or create a second project authority.

## Current control flow

| Layer | Current implementation | Consequence |
| --- | --- | --- |
| Product entry | `app/dashboard/editron/project/[projectId]/page.tsx` mounts `ReactVideoEditor`. | This is the live V1 editor route. |
| Preview entry | `app/dashboard/editron/project/[projectId]/v2/page.tsx` identifies itself as a `/v2 PREVIEW route` and mounts the same editor with `variant="v2"`. | It is a redesigned shell over the existing provider stack, not a separate canonical editor or migrated control plane. |
| In-memory editor state | `contexts/editor-context.tsx` exposes `Overlay[]`, `selectedOverlayId`, a numeric `currentFrame`, and overlay operations. `constants.ts` sets `FPS = 30`. | The currently exposed V1 context is overlay/frame oriented; it does not expose a selected canonical editorial range. |
| Persistence | `use-autosave.ts` serializes the editor state with `expectedRevision`, then routes it to the project save/autosave endpoints. | A write is protected by project revision CAS, rather than by range/object scope. |
| Conflict behavior | On either save `409`, `use-autosave.ts` invokes `loadStateRef.current()`. | The client reloads the state; it does not present a range-aware merge or rebase. |
| AI coexistence | The AI chat panel sets `isAIProcessing` before dispatch. `ReactVideoEditor` pauses autosave and renders a full pointer-event blocking overlay while it is true. | AI and manual work are serialized in the UI for this path. |

## Explicit non-claims

Do not call the V2 preview route a second editing authority, or call the current UI collaborative, range-aware, or safe to edit alongside a running AI turn. The context does not establish canonical source identity, durable selected ranges, operation receipts, range locks, or revision-aware merge choices.

## Migration boundary

The future UI may consume a ProjectService-owned, receipt-bound command only after the Stage 2.5 evidence boundary and required CAP2 requalification. That command must be the sole authority for revision, range scope, conflict disposition, and invalidation. The UI can then display revision/range status and allow disjoint manual work; it must not infer those guarantees from a local overlay selection or from the existing preview shell.
