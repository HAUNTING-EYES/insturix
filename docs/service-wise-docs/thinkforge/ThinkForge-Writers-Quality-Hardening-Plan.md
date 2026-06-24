# ThinkForge Writers â€” Quality Hardening & Knowledge Re-Wire Plan

**Owner handoff:** for Codex. Self-contained â€” assumes no prior conversation context.
**Repo:** `Front-End` (nested working copy `Front-End-main/Front-End-main`), branch `main`.
**Stack:** Next.js 15, Vercel AI SDK (`ai`), Gemini 2.5 Flash via `@ai-sdk/google`. Package manager: pnpm.
**Date:** 2026-06-22.

---

## 0. TL;DR

ThinkForge's live content generators are `PostWriterAgent` and `ScriptWriterAgent`. Commit `ee216913` ("flatten architecture") made them the live path but (a) shipped them with weaker prompts than the agent they replaced, and (b) disconnected them from two existing knowledge systems â€” the **Writing Knowledge Graph** and the **Content Signal Profile**. A new eval harness now measures them at scale. The data shows the exact gaps the flatten created: filler leaks, missing CTAs, and dropped/reformatted facts.

This plan: harden the two writer prompts (Gemini prompt-guide + Rule 35), re-wire the two knowledge systems the legacy agent still uses, and gate every change on the eval. Net effect: recover the rigor the flatten dropped without un-flattening the architecture.

**Do the phases in order. Each phase is gated by the eval harness. Do not start a phase until the prior phase's acceptance criteria pass.**

---

## 1. Background â€” how the live path works today

User prompt â†’ `chat-service.ts` â†’ `detectContentPath(userPrompt, docType)` (`lib/thinkforge/agents/prompt-utils.ts:134`) â†’ `'post'` or `'script'`:

- **post** â†’ `new PostWriterAgent().runStructured()` (`lib/thinkforge/services/chat-service.ts:852`)
- **script** â†’ `new ScriptWriterAgent().runStructured()` (`chat-service.ts:882`)

Both extend `StructuredAgent` (`lib/thinkforge/agents/base-agent.ts`) and emit schema-validated JSON via `generateObject` (`PostWriterResultSchema` / `ScriptWriterResultSchema`).

What the live writers inject into the prompt today (`post-writer-agent.ts:51-105`, `script-writer-agent.ts:45-88`):
- `context.projectSummary`
- `context.systemBrief` (Brand DNA, labeled "Brand DNA & Memory")
- `retrievedContext.projectFacts` + `globalFacts` (RAG DataBank)

What they DON'T inject (but the legacy `ScriptAuthorAgent` does):
- **Writing Knowledge Graph** techniques + Anti-AI constraints â€” `selectAllTechniques()` / `getConstraints('Anti-AI Constraints')` from `lib/thinkforge/data/writing-graph-query.ts`, fed by `extractSignalsFromContext()` (`lib/thinkforge/data/extract-signals.ts`). See `script-author-agent.ts:52-90` (`buildWritingKnowledgeBlock`).
- **Content Signal Profile** â€” `resolveContentSignalProfile()` + `formatContentSignalProfileForPrompt()` from `lib/thinkforge/signals/`. See `script-author-agent.ts:92-107` (`buildContentSignalProfileBlock`) and the wiring template in `script-draft-agent.ts:99-118`.
- **Structured `<output_format>`** with ordered STEP 1-4 (hook â†’ body â†’ CTA â†’ hashtags) and a **source-ledger** grounding rule. See `script-author-agent.ts:110-175+`.

> NOTE: Do not confuse the Writing Knowledge Graph (`lib/thinkforge/data/writing-knowledge.json`) with Editron's `creative-knowledge-graph.json` (`lib/editron/...`). They are unrelated. This plan touches **only** ThinkForge. Do not modify any `lib/editron/**` file.

---

## 2. Current quality baseline (eval, 10 seeds per case)

Harness: `scripts/prompt-optimization/eval-thinkforge-writers.ts`. Run: `npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --multi-seed` (needs `GEMINI_API_KEY` in `.env.local`).

| Case | Min | Avg | Recurring failures |
|---|---:|---:|---|
| 1 LinkedIn thought-leadership | 80% | 92% | weak hook, CTA, filler |
| 2 Event promo (grounding) | 83% | 90% | CTA, dropped `9am`/`4pm` |
| 3 X product launch | 100% | 100% | clean |
| 4 Instagram caption | 93% | 96% | CTA missed 6/10 |
| 5 TikTok ad script | 92% | 96% | filler |
| 6 Brand film script | 83% | 97% | 1 seed missed narration/visual structure |
| 7 YouTube explainer | 92% | 96% | filler, 1 scene-prompt mismatch |
| 8 Personal LinkedIn story | 87% | 95% | hook, filler, dropped `$40K` (3 seeds) |

