---
name: Agent Operating Rules — MANDATORY
description: READ BEFORE EVERY RESPONSE. Mechanical overrides that override default behavior. Violations = broken output.
type: feedback
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# AGENT OPERATING RULES — MANDATORY

**These rules override all default behaviors. Check EVERY rule before EVERY action.**

---

## PRE-WORK

### Rule 1: Step 0 — Clean Before Refactoring
Before ANY structural edit on a file >300 LOC:
1. Remove dead props, unused exports, unused imports, debug logs
2. Commit cleanup separately
3. THEN start the real work

### Rule 2: Phased Execution
- Never touch >5 files in a single phase
- Complete phase → run verification → wait for explicit approval → next phase
- No skipping ahead

---

## CODE QUALITY

### Rule 3: Senior Dev Override
Do NOT take the lazy path. If architecture is flawed, state is duplicated, patterns are inconsistent — fix them. Ask: "What would a senior, experienced, perfectionist dev reject in code review?" Fix all of it. No assumptions. No shortcuts.

### Rule 4: Forced Verification
NEVER report a task as complete until BOTH pass:
```
npx tsc --noEmit --skipLibCheck              # Type correctness
npx eslint <changed-files> --quiet           # Code quality (unused vars, let/const, imports)
```
These check DIFFERENT things — tsc ignores unused vars, eslint ignores type errors. Running only tsc is a Rule 4 violation. Fix ALL errors AND warnings. If eslint is not configured, state that explicitly.

**Why both:** Session 2026-05-02 shipped code with 22+ eslint warnings across multiple commits because only tsc was run. Unused imports, `require()` instead of `import`, `let` on never-reassigned vars — all invisible to tsc.

---

## CONTEXT MANAGEMENT

### Rule 5: Sub-Agent Swarming
Tasks touching >5 independent files → MUST launch parallel sub-agents (5-8 files per agent). Sequential processing of large tasks = context decay = bugs.

### Rule 6: Context Decay Awareness
After 10+ messages: RE-READ any file before editing it. Do NOT trust memory of file contents. Auto-compaction silently destroys context. Editing against stale state = the #1 cause of wrong fixes.

### Rule 7: File Read Budget
Files >500 LOC → MUST use offset and limit parameters to read in chunks. Never assume a single read captured the complete file.

### Rule 8: Tool Result Blindness
Results >50K chars are silently truncated. If any search returns suspiciously few results → re-run with narrower scope. State when truncation is suspected.

---

## EDIT SAFETY

### Rule 9: Edit Integrity
1. Re-read the file BEFORE every edit
2. Make the edit
3. Re-read the file AFTER to confirm it applied correctly
4. Max 3 edits to the same file before a full verification read

### Rule 10: No Semantic Search
When renaming or changing any function/type/variable, search separately for:
- Direct calls and references
- Type-level references (interfaces, generics)
- String literals containing the name
- Dynamic imports and require() calls
- Re-exports and barrel file entries
- Test files and mocks
A single grep is NEVER enough.

---

## NIMIT'S RULES (non-negotiable)

### Rule 0: Universal Content Compatibility
Must work for: product ads, brand ads, website ads, UGC, tutorials, talking heads, any business content. Code that only works for one content type is BROKEN.

### Rule 1N: Post-Phase Verification
After EVERY phase, verify nothing is broken/unwired/placeholder/conflicting.

### Rule 2N: No Fallbacks as Solutions
Fix root cause. Fallbacks mask problems.

### Rule 3N: Adversarial Testing
Find every way it can fail before declaring done.

### Rule 4N: Never Delete Env Vars
NEVER run `vercel env rm` without explicit user permission.

### Rule 5N: "Preview" = Vercel Preview
Not local dev server.

### Rule 6N: Deep Dive Before Fixing
Understand the entire system before touching code. Read every file, every line.

### Rule 7N: Ken Burns = Last Resort
Animated stills is ABSOLUTE LAST RESORT.

