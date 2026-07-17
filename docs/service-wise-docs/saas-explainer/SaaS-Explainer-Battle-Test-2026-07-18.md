# SaaS Explainer — Battle-Test Report & Remaining Work (2026-07-18)

Method: `docs/service-wise-docs/Production-Service-Battle-Testing-Playbook.md`.
Scope this pass: the **render pipeline** (`finalize` → job → Cloud Run worker → craft → Lambda → MP4) plus a full auth/security sweep of all explainer routes. **Not** a full playbook run — see "Remaining Work".

## 1. Test truth
- Worktree `editron-worktree`, branch `infrastructure-improvs-+Editron`, commits `423cf1d8` (fixes) + `ca937cc7` (ingest-reference SSRF).
- Worker image rebuilt + deployed (Cloud Run `explainer-worker`, `CRAFT_MODEL=claude-opus-4-8`, scheduler PAUSED).
- Test job cloned to 2 scenes (~10s) on grok (~1.3¢ total); DB `editron_prev`.
- Unrelated dirty worktree files (other sessions' WIP: reference-video, trends, ledger, prompt-optimization, thinkforge) captured and **deliberately excluded** from all commits.

## 2. Live render (Layer C/D-lite/E)
- 2/2 scenes crafted (9, 7), MP4 produced, cost $0.011.
- Triangulation: Mongo `status=done/progress=1/costUsd/outputUrl` all consistent with the S3 asset; asset is valid 1080p H.264+audio; frame inspected = real branded content.

## 3. Findings (severity-ordered)

### P1-1 — Render was unbilled + non-idempotent — FIXED
`/plan` charges 1 credit (script); `/finalize` (the render) had **no credit gate and no idempotency key** → duplicate/replayed finalize = N renders. Fix: server-derived idempotency key (`deriveExplainerIdempotencyKey`) + unique partial index in `createExplainerJob`; key cleared on error to allow retry.
Verification: 4/4 live Mongo tests (duplicate→same, concurrent race→1 wins, retry-after-error→new) + tsc/eslint. Files: `explainer-job-service.ts`, `finalize/route.ts`.

### P1-2 — Worker SSRF — FIXED
Worker `download()` did a bare `fetch()` on caller-supplied `productImageUrls`/`referenceImageUrls`/`referenceVideoUrl` while running as a privileged GCP SA. Fix: new `lib/shared/safe-asset-url.ts` (DNS-resolved private/link-local/metadata block; https/data only) + `redirect:'error'`.
Verification: 13/13 adversarial cases. Files: `safe-asset-url.ts`, `scripts/explainer-worker.ts`.

### P1-3 — Unverified caller `brandId`/`projectId` — FIXED
`finalize` passed them through unverified. Fix: verify `{id, userId}` ownership → 403. Verification: foreign-user→null→403 (owner half correct by construction — reuses the canonical `brands/[brandId]` pattern). File: `finalize/route.ts`.

### P1-4 — `ingest-reference` SSRF — FIXED
JSON path fetches caller-supplied `videoUrl` server-side (scheme-check only). Fix: `assertSafeAssetUrl(videoUrl)` before sampling. Verification: tsc/eslint + reused 13/13-tested guard. File: `ingest-reference/route.ts`.

### P2-1 — Rendered duration overshoots the plan — NOT A BUG
`glm-voice-fit.py:25` sizes each scene to `max(2.6, ttsDuration+0.9)*fps` — scenes correctly fit the voiceover. Forcing the plan duration would truncate narration. Root cause demonstrated; no code change.

### P3-1 — `intake` route is unauthenticated — OPEN (low)
`intake/route.ts` has no `auth()` gate. It is a **stateless validator** (no DB/billing/data access; echoes the payload). Low severity — add auth for consistency + rate-limit hygiene. Not yet fixed.

## 4. Passed (no change needed)
Status route two-user auth (404, no leak) · claim atomicity (`findOneAndUpdate`) · SIGTERM/orphan recovery · `chat-edit` (stateless, bounded patch, prompt-injection hardened, refuses infra probes).

## 5. Remaining Work (pinned — NOT done this pass)

**Verification gap**
- [ ] **Authenticated live end-to-end (§10.6):** double-submit `finalize` against the deployed app to confirm one job/one charge. Blocked headless by Vercel Deployment Protection + Clerk — needs a real browser session (`/setup-browser-cookies` + `/browse`).

**Playbook sections not covered**
- [ ] **§4C Live provider faults:** craft-model 429/5xx/malformed/refusal injection.
- [ ] **§4D Authenticated browser QA:** studio UI click-through with before/after screenshots for every action, all workflows.
- [ ] **§5 Adversarial state (live):** reload-during-generation, two-tab concurrency, item-A→B isolation, timeout→late-success reconciliation.
- [ ] **§6 Contract mutation matrix:** N=M / N<M / N>M / N=0 script→scene mapping; platform-max < requested; user changes M after plan.
- [ ] **§7 AI quality battle tests:** dev-seed / held-out / adversarial sets, multi-run 95% threshold, independent judge. (This is the "basic vs Lovable" quality axis — separate from the pipeline.)
- [ ] **§11 promotion gates:** re-run the full gate list once the above close.

**Other workflows (only static-audited this pass; not full matrix)**
- [ ] `plan`, `ingest-doc`, `intake`, `chat-edit` — full reload/navigation/duplicate/two-tab/mobile matrix.

**Product follow-ups (additive, not bugs)**
- [ ] `intake` P3 — add auth gate.
- [ ] Target-length control: trim the SCRIPT to hit a duration target (since duration is VO-driven), e.g. an "8-10s max" knob.