**Three systemic failure modes**, all traceable to what the flatten removed:
1. **CTA** (cases 1, 2, 4) â€” no enforced CTA step in the live prompt.
2. **Filler** (cases 1, 5, 7, 8) â€” one-line buzzword ban vs the graph's full Anti-AI constraint set.
3. **Grounding** (cases 2, 8) â€” facts dropped or reformatted; no source-ledger rule.

---

## 3. The measurement gate (read before touching anything)

Every phase below is verified the same way:

```bash
# 1. typecheck (must be clean for files you touched)
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "post-writer|script-writer|chat-service|eval-thinkforge-writers" || echo CLEAN

# 2. offline prompt-assembly sanity (no API spend)
GEMINI_API_KEY=dummy npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --dry-run

# 3. quality gate â€” multi-seed before AND after each phase, compare the table
npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --multi-seed
```

**Rule:** record the multi-seed table before a phase and after. A phase ships only if every case's min is **â‰¥ its pre-phase min** (no regressions) AND the phase's target metric improves. Set `REGRESSION_BASELINES` in the eval (currently empty) from the first run so the gate auto-fails regressions.

---

## 4. Phases

Each phase â‰¤ 5 files. One concern per commit. Do not batch phases.

### Phase 0 â€” Set baselines + de-brittle the eval (enables honest measurement)

**Goal:** the eval should fail on real defects, not on legitimate reformatting.

**Files:** `scripts/prompt-optimization/eval-thinkforge-writers.ts`

**Changes:**
1. Populate `REGRESSION_BASELINES` (eval ~line 215) from the Â§2 mins (e.g. `{1:0.80, 2:0.83, 4:0.93, 5:0.92, 6:0.83, 7:0.92, 8:0.87}`). Case 3 = 1.00.
2. **Grounding variants.** Change `TestCase.grounding` from `string[]` to `Array<string | string[]>`; an inner array = acceptable equivalents. Update `scoreGrounding` (eval line 331-342): a fact counts as present if ANY variant matches. Update case 2 `'9am'`â†’`['9am','9 am','9:00','9 a.m.']`, `'4pm'`â†’`['4pm','4 pm','16:00','4 p.m.']`; case 8 `'$40K'`â†’`['$40k','$40,000','40k','40000']`.
3. **CTA tail window.** `cta_actionability` (eval line 392-394) and structural `has_cta` only inspect the final non-hashtag line â€” brittle when the CTA precedes emoji/hashtags. Scan the **last 3 non-hashtag content lines**, not just the last one.

**Acceptance:** dry-run still 8/8 routing; multi-seed runs; baselines now gate regressions. (No model-behavior change expected â€” this only fixes measurement.)

**Why first:** Phases 1-4 are judged by this harness. If the harness penalizes valid output, you'll tune toward the wrong target (Rule 35: eval before tuning).

---

### Phase 1 â€” Harden the PostWriter prompt (Gemini guide + Rule 35)

**Goal:** kill the CTA + filler + hook failures for posts by porting the legacy agent's prompt rigor onto `PostWriterAgent.buildPrompt`.

**Files:** `lib/thinkforge/agents/post-writer-agent.ts`, `lib/thinkforge/agents/prompt-utils.ts` (add shared output-format helper). Reference (read-only): `script-author-agent.ts:110-175+`.

**Changes â€” restructure `buildPrompt` to this skeleton** (XML delimiters, rules over examples, **data LAST**):