### Rule 8N: Script Duration is King
If the script says 4s, show 4s.

### Rule 9N: Understand Assets
System should understand each asset and overall video/script/intent.

### Rule 10N: No Assumptions
Check the actual data, code, and user choices. NEVER assume behavior. The caption fiasco happened because of an assumption. Every assumption is a potential bug.

### Rule 11N: Bigger Picture Solutions
Every solution, fix, or suggestion MUST consider the entire infrastructure and workflow — not just the immediate problem. Content production is a dynamic field. Hardcoded fixes break for different content types. Solutions must be flexible, configurable, and work across the full range of B2B content (product ads, brand ads, UGC, tutorials, talking heads, etc.).

### Rule 11.75N: Toyota Reliability Audit (MANDATORY before scale milestones)
**Treat silent failures as defects.** Run the Toyota-style reliability audit documented in `memory/toyota_reliability_audit.md` at these trigger points:
1. **Before any production launch milestone**
2. **After any architectural change that touches external APIs, workers, or data persistence**
3. **Every 15 commits** on the active branch (drift detection)
4. **When the user reports unreliability** (regression, silent failure, unexpected behavior)
5. **Before adding a new external dependency**

**How to run the audit:**
- Launch 2+ parallel Explore agents with Toyota Production System framing
- Each must return file:line for every finding
- Each finding tagged P0/P1/P2 by blast radius
- Each finding describes: what happens / is it silent / detection path
- Merge findings into `memory/toyota_reliability_audit.md` with dates + status
- Open P0 items become Tier-0 backlog before new feature work

**Do NOT silently swallow errors.** Every `catch {}` block is a defect. Every `as any` cast is hidden state. Every "just works" fallback masks a root cause. Make failures loud at the source.

**Every external API call must have:** timeout, retry logic (with exponential backoff for transient errors), failure visibility via pipelineWarnings, and a graceful degradation path.

### Rule 11.5N: Project Decision Log (MANDATORY for Phase A3 + any architectural Editron work)
**Read first, update often.** Maintain `memory/phase_a3_decision_log.md` (or equivalent for the active phase) with:
- Every architectural decision + alternatives rejected + why
- Current state of all tracked bugs
- Files touched per commit with rationale
- User feedback that influenced decisions

**When to update:**
1. **After every commit** related to the active phase
2. **Every 10 chat turns** even if no commit happened (drift detection)
3. **When the user pivots strategy** (record what changed and why)
4. **Before starting a new sub-phase** (record the plan + alternatives considered)

**Why this rule exists:** As chat context grows, accuracy degrades. The user explicitly noted this on 2026-04-08. The decision log is the rolling source-of-truth that survives compaction. **Read it FIRST in any new session before touching code.**

### Rule 12N: Code Quality Standards (Priyank Standard)
- **One concern per commit.** Don't mix features + bug fixes + optimizations.
- **Comment old vs new pattern** when changing an approach, with rationale.
- **Don't touch business logic when optimizing.** Perf fixes are separate from feature changes.
- **Use proper types, not `as any`.** If a type is missing, add it to the interface first.
- **Test in isolation before committing.** Verify the single change works before moving on.
- **No experimentation in production code.** If unsure, test in debug panel first.

### Rule 17N: Deliberate Before Implementing (MANDATORY)
Before proposing or implementing ANY solution, you MUST deliberate:
1. **Is this actually the best approach?** — not just the first idea, the BEST one.
2. **What alternatives exist?** — different tech, tools, techniques, patterns, libraries, APIs.
3. **What are the tradeoffs?** — compare at least 2-3 approaches on: quality, complexity, maintainability, performance, user experience.
4. **Would a domain expert do it this way?** — research what the industry standard is. Check the web if unsure.
5. **Am I settling?** — if the answer is "it works," that's not good enough. It must be the RIGHT solution.

This step is NEVER skipped. Every solution gets scrutinized before code is written. Quick hacks that "just work" are how technical debt accumulates. The 5 minutes spent deliberating saves hours of rework.

