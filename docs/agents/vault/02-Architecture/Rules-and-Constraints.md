---
tags:
  - rules
  - mandatory
  - constraints
created: 2026-05-24
source: Consolidated from memory/feedback_*.md, toyota_reliability_audit.md, pipeline_audit_2026_04_23.md, edge_cases_backlog.md
---

# Rules and Constraints

All rules, feedback, audit findings, and constraints accumulated across sessions. Organized by category. Every rule exists because violating it caused real breakage.

---

## Deployment Rules

### RULE: Never Delete Env Vars Without Permission
Never run `vercel env rm` or delete/modify any environment variable without:
1. Explicitly telling the user EXACTLY what will be deleted
2. Getting explicit "yes" confirmation
3. Understanding the full blast radius (which environments, which branches)

**Origin:** Accidentally deleted `NEXT_PUBLIC_AUTHORIZED_PARTIES` for all Preview branches, breaking Clerk auth on all preview deployments. `vercel env rm` with scope `preview` removed the value for ALL preview branches, not just the current one.

**How to apply:** Use `vercel env add` to create new entries. Never `vercel env rm` unless absolutely necessary and user explicitly approves. If a value needs updating, add the new value for the specific branch/environment rather than removing the old one.

### RULE: "Preview" Means Vercel, Not Localhost
When the user says "preview" they mean the Vercel preview deployment (from the `infrastructure-improvs-+Editron` branch), NOT a local dev server.

**How to apply:** Do not suggest `npm run dev` or `preview_start` for testing. Changes need to be committed and pushed to the branch, then verified on the Vercel deployment. Credits, MongoDB, GCS, fal.ai -- all the real services run there.

### RULE: Never Trigger Production Deployments from Feature Branches
1. NEVER run `npx vercel --prod` or `npx vercel promote`
2. NEVER push empty commits to trigger redeploys -- use Vercel dashboard instead
3. NEVER assume a branch is "just preview" -- verify Vercel's production branch config first
4. Feature branches deploy as PREVIEW only -- production is ALWAYS from `main`
5. When env vars change, say "redeploy from Vercel dashboard" and STOP

**Origin (2026-04-27):** An empty commit pushed to `infrastructure-improvs-+Editron` triggered a Production deploy on Vercel, overwriting the stable `main` production with an untested feature branch.

### RULE: Always Verify Deployed Result (Audit Lesson A10)
After pushing a fix:
1. Wait for Vercel deploy
2. Check Vercel logs for the specific code path you changed
3. Verify the fix is actually active, not dead code

**Origin:** The analysis model "fix" (555b90ab) was committed, pushed, and declared done -- but the factory still used gemma-4. If logs had been checked after deploy, the problem would have been caught immediately.

### RULE: Don't Assume Vercel Limits
Before setting any platform limit (Vercel maxDuration, Lambda memory, R2 limits), verify against actual plan docs.

**Origin (2026-05-06):** Assumed maxDuration 900s was valid. Vercel Pro max is 800. Build failed.

---

## Models and APIs Rules

### RULE: Never Change Model IDs Without Testing Against the Actual API
1. NEVER change a model ID string without testing it: `genAI.getGenerativeModel({ model: 'new-model' }).generateContent('test')`
2. If the test returns 404 or "not found" -- the model ID is WRONG
3. If you can't test locally -- DO NOT deploy the change
4. Read existing comments about model ID format -- they exist because someone already verified
5. The `-preview` suffix on 3.1 models is NOT optional. Google has NOT released GA versions without it.
6. When the user says "use 3.1 flash" they mean the MODEL FAMILY, not the exact ID string. ASK or verify yourself.

**Origin (2026-05-15):** Changed `gemini-3.1-pro-preview` to `gemini-3.1-pro` and `gemini-3.1-flash-lite-preview` to `gemini-3.1-flash` across 8 files. Every Gemini call returned 404. Transcript editor failed silently, fell back to fragment-pipeline. Cut quality went from 42 segments / 9.5 min to 89 segments / 13 min.

The code at editron-config.ts line 454 LITERALLY said not to do this: "Verified against Google AI API docs: name is 'gemini-3.1-flash-lite-preview' (NOT 'gemini-3.1-flash')." The comment was read and ignored.

