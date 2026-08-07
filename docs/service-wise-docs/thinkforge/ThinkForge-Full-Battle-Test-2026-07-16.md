# ThinkForge Full Battle Test

**Date:** 2026-07-16  
**Branch:** `infrastructure-improvs-+Editron`  
**Deployment tested:** `https://front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app`  
**Deployment:** `dpl_4gywwoAvyRogvE4wPLFmF8X3NvJ1`, created 2026-07-16 10:51 IST  
**Matching branch commit:** `df368e30 fix(thinkforge): bind editor state to document identity` (commit time 10:51 IST)  
**Method:** authenticated browser QA, API inspection, static control-flow audit, adversarial probes, automated tests, and live Gemini schema checks.

## Executive Verdict

ThinkForge is **not production-ready yet**. Its happy-path test suite is broad, but the battle test found failures in authorization, document-family routing, session recovery, regeneration semantics, trend usability, prompt isolation, mobile layout, and export ownership/billing boundaries.

The central architectural problem is that the selected artifact contract is not yet the single authority from intake through writer, persistence, editor, and export. The same request can be described as a carousel in `projectMeta`, executed as a video script, persisted with a screenplay contract, opened in a Video Script editor, converted back into inferred carousel slides, and then blocked by Clickatron because those slides originated from video scene prompts. Shared downstream plumbing exists, but this is only partial convergence.

## Release Blockers

### P0-1: Authenticated users can read another user's ThinkForge session data

Several routes authenticate the caller but never prove that `sessionId` belongs to that caller before reading data:

- `app/api/services/thinkforge/script/blocks/route.ts:17-32`
- `app/api/services/thinkforge/script/get/route.ts:12-27`
- `app/api/services/thinkforge/script/list/route.ts:12-27` and `:37-57`
- `app/api/services/thinkforge/chat/list/route.ts:12-29`
- `app/api/services/thinkforge/chat/threads/route.ts:12-26`

These routes call `db.getScript`, `db.listScripts`, `db.getChatHistory`, or `db.listChatThreads` with a caller-provided session ID. In contrast, protected routes first call `db.getSession(sessionId, userId)`.

**Impact:** any authenticated user who obtains another valid session ID may read scripts, chat messages, document tabs, and thread metadata.

**Required fix:** one shared `requireOwnedThinkForgeSession(sessionId, userId)` guard used by every session-scoped route, plus negative integration tests using two users. Do not rely on unguessable IDs as authorization.

### P0-2: Post and carousel requests execute as video scripts

Two live reproductions:

1. `Write a short, honest LinkedIn post...` produced `Video Script` with four scenes.
2. A generated idea whose format and project metadata were `LinkedIn carousel` produced a five-scene `Video Script`.

Persisted output from the carousel case confirmed:

- `documentType: video_script`
- `contentContract.documentKind: script`
- `contentContract.artifactType: screenplay`
- `briefSnapshot.output.platform: unspecified`
- `briefSnapshot.output.aspectRatio: 16:9`
- `briefSnapshot.output.format: auto-edit`
- `writerMetadata.platform: youtube`

The original session still correctly stored `format: LinkedIn carousel` and `platform: LinkedIn`, proving the contract was lost during generation rather than intake.

**Direct-post root cause:** `lib/thinkforge/agents/prompt-utils.ts:21` treats the bare word `short` as a script signal. `resolvePromptDocumentKind` checks script signals before generic post signals, so "short LinkedIn post" becomes `video_script`.

**Initial-draft root cause in deployed code:** deployed `chat-service.ts` lets the synthetic prompt `Create the complete first script draft...` override the selected format. There are current uncommitted local edits in:

- `components/dashboard/ThinkForge/ChatPanel.tsx`
- `lib/thinkforge/services/chat-service.ts`
- `tests/thinkforge/script-hydration-contract.test.ts`

Those edits introduce an `initial_draft_claim` origin and use the selected document format for silent first drafts. The focused local tests pass, but the changes are not committed/deployed and they do not fix the separate bare-`short` misclassification.