### Rule 18N: Production Stability Standard (MANDATORY — the Insturix vision)

**The goal is not to ship features. The goal is to become the industry-standard tool.**

Insturix's vision (affirmed by user 2026-04-16): a tool professionals trust enough that they DON'T think twice, DON'T re-run to check, DON'T read docs every time. A standard, not a toy. A workhorse, not a novelty.

Every code decision must preserve or increase this trust:

1. **Deterministic where possible.** Same inputs produce same outputs. Random seeds must be seeded (Math.random → PRNG with stable seed). "It worked last time" is a failure mode.
2. **Rule-driven over LLM-driven wherever rules suffice.** LLMs are for understanding (parsing, analysis, vision). LLMs are NOT for mechanical decisions that rules + data can determine. A sound designer doesn't wait for an AI to suggest whooshes — they look at the cut and place one. The system should work the same way.
3. **Fail loud, fail visible.** Silent failures are defects. Every external call logs success/failure. Every `catch {}` is a bug. Every fallback fires a `pipelineWarnings.degraded()` entry.
4. **Graceful degradation, never "just works sometimes."** If the primary path fails, the fallback is intentional and documented — not "well, it mostly works."
5. **Professional output by default.** No "close enough." If creative_production_knowledge.md says brand-ad cuts/min is 6-10, the system produces 6-10, not 22. Violations are bugs.
6. **Consistency across content types.** Rule 0 (Universal Content Compatibility). A product ad and a tutorial and a brand film all get professional output. Not "works for one type."
7. **Observable in production.** Every pipeline run can be inspected via logs + MongoDB state. "Not sure what happened" is never an acceptable answer.

When a feature has to choose between "clever + probabilistic" and "simple + deterministic": choose simple. Cleverness is for edge cases, not the hot path.

### Rule 20N: Document Every Finding (MANDATORY — compounding knowledge across sessions)

**When you find ANY of these during investigation, debugging, or code review, you MUST document it before moving on:**
- Bug (actual or suspected)
- Design gap (feature missing, incomplete implementation)
- Architectural conflict (two systems disagreeing)
- Silent failure (error swallowed, degraded path without notification)
- Performance issue (slow path, wasteful pattern)
- Vulnerability (security, data exposure, privilege escalation)
- Cross-file inconsistency (different truth in different places)
- Rule violation (any AGENT_RULES or memory file rule broken in code)

**Why this rule exists:** Investigations take hours. Context decays session-to-session. If the finding isn't written down, the next session rediscovers it from scratch — wasting hours and often arriving at a worse conclusion due to compaction. Compounding knowledge requires artifacts.

**Where to document:**
1. **Long-form investigation reports** → `pipeline_investigations.md`
   - Use the entry template at the top of that file
   - Include file:line evidence, impact analysis, 2+ proposed fix options
   - Update status when work progresses (open → investigating → fixed-partial → fixed)

2. **Short entries / backlog items** → `editron_master_remaining.md`
   - Bug tables or tier-appropriate section
   - Link back to `pipeline_investigations.md` entry if one exists

3. **Reliability / silent-failure patterns** → `toyota_reliability_audit.md`
   - Failures in external APIs, async dispatch, data integrity boundaries

4. **Rules derived from mistakes** → `feedback_audit_lessons.md` or a new rule in `AGENT_RULES.md`
   - Only when a finding reveals a PATTERN worth codifying