### RULE: Never Ship a Model ID Without Testing It (Audit Lesson A1)
Before changing ANY model ID in code:
1. Check the model's actual capabilities (what modalities it supports)
2. Test with a real API call using the exact input format the code sends
3. If you can't test, state that explicitly and flag it as unverified

**Origin:** Analysis model was changed 5 times. gemma-4-31b-it was shipped as default without verifying it supports audio input -- it doesn't. Every Seedance video's 5-Track analysis silently failed for weeks.

---

## Code Quality Rules

### RULE: Follow All Rules From the First Edit, Not Retroactively
Follow ALL agent rules (Pre-Flight, Evidence Block, R9, R10, R12N, R22N, R25N) from the FIRST edit of each phase -- not retroactively after the user asks "all rules followed?"

**Origin:** User explicitly said "pls man FOLLOW ALL RULES DONT RUSH if you would follow all rules in one go it will save us lot of time and effort." Previous session required a retroactive remediation cycle after 4 rule violations were caught.

### RULE: Don't Edit Code During a Verification / Orientation Sprint
When the task is to "verify", "pick up and check", "get to know", or otherwise orient/audit:
**DO NOT edit production code.** Verify, find issues, and REPORT them with file:line + fix options —
let the user decide what to fix and when. Editing is a separate phase that needs explicit approval
(Rule 2: Phased Execution). Finding a verified bug is NOT license to fix it mid-verification.

If a fix is made anyway, you owe ALL of: (a) audit it against every rule, (b) production-level check
(Rule 30N), (c) confirm intent + verify (tsc/eslint/tests/behavioral), (d) explicit user go before commit/push.

**Origin (2026-05-30):** During a "pick up the MG Tier 3 sprint / verify the end-to-end render" task, found a
verified silent bug (backdrop `surface.surfaceOpacity` → should be `color.surfaceOpacity`) and fixed it inline
without being asked. User: "no you shouldn't have been editing in verification or get-to-know sprint." The fix
was correct and fully verified — but editing wasn't in scope. Verify-and-report; fix only when approved.

### RULE: Verify Value FORMAT, Not Just Magnitude (Rule 29N extension)
When setting any string an external API parses (durations, timeouts, dates, enums, units, IDs), verify the exact
FORMAT/syntax it expects — not only that the magnitude is in range. Test against the real API if possible; if not,
match a KNOWN-WORKING example in the same codebase exactly. **Red flag: if two adjacent/similar settings use
DIFFERENT formats, one is probably wrong — stop and verify which.**

**Origin (2026-05-30):** Set QStash `Upstash-Timeout: '800'` (bare number). Verified 800 ≤ plan max (900s) but NOT
the format. QStash parses it as a Go duration requiring a unit → HTTP 400 "missing unit in duration" → broke the
TRIBE dispatch AND the user's whole auto-edit run (worse than before the fix). The adjacent `Upstash-Delay: '2s'`
used a unit (the missed red flag); a pre-existing bare `'300'` elsewhere (also wrong) made bare look normal. Fix: '800s'/'300s'.

### RULE: Quality Over Speed (Rule 28)
1. NEVER skip the Pre-Flight Checklist because "the user wants it fast"
2. NEVER skip verification because "I'll verify after"
3. The user saying "lets go" means "lets go WITH QUALITY" not "skip checks"
4. If following rules slows you down: that's the point. Slow is smooth, smooth is fast.
5. The user explicitly said: "I don't want speed. I want quality. Don't rush."

### RULE: Always Run ESLint Alongside TSC
Run BOTH after every phase:
```
npx tsc --noEmit --skipLibCheck
npx eslint <changed-files> --quiet
```

**Origin (2026-05-02):** Shipped 22+ eslint warnings across multiple commits because only tsc was run. Unused imports, `require()` instead of `import`, `let` on never-reassigned vars -- all invisible to tsc but caught by eslint.

### RULE: Config Changes Are NOT Code Changes (Audit Lesson A2)
After changing ANY config/default value:
1. grep for EVERY place that value is read (env var name, hardcoded string, import path)
2. Update ALL locations, not just the config file
3. Verify with grep that zero hardcoded references to the old value remain