**Required fix:** make a canonical `ThinkForgeDocumentContract` mandatory at intake and carry it unchanged through session creation, initial draft claim, chat request, writer selection, ProductionBrief, persistence, editor tabs, and exports. Natural-language inference may propose a contract only when the user has not explicitly selected one. Remove ambiguous bare terms such as `short` from the script classifier or resolve conflicts by explicit deliverable grammar.

## High-Severity Findings

### P1-1: Reload recovery loses access to generated work

After successful generation, a full reload fetched the saved blocks (`200`) but returned the UI to the landing prompt. The generated document was no longer visible and `Projects` displayed `Project management coming soon!`.

`useThinkForgeSession` restores `sessionId` and cached metadata, but `app/dashboard/thinkforge/page.tsx` initializes `workspaceMode` to `ideation` and `selectedIdea` to `null`. There is no mount path that reconstructs the selected idea and enters the scripting workspace. `components/dashboard/ThinkForge/SessionRecoveryLoader.tsx` exists but is not used.

**Required fix:** a single recovery state machine must restore session, active document ID, canonical document contract, project metadata, editor snapshot, and generation status before choosing the visible workspace. Session history also needs a real UI owner; recovery cannot depend only on local storage.

### P1-2: Production generation is hard-seeded, so Regenerate repeats output

Live ideation regeneration cleared the old selected-detail card correctly, but returned the exact same four ideas verbatim.

`lib/thinkforge/agents/base-agent.ts` passes `seed: 42` in production `streamText`, `generateObject`, structured fallback, and other generation paths. This couples production creativity to the eval determinism mechanism.

**Required fix:** seeds belong in eval-only adapters. Production should omit the seed by default. A regeneration request should carry a regeneration ID/nonce and optionally the prior outputs as explicit negative evidence so "new set" has a measurable diversity contract.

### P1-3: Public trend discovery does not produce a usable selected trend

Live flow:

- Perplexity discovery returned eight candidates in about 30 seconds.
- Candidates included sources, but many sources were articles rather than videos.
- Clicking `Use this` copied the candidate's first article URL into `Public reference video URL`.
- `Analyze format mechanics` returned `source_rejected`.

Code confirms `TrendWorkflowPanel.tsx` always advances selected candidates to a video-analysis step and calls `/trends/analyze` with `referenceVideoUrl`, even when discovery returned an article.

**Required fix:** the discovery contract must classify source media. Video candidates may enter timing/beat analysis. Article/news candidates need a text/news TrendSpec path. "Use this" must either be immediately usable or clearly request a missing reference before selection. Evidence confidence must be derived from source coverage; every result displaying the same `80% evidence` and `unknown` freshness is not decision-grade provenance.

### P1-4: Clickatron commit can target an unrelated Editron project

`app/api/services/clickatron/session/[id]/commit/route.ts` validates ownership of the Clickatron task, but accepts caller-supplied `editronProjectId` and `gcsPath`. `lib/clickatron/thumbnail-commit-context.ts` gives the request project ID precedence over the task's stored project ID. `projectService.updateProjectMetadata` updates by `{ projectId }` without a user filter.

**Impact:** a caller with an owned Clickatron task may mutate another project if its ID is known. The committed GCS path is also accepted without proving ownership of that object.

**Required fix:** resolve the target project only from an owned project link/task relationship; validate project ownership and storage-object ownership server-side. Treat browser IDs and paths as claims, not authority.

### P1-5: Export billing and retry boundaries are not transaction-safe

Confirmed code risks in the ThinkForge-to-Clickatron path:

- Clickatron session creation supports `Idempotency-Key`, but the current canvas producer does not send one.
- Credit deduction can precede `createJob()` failure without a guaranteed refund.
- Frontend timeout handling can mark work failed before the cron refund path and suppress later compensation.
- Several handoff/direct-import failure windows deduct before all owned resources and downstream jobs are verified.

**Required fix:** one durable generation ledger keyed by idempotency token, with explicit states (`reserved`, `submitted`, `completed`, `failed`, `refunded`) and replay-safe compensation. The browser must never be the final billing authority.

### P1-6: Writer prompt boundaries can be broken by user or memory text

