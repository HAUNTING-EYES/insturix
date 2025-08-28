# Clickatron Migration & Integration Plan (Legacy → New Canvas Suite)
(((I have renamed clickatron2 everywhere to clickatron, including in these md files.)))
> Date: 2025-08-28  
> Author: Migration Assistant  
> Scope: Replace legacy `/dashboard/clickatron` implementation with the new Clickatron workflow currently at `/dashboard/clickatron` and integrate real backend services while preserving schema continuity for a smooth migration.

---

## 1. Objectives (Simplified)

1. Replace the legacy thumbnail-only Clickatron UI with the new multi-stage canvas suite.
2. Reuse and minimally extend the existing `ClickatronTask` schema (no breaking migration scripts).
3. Auto-adapt every legacy task lazily into the new structure the first time it is opened (in-memory + persisted back) so users can continue working.
4. Persist new workflow + canvas data under `details.workflow` and `details.canvas` (non-breaking append-only extension).
5. Remove all legacy UI code after cutover (no dual-running, no feature flags, no rollback infra).

---

## 2. Current State Summary

| Aspect | Legacy Clickatron | New Clickatron |
| ------ | ----------------- | --------------- |
| Entry Route | `/dashboard/clickatron` | `/dashboard/clickatron` |
| Detail Route | `/dashboard/clickatron/task/:id` | `/dashboard/clickatron/lab/:taskId` |
| Workflow | Single prompt → async generation → history | Multi-stage: Spark (idea) → Ideation (directions) → Canvas (variations + edits) |
| Persistence | Mongo (`ClickatronTask`) | IndexedDB (local `clickatron_<taskId>` sessions) + mock variations |
| Schema | `IClickatronTask` with `details`, `results.thumbnail` | No server schema yet; `TaskData` (videoIdea, stage, selectedDirection, preset, referenceImage) |
| Realtime | RTDB listener (`useTaskUpdater`) | None (mock only) |
| Generation API | `/api/services/clickatron/generate` (thumbnail) | Not wired (simulated) |

### 2.1 Key Legacy Schema (Must Remain Compatible)
```ts
interface IClickatronTask {
  clerkUserId: string;
  title?: string; // used as a human label
  details: any;   // stores original request payload / structured prompt JSON
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  results?: { thumbnail: { prompt: string; gcs_url: string }; details?: string };
  error_message?: string;
  createdAt: Date; updatedAt: Date; completedAt?: Date; refunded?: boolean;
}
```

### 2.2 New Session Model (Client‑side Only Now)
```ts
interface TaskData {
  videoIdea: string;
  timestamp: number;
  stage: 'ideation' | 'canvas';
  selectedDirection?: string;         // maps to chosen creative direction → becomes part of prompt
  selectedPreset?: { id; name; aspectRatio; dimensions; promptText; placeholder };
  referenceImage?: { name; size; type; imageId } | null; // stored locally
}
```

### 2.3 Unification Strategy
We will map `TaskData` onto the existing Mongo document:

| TaskData Field | Mongo Field | Strategy |
| -------------- | ----------- | -------- |
| `videoIdea` | `title` or inside `details.videoIdea` | Duplicate into `title` for list readability; persist structured under `details.workflow.videoIdea` |
| `selectedPreset` | `details.workflow.selectedPreset` | Store as raw object (Mixed) |
| `selectedDirection` | `details.workflow.selectedDirection` | Used to seed initial generation prompt |
| `referenceImage` | `details.workflow.referenceImageMeta` | Only metadata; binary stays client/CDN |
| `stage` | `details.workflow.stage` | For resuming sessions |
| Variations (future) | `details.canvas.variations[]` | Each with prompt, fineTuning settings, image refs |
| Final chosen image | `results.thumbnail` | Same as legacy (keep structure) |

Schema change: NONE required. We simply nest under `details.workflow` & `details.canvas`.

---

## 3. High-Level Migration Phases

| Phase | Goal | Notes |
| ----- | ---- | ----- |
| 1 | Backend session + variation endpoints | Build straight on existing API namespace (v2 path optional) |
| 2 | Frontend integration & schema extension | Hook store to server; implement lazy legacy adaptation |
| 3 | Route swap & cutover | Rename `clickatron` → `clickatron`; delete legacy folder same PR (after local QA) |
| 4 | Post-cutover cleanup | Remove unused hooks/components, finalize docs & tests |

---

## 4. Detailed Action Plan

