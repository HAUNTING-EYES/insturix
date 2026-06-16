---
name: session-handover-2026-05-20-thinkforge-pipeline
description: "MEGA SESSION. Full ThinkForge writing pipeline built, wired, investigated, fixed, tuned, and measured. 18 commits, 9,980 lines, 40 LLM eval runs. Creative doc + signal module committed. Writing knowledge graph extracted + query service. All RC1-RC8 fixed. Post vs video classification root-caused from live user testing. 5 infrastructure bugs found and fixed. Quality scorer + StylistAgent wired. Prompt tuned to 100%/93%/100%/78% across 4 content types. Eval harness built (Rule 35)."
metadata:
  type: project
  last_updated: 2026-05-20
---

# Session Handover — 2026-05-20 (ThinkForge Writing Intelligence Pipeline)

## READ THIS FIRST — What To Know Before Touching ThinkForge

### The Pipeline (end-to-end, working, measured)

```
User types a request in ThinkForge chat
  ↓
inferRoleFromContext(projectSummary, userPrompt)
  → Post? (checks userPrompt FIRST — "LinkedIn post", "article", "newsletter")
  → Video? (checks userLower — "video", "ad", "commercial", "reel", "tiktok")
  → Generic fallback
  ↓
extractSignalsFromContext(documentType, medium, projectSummary, userPrompt)
  → TIER_1: 24 signal defaults per document type (video_script, post, article, etc.)
  → TIER_2: 17 keyword patterns ("urgent"→kairos=0.8, "talking head"→visual_dep=0.3)
  → Returns Partial<CreativeSignals>
  ↓
buildWritingKnowledgeBlock(signals)  [POSITION: FIRST in prompt]
  → selectAllTechniques(signals, 2) — scored activation from writing-knowledge.json
  → Returns: technique name + DO + EXAMPLE + WHY + NEVER per category (6 categories)
  → Plus: quality rules (specificity forcing, rhythm variation, no AI filler)
  ↓
buildCorePromptBlock(roleProfile, task, contract, brand, rules)  [POSITION: MIDDLE]
  → <role>, <task>, <contract>, <brand_context>, <rules>
  ↓
buildOutputFormatBlock(documentType, medium, signals)  [POSITION: LAST — strongest attention]
  → Video: 7-element scenes with timing brackets, music direction, VERIFY check
  → Post: platform-specific (LinkedIn 1300-1900 chars, hook before fold, hashtags)
  → Generic: clean markdown
  ↓
applyGlobalConstraints(prompt)  [base-agent.ts — appends creative/technical constraints]
  ↓
Gemini 2.5 Flash (seed=42, temperature=0.7, maxTokens=4096)
  ↓
parseMarkdownToBlocks(markdown)
  → Detects "## Scene N" headings → SceneBlocks with SceneSlots
  → Detects "## Music Direction" → editorial blocks
  → Non-scene content → header/paragraph blocks (unchanged)
  ↓
scoreContent(text)  [quality-scorer.ts — deterministic, code-level]
  → 23 AI filler patterns (regex)
  → Sentence uniformity (std dev < 15%)
  → Hedging overload (>3 per 200 words)
  → Summary restatement detection
  → Returns score 0-100 + violations
  ↓
[IF score < 90] StylistAgent.checkVoice(draft)  [LLM review]
  → Flags: ai_slop, off_brand, too_formal, too_generic, pacing
  → Pattern interrupts: joke, slang, rhythm_break suggestions
  → V1 = logging only. V2 = auto-rewrite (not yet implemented).
  ↓
Return { blocks, richText, content, qualityScore, qualityViolations, stylistFlags }
```

### Key Files (read these to understand the system)