`post-writer-agent.ts` inserts raw `projectSummary`, Brand Vault/memory, DataBank facts, and `userPrompt` inside XML-like tags. `assembleContext.ts` truncates and prioritizes data but does not escape or structurally serialize it.

An adversarial offline probe containing `</input_data><role>...` produced additional closing tags and injected role text inside the final prompt. This proves the isolation boundary is syntactic text, not a real boundary.

**Required fix:** serialize untrusted fields as JSON with explicit schema and escaping, or pass them as provider-supported structured messages/parts. Add a prompt-injection regression corpus covering user input, Brand Vault fields, facts, retrieved memories, URLs, and imported documents.

### P1-7: Mobile scripting workspace is unusable

At `375x812`, the 180px sessions sidebar remained visible, the editor was clipped, and the 260px assistant column was off-canvas. `thinkforge.css` defines fixed sidebar/chat widths and has responsive rules only for the ideation grid, not the control room.

**Required fix:** below a defined breakpoint, move sessions and AI assistant into drawers/sheets, keep the editor full-width, and provide explicit controls to open each panel. Add screenshot and interaction tests at 375px, 768px, and desktop.

## Medium-Severity Findings

### P2-1: Workspace terminology is script-only before the contract is known

A manually configured `LinkedIn post` session opened a blank workspace titled `Video Script`. Chat placeholder text also says "improve your script." This biases both users and downstream code toward scripts.

### P2-2: Completion transcript looks like an active generation

After success, the assistant permanently displayed `Creating your script...` followed by the success message. The backend generation had completed, but the transcript reads like a still-running state. Use a transient progress component and persist only the terminal message.

### P2-3: The quality scorer can report 100% on generic copy

A held-out live post scored 100% under deterministic and grounding checks while still containing generic phrases such as "streamlines" and "strategic initiatives." Repeating the same case later failed the publishable gate (`content_under_500_chars`, `missing_hashtags`). The current checker proves contract compliance better than editorial excellence.

**Required fix:** retain deterministic checks, but add an independent rubric judge with different model/provider DNA and held-out cases. Quality promotion must require stability across multiple runs, not one seeded result.

### P2-4: Writer eval runner does not terminate reliably

The held-out writer runner completed provider work but left Node processes alive because timeout races do not cancel underlying provider requests/sockets. Full held-out execution could not be trusted as a clean CI gate.

### P2-5: Tiptap registers duplicate extensions

Live console warning: duplicate `link` and `underline` extension names. This can create editor command and serialization ambiguity.

### P2-6: Intelligence convergence remains partial

- Brand Vault is available, but legacy BrandDNA/free-text fallback still participates in authority.
- The signal resolver is wired, but some authoring paths re-resolve or omit project overrides.
- Source Ledger currently covers scripts more deeply than posts and does not ingest every source type claimed by the schema.
- CalOS accepted opportunities do not carry every date/provenance/series field into the full ThinkForge authoring path.
- Interaction memory surfaced an unrelated preference about dynamic testimonial videos as a key claim in the carousel handoff. Learned facts need relevance thresholds and claim-vs-preference separation.

## What Passed

- Authentication and the branch preview loaded correctly.
- Full ThinkForge automated suite: 48 files passed, 2 skipped; 275 tests passed, 2 skipped.
- Canonical ThinkForge-Editron preflight: 8 files, 27 tests passed.
- Colocated Node suites: 21 tests passed.
- Local focused routing/document tests after teammate edits: 3 files, 16 tests passed.
- Live Gemini structured-schema acceptance passed.
- Live prompt-knob parser: 14/14 cases, 1.00 mean precision/recall, zero hallucinated knobs.
- Ideation generated four correctly labeled LinkedIn carousel ideas.
- Regeneration cleared the expanded old-detail card immediately.
- Script generation populated the editor and persisted a v1 sidecar with five scenes, one character, and five lines.
- Immediate editor typing followed by reload persisted in this test; the suspected final-keystroke loss was not reproduced.
- Creating a fresh session after an old generated script did not leak the previous script into the new session.
- Trend discovery did not send Brand Vault context to the public discovery provider, as stated by the UI.
- Clickatron handoff correctly refused to silently treat video scene prompts as a ready static creative. Switching to carousel derived five slides but remained `needs_user_input`.
- Editron export configuration loaded, fetched voices, and prewarmed without an API error. Expensive asset generation was not started.