**Origin:** editron-config.ts was updated to `gemini-3.1-flash` but gemini-model-factory.ts still hardcoded `gemma-4-31b-it`. The config fix was dead code.

### RULE: Never Change a Value Reactively Without Understanding WHY (Audit Lesson A3)
When something times out or fails:
1. STOP. Read the error. Read the code path. Understand the actual bottleneck.
2. Is the timeout the problem, or is the operation genuinely too slow?
3. If too slow, fix the operation (simplify schema, use faster model, reduce data). Bumping the timeout is a band-aid.

**Origin:** Parser timeout changed 4 times (90 -> 60 -> 45 -> 90 -> 120). Each change was reactive. Root cause was never analyzed.

### RULE: Every Fix Must Reach ALL Code Paths (Audit Lesson A4)
After fixing a bug:
1. grep for the PATTERN you fixed, not just the one file
2. If 3 files have the same bug, fix all 3 in the same commit
3. Verify with grep that zero instances of the broken pattern remain

### RULE: Never Ship a Feature Without Verifying Downstream Consumers (Audit Lesson A5)
Before committing a feature:
1. Trace the data flow from creation to final consumption
2. Every consumer must handle the new data shape
3. If consumers aren't ready, DON'T ship the feature -- ship the consumer support first

**Origin:** Montage sub-shots were added, reverted, re-added (3 times). Each add broke because downstream consumers were not ready.

### RULE: One Source of Truth for Every Value (Audit Lesson A6)
Before adding ANY constant, config value, or default:
1. Check if it already exists as a constant/config elsewhere
2. If yes, import and use the existing one
3. If no, create ONE source of truth and import it everywhere
4. NEVER duplicate a value with a hardcoded copy

**Origin:** ROW constants hardcoded in 13+ files. Model IDs hardcoded in 4+ files. Timeouts in 6+ files.

### RULE: Verify After EVERY Edit, Not Just Type-Check (Audit Lesson A7)
After editing UI code:
1. Type-check is necessary but NOT sufficient
2. If a preview server is available, verify visually
3. If not, trace the render path: does the data exist? Is the condition true? Is the component mounted?

### RULE: Do Not Stack Fixes Without Testing Between Them (Audit Lesson A8)
1. One fix, one commit, one verification
2. If the user asks for multiple fixes, do them sequentially with verification between each
3. Never batch more than 3 closely-related changes in one commit

**Origin:** Multiple fixes batched into "Bundle" commits (5-15 changes each). When something broke, impossible to isolate which fix caused it.

### RULE: Before Changing Architecture, Check What Exists (Audit Lesson A9)
Before building infrastructure:
1. Search the codebase for existing patterns that solve the same problem
2. If a pattern exists (like QStash for async jobs), use it
3. Don't reinvent what already works

**Origin:** Video generation went through 4 architectures in 3 hours (blocking -> Redis -> Redis+fallback -> QStash). QStash was already used by Clickatron in the same codebase.

### RULE: Never Use Single-Source Gate for Mode 2
Do NOT add blanket single-source gates that suppress all transitions/SFX/keyframes for Mode 2.

**Origin (commit a42a358d):** Already tried and reverted. "A single uploaded file can contain multiple distinct scenes (vlog with locations, wedding ceremony+reception, compilation). The right approach: use continuity scores to decide per-boundary."

### RULE: Always Query Graphify Before Architecture Decisions
Read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before architecture changes. Use `graphify query` CLI for cross-module questions.

**Origin:** User built graphify specifically for this purpose. 1673 nodes mapping the full codebase architecture. Skipping it means missing cross-module dependencies.

### RULE: Don't Skip Observed Bugs
Every observed bug is a free finding. Documenting costs 30 seconds. Rediscovering costs hours. spawn_task or add to editron_master_remaining IMMEDIATELY when any bug is spotted.

### RULE: Don't Use Stale Memory as Ground Truth
For any claim about "what exists" or "what phase we're in" -- verify against actual code (file exists? function exists? commit exists?), not memory files. Memory files decay. The codebase + git log IS the truth.