| File | Lines | What It Does |
|------|-------|-------------|
| `docs/creative-content-knowledge.md` | 4,338 | Source of truth. 9 Parts: scope, voice, signals, dynamics, atlas, reference, constraints, theory, constants. 18 CEO/Eng/Copywriter reviews. |
| `lib/shared/signals/types.ts` | 312 | CreativeSignals interface (48 signals), all enums, constraints, profile types. Shared by Editron + ThinkForge. |
| `lib/shared/signals/validation.ts` | 308 | SIGNAL_RANGES, validateSignals(), computeDerivedSignals(), evaluateEnvelope(). |
| `lib/thinkforge/data/writing-knowledge.json` | 2,796 | Flat JSON extracted from doc: 48 signals, 24 techniques, 26 constraints, 8 platforms. |
| `lib/thinkforge/data/build-writing-graph.mjs` | 569 | Parser: markdown doc → JSON. Run: `node lib/thinkforge/data/build-writing-graph.mjs` |
| `lib/thinkforge/data/writing-graph-query.ts` | 411 | Scored activation: selectTechniques(), selectAllTechniques(), computeQualityScore(), lookups. |
| `lib/thinkforge/data/extract-signals.ts` | 191 | Context → signals. 10 doc type defaults (24 signals for video_script). 17 keyword patterns. |
| `lib/thinkforge/data/quality-scorer.ts` | 127 | Post-generation: 23 AI filler patterns, sentence uniformity, hedging, summary detection. |
| `lib/thinkforge/agents/script-author-agent.ts` | ~550 | The heart. inferRoleFromContext, buildWritingKnowledgeBlock, buildOutputFormatBlock, buildCorePromptBlock. |
| `lib/thinkforge/agents/script-draft-agent.ts` | ~220 | Orchestrator: Contract → Outline → Author → Score → Stylist. |
| `lib/thinkforge/normalization/markdown-parser.ts` | 280 | Markdown → ThinkForge blocks. Scene detection, editorial blocks. |
| `scripts/prompt-optimization/eval-thinkforge-author.mjs` | 507 | Eval harness: 4 test cases, 26+ criteria, multi-seed. Rule 35 methodology. |

---

## ALL 18 COMMITS (chronological)

| # | Hash | Message | What Changed |
|---|------|---------|-------------|
| 1 | `b78e3fe9` | Creative doc v1.0 + signal module | +5,022 lines (doc + types + validation + barrel) |
| 2 | `bfce7876` | Writing knowledge parser + flat JSON | +3,365 (parser + JSON) |
| 3 | `bf4f9c45` | Writing graph query service | +411 (scored activation) |
| 4 | `4c71bea0` | Wire graph into script author agent | +205 (buildWritingKnowledgeBlock + injection) |
| 5 | `4988642f` | RC1+RC2+RC8 fixes | +75/-29 (output format, narration, music) |
| 6 | `c0dd4dec` | RC3 — SceneBlock parser | +126/-9 (scene detection in markdown parser) |
| 7 | `d2eceefb` | RC4+RC5+RC6 fixes | +28/-26 (constraints, beats, classification) |
| 8 | `c55eb330` | Posts no longer classified as video scripts | +35 (post detection on userPrompt) |
| 9 | `3a5bcbd0` | Restore reverted RC fixes + tighten video regex | +190/-36 (GSAP revert recovery) |
| 10 | `2147ad79` | Remove duplicate title | +1/-1 |
| 11 | `9f48c287` | Video regex on userLower only | +4/-2 |
| 12 | `660a2cae` | 4 infrastructure bugs | +50/-22 (NO-OP, sparse signals, injection, logging) |
| 13 | `7ba62efc` | Production-grade output format | +48/-29 (7-element scenes, platform posts) |
| 14 | `464dfff7` | Revert profile-specific labels + seed=42 | +10/-17 |
| 15 | `7df80b39` | Eval harness | +507 |
| 16 | `284a9eb0` | Prompt tuning (4 iterations) | +60/-75 |
| 17 | `a5a20b0a` | Signal-driven narration labels | +17/-2 (then reverted — see decisions) |
| 18 | `a9f5ecab` | Quality scorer + StylistAgent + prompt position | +177/-8 |

**Total: +9,980 lines, -59 lines across 15 files.**

---

## ALL 8 ROOT CAUSES (RC1-RC8) — STATUS