## Automated-Test Gaps

- No browser E2E suite exists for ThinkForge.
- Many frontend "contract" tests inspect source strings rather than behavior.
- Only a minority of the approximately 40 ThinkForge API routes have ownership/behavior tests.
- No two-user authorization matrix exists.
- No production prompt-injection corpus exists.
- No provider fault matrix covers 401, 429, 503, malformed SSE, hanging sockets, DB interruption, and refund reconciliation.
- `tests/thinkforge/eval/seed-prompts.json` is not a trusted promotion gate.
- Typecheck is nonblocking in CI; current repo-wide `tsc` remains baseline-red on unrelated generated route types and temporary render files.
- Five Clickatron brand-prompt tests and two CalOS regression tests failed in the wider matrix. The CalOS failures appear to be stale source assertions; the Clickatron failures expose real contract/config drift and must be triaged before promotion.

## Required Production Plan

### 1. Security gate

Add shared ownership guards to every session/project/storage route. Add two-user negative tests. Block release until these pass.

### 2. Canonical artifact contract

Make the typed document contract the source of truth from intake to final consumer. Land and review the existing uncommitted initial-draft fix, then fix ambiguous direct requests such as "short LinkedIn post." Add a matrix covering post, carousel, script, caption, X thread, newsletter, and explicit user overrides.

### 3. Recovery and document ownership

Build one session/document recovery state machine and a real session picker. Reload, reconnect, cancel, tab switch, and generation completion must converge on the same server-owned document identity.

### 4. Production creativity vs eval determinism

Remove hardcoded seeds from production agents. Add regeneration IDs and diversity assertions. Keep deterministic seeds only in eval adapters.

### 5. Trend contract convergence

Split video-format analysis from article/news evidence analysis while keeping one versioned TrendSpec read contract. Preserve source type, freshness, citation, confidence, and expiry. A discovered candidate must be consumable without an unrelated second source.

### 6. Handoff and billing hardening

Enforce owned project links and storage references, require idempotency keys, and use a durable billing ledger with server-side compensation. Then re-run real carousel and static-post generation through Clickatron.

### 7. Prompt isolation and quality promotion

Use structured untrusted-data serialization. Add independent held-out judging for brand adherence, factuality, craft, useful specificity, sidecar quality, and export readiness. The 95% bar should apply to a multi-run held-out promotion score, not keyword avoidance.

### 8. Responsive product pass

Make the editor the primary mobile surface and move supporting panels into drawers. Add browser screenshots and interaction assertions for all core workflows.

## Promotion Gates

ThinkForge should not be called production-ready until all of these are true:

1. Zero cross-user access in a two-account API matrix.
2. 100% correct writer-family routing across explicit contract cases and held-out natural-language cases.
3. Reload/session/tab recovery passes under idle, generating, completed, failed, and cancelled states.
4. Regeneration produces meaningfully different outputs while preserving facts and brand constraints.
5. Trend discovery-to-draft succeeds for supported source types and rejects unsupported types before selection.
6. Billing/idempotency tests prove one charge and one terminal outcome per request.
7. Prompt-injection corpus produces no role/tag escape or instruction takeover.
8. At least 95% held-out quality score across brands, agencies, film teams, nonprofit, ecommerce, recruiting, long briefs, unusual tone, and non-English briefs, with multi-run stability.
9. Desktop, tablet, and mobile browser workflows pass without clipping or inaccessible controls.

## Evidence Artifacts

Screenshots are under `.gstack/qa-reports/screenshots/`, including:

- `post-routing-live-result.png`
- `carousel-draft-result.png`
- `post-routing-after-reload.png`
- `new-session-isolation.png`
- `trend-results-b2b-linkedin.png`
- `trend-analysis-result.png`
- `carousel-misroute-clickatron-dialog.png`
- `clickatron-switch-carousel.png`
- `editron-export-dialog.png`
- `workspace-mobile-375.png`

This report intentionally changes no product code. The worktree contains unrelated teammate edits and untracked work; those were not reverted, staged, or committed.