```
<role>You are an elite {platform} copywriter and strategist.</role>
<task>Write ONE final, publishable {platform} post from the brief in <input_data>. Match the JSON schema exactly.</task>
<rules>
  - SOURCE-LEDGER (grounding): every factual sentence must trace to an exact phrase in <input_data>.
    Preserve supplied dates, times, prices, URLs, brand/event/product names, taglines VERBATIM.
    Use generic preservation rules, not examples copied from known eval cases. NEVER drop or silently reformat a supplied fact.
    Do not invent specifics (ingredients, %, results, prices) not present in <input_data>.
  - ANTI-FILLER: never use these phrases: {Anti-AI constraint list â€” Phase 3 injects from the graph;
    until then hardcode the legacy list from script-author-agent + ai-filler-patterns.json labels}.
  - CTA (mandatory): end with exactly ONE specific call-to-action tied to the brief
    (register / sign up / donate / shop / book / the supplied URL). Never "What do you think?".
  - HOOK: first {foldChars} chars must carry a grounded claim, supplied number, or named entity.
    No clichÃ©d openers ("In today'sâ€¦", "Have you everâ€¦", "Imagineâ€¦").
  - PLATFORM: target {charTarget} chars, {hashtagRange} hashtags, {extraGuidance}.
</rules>
<output_format>
  STEP 1 HOOK â†’ STEP 2 BODY (2-4 short paras, varied rhythm) â†’ STEP 3 CTA â†’ STEP 4 HASHTAGS.
  Then fill clickatron.singleImagePrompt / carouselPrompts: each MUST carry the source facts
  (brand, logo, date, time, location, offer, exact overlay text).
</output_format>
<input_data>
  Project Summary: {context.projectSummary}
  Brand DNA: {context.systemBrief}
  DataBank: {retrievedContext facts}
  USER BRIEF: {userPrompt}   â† the brief goes LAST
</input_data>
```

Keep `detectPlatform` / `PLATFORM_CONFIGS` usage as-is. Extract the STEP 1-4 block into a reusable `buildPostOutputFormat(platform)` helper in `prompt-utils.ts` (the legacy `buildOutputFormatBlock` at `script-author-agent.ts:110` is the reference; do not import the legacy agent).

**Acceptance (multi-seed):**
- Known post cases 1, 2, 4, 8 min **>= 0.90**; no case regresses below its section 2 min.
- Do not chase per-case `0/10` checker failures by adding more checker keywords. The target is robust output across held-out cases, not perfect scoring on the tuned cases.
- Any remaining CTA miss should be handled by a principled repair path later: lower post temperature, deterministic post-gen check-and-repair, or Phase 4 `cta_type`, not by expanding prompt keyword lists.

---

### Phase 1.5 -- Restore independent post validation before ScriptWriter work

**Goal:** prove Phase 1 generalized instead of only teaching the model to satisfy the same regex/checker rules used by the eval.

**Files:** `scripts/prompt-optimization/eval-thinkforge-writers.ts`, optional new `scripts/prompt-optimization/eval-thinkforge-writers-judge.ts` or a judge mode in the existing harness.

**Why this is now before Phase 2:** Phase 1 improved the post prompt, but the prompt and deterministic eval now share some vocabulary: CTA verbs, cliche openers, filler constraints, and format-preservation pressure. That is useful as a compliance floor, but it is not an independent quality oracle. Do not harden ScriptWriter using the same coupled loop until the post path has held-out proof.

**Changes:**
1. Add 5-8 held-out post cases that were not used while tuning Phase 1:
   - B2B SaaS launch or customer proof.
   - Nonprofit donation/volunteer campaign.
   - E-commerce product drop with price, SKU, and shipping detail.
   - Recruiting/employer-brand post.
   - Non-English or mixed-language brief.
   - Very long messy brief with duplicated facts.
   - Unusual tone request, e.g. dry, skeptical, luxury, founder-confessional.
   - A no-facts-supplied case where the writer must not invent specifics.
2. Add an independent judge pass with a different scoring shape from the regex eval. Prefer a non-Gemini provider only for sanitized eval cases. If using Gemini, keep the rubric separate from the prompt wording and report that the judge is not provider-independent.
3. Score the judge on: factual preservation, specificity, brand/voice use, CTA usefulness, platform fit, non-generic writing, Clickatron prompt usefulness, and no hidden/internal machinery leakage.
4. Keep deterministic regex checks as a floor, but treat the held-out set + judge as the decision gate.

**Acceptance:**
- Held-out post set min **>= 0.90** and average **>= 0.95**, or explicitly mark the prompt as overfit and return to Phase 1.
- Judge average **>= 4/5** with no factual-fabrication hard fails.
- No new hardcoded examples from held-out cases are added to writer prompts.
- The run report separates known tuned cases from held-out cases.

---

### Phase 2 â€” Harden the ScriptWriter prompt

**Goal:** same rigor for scripts; kill filler + the stochastic structure/scene-prompt misses (cases 5, 6, 7).

**Files:** `lib/thinkforge/agents/script-writer-agent.ts`, `lib/thinkforge/agents/prompt-utils.ts` (shared helpers). Reference: `script-author-agent.ts`.