**Origin (2026-05-06):** Referenced a 41-day-old roadmap.md as current state. Phase C commits existed. Memory was wrong.

### RULE: Don't Skip Compression for Long Videos
Always compress. Adapt settings (resolution, bitrate, timeout) by duration, but never skip entirely. Even if compression takes a while, 260MB -> 90MB = 3x faster upload.

### RULE: 429 Retry Is a Fallback, Not a Fix
When adding retry logic, ask: "what's causing the error?" If the cause is architectural (Worker concurrency), fix the architecture (presigned URLs). Retry is only valid for truly transient errors (network blips).

---

## 10 Audit Lessons (from 480-Commit Audit, 2026-04-14)

These 10 lessons were derived from patterns of failure found in a 480-commit audit. Each rule exists because it was violated and caused production breakage:

| ID | Rule | One-Line Summary |
|----|------|------------------|
| A1 | Never ship model ID untested | gemma-4-31b-it shipped without verifying audio support; 5-Track silently failed for weeks |
| A2 | Config != code | Config updated but factory still hardcoded old value; fix was dead code |
| A3 | Understand WHY before changing | Parser timeout changed 4x reactively; root cause never analyzed |
| A4 | Fix reaches ALL code paths | "Kill duplicate transitions" only killed 1 of 2 systems |
| A5 | Downstream consumers ready first | Montage sub-shots added/reverted/re-added 3x; consumers not ready |
| A6 | One source of truth | ROW constants in 13+ files; model IDs in 4+ files |
| A7 | Verify beyond type-check | Sub-shot thumbnails committed but component might not render |
| A8 | One fix, one commit, one verify | Bundle commits (5-15 changes) made isolation impossible |
| A9 | Check existing patterns first | Video gen went through 4 architectures in 3 hours; QStash already existed |
| A10 | Verify deployed result | Analysis model "fix" committed but factory still used old model |

---

## Pipeline Audit Findings (v3 Verified, 2026-04-24)

Overall score: **4.1/10** against "Would Marvel's post-production team trust this output?" bar.

### Verified Scores by Stage

| Stage | System | Score | Critical Gap |
|-------|--------|-------|-------------|
| 1 | Scene Parser | 4/10 | `narrativeArc` enum: 5 values (doc has 20+). Zero cultural awareness |
| 2 | Storyboard Images | 3/10 | Hardcoded "rule of thirds". No cinema-config imports |
| 3 | Video Generation | 5/10 | Cinema config wired but only 4/8 prompt elements |
| 4a | TTS | 3/10 | Speed param exists but never set. Zero WPM tiers |
| 4b | BGM | 3/10 | Binary BPM (120-140 or 80-100). Doc has 7 tiers |
| 4c | SFX | 4/10 | 3-tier fallback works. No three-layer sound model |
| 5 | Finalize | 5/10 | Assembly solid. No platform-specific delivery |
| 6a | Unified Intelligence | 6/10 | Murch referenced. Eisenstein/Pearlman/Tarkovsky: zero |
| 6b | Intent Translator | 6/10 | Waterfall architecture sound. Mechanical not emotional |
| 6c | EDL Executor | 5/10 | Budget enforcement good. SFX vol 0.25 vs config 0.3 |
| 6d | Quality Review | 3/10 | ~7 checks. Doc says 24+ checks |
| S1 | Asset Briefing | 5/10 | 5/8 AI artifact detectors |
| S2 | Continuity | 3/10 | Keyword overlap. No 5-Track data |
| S3 | Profile Detection | 4/10 | Semantic embeddings added. Zero cultural context |
| S4 | Config | 6/10 | Ducking params match. Missing LUFS, caption specs |
| S5 | Asset Search | 4/10 | Skeleton. Embeddings never written |

### Fix Categories
- **A) Quick wins (days):** Config wiring, temperature fixes, dead code removal
- **B) Prompt engineering overhaul (1-2 weeks):** Parser structures, storyboard composition, audio creative control
- **C) Cultural awareness layer (2-3 weeks):** Parser + storyboard + video + audio need cultural technique menus
- **D) Quality gate buildout (1 week):** Full implementation of 24+ checks per doc
- **E) Asset-centric infrastructure (4-6 weeks):** Mode 2 user footage support