**When NOT to document:**
- Trivial fixes applied in the same commit (e.g., typo, linter warning) — commit message is enough
- Findings explicitly resolved within the same investigation session (include in that entry's "Decision / Action")

**Non-negotiable elements of any entry:**
- **Date** (YYYY-MM-DD)
- **Severity** (P0/P1/P2)
- **File:line evidence** (not "around line X" — the exact line)
- **Impact** (who/what is affected, which content types)
- **At least 2 fix options with tradeoffs** (Rule 17N alignment)

**Format is non-negotiable so future sessions can grep/search effectively.**

### Rule 21N: Commit Audit Mandate (MANDATORY — every commit updates the audit doc)

**The canonical commit history audit lives at `memory/commit_history_audit_2026_04_21.md`.** It maps every commit on `infrastructure-improvs-+Editron` (branch-start 2026-03-21 onwards) to SHA + scope + thematic cluster.

**Why this rule exists:** Without a single source of truth for "what was actually shipped," sessions start making false claims about state ("X was built" when it was reverted; "Y is wired" when it's still orphan). The audit is ground truth; memory files are stale. Without mandatory updates, the audit decays to useless within a week.

**Enforcement — on EVERY commit you create:**
1. Add a bullet to the relevant week section in `commit_history_audit_2026_04_21.md` with:
   - SHA (short form) + commit title
   - One-line scope (files touched, lines changed if >50)
   - Thematic cluster (which week/topic it belongs to — create a new cluster heading if none fits)
2. If the commit ships a S-series/C-series/phase-labeled change, link to its memory entry (e.g., S-30 → editron_master_remaining.md entry).
3. If the commit reverts a prior commit in the audit, mark the prior entry with `*(reverted in SHA)*` and add the revert as its own bullet.
4. If the commit wires a previously-orphan service, update the "Still-orphan services" list at the bottom of the audit.

**Non-negotiable:** If you forget to update the audit, the next session operates on stale ground truth. Update it in the SAME session, SAME response, as the commit.

**When the audit rolls over:** When the date in the filename is >30 days old, create a new file (e.g., `commit_history_audit_2026_05_21.md`) that covers commits since the last audit's end-date. Link the new file from MEMORY.md and reference the previous audit for older history.

### Rule 23N: NEVER MVP — Always Production Level (MANDATORY)

Every feature, fix, or system built must be production-grade on the FIRST implementation. No "MVP for now, proper fix later." The proper fix IS the first fix.

**When deliberating (Rule 17N):** If one option is "quick/MVP/band-aid" and another is "proper/production/correct," ALWAYS pick production. If the production solution takes longer, state the effort honestly but don't downgrade. If blocked (needs infra not yet available), DEFER entirely — don't ship a band-aid.

**Why this exists:** User explicitly rejected an MVP buffer fix in favor of the production solution. Quote: "wtv we build needs to production level not MVP ever."

**How to apply:**
- "Option A as follow-up" is not acceptable. Option A IS the fix, or defer.
- No `// TODO: replace with proper implementation` in shipped code
- No hardcoded values that "work for now" — use the config system or the creative doc's specs
- If you can't build it right, say so and move on. Don't build it wrong.

### Rule 22N: Query Graphify Before Editing (MANDATORY)

Before modifying any file, query the Graphify knowledge graph for semantic context the CRG misses:

```bash
graphify query "what connects [concept A] to [concept B]" --budget 1500
```

Or use `/graphify query "..."` in Claude Code.

**When to query:**
- Before touching transition logic → query "what KB rules affect transitions"
- Before touching SFX/audio → query "what connects SFX to transitions to audio ducking"
- Before touching any service → query "what depends on [service name]"
- Before touching LLM output handling → query "what validates LLM output in the pipeline"

**Why this exists:** CRG tracks static imports/calls. Graphify tracks semantic relationships (KB rules → code, doc rationale → architecture, cross-file concepts). The T-022/T-012 violations in this session would have been caught by querying "what KB rules override transition selection."

**When to skip:** Trivial changes (typos, log messages, config values) that don't affect behavior.

### Rule 19N: The Domain Expert Check (MANDATORY extension of Rule 17N)

Before proposing an architecture for ANY feature, ask:

**"How would the professional who uses this tool actually do it?"**

- Editing a transition? → How does a film editor do it? (Murch's Rule of Six, not LLM decisions)
- Adding SFX? → How does a sound designer do it? (Watch the cut, place the sound. Not "ask the AI to suggest.")
- Color grading? → How does a colorist do it? (Skin-tone protection, scopes, scene-by-scene. Not "hue-rotate(160deg)".)
- Typography? → How does a typographer do it? (Weight contrast, x-height matching. Not "pick a random Google Font.")
- Pacing? → How does a pace editor do it? (Content-type-aware rules. Not "X cuts per Y seconds fixed.")

If your proposed architecture makes a domain expert laugh, find the architecture they'd approve of. LLM-heavy over-engineering is often the wrong answer because domain experts built reliable workflows before LLMs existed.

**Framing questions to surface bad architectures:**
- Would a sound designer wait for an AI to suggest sounds? (No.)
- Would a colorist randomly apply hue-rotate to every clip? (No.)
- Would an editor place a whoosh on a dip-to-black? (No — silence is the point.)
- Would a typographer pair Helvetica with Arial? (No — too similar to have contrast.)

The creative_production_knowledge.md doc exists because the domain experts' rules are already written down. Consult it first. Then reduce LLM reliance accordingly.

---

## PRE-EDIT CHECKLIST (MANDATORY before ANY code change)

Before writing or editing ANY file, answer these 5 questions. If any answer is "I don't know" — STOP and investigate before proceeding.

1. **What is this file?** (purpose, role in system)
2. **What does the code I'm changing DO?** (not what I think it does — what it ACTUALLY does)
3. **What depends on this code?** (grep for imports, callers, consumers)
4. **How does this change affect the bigger system?** (Rule 11N)
5. **Am I assuming anything?** (Rule 10N — if yes, verify first)
6. **Did I check blast radius with code-review-graph?** (Rule 16 — run detect-changes or query graph)
7. **Did I query Graphify for semantic connections?** (Rule 22N — run `/graphify query` or `graphify query` CLI for cross-file relationships the CRG misses: semantic edges, doc→code links, KB rule connections)
8. **Is this production-grade?** (Rule 16 — would a senior engineer at a top tech firm approve this?)
9. **Does this affect creative output?** (Rule 25N — if yes, query `creative-knowledge-graph.json` for the relevant signal/mapping/technique/constraint. Check trigger conditions, anti-patterns, weight responses, and constraints. The graph is the creative decision source of truth.)

---

## PRODUCTION-LEVEL ENGINEERING (Rule 16 — MANDATORY)

Every change must meet big-tech production standards:
- **Blast radius:** Use code-review-graph before committing to verify no unintended breakage
- **One change at a time:** Ship one fix, verify it works, then the next. No rapid-fire batches.
- **Test before deploy:** Verify locally or via test script. Don't discover issues in production.
- **Graceful degradation:** New features fall back to previous behavior on failure, never crash
- **No assumptions:** Verify env vars, API endpoints, model availability. Don't assume.
- **Monitoring:** Every code path logs success/failure to Vercel logs
- **Remotion bundle sync:** When composition code changes, redeploy Lambda S3 bundle
- **Rollback plan:** Know which commit to revert to before shipping

### Rule 24N: NEVER Trigger Production Deployments (MANDATORY — added after 2026-04-27 incident)

**NEVER push commits, run CLI commands, or take ANY action that could deploy to production.**

1. NEVER run `npx vercel --prod`, `vercel promote`, or any Vercel CLI deploy command
2. NEVER push empty commits to trigger redeploys
3. NEVER assume a feature branch is "just preview" — verify first
4. Production deploys happen ONLY from `main` branch, ONLY via the Vercel dashboard
5. If env vars need a redeploy, tell the user: "Redeploy from Vercel dashboard" and STOP

**Why:** An empty commit to `infrastructure-improvs-+Editron` triggered a Production deploy, overwriting stable `main` with an untested feature branch. This is a P0 incident — production users see broken/untested code.

### Rule 25N: Consult Creative Knowledge Graph Before Creative Decisions (MANDATORY — added 2026-05-03)

**Before ANY code change that affects the system's creative output, QUERY the creative knowledge graph.**

Graph location: `lib/editron/data/creative-knowledge-graph.json` (671 nodes, 799 edges)
Source doc: `D:\google downloads\creative_production_knowledge_v3 (1).md` (5838 lines, v3 signal-centric)

**When this rule applies:**
- Changing or adding a transition, zoom, speed, color, graphic, caption, or sound decision
- Modifying the Director Agent's 13-step execution
- Changing signal detection logic (5-Track, content-type-detector, raw-footage-processor)
- Modifying Unified Intelligence prompts or creative intent schema
- Adding/changing constraints or anti-pattern checks
- Any change to profile behavior or pacing logic
- Any change to audio ducking, beat sync, or SFX placement

**How to consult:**
1. Identify the relevant signal(s), mapping(s), technique(s), or constraint(s) by name
2. Read the node from the graph JSON (search by ID prefix: `signal:`, `mapping:`, `technique:`, `constraint:`)
3. Check edges: what triggers this? what does it produce? what constrains it?
4. Verify your implementation matches the graph's `details.trigger`, `details.antiPatterns`, `details.weightResponse`
5. If the graph says "NEVER X" — your code must enforce that. If the graph says "ALWAYS Y" — your code must do that.

**What the graph contains:**
- 49 signals (what we observe) — Part 1
- 95 mappings (when X → do Y, because Z, never W) — Part 2
- 115 techniques (what each technique does, parameters, QualityGate metrics) — Part 3
- 50 constraints (rules that can't be violated, with thresholds) — Part 4
- 71 theory nodes (Murch, Eisenstein, Pearlman — WHY techniques work) — Part 5
- 218 constants (LUFS, safe zones, platform specs — hard numbers) — Part 6
- 73 intent nodes (genre parameters, authority matrix, computation stages) — Part 0

**Why this rule exists:** The creative doc v3 is 5838 lines. No one can hold it all in context. The graph IS the doc in queryable form. Decisions made without consulting it risk violating constraints, misusing techniques, or ignoring anti-patterns — all of which produce amateur-looking output that violates Rule 18N (production stability standard).

### Rule 26N: NEVER Skip an Observed Bug (MANDATORY — added 2026-05-06)

**If you SEE a bug during investigation, you MUST document it IMMEDIATELY — even if it's not the bug you're currently fixing.**

1. **Spawn a task** via `mcp__ccd_session__spawn_task` with: file path, line numbers, root cause, fix needed
2. **OR** add it to `editron_master_remaining.md` with P0/P1/P2 severity
3. **NEVER** say "that's not the current issue" and move on. The next session won't know about it.

**Why this exists:** During the Mode 2 upload investigation (2026-05-06), the silence removal `sourceStartFrame` bug was identified mid-investigation but skipped because "it wouldn't make the video invisible." It was a P0 bug causing all 33 segments to repeat from frame 0. The user caught the skip. Every observed bug is a free finding — documenting it costs 30 seconds, rediscovering it costs hours.

### Rule 29N: NEVER Ship Unverified Values (2026-05-15)

**HARD GATE: Every value you put into code MUST be verified BEFORE committing.**

This includes: model IDs, API endpoints, constants, thresholds, formulas, config values, URLs, credentials references — ANYTHING that affects runtime behavior.

**What "verified" means:**
1. **Model IDs:** Test against the actual API: `model.generateContent('test')`. If it returns 404 or error → the ID is WRONG. Do NOT commit it.
2. **Constants/thresholds:** Must have a traceable source (industry standard, measured from data, user-specified). If invented → mark `⚠️ INVENTED — needs validation` in code AND in `constants_and_logic_audit.md`. Do NOT present invented values as facts.
3. **API endpoints/URLs:** Test with an actual HTTP request. If it 404s → it's WRONG.
4. **Formulas/logic:** Must have a rationale. "Seemed reasonable" is NOT a rationale. Either cite a source, derive from data, or flag as needing brainstorming.

**What NEVER goes into production code:**
- Stubs ("placeholder for now, will fix later")
- Hallucinated constants (numbers you made up without source)
- Unverified model IDs (test them FIRST)
- Logic decisions without production-level deliberation

**Why this exists:** Changed `gemini-3.1-pro-preview` to `gemini-3.1-pro` without testing. Model doesn't exist on Google API. 404 on every Gemini call. Transcript editor fell back to fragment-pipeline. Cut quality regressed from 42 segments to 89. The code LITERALLY had a comment saying "name is gemini-3.1-flash-lite-preview (NOT gemini-3.1-flash)" and it was ignored.

### Rule 30N: Production-Level Test for Every Logic Decision (2026-05-15)

**HARD GATE: Before implementing ANY logic decision, pass the production test.**

Ask these 3 questions:
1. **Is this production-level?** Would a senior engineer at a top tech firm approve this in code review? Not "does it work" but "is it RIGHT?"
2. **Is this scalable?** Does it work for 1 video? 100 videos? 10,000 videos? All content types? All durations? All platforms?
3. **Is this the right direction?** Not just "does it solve the immediate problem" but "does it move the architecture in the right direction?" A fix that works today but fights the target architecture is WRONG.

**When this triggers:**
- Choosing between approaches (always)
- Adding a threshold/constant (always)
- Adding a gate/condition/filter (always)
- Changing execution order (always)
- Adding or removing a code path (always)

**What fails the test:**
- "It works for the test video" — does it work for ALL videos?
- "It's the simplest approach" — simple ≠ correct. Simple AND correct = good. Simple AND wrong = technical debt.
- "We can fix it later" — Rule 23N says no. The proper fix IS the first fix.
- "The threshold seemed reasonable" — reasonable to whom? Based on what data?
- Blanket gates that break for edge cases (vlogs, compilations, multi-scene)
- Bandaid systems (DecisionBudget) instead of fixing the source

**What passes the test:**
- Data-driven decisions (measured, not guessed)
- Per-boundary/per-segment decisions (not blanket kills)
- Self-regulating systems (budget at the source, not downstream)
- Verified constants (tested against actual API/data, not assumed)
- Architecture-aligned changes (moves toward target flow, not away)

### Rule 28N: Adversarial Option Testing — see CLAUDE.md Rule 29 (canonical location)

### Rule 29N: Universal Content Coverage Through Signals, Not Presets
The system MUST handle ANY content type — including ones we've never heard of — through the signal/dial architecture, not through presets or templates.

**Why this exists:** Presets only cater to what we know. Creative fields have infinite variation — different creators, different styles, different cultures, different intentions. Building presets for every combination is infeasible. With N continuous signals at M discrete values each, the combinatorial space is M^N (currently 11^17 ≈ 505 quadrillion). This is the moat.

**The rule:**
1. NEVER build a feature that only works for known content types (presets, templates, hardcoded profiles)
2. ALWAYS build features as functions of signals — the signal combination determines behavior
3. If you can't express a feature as f(signals) → output, redesign it until you can
4. Profiles are TRAINING WHEELS — they should decompose into signal presets, not be primary drivers
5. When adding a new capability (MG, pacing, transitions, etc.), ask: "Does this work for a cooking vlog AND a brand ad AND a documentary AND a music video AND a content type that doesn't exist yet?"
6. If the answer is "only for known types" → WRONG ARCHITECTURE
7. This applies to: motion graphics composition, pacing, transitions, audio mixing, graphic density, animation style — everything

**How signals enable universality:**
- Each signal is a continuous dial (0→1), not a binary switch
- Signal combinations create emergent behaviors we never explicitly programmed
- New content types automatically get appropriate treatment if their signals are measured correctly
- Adding ONE new signal multiplies the state space by 11× (or more for continuous)

**What this means for MGs specifically:**
- Graphic type selection = f(signals), not f(content_category)
- Animation character = f(signals), not f(template_preset)
- Density/pacing = f(signals), not f(profile.cutsPerMinRange)
- Every composition should vary with signal input, even slightly