**Changes:** same XML skeleton (role/task/rules/output_format/input_data, data LAST). Script-specific output_format:
- Mandate per-scene `**Narration:**` + `**Visual:**` labels and `## Scene N:` headers (fixes case 6's missed structure â€” make it a hard rule, not a suggestion).
- Mandate `visualMetadata.scenePrompts` 1:1 with scene count (fixes case 7 mismatch). State the count rule explicitly: "Produce exactly one scenePrompt per `## Scene` header."
- Same SOURCE-LEDGER + ANTI-FILLER rules as Phase 1.

**Acceptance (multi-seed):**
- Cases 5, 6, 7 min **â‰¥ 0.90**.
- `has_narration` / `has_visual` fail **0/10** on case 6.
- `scene_prompts_match_scenes` fails **0/10** on cases 5, 6, 7.
- `no_ai_filler` fails **0/10** on cases 5, 7.

---

### Phase 3 â€” Re-wire the Writing Knowledge Graph into both writers

**Goal:** replace the hardcoded anti-filler list with the live graph (techniques + Anti-AI constraints) â€” the same source `ScriptAuthorAgent` uses. This makes anti-filler and craft data-driven and consistent across the app.

**Files:** `lib/thinkforge/agents/post-writer-agent.ts`, `lib/thinkforge/agents/script-writer-agent.ts`, `lib/thinkforge/agents/prompt-utils.ts` (add `buildWritingKnowledgeBlock` helper). Reference (read-only): `script-author-agent.ts:52-90`, `lib/thinkforge/data/writing-graph-query.ts` (`selectAllTechniques(signals, n)`, `getConstraints(section)`), `lib/thinkforge/data/extract-signals.ts` (`extractSignalsFromContext({ documentType, projectSummary, userPrompt })`).

**Changes:**
1. Add `buildWritingKnowledgeBlock(signals)` to `prompt-utils.ts` (port from `script-author-agent.ts:52-90`): emits an `<writing_knowledge>` block from `selectAllTechniques(signals, 2)` + `getConstraints('Anti-AI Constraints')`. Fail-soft: empty string on error, logged (legacy already does this).
2. In each writer's `buildPrompt`: derive `signals = extractSignalsFromContext({ documentType: <'post'|'video_script' from path>, projectSummary: context.projectSummary, userPrompt })` and inject `buildWritingKnowledgeBlock(signals)` into the `<rules>`/`<writing_knowledge>` slot, replacing the Phase-1 hardcoded buzzword list.
3. Thread `documentType` to the writers if not already available (PostWriter = `'post'`, ScriptWriter = `'video_script'`).

**Guardrail (Rule 35):** the legacy eval (`eval-thinkforge-author.ts --log-techniques`) has a GO/NO-GO check: if `selectAllTechniques` returns 0 categories the block is empty. Run that check for the writer doc types; if techniques don't activate, fix signal extraction before claiming the wire works (do not ship an empty `<writing_knowledge>` block).

**Acceptance:** `no_ai_filler` fails **0/10** across ALL cases; no case regresses; `--log-techniques`-style check shows â‰¥1 technique category activates for both `post` and `video_script`.

---

### Phase 4 â€” Re-wire the Content Signal Profile into the live path

**Goal:** restore structured signal grounding (format/platform/audience/goal/proof/constraints + source-ledger) and re-populate `signalTrace` (currently `undefined` on the live path, `chat-service.ts:831`).

**Files:** `lib/thinkforge/services/chat-service.ts`, `lib/thinkforge/agents/post-writer-agent.ts`, `lib/thinkforge/agents/script-writer-agent.ts`. Reference (read-only): `script-draft-agent.ts:99-118`, `lib/thinkforge/signals/content-signal-resolver.ts` (`resolveContentSignalProfile(input)`), `lib/thinkforge/signals/index.ts` (`formatContentSignalProfileForPrompt`).

**Changes:**
1. In `chat-service.ts`, in the live writer branch (around `chat-service.ts:834-849`, before constructing the writer): call
   ```ts
   const contentSignalProfile = resolveContentSignalProfile({
     userPrompt: effectivePrompt,
     project: sessionState.metadata,
     context: baseInput.context,
     documentType: sessionState.metadata.format,
     platform: sessionState.metadata.platform,
     brandId: sessionState.metadata.brandId,
     sessionId: sessionState.sessionId,
     retrievedContext: retrievedCtx,
   });
   ```
   Pass `contentSignalProfile` into `baseInput`. Set `signalTrace` from it so the existing persistence at `chat-service.ts:935/961` populates (mirror how `generateScriptDraft` returns `draft.signalTrace`).
2. `PostWriterAgent` already accepts `contentSignalProfile` (post-writer-agent.ts:34) â€” inject it via a `buildContentSignalProfileBlock` (port `script-author-agent.ts:92-107`, including the `<signal_execution_rules>` source-ledger block). Add the same field + injection to `ScriptWriterAgent` (script-writer-agent.ts:27 area).
3. The signal profile's `forbiddenTerms` / `proofPoints` / `constraints` should reinforce the Phase-1 rules (don't duplicate â€” reference them).