| RC | Problem | Fix | Commit |
|----|---------|-----|--------|
| RC1 | Output format contradicts sectionGuidance (JSON vs markdown) | Replaced JSON scene guidance with markdown-compatible guidance | `4988642f` |
| RC2 | No Narration/Voiceover label in output | Signal-driven labels (VO, On-Camera, Text Overlay per scene) | `4988642f`, `464dfff7` |
| RC3 | parseMarkdownToBlocks can't produce SceneBlocks | Scene detection: `## Scene N` → SceneSlots, `## Music Direction` → editorial | `c0dd4dec` |
| RC4 | Creative constraints bias toward production over narration | Changed "concrete imagery" to "narration is the core product" | `d2eceefb` |
| RC5 | Outline agent genre-blind | Beat enum expanded: +Hook, Problem, Solution, CTA, Bridge. PAS/AIDA structures. | `d2eceefb` |
| RC6 | score_direction regex hijacks video_script | video_script check moved before score_direction. Regex tightened. | `d2eceefb` |
| RC7 | No creative knowledge doc for scriptwriting | Built the 4,338-line doc (last session) | `b78e3fe9` |
| RC8 | Music per-scene instead of project-level | `## Music Direction` section with Style/Tempo/Arc before scenes | `4988642f` |

---

## 5 INFRASTRUCTURE BUGS FOUND (investigation)

| Bug | What | Impact | Fix |
|-----|------|--------|-----|
| applyGlobalConstraints NO-OP | ScriptAuthorAgent overrode to `return prompt` | RC4 creative constraints were dead code | Deleted override |
| Anti-AI constraints toothless | LLM saw "match against phrase list" (method description) not actual banned phrases | AI filler passed unchecked | Rebuilt injection with WHY field + explicit BANNED PHRASES list |
| .slice(0,5) dropped constraints | Only 5 of 10 anti-AI constraints reached prompt | Half the quality rules missing | Removed slice, all constraints injected |
| Signal defaults sparse (7/48) | CTA techniques couldn't fire, question_hook couldn't score | Technique selection starved | Expanded to 24 signals for video_script |
| Zero logging | No console output for graph load, technique selection, or errors | Can't diagnose on Vercel | Added [ThinkForge:WritingKnowledge] and [ThinkForge:Quality] logs |

---

## CLASSIFICATION ARCHITECTURE (post vs video — CRITICAL)

**The problem we solved:** The word "video" in the PROJECT SUMMARY (Insturix IS a video platform) caused EVERY content request — including "write a LinkedIn post" — to be classified as `video_script`.

**The solution (3 iterations):**

```javascript
function inferRoleFromContext(projectSummary, userPrompt, explicitDocType) {
  const userLower = userPrompt.toLowerCase();
  const combined = `${projectSummary} ${userPrompt}`.toLowerCase();

  // 1. Post/text: check USER PROMPT first (overrides project context)
  if (POST_RE.test(userLower)) return post_profile;

  // 2. Video: check USER PROMPT only (not combined — project "video" doesn't hijack)
  if (VIDEO_RE.test(userLower)) return video_script_profile;

  // 3. Other doc types: check combined (character_bible, research, etc.)
  // ...
  
  // 4. Generic fallback
}
```

**Why this order matters:**
- "LinkedIn post about video editing" → step 1 catches "LinkedIn post" → post ✓
- "Create a video ad for our product" → step 2 catches "video ad" → video_script ✓
- "Write about video production trends" → step 1 misses, step 2 catches "video" → video_script (acceptable — on a scriptwriting tool)
- Project says "video platform" + user says "write a draft" → no match on userLower → generic ✓

**Adversarial tested: 20/20 pass** across video requests, post requests, and ambiguous cases.

---

## PROMPT ENGINEERING — RULE 35 METHODOLOGY (proven)

### Principles Applied
1. **XML structure:** `<role>`, `<task>`, `<rules>`, `<writing_knowledge>`, `<output_format>`
2. **Writing knowledge FIRST** (establishes creative framework), **output format LAST** (strongest attention position for format compliance)
3. **Rules over examples** — narrow rules ("timing brackets REQUIRED on every scene") not few-shot
4. **Chain-of-thought:** "STEP 1 — estimate duration. STEP 2 — write music direction. STEP 3 — for EACH scene, check all 7 elements."
5. **VERIFY BEFORE OUTPUT** — self-check at the very end of the prompt
6. **Seed=42** on all LLM calls — structural consistency (~5% variation)
7. **Banned phrases list** — explicit, zero tolerance, 15 specific phrases
8. **Eval harness** — 4 test cases, 26+ criteria, multi-seed (10 seeds), ~30s per run

### Tuning Journey (4 iterations, measured)