### 4.1 Phase 1: Backend Session & Variation Endpoints
Minimal set required for new canvas (no flags):
| Endpoint | Method | Purpose |
| -------- | ------ | ------- |
| `/api/services/clickatron/session` | POST | Create new workflow record (initial `workflow` block) |
| `/api/services/clickatron/session/:id` | GET | Fetch merged legacy + new fields |
| `/api/services/clickatron/session/:id` | PATCH | Upsert partial workflow / canvas fields (idempotent) |
| `/api/services/clickatron/session/:id/variation` | POST | Queue/generate a variation (returns stub → updates when ready) |
| `/api/services/clickatron/session/:id/variation/:varId` | PATCH | Fine-tuning metadata update |
| `/api/services/clickatron/session/:id/commit` | POST | Mark final variation → populate `results.thumbnail` |

Implementation notes:
* Reuse existing generation queue logic; wrap original thumb generation as a first variation.
* Variation documents not separate collection initially—store array under `details.canvas.variations` (cap length, e.g. 50).
* Add lightweight server-side zod validation.

### 4.2 Phase 2: Frontend Integration
1. Extend `useCanvasStore` with: `sessionId`, `backendSynced`, `variations`, and a generic `persist(updates)` that PATCHes.
2. On lab mount: if `taskId` looks like a Mongo ObjectId → fetch server session; else create ephemeral session (UUID) and POST when the user first selects a direction.
3. Replace mock generation with real variation POST (optimistically insert variation with `status: generating`).
4. Auto-save: debounce PATCH (1000–1500ms) for stage & fine-tuning.
5. Allow offline fallback: if PATCH fails, mark dirty and retry on next interaction.

### 4.3 Phase 3: Cutover
1. Rename `app/dashboard/clickatron` → `app/dashboard/clickatron`.
2. Delete legacy `components/dashboard/Clickatron` & `app/dashboard/clickatron/*` (old) in same PR (after confirming new route loads & basic flows function locally).
3. Update sidebar/navigation constants to new path (already present references to old path are updated).
4. Add simple redirect route file sending `/dashboard/clickatron/*` → `/dashboard/clickatron/*` (static 301 acceptable since we deploy only when ready).

### 4.4 Phase 4: Post-Cutover Cleanup
1. Remove obsolete hooks: `useGenerateThumbnail` (or refactor to call variation create endpoint then rename to `useClickatronVariation`).
2. Merge analytics to support variation counts & active sessions.
3. Add tests & docs (see Sections 8 & 9).

// (Legacy dual-mode / feature flag section removed per simplified strategy.)

---

## 5. Data Migration & Backward Compatibility

### 5.1 Existing Tasks
No schema transformation required. For an old task opened in new lab:
1. Fetch `ClickatronTask`.
2. Derive a synthetic `TaskData`:
   - `videoIdea`: `title || (results.details?.parsed.videoIdea) || 'Legacy Task'`
   - `selectedDirection`: best-effort from `results.thumbnail.prompt` or `details.prompt`.
   - Stage: `'canvas'` if completed, else `'ideation'`.
3. Store synthetic session in IndexedDB keyed by the Mongo `_id` to allow offline reopening.

### 5.2 Variation History Introduction
Add a non-breaking field: `details.canvas = { variations: [{ id, prompt, fineTuning, imageRef, createdAt, status }] }` (all optional). Legacy readers ignore.

### 5.3 Reference Images
Only store metadata + remote URL once uploaded (separate upload endpoint or reuse existing storage service). Keep binary out of Mongo.

### 5.4 Lazy Auto-Migration Logic (Replaces Rollback Section)
On any GET (session fetch or legacy task detail):
1. If `details.workflow` missing → synthesize workflow block (see pseudo below).
2. If `details.canvas` missing → initialize `{ variations: [] }`.
3. Persist the enriched document with a `$set` update (idempotent) before returning to client.
4. Return unified shape to frontend (frontend never branches on legacy/new).

Benefits: *Zero* pre-migration scripts; only touched tasks are upgraded.

---

## 6. Security & Permissions
| Concern | Action |
| ------- | ------ |
| Unauthorized session access | Validate `clerkUserId` on every session/variation endpoint |
| Cross-user variation leakage | Variation queries always scoped by `sessionId` + user |
| Tampering with fine-tuning | Server-side schema validation (zod) for PATCH body |
| Large payload abuse | Enforce size limits (e.g. max 50 variations, reference meta < 5KB) |

---

## 7. Performance Considerations
1. Debounce PATCH updates (1–1.5s idle) for stage + fine-tuning.
2. Cap `details.canvas.variations` length (e.g. 50) — drop or archive older ones client-side before PATCH.
3. React Query cache by `sessionId`; staleTime can be modest (30–60s) since we optimistically update local state.
4. Include `details.workflowVersion` (number) to support future silent migrations.