**Privacy guardrail:** `resolveContentSignalProfile` pulls brand context. The model factory routes private brand context to Gemini only (`model-factory.ts` privacy gateway, `privacyClass: 'business_confidential'`). Do NOT route brand-context prompts to OpenRouter. Keep the writers on `gemini-2.5-flash`.

**Acceptance:** case 2 grounding worst-seed coverage **= 1.0** (hard event facts preserved); case 8 `$40K` present **10/10**; `violations_empty` stays 0 failures; `signalTrace` non-null in saved output; no regressions.

---

### Phase 5 â€” Legacy chain decision (architecture cleanup)

**Goal:** resolve the partial flatten. The legacy `ScriptAuthorAgent` chain (`ScriptContractAgent` â†’ `ScriptOutlineAgent` â†’ `ScriptAuthorAgent` â†’ `StylistAgent`, via `script-draft-agent.ts`) still runs for two paths:
- **Blueprint multi-doc creation** â€” `chat-service.ts:376` (`generateScriptDraft`).
- **Block editing** â€” `app/api/services/thinkforge/script/edit-blocks/route.ts:108` (`createScriptAuthorAgent`).

**Decision required (do not auto-delete):**
- If Blueprint genuinely needs the heavier chain (multi-doc, contract+outline), KEEP it and document why in `ThinkForge_Flattened_Architecture.md` (the doc currently says the chain was "eliminated" â€” that's misleading; fix the wording).
- If Blueprint can use the flattened writers, migrate it (route Blueprint through Post/Script writers), then delete the now-dead `script-draft-agent.ts` + `script-outline-agent.ts` + `script-contract-agent.ts` + `stylist-agent.ts` after grepping for all importers.
- Block-edit (`edit-blocks`) is a distinct intent (FORK/edit existing content) â€” likely keep `ScriptAuthorAgent` for it.

**Files:** `lib/thinkforge/services/chat-service.ts` (if migrating Blueprint), `docs/service-wise-docs/thinkforge/ThinkForge_Flattened_Architecture.md` (fix "eliminated" claim either way). This is a judgment phase â€” surface the tradeoff before coding.

**Acceptance:** the architecture doc matches reality; no orphaned exports if anything is deleted (grep all importers per repo rule "NO SEMANTIC SEARCH").

---

### Phase 6 -- Durability: CI gate + broader test expansion

**Goal:** keep quality from regressing and widen coverage after the independent post oracle exists.

**Files:** `scripts/prompt-optimization/eval-thinkforge-writers.ts`, CI config (e.g. `.github/workflows/*` if present), optional new `scripts/prompt-optimization/eval-writers-judge.ts`.

**Changes:**
1. Wire the multi-seed eval into CI (or a pre-deploy gate) using `REGRESSION_BASELINES` (exits non-zero on regression; already implemented in `main()`).
2. Expand script-side cases: adversarial filler, CJK/emoji, very-long-brief, multi-fact grounding-heavy script, live-shoot setup, and a "no facts supplied" case (must NOT fabricate; checks the source-ledger holds).
3. Reuse the independent judge from Phase 1.5 for script quality and shootability. Do not make the judge optional once production quality claims depend on it.

**Acceptance:** CI fails on an injected regression; expanded cases pass at min >= 0.85.

---

## 5. Sequencing & dependencies

```
Phase 0 (eval) -> Phase 1 (PostWriter) -> Phase 1.5 (held-out + judge)
                                                   |
                                                   v
                                      Phase 2 (ScriptWriter) -> Phase 3 (writing graph)
                                                                         |
                                                                         v
                                                               Phase 4 (signal profile)
                                                                         |
                                                                         v
                                             Phase 5 (legacy decision) -> Phase 6 (CI/expand)
```

Phase 1.5 is mandatory before Phase 2. Phases 1 and 2 are no longer parallel by default because the post prompt exposed checker-coupling risk; prove the evaluation loop first, then apply the lesson to scripts. Phases 3-4 depend on 1-2 (you harden the prompt skeleton first, then swap hardcoded lists for live knowledge). Phase 5 is independent but best after 1-4 so the flattened writers are proven. Phase 6 last.

**Quickest honest path to the biggest quality win:** Phase 0 -> 1 -> 1.5. If held-out posts hold, continue to Phase 2. If they drop into the 80s, fix overfit before touching ScriptWriter.

---

## 6. Guardrails for Codex (project rules â€” non-negotiable)

- **Zod:** never add `.strict()` to tool/output schemas (it breaks Gemini structured output). The existing `PostWriterResultSchema`/`ScriptWriterResultSchema` are correct â€” extend, don't tighten.
- **Verify before "done":** `npx tsc --noEmit --skipLibCheck` clean for touched files; run the eval multi-seed before/after; paste the before/after table in the PR. "Doesn't crash" is not "works".
- **Determinism:** `seed` is already set in production (`base-agent.ts`). Keep prompt changes deterministic; no `Math.random` in scoring.
- **Blast radius:** do NOT modify `base-agent.ts` for prompt phases (shared by all agents). All hardening lives in `buildPrompt` (a pure string method) + `prompt-utils.ts` helpers.
- **Privacy:** keep writers on `gemini-2.5-flash`; never route brand-context prompts to OpenRouter (model-factory privacy gateway).
- **Scope:** touch only `lib/thinkforge/**`, `app/api/services/thinkforge/**`, `scripts/prompt-optimization/**`, and the thinkforge doc. Do NOT touch `lib/editron/**` or `creative-knowledge-graph.json`.
- **One concern per commit. â‰¤5 files per phase. Re-read each file before editing** (per repo `CLAUDE.md`).
- **No fabricated numbers:** baselines come from real eval runs, not guesses. Targets in Â§4 are goals, labeled as such.

---

## 7. Reference map (files Codex will read or edit)

| Purpose | Path |
|---|---|
| Live post writer (EDIT) | `lib/thinkforge/agents/post-writer-agent.ts` |
| Live script writer (EDIT) | `lib/thinkforge/agents/script-writer-agent.ts` |
| Shared prompt helpers (EDIT) | `lib/thinkforge/agents/prompt-utils.ts` |
| Live orchestrator (EDIT, Phase 4) | `lib/thinkforge/services/chat-service.ts` |
| Eval harness (EDIT, Phase 0/1.5/6) | `scripts/prompt-optimization/eval-thinkforge-writers.ts` |
| Legacy agent â€” port FROM (READ) | `lib/thinkforge/agents/script-author-agent.ts` |
| Legacy wiring template (READ) | `lib/thinkforge/agents/script-draft-agent.ts:99-118` |
| Writing knowledge graph (READ) | `lib/thinkforge/data/writing-graph-query.ts`, `writing-knowledge.json` |
| Signal extraction (READ) | `lib/thinkforge/data/extract-signals.ts` |
| Content signal resolver (READ) | `lib/thinkforge/signals/content-signal-resolver.ts`, `signals/index.ts` |
| Filler patterns (READ) | `lib/thinkforge/data/ai-filler-patterns.json` |
| Architecture doc (EDIT, Phase 5) | `docs/service-wise-docs/thinkforge/ThinkForge_Flattened_Architecture.md` |
| Output contract / schemas (READ) | `PostWriterResultSchema` / `ScriptWriterResultSchema` in the writer files |

---

## 8. Definition of done (whole effort)

- Known eval cases and held-out cases are reported separately. Known cases multi-seed min **>= 0.90**; held-out min **>= 0.90** and avg **>= 0.95**; independent judge avg **>= 4/5** with no fabrication hard fails.
- Live writers inject the Writing Knowledge Graph + Content Signal Profile (parity with `ScriptAuthorAgent` on grounding rigor).
- `signalTrace` populated on the live path.
- Architecture doc matches reality (no false "eliminated" claim).
- Eval wired into CI with regression baselines; expanded test set passes.
- `npx tsc --noEmit --skipLibCheck` clean; before/after eval tables in each PR.

---

## 9. Phase 7 - ThinkForge to Clickatron handoff hardening

**Why this phase exists.** A file:line-grounded map of the visual handoff found TWO divergent pipelines, and the live "create content" flow uses the weaker one:

- **Grounded path (sidecar):** `ScriptDraftAgent` emits a hidden, fully-typed `ClickatronCreativeSpec` with fact-locking (`lib/thinkforge/utils/clickatron-creative-sidecar.ts:194-205`), block-ID resolution, and validation. Reachable ONLY from the script-edit route (`app/api/services/thinkforge/script/edit/route.ts:5`).
- **Live path (free-text):** the production chat/generate flow (`lib/thinkforge/services/chat-service.ts:851-910`) uses Post/ScriptWriter, which emit free-text `clickatron.singleImagePrompt` / `visualMetadata.scenePrompts`. These are reconstructed into a spec by `buildWriterOutputClickatronCreativeSpec` (`lib/thinkforge/clickatron-context.ts:271-380`), which drops the grounding guarantees and hardcodes `validation.status: "ready"` (`clickatron-context.ts:377`).

Net: the everyday "Send to Clickatron" handoff ships whatever facts the free-text prompt happened to contain, with no forbidden-term enforcement and an always-green ready gate. **This phase makes the live path as grounded as the sidecar path.**

**Gated by the eval.** The independent judge already scores `clickatronReadiness`, and `scoreGrounding` already checks the image/scene prompts (the `scenePromptsBlob`) carry the source facts. So every fix below is measured: held-out `clickatronReadiness` avg must rise and grounding-in-prompts must not regress.

**CONFIRMED (2026-06-24):** The Clickatron canvas does NOT composite `renderPlan.textLayers`. Traced: `stores/useCanvasStore.ts` has zero handling of `creativeSpec`/`textLayers`/`renderPlan`, and the only text capability is `components/dashboard/Clickatron/canvas/SketchOverlay.tsx` - a MANUAL sketch tool (pencil/eraser/text) where the user types `TextElement {x,y,text,color}` by hand. ThinkForge's grounded text layers are computed, stored in Mongo, withheld from the image model, and never loaded into the editor, so the user re-types every headline/price/date. C2 is real, not minor - see the reframed fix below.

### Ranked fixes

**C1 [CRITICAL] - Apply sidecar grounding to the live writer-output path.**
- Fragile: `buildWriterOutputClickatronCreativeSpec` (`clickatron-context.ts:271-380`) never applies the sidecar grounding rules, sets `validation.status:"ready"` unconditionally (`:377`), and never attaches `brand.hardConstraints`/`keyClaims`. The grounded rules live only in `clickatron-creative-sidecar.ts:194-205`.
- Impact: off-brand or fabricated marks can render; the UI `canSendToClickatron` gate (`lib/thinkforge/clickatron-handoff-state.ts:127`) is effectively always-green for writer output.
- Fix: run the content-signal-profile enrichment (`applyContentSignalProfileToClickatronExportMeta`) on writer output too; derive `keyClaims`/`hardConstraints` from `signalTrace` (already on the route, currently stored opaque); compute `validation.status` from actual grounded-fact presence, not a constant. Ties to Phase 4 (signal profile on the live path).
- Acceptance: judge `clickatronReadiness` up; a forbidden/fabricated term in the brief never appears in the spec; `validation.status` flips to non-ready when facts are missing.

**C2 [CRITICAL] - Grounded text never reaches the image. REFRAMED: stop withholding it; let a text-capable model render it + verify.**
- Fragile: `textLayers[].text` (exact headline/price/date/CTA) is deliberately withheld from the model; `summarizeTextLayers` (`lib/clickatron/brand-prompt-context.ts:128-145`) replaces exact copy with "exact copy withheld" unless `textPolicy==='minimal_generated_text'` (default `editable_text_layers`, `schemas/clickatron-creative-contract.ts:24`); the flattened session prompt omits textLayers entirely (`clickatron-context.ts:472-489`); and (CONFIRMED) nothing in the canvas re-applies them.
- WHY it exists: a workaround for old image models that rendered text as gibberish. That assumption is now stale - text-capable models (Flux, Ideogram, Recraft, Seedream-class) render short text accurately, so the withhold-and-overlay design is largely OBSOLETE.
- Fix (founder direction, 2026-06-24): stop withholding. Feed the grounded `textLayers[].text` INTO the generation prompt, switch Clickatron's default to a text-capable model, and drop the text-suppression for the common case.
- KEEP A VERIFY GATE for exact facts: model text still drifts on long strings, prices, URLs, dates, tiny text, and non-Latin scripts (the Spanish/CJK cases). Add a cheap check that the rendered image's text matches the supplied facts - the eval's `clickatronReadiness` judge is the hook, or an OCR pass. For the highest-stakes exact fields, optionally retain an editable overlay seeded from `renderPlan.textLayers` (the loader the canvas is missing) as a fallback, not the default.
- DIVERGENCE TO RESOLVE: Codex's `clickatron_carousel_optimization_plan.md` section 3 goes the OPPOSITE way - keep suppressing model text ("strict negative rules to prevent the AI embedding messy gibberish text") and render titles via the editable text layer library on Flux. Pick one direction before either is built, or you ship two opposed systems.
- Files: `lib/clickatron/brand-prompt-context.ts` (stop withholding), `app/api/internal/workers/clickatron/variation/route.ts` (model selection + grounded-text injection), `schemas/clickatron-creative-contract.ts` (textPolicy default).

**C3 [HIGH] - Silent fallback chain reports failure as success.**
- Fragile: `buildThinkToClickContext` falls through writerOutput -> block-sidecar -> visible-content (`clickatron-context.ts:528-540`) with no signal which path fired; an empty/malformed writer prompt silently degrades to a generic text-free brief (`:382-470`: "brand-safe shapes," facts reduced to `visualKeywords`).
- Impact: user clicks Send expecting their grounded creative, gets a generic abstract background; looks like it worked.
- Fix: record the chosen resolution path in `validation.issues` for all three branches; UI warns on the visible-content fallback; treat empty/whitespace writer prompts as a validation error, not a fallthrough.

**C4 [HIGH] - Spec-construction 500s are opaque.**
- Fragile: `normalizeClickatronCreativeSpec` throws on messy LLM strings (`clickatron-creative-contract.ts:142-146`; carousel-needs-slides `:430-432`); caught only as a generic 500 at the context route (`app/api/services/thinkforge/clickatron-context/route.ts:89`).
- Fix: wrap writer-output reconstruction in try/catch that degrades to the visible-content brief WITH an explicit issue, not a 500.

**C5 [MEDIUM] - Worker source-context read is positional + fail-soft.**
- Fragile: `brand-prompt-context.ts:204-209` walks `creativeSpec.renderPlan...` by string-key without re-validating; on shape drift it emits no context (`:245`) and only logs `hasSourceContext:false` (`app/api/internal/workers/clickatron/variation/route.ts:251-254`). Silent loss of all grounding at the final hop.
- Fix: validate metadata with `normalizeClickatronCreativeSpec` in the worker; warn when a thinkforge-sourced job has `sourceContext` present but an unreadable `creativeSpec`.

**C6 [MEDIUM] - Writer visual prompts have no minimum-content validation.**
- Fragile: `singleImagePrompt`/`scenePrompts[]` are `z.string()` with no `.min()` (`post-writer-agent.ts:24`, `script-writer-agent.ts:17`); PostWriter checks presence not content (`post-writer-agent.ts:75-77`); ScriptWriter has no gate. A generic "modern visual" passes.
- Fix: deterministic check that the visual prompt contains at least the brand name / a supplied number when those exist in the brief (mirror the SOURCE-LEDGER rule as code). This is the same grounding check the eval already runs on prompts - promote it into production.

**C7 [LOW] - `signalTrace` carried but unused for grounding.** Mine it for `keyClaims`/constraints on the writer-output path. Folds into C1.

**Cleanup found in this path:** remove the debug `console.log` in the production session POST (`app/api/services/clickatron/session/route.ts:168,172`); review the repair-as-solution shim `repairRecoverableClickatronCreativeSidecar` (`clickatron-creative-sidecar.ts:408-449`) - it masks LLM omissions rather than failing loud.

### Sequencing
C1 first (it is the grounding regression and lights up the eval signal). C6 pairs with C1 (same grounding rule, prompt-time vs spec-time). C3/C4 next (stop silent/opaque failures). Confirm-then-C2. C5 last. C7 folds into C1. Do C1-C6 as separate commits, each gated on the judge's `clickatronReadiness` not regressing and held-out grounding holding.

**Scope note:** this phase touches `lib/thinkforge/clickatron-context.ts`, `lib/thinkforge/utils/clickatron-creative-sidecar.ts`, `lib/clickatron/brand-prompt-context.ts`, and the two clickatron routes/worker. It crosses the thinkforge/clickatron boundary, so coordinate with whoever owns Clickatron - this is where the mid-June "clickatron/thinkforge cluster" merge conflicts came from.
