# Vibe OS — Wiring Checklist (living doc)

Every capability/feature/pipeline from the census (VIBE_OS_PLAN.md §1 + §3
disposition matrix) tracks here. Nothing is "done" until its row says DONE
with evidence. Updated at every phase gate.

Legend: DONE (verified) · BRIDGED (live HTTP bridge, rewrite swaps later) ·
WIRED (direct server calls) · MOCK (design surface only) · OPEN

## Capability executors
| Capability | Status | Evidence |
|---|---|---|
| write | WIRED (direct lib calls) | prod live-loop: 0.2cr, 43-word draft, persisted script |
| edit | VERIFIED on production — Home row → hydrated session → real editor in stage → read-only turn → live agent picked get_timeline_view, registry receipt 'Read timeline' rendered (screenshot edit-live-loop.png; engine autosave 'markers' 400 is pre-existing, not bridge) |
| design | BRIDGED (session create) | prod quote card verified (9cr real math); confirm continuation reworked serverless-safe |
| distribute | WIRED (suggestCadence direct) | dev smoke PASS (linkedin 3x/wk + rationale) |
| analyze | BRIDGED (analyze submit + polling) | queued artifact resolves from real task status; report render still MOCK |

## Confirm gates (serverless-safe continuation pattern)
| Gate | Status | Evidence |
|---|---|---|
| spend (design) | DONE (pattern) | quote ends stream; answer re-posts; server re-derives price |
| spend (analyze) | DONE (pattern) | same mechanism |
| publish (CalOS) | DONE (pattern) | gate card w/ real targets; accept queues idea-stage cards via bridge (smoke PASS; nothing auto-publishes) |
| destructive (edit high-risk) | OPEN | rides the edit registry riskLevel at bridge v2 |

## Stage views
| View | Status |
|---|---|
| script (real content) | DONE — engine markdown renders |
| reel (real editor embed) | DONE — boot guard + missing-state; live mount needs real project |
| canvas | BRIDGED — VERIFIED on production: gate→confirm→session→artifact→lab embed live (9cr) |
| schedule | BRIDGED — real calendar embeds in stage |
| analyze | BRIDGED — real report embeds in stage (task id from sourceRef) |

## Feature absorption (per disposition matrix §3)
| Surface | Status |
|---|---|
| ThinkForge ideation as turns | BRIDGED — REAL ideas agent (editorial-plan + signals chain), idea cards in thread, click-to-draft; trends/URL-brief OPEN |
| ThinkForge→Editron storyboard export edge | OPEN |
| Editron auto-edit in-thread | DONE — 8-stage rail (canonical engine stages, telemetry-lit) + needs-input card w/ feed-it-footage CTA in the stage |
| Checkpoints/undo in thread | BRIDGED — high-risk receipts render red + undo chip → restore checkpoint turn via edit bridge |
| SaaS explainer flow | OPEN |
| Clickatron variations polling → artifact done-state | DONE — useArtifactPolling (4s, real telemetry, honest percent) |
| CalOS calendar/review rail/delivery states | OPEN |
| UploaderX platform arming + receipts | OPEN |
| Musitron/DAW audio stage | OPEN |
| Avatar render flow | OPEN |
| Socialize link-in-bio updates | OPEN |
| Home real data (TF + Editron adapters, brand-name groups) | DONE — /api/studio/deliverables (+brands map) |
| Mission control | VERIFIED on production — In-flight 12 real rows, Your work 50, attention section honest-empty; screenshot mission-control-live.png |
| Open a Home row → hydrated session | DONE — /api/studio/deliverables/[id] seeds artifacts + stage (script content, reel→editor) |
| Composer: upload + rights gate + honest progress | DONE — presign→PUT→register chain w/ attestation, pill state, error/dismiss (A1) |
| Composer: unified media library + /api/studio/media | DONE — picker over editron/clickatron/TF/musitron; stock tab + auto-edit-from-attachment next (A2) |
| Media attachment → auto-edit pipeline | DONE (A2) — from-asset bridge creates the project; reel artifact born running; editron telemetry polling (needs_input surfaces honestly, done/error mapped) |
| ICP personas + per-screen task scripts (MatrAIx seam) | OPEN — MatrAIx R&D not in code; advisory-only |
| Account shell seam | BRIDGED — /account/{billing,brands,avatars,connections,org} resolve to the real surfaces; own skin OPEN |
| Legacy /dashboard coexistence + redirects | OPEN (Phase 7) |

## Infra
| Item | Status |
|---|---|
| Vercel branch flags (preview, vibe-content-os only) | DONE |
| Vercel stray project cleanup | OPEN (needs typed-name delete) |
| Env files in worktree (untracked) | DONE (local only) |