---

## 8. Testing Strategy
| Layer | Tests |
| ----- | ----- |
| Unit | Store actions: stage transition, variation lifecycle, fine-tuning persistence |
| API | Session create → variation add → commit flow; idempotent PATCH; lazy auto-migration path |
| Integration | Open legacy task → verify workflow/canvas blocks now present; generate new variation; commit final |
| UI (E2E) | New session flow, legacy reopen flow, variation generation error handling, fine-tuning save debounce |
| Performance | Variation list capped; PATCH batching respected |

---

## 9. Step-by-Step Checklist (Engineering Execution)
Legend: [ ] pending, [*] in progress, [x] done

1. [x] Author migration plan document.
2. [ ] Create unified types (`types/clickatron.ts`).
3. [ ] Implement session & variation endpoints (POST/GET/PATCH/commit).
4. [ ] Extend `useCanvasStore` (sessionId, backend sync, variations array persisted).
5. [ ] Replace mock generation with real variation API integration.
6. [ ] Implement lazy auto-migration on session fetch.
7. [ ] Wire lab to fetch sessions (ObjectId) or create ephemeral then persist.
8. [ ] Add debounce persistence for fine-tuning & stage changes.
9. [ ] Rename route `clickatron` → `clickatron` & remove legacy folder.
10. [ ] Add redirect from `/dashboard/clickatron/*` → new route.
11. [ ] Update navigation/sidebar references.
12. [ ] Add E2E & API tests (see Section 8).
13. [ ] Cap variation length & enforce server-side validation.
14. [ ] Remove obsolete hooks/components (old history, analytics duplication).
15. [ ] Final docs update & handoff.

---

## 10. Risks & Mitigations
| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Partial save failures | Lost edits | Debounced retry queue + local dirty flag |
| Oversized variations array | Slower doc operations | Client cap + server validation (reject >50) |
| Legacy task missing fields | Runtime errors | Lazy auto-migration (guarantee blocks exist before return) |
| Unbounded PATCH spam | Server load | Debounce + merge patches |

---

## 11. Post-Migration Cleanup Targets
1. Remove `components/dashboard/Clickatron/*` (legacy) and related hooks.
2. Consolidate analytics (include variation counts, avg variations per session, commit rate).
3. Replace `useGenerateThumbnail` with `useClickatronVariation` (create + poll status if async).
4. Update docs + README references; archive redesign & migration plan (historical).

---

## 12. Appendix

### 12.1 Example New Session Document (Mongo)
```jsonc
{
  "_id": "...",
  "clerkUserId": "user_123",
  "title": "How to Cook Perfect Eggs",
  "details": {
    "workflow": {
      "videoIdea": "How to Cook Perfect Eggs",
      "stage": "canvas",
      "selectedPreset": { "id": "youtube", "name": "YouTube Thumbnail", "aspectRatio": "16:9", "dimensions": "1920x1080" },
      "selectedDirection": "Master the art of egg perfection",
      "referenceImageMeta": { "imageId": "ref_abc123", "type": "image/png" }
    },
    "canvas": {
      "variations": [
        { "id": "v1", "prompt": "Master the art...", "fineTuning": { "brightness": 100, "contrast": 100, "saturation": 100 }, "imageRef": "img_v1.png", "createdAt": 1690000000000, "status": "completed" },
        { "id": "v2", "prompt": "Golden morning light...", "status": "generating" }
      ]
    }
  },
  "status": "processing",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 12.2 Legacy Task Adaptation to New Session (Pseudo)
```ts
function adaptLegacy(task: IClickatronTask): TaskData {
  const prompt = task.results?.thumbnail?.prompt || task.details?.prompt || '';
  return {
    videoIdea: task.title || task.details?.videoIdea || 'Legacy Task',
    timestamp: new Date(task.createdAt).getTime(),
    stage: task.status === 'completed' ? 'canvas' : 'ideation',
    selectedDirection: prompt || undefined,
    selectedPreset: { id: 'youtube', name: 'YouTube Thumbnail', aspectRatio: '16:9', dimensions: '1920x1080', promptText: "What's your video about?", placeholder: '' },
    referenceImage: null,
  };
}
```

---

## 13. Conclusion

Direct cutover with lazy, on-demand enrichment keeps momentum high and avoids spending time on rollback scaffolding. The existing schema is extended (not altered) so every legacy record becomes a valid canvas session after first open. Focus now is to implement endpoints, store sync, and route rename quickly; once stable locally, deploy the new experience as the sole Clickatron.

> NEXT ACTION: Unified types + endpoints (Checklist items 2–3).