| Iteration | Change | TikTok Min | Brand Film Min |
|-----------|--------|-----------|---------------|
| Baseline | Before tuning | 43% | 64% |
| 1 | Chain-of-thought + BANNED PHRASES | 43% (seed=21 fixed, seed=55 fails) | — |
| 2 | VERIFY BEFORE OUTPUT | 100% (seed=21 100%) but seed=55 43% | — |
| 3 | Compressed knowledge block (5800→2500 chars) | **100% all seeds** | 86% |
| 4 | maxTokens 2600→4096 | 100% | **86%** (truncation fixed) |
| Final | Position optimization (knowledge FIRST) + restore WHY | **100%** | **93%** |

### Final Eval Results (40 LLM runs)

| Test Case | Min | Avg | Variance | Status |
|-----------|-----|-----|----------|--------|
| TikTok product ad (30s) | **100%** | 100% | 0pp | ✅ Perfect |
| Brand film (2 min) | **93%** | 98% | 7pp | ✅ Robust |
| Talking head | **100%** | 100% | 0pp | ✅ Perfect |
| LinkedIn post | **78%** | 94% | 22pp | ⚠️ Needs work |

### Key Learning: Prompt Length vs Format Compliance
The writing knowledge block at ~5800 chars caused format instructions at the END to lose attention weight on certain seeds (seed=21, seed=55 → 43%). Two solutions discovered:
1. **Compress** the knowledge block (5800→2500): works but loses depth (WHY field cut)
2. **Reposition** knowledge block to position 1 (FIRST): works AND keeps full depth

Solution 2 is better — the LLM reads the creative framework first (establishes context), then format instructions last (strongest attention for compliance). Both at full depth.

---

## USER FEEDBACK MOMENTS (important for next session)

1. **"bruh you are new session"** — User pasted the handover message. Expects instant context restore.

2. **"followed all rules?? graph is up?? serves the agents?"** — Called out that I built code nobody imports. Led to wiring + investigation.

3. **"uhhhh wtf?"** (showing LinkedIn post with Scene blocks) — The classification bug. Project "video" hijacked everything. Led to 3 iterations of the regex fix.

4. **"I SAID NO PROFILE SPECIFIC WORK EVER"** — Called out hardcoded narration labels (VO vs On-Camera). Content type must be EMERGENT from signals, not locked per document. Led to reverting the profile-specific code.

5. **"we made the whole signals stuff right the doc and graph what about that"** — Pointed out we're extracting ~20% of the doc's value. Led to restoring WHY field and full anti-patterns.

6. **"dont we have prompt tuning thing"** — Reminded me about Rule 35 seed parameter. Led to adding seed=42 + building eval harness.

7. **"cmon we cant simply ban phrases this isnt a production fix"** — Rejected banned phrase list as a solution for AI filler. Led to the quality scorer + StylistAgent architecture.

8. **"this is still low we need to tackle this"** (LinkedIn 78%) — Wants min > 90% on all content types. Next session priority.

9. **Voice Signature = Brand DNA going deeper** — Not a separate system. Layers 2-3 live IN Brand DNA, enriching what's already there.

---

## TECHNIQUES THAT WORKED

1. **Eval harness before deploying** — Found maxTokens truncation that code review would never catch. 40 measured LLM runs gave confidence to ship.
2. **Prompt position matters** — Writing knowledge FIRST, format instructions LAST. Solved the attention loss problem without sacrificing depth.
3. **Adversarial classification testing** — 20 test cases for the regex fix. Found "The Video Team is Dead" edge case.
4. **Live testing reveals real bugs** — The LinkedIn-as-video-script bug was only visible in production. Logs confirmed deployment hash.
5. **GSAP revert awareness** — Another session's `git revert` silently undid all ThinkForge files. Always check git log for unexpected commits.
6. **Signal-driven, not profile-driven** — Every time we hardcoded behavior per content type, the user corrected us. The signal system was built to eliminate this.
7. **Quality scoring must be code-level** — Prompt-only constraints hit ~85-90% ceiling. Regex + math (deterministic) catches what prompts can't enforce.

## TECHNIQUES THAT FAILED

