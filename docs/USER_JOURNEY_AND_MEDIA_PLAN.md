# User Journey & Composer Media Plan

**Founder directive 2026-08-28:** plan the entire flow from dashboard click; the
chat entry has no way to upload media or reach existing user media; think the
backend through; set up ICP-reaction testing (MatrAIx).

---

## 1. THE JOURNEY — dashboard click to published content

```
Click "Dashboard"
→ MISSION CONTROL (one screen)
   ├─ Needs you      (attention items, dismissable, deep-links)
   ├─ In flight      (every engine's running work, live)
   ├─ Your work      (deliverables by brand → open hydrated session)
   └─ Start          ("What do you want to make?" + doors: chat-first, upload, music…)
→ SESSION (the chat format)
   ├─ Thread: plan cards, receipts (risk-stamped, undo), artifacts born inline,
   │   honesty cards (clarify / gap / spend / publish)
   ├─ Composer: text + ⌘K + ATTACHMENTS (the gap — §2)
   └─ Stage: auto-follows; real editors/labs/reports embedded; manual hatch
→ GATES: spend quotes (real wallet) · publish hard-gate · destructive (v2)
→ ARTIFACTS: script/reel/canvas/analysis/schedule — poll real telemetry
→ EXIT RAMPS: full editor/lab/calendar ↗ · /account for configuration
```

## 2. COMPOSER MEDIA — the missing on-ramp (UI + backend)

### UI (composer affordances)
- `[+]` upload — file/video/image drop → attachment pill w/ honest progress
- `[library]` — picker over EVERYTHING the user already has (see aggregation)
- `@` mention — brands (exists), assets (add), artifacts (add)
- Pills render as attachments on the next turn; roles visible, removable

### Backend — rides existing rails, nothing new invented
| Need | Existing rail | Studio wiring |
|---|---|---|
| Upload video/image | `POST media/upload/url` (presign) → PUT → `POST media/upload` (register, **rights attestation engine-side**) | Composer → presign → progress → register → attachment `{ref: assetId, role:"media"}` |
| Big files | R2 multipart (alyzitron util) + proxy-swap cron | Same flow, resumable |
| User media library | `GET media/list`, `media/search`, `search_user_assets`, `inspect_user_asset` | NEW read-side `GET /api/studio/media` aggregating: editron media, clickatron canvases, TF scripts, musitron tracks |
| Stock | `search_stock_footage`, pexels, sfx-library | Library picker tab |
| Attachments → turns | `StudioTurnRequest.attachments[{ref, role}]` — **contract already exists** | Orchestrator maps roles: `media`→editron source, `image`→design reference, `script`→write source, `brand`, `asset` |
| Storage limits | storage-quota service + StorageCard | Upload error state surfaces quota honestly |

### Flow states (the honesty bar)
Uploading (real % from multipart) · Registering · Rights gate (ownership
confirm — reuse the engine's attestation) · Quota exceeded (link to /account)
· Failed (retry, never error-as-empty).

### Turn integration (backend thinking)
1. Attachment rides the turn request (already typed).
2. Orchestrator validates access (asset owner check) BEFORE planning.
3. Planner treats attachments as context: footage → auto-edit pipeline door;
   image → design reference; script → write source. **Planner never fabricates
   media facts it can't see — it reads asset metadata via existing inspect.**
4. Auto-edit turns get the 8-stage processing UI in-thread (needs_input card
   lists uncovered beats — the engine already computes scriptCoverage).

## 3. ICP-REACTION TESTING (MatrAIx) — the honest state

- **MatrAIx is not in the codebase** (census: persona/tribe/neural greps empty;
  the `matrix` hits in editron agent files are "command matrix" comments).
  The handover classifies it P4 R&D — advisory signal, never a gate.
- **matrix.org** is an open federated chat protocol — not a user-testing
  service (flagging in case the names got crossed).
- **What we can do NOW, on every UI we ship:**
  1. Fix 3 ICP personas: *agency owner* (5 client brands, delegation,
     billing), *brand manager* (one brand, speed, brand safety), *operator*
     (editor/creator, hands-on control, undo trust).
  2. Per-screen **task scripts + success criteria** (e.g. "dashboard → reel
     from uploaded footage, < 60s, without visiting a second screen").
  3. Score walkthroughs against criteria on the deployed preview (real users
     when available; agent-simulated personas as ADVISORY signal only).
  4. **The seam**: task scripts + criteria live per-screen in the repo, and
     each screen's critical interactions emit events — when MatrAIx lands,
     persona-fuzz plugs into the same scripts and scores against them.

## 4. Checklist adds
- Composer: upload affordance + rights gate + progress (OPEN)
- Composer: unified media library picker + /api/studio/media (OPEN)
- Attachment roles wired through orchestrator planners (OPEN)
- ICP personas + per-screen task scripts (OPEN — §3)