### Key Insight
Creative doc v2 philosophy: "No rules -- only menus of techniques." Current pipeline does the opposite: hardcoded rules everywhere. The fix pattern: replace hardcoded defaults with technique menus, let LLM or rule-engine select from menu based on context.

---

## Toyota Reliability Audit Findings

Methodology: Toyota Production System "stop the line" philosophy. Find every silent failure, every timing assumption, every swallowed error, every un-validated data boundary.

### Audit Cadence Rule
1. Before any production launch milestone
2. After any architectural change touching external APIs, workers, or data persistence
3. Every 15 commits on the active branch
4. When user reports unreliability
5. Before adding a new external dependency

### Still Open (Post 2026-04-19)

**External Deps:**
- A.fal.ai.5 -- no cross-service circuit breaker (per-call retry only)
- A.gemini.5 -- no API key expiry detection (401/403 don't trigger reauth)
- A.deepgram.1 -- stream read has no timeout
- A.deepgram.2 -- transcription fallback chain has no global deadline

**Race / Silent:**
- B.race.5 -- 15-min stale batch window arbitrary
- B.race.6 -- finalize to BGM/SFX dispatch race (QStash fire-and-forget, `.catch(() => {})` silent-swallow)
- B.race.7 -- video to Director dispatch backstop partial (only 1 retry, silent-swallow on fallback)
- B.data.3 -- ~12+ `as any` in lib/ alone, hiding null access in hot paths

### Resolved Items (Selected)
- fal.ai retry loop, Promise.race cleanup, extractVideoUrl null handling (Bundle 4)
- Safe JSON parse via `llm-json-safe-parse.ts` (Bundle 4)
- Gemini 429 retry wrapper (Batch 4)
- Storyboard/generate 504 fixed via QStash workers (Bundle 4)
- Director lock enforced in autosave + manual save path
- Overlay mutation + dedup (edl-executor)
- Screen zone validation for Zone 3 reservation (Batch 5)

---

## Edge Cases Backlog

### Image Generation
- Style anchor lost if Scene 0 is a montage (FIX 8 style anchor only captures from standard parent path)
- Failed sub-shot falls back to first sub-shot image (purpose-built parent fallback would be better)

### Video Artifacts
- Netflix VOID model -- removal ONLY, not editing. Requires A100 GPU. Apache 2.0.
- Pika Swaps -- replacement + editing via API. Limited to first 5s, 25MB max.
- Wan VACE (fal.ai) -- video inpainting via mask + prompt. $0.04-0.08/sec.
- Re-generation approach -- slop detection flags artifacts, could auto-trigger regeneration

### Editor / UI
- Still frames at scene start (1-2s) -- HTML5 Video buffers, rendered output fine
- neon-nights filter uses hue-rotate(270deg) -- destroys skin tones, avoid for people content
- Editron AI Chat unstable/unusable -- needs dedicated audit
- On-screen text from script is always-on -- should be optional/profile-driven
- Caption style architectural drift -- 4 parallel definitions of "caption style" exist

### Libraries Researched (Integration Deferred)
- [[APIs-Models-Keys-Costs|Motion]] -- React animation library for editor UX polish
- Duix Avatar -- AI digital human cloning for presenter videos
- ImageBind (Meta/FAIR) -- cross-modal embedding for SFX/visual validation
- OpenScreen -- screen recorder with auto-zoom for Phase F

---

## Session-Specific Feedback (2026-05-06)

- Don't assume Vercel limits -- verify against actual plan docs
- Don't skip compression for long videos
- Don't skip observed bugs -- document immediately
- Don't use stale memory as ground truth -- verify against actual code
- Don't speed-run phase audits -- use git log and grep, not memory snapshots
- 429 retry is a fallback, not a fix -- fix root causes
- User wants thorough investigation, not quick answers

---

## Cross-References

- [[Prompt-Engineering-Methodology]] -- Proven prompt engineering process
- [[APIs-Models-Keys-Costs]] -- All API/model/cost information
- [[Pipeline-Investigations]] -- Detailed bug investigation reports