1. **Profile-specific narration labels** — Locked VO vs On-Camera per document type. User rejected: "talking head CAN have voiceover." Reverted.
2. **Tightened video regex** — Changed `/video|ad|.../` to `/video\s*(script|ad|.../` — missed 4/5 common video prompts. Had to broaden back on userLower.
3. **Verbose writing knowledge block** — 5800 chars at position 6 caused format compliance failures on 2/10 seeds. Compressed, then repositioned to fix properly.
4. **Detection field in constraints** — Injecting "match against phrase list (600+ patterns)" instead of actual phrases. LLM saw METHOD, not RULES. Fixed by using WHY field.

---

## OPEN ITEMS — PRIORITIZED FOR NEXT SESSION

### P0 (Do First)
- [ ] **LinkedIn post min 78% → target 90%+** — Run eval harness, identify seed=3 failure (hashtags + char_range), tune post output format
- [ ] **StylistAgent V2** — auto-rewrite flagged sections instead of just logging. The quality scorer detects violations; the stylist should FIX them.

### P1 (Important)
- [ ] **Voice Signature Layers 2-3 in Brand DNA** — Layer 2: statistical fingerprint (sentence length, vocabulary tier, punctuation). Layer 3: curated exemplars (2-3 pieces for few-shot). Both stored IN Brand DNA, not alongside it.
- [ ] **Eval harness content quality criteria** — Current criteria are structural (has timing? has elements?). Need content quality scoring (is the hook specific? is the CTA actionable? does the narration have rhythm?).
- [ ] **Verify on Vercel** — Run a video script + LinkedIn post on the deployed preview. Check Vercel logs for `[ThinkForge:WritingKnowledge]` and `[ThinkForge:Quality]` log lines.

### P2 (Deferred)
- [ ] **GSAP revert protection** — Another session's revert undid all ThinkForge files. Need either branch protection or ThinkForge-specific deploy guard.
- [ ] **Cross-system traversal** — Can't ask "which editing techniques pair with this writing pattern?" Architecture decision deferred to product #4-5.
- [ ] **Full constraint enforcement loop** — Draft → Score → Rewrite → Re-score → Accept/Reject. Currently: Draft → Score → Log.

---

## QUICK START FOR NEXT SESSION

```
1. Read THIS handover doc
2. cd "D:\google downloads\Front-End-main\editron-worktree"
3. git log --oneline -5  (verify latest commit is a9f5ecab or later)
4. Check Vercel deployment — is the latest code deployed?

TO TUNE LINKEDIN POST:
5. node scripts/prompt-optimization/eval-thinkforge-author.mjs --test-case=2 --multi-seed
6. Identify failing seeds → inspect output → adjust post output format
7. Re-run until min > 90%

TO BUILD STYLIST V2:
8. Read lib/thinkforge/agents/stylist-agent.ts (92 lines)
9. Read lib/thinkforge/agents/script-draft-agent.ts (quality scoring section)
10. The stylist already returns flags with suggestions. V2 = apply suggestions to the draft.

TO WIRE VOICE SIGNATURE:
11. Read docs/creative-content-knowledge.md Part 1 (Voice & Brand System, lines 797-1321)
12. Read lib/thinkforge/agents/script-author-agent.ts buildCorePromptBlock — the brand_context injection
13. Enrich Brand DNA with Layer 2 (statistical fingerprint) + Layer 3 (exemplar storage)
```

---

## CONTEXT THE NEXT SESSION NEEDS BUT WON'T HAVE

1. **The user's testing pattern:** They test on Vercel preview, export logs + PDF, share both. Always check the deployment hash in logs to confirm you're on the right code.

2. **The user hates profile-specific logic.** Content type must be EMERGENT from signals. Every hardcoded "if video then X" will be rejected. Design for signals, not profiles.

3. **The user values measurement over claims.** "Is it working?" means "show me the eval numbers." Not "I think it should work." Build the harness first, then iterate.

4. **Brand DNA is the center of gravity.** Voice Signature, Format Presets, regulatory profiles — everything lives IN Brand DNA, not alongside it. Don't build parallel systems.

5. **Rule 35 is proven and mandatory.** XML structure, data-last, rules not examples, seed parameter, eval harness. This is not optional — it's the methodology that took F1 from 0.70 to 1.000.

6. **The GSAP revert incident:** Commit `8499924e` by another session reverted ALL ThinkForge files. This WILL happen again unless there's protection. Check git log before assuming your code is deployed.
