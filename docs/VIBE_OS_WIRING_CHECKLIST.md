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
| edit | BRIDGED (chat/stream SSE) | synthetic smoke PASS; receipts from registry labels; live-loop needs a seeded reel in the deliverable |
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
| canvas | MOCK (static grid) — real lab embed OPEN |
| schedule | MOCK (static week) — real CalOS embed OPEN |
| analyze | MOCK (static scorecard) — real report embed OPEN |

## Feature absorption (per disposition matrix §3)
| Surface | Status |
|---|---|
| ThinkForge ideation/trends/URL-brief as turns | OPEN |
| ThinkForge→Editron storyboard export edge | OPEN |
| Editron auto-edit (upload→8 stages→needs_input) | OPEN |
| Checkpoints/undo in thread | OPEN (mock shows pattern) |
| SaaS explainer flow | OPEN |
| Clickatron variations polling → artifact done-state | DONE — useArtifactPolling (4s, real telemetry, honest percent) |
| CalOS calendar/review rail/delivery states | OPEN |
| UploaderX platform arming + receipts | OPEN |
| Musitron/DAW audio stage | OPEN |
| Avatar render flow | OPEN |
| Socialize link-in-bio updates | OPEN |
| Home real data (deliverable adapters) | OPEN (Phase 6) |
| Account shell (org/billing/vaults) | OPEN (Phase 6) |
| Legacy /dashboard coexistence + redirects | OPEN (Phase 7) |

## Infra
| Item | Status |
|---|---|
| Vercel branch flags (preview, vibe-content-os only) | DONE |
| Vercel stray project cleanup | OPEN (needs typed-name delete) |
| Env files in worktree (untracked) | DONE (local only) |
