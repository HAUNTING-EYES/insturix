# ThinkForge Continuation Handoff

Date: 2026-06-15  
Branch/worktree: `main` in `D:\google downloads\Front-End-main\Front-End-main`  
Status: continuation handoff for the next teammate. The signalTrace/context-cache work has already landed on `main`; this doc now focuses on what is still left.

## Read This First

Use this doc to continue ThinkForge core work, not to redo completed plumbing.

Completed and pushed:

- `signalTrace` is generated from the resolved content signal profile.
- `signalTrace` is persisted on saved scripts as `script.metadata.signalTrace`.
- Script read APIs expose saved metadata.
- The ThinkForge -> Clickatron context path can carry `signalTrace`.
- `ScriptAuthorAgent` can use Gemini context caching for `docs/creative-content-knowledge.md`.
- The creative knowledge doc status header was corrected.

Not completed:

- ThinkForge output quality is not yet production-level.
- The prompt quality pass has not been done against real ICP seed cases.
- Brand Vault / learning-layer runtime depth has not been fully verified.
- Calendar/trend intelligence is still mostly north-star work.
- The 95 percent production quality gate is not complete.
- DeepSeek remains eval/safe-route only; production private-context routing is not approved.
- Shoot-guidance visuals are not built.

Next best task:

```text
Run a prompt/output quality audit using real ThinkForge seeds, record failures, then patch the authoring prompt/contract.
```

Do not start by changing providers, calendar, or downstream integrations. First prove ThinkForge can produce excellent post/caption/script/carousel output from real brand/project context.

## Current Reality

ThinkForge is the ideation, scripting, and copywriting workspace. The north star is not "generate a template." The system should resolve brand/user/project/session signals, use the creative writing knowledge base, produce sharp publishable or shootable content, and carry hidden structured context for downstream tools.

The most recent core work added:

- `signalTrace` generation from the resolved content signal profile.
- `signalTrace` persistence in saved scripts.
- `signalTrace` preservation through document edits.
- `signalTrace` exposure through script read APIs and ThinkForge -> Clickatron context metadata.
- Gemini writing-context cache for `docs/creative-content-knowledge.md`.
- Correction of stale creative doc status metadata.

Do not claim full convergence yet. Current convergence is partial:

```text
prompt/session context
  -> resolveContentSignalProfile()
  -> ScriptAuthorAgent prompt
  -> draft result signalTrace
  -> script metadata.signalTrace
  -> read APIs / Clickatron context metadata
```

This is real plumbing, but not full Brand Vault, calendar, trend, Alyzi, or Editron convergence.

## Already Landed On Main

Commit:

- `15ff3ab1 feat(thinkforge): persist signal trace and cache writing context`

Files landed in that commit:

- `app/api/services/thinkforge/clickatron-context/route.ts`
- `app/api/services/thinkforge/script/current/route.ts`
- `app/api/services/thinkforge/script/get/route.ts`
- `docs/creative-content-knowledge.md`
- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/clickatron-context.ts`
- `lib/thinkforge/services/chat-service.ts`
- `lib/thinkforge/services/command-service.ts`
- `lib/thinkforge/services/db.ts`
- `lib/thinkforge/services/gemini-writing-context-cache.ts`
- `lib/thinkforge/signals/index.ts`
- `lib/thinkforge/signals/signal-trace.ts`
- `tests/clickatron/think-to-click-context.test.ts`
- `tests/thinkforge/command-service-metadata.test.ts`
- `tests/thinkforge/gemini-writing-context-cache.test.ts`
- `tests/thinkforge/script-draft-retrieved-context.test.ts`

Current local worktree note:

- After commit `15ff3ab1`, local `main` had no tracked ThinkForge source changes. This handoff doc may itself be modified if the current session is clarifying it.
- There are unrelated untracked local folders/files in this checkout. Do not use `git add -A`.

## Verification State

Focused tests passed:

```powershell
npx vitest run tests/thinkforge/gemini-writing-context-cache.test.ts tests/thinkforge/content-signal-resolver.test.ts tests/thinkforge/script-author-signal-profile.test.ts tests/thinkforge/script-draft-retrieved-context.test.ts tests/thinkforge/clickatron-creative-sidecar.test.ts tests/thinkforge/command-service-metadata.test.ts tests/clickatron/think-to-click-context.test.ts
```

Result: `7` files, `24` tests passed.

Lint passed:

```powershell
npx eslint . --quiet
```

Full TypeScript is baseline-red due to existing unrelated repo errors:

```powershell
npx tsc --noEmit
```

Use touched-file filtering after running full `tsc`. Recent touched-file filter was clean.

Whitespace check passed with only normal Windows LF/CRLF warnings:

```powershell
git diff --check
```

## Core File Map

### Creative Writing Knowledge

- `docs/creative-content-knowledge.md`  
  Source writing-intelligence doc. It explicitly says content type is emergent from signals, not templates. Status header was corrected on 2026-06-15.

- `lib/thinkforge/data/build-writing-graph.mjs`  
  Parses the doc into runtime structured data.

- `lib/thinkforge/data/writing-knowledge.json`  
  Runtime extracted knowledge. Current extracted coverage is roughly 48 signals, 24 techniques, 26 constraints, 8 platforms.

- `lib/thinkforge/data/writing-graph-query.ts`  
  Runtime selector for techniques and constraints. `ScriptAuthorAgent` uses this today.

- `lib/thinkforge/services/gemini-writing-context-cache.ts`  
  New ThinkForge sibling to Editron's creative-doc cache. Loads `creative-content-knowledge.md`, creates/reuses Gemini context cache via Upstash Redis, and falls back to inline system instruction.

### Main Authoring Path

```text
POST /api/services/thinkforge/chat
  -> lib/thinkforge/services/chat-service.ts
  -> lib/thinkforge/context/fetchContextSources.ts
  -> lib/thinkforge/agents/script-draft-agent.ts
  -> lib/thinkforge/signals/content-signal-resolver.ts
  -> ContractAgent / OutlineAgent / ScriptAuthorAgent
  -> lib/thinkforge/data/writing-graph-query.ts
  -> lib/thinkforge/services/gemini-writing-context-cache.ts
  -> quality/profile compliance
  -> save via command-service/db
```

Important files:

- `app/api/services/thinkforge/chat/route.ts`
- `lib/thinkforge/services/chat-service.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/script-contract-agent.ts`
- `lib/thinkforge/agents/script-outline-agent.ts`
- `lib/thinkforge/agents/stylist-agent.ts`
- `lib/thinkforge/agents/base-agent.ts`
- `lib/thinkforge/agents/model-factory.ts`

### Signals And Trace

- `lib/thinkforge/signals/content-signal-resolver.ts`  
  Resolves output format, platform, target length, CTA, audience, goal, tone, proof points, forbidden terms, visual/export needs, provenance, warnings.

- `lib/thinkforge/signals/content-profile-compliance.ts`  
  Scores generated output against resolved profile.

- `lib/thinkforge/signals/signal-trace.ts`  
  New trace builder. Converts resolved profile into a safe `signalTrace`.

- `lib/thinkforge/signals/index.ts`  
  Exports resolver and trace helpers.

- `lib/shared/signals/types.ts` and `lib/shared/signals/validation.ts`  
  Shared signal vocabulary/validation. Shared vocabulary does not mean runtime systems are unified.

### Persistence And Read APIs

- `lib/thinkforge/services/db.ts`  
  `Script` now supports `metadata`. `getScript`, `saveScript`, and `saveScriptWithVersion` carry metadata.

- `lib/thinkforge/services/command-service.ts`  
  `ReplaceDocument` accepts metadata. Block edits preserve existing metadata.

- `lib/thinkforge/services/chat-service.ts`  
  Draft saves attach `metadata.signalTrace`. Final create SSE emits it on the script object.

- `app/api/services/thinkforge/script/get/route.ts`  
  Returns `script.metadata`.

- `app/api/services/thinkforge/script/current/route.ts`  
  Returns `script.metadata`.

### Brand, Memory, Learning

- `lib/thinkforge/context/fetchContextSources.ts`  
  Pulls BrandDNA, project DataBank facts, global DataBank facts, and interaction patterns.

- `lib/thinkforge/context/assembleContext.ts`
- `lib/thinkforge/context/selectors.ts`
- `lib/thinkforge/context/truncation.ts`
- `app/api/services/thinkforge/brand-dna/route.ts`
- `app/api/services/thinkforge/databank/route.ts`
- `app/api/services/thinkforge/events/observe/route.ts`
- `app/api/services/thinkforge/events/post-mortem/route.ts`
- `lib/thinkforge/agents/post-mortem-agent.ts`
- `lib/thinkforge/agents/post-mortem-scope.ts`
- `lib/thinkforge/services/exemplar-collector.ts`

Open question: ThinkForge still uses ThinkForge BrandDNA/DataBank context, not a verified unified Brand Vault runtime source of truth. Do not call it unified until producer, source of truth, decision owner, and consumer are traced in code.

### Clickatron Handoff Surfaces

Integration work is separate, but these files are relevant:

- `lib/thinkforge/utils/clickatron-creative-sidecar.ts`
- `lib/thinkforge/schemas/clickatron-creative-contract.ts`
- `lib/thinkforge/clickatron-context.ts`
- `app/api/services/thinkforge/clickatron-context/route.ts`
- `tests/thinkforge/clickatron-creative-sidecar.test.ts`
- `tests/clickatron/think-to-click-context.test.ts`

Current state: ThinkForge can create/extract/enrich hidden `THINKFORGE_CLICKATRON_EXPORT` JSON and pass `signalTrace` into Clickatron context metadata. Results quality still needs eval-driven prompt hardening.

### Calendar And Planning

- `app/api/services/thinkforge/content-planning/route.ts`
- `app/api/services/thinkforge/content-planning/[id]/route.ts`
- `app/dashboard/thinkforge/hooks/useContentPlanning.ts`
- `lib/thinkforge/planning/content-card-contract.ts`
- `tests/thinkforge/content-card-contract.test.ts`

Current state: planning storage/types exist. North-star calendar intelligence is not done.

### Privacy And Provider Routing

- `lib/thinkforge/privacy/provider-privacy-gateway.ts`
- `lib/thinkforge/agents/model-factory.ts`
- `tests/thinkforge/provider-privacy-gateway.test.ts`
- `tests/thinkforge/model-factory-provider-routing.test.ts`
- `scripts/prompt-optimization/thinkforge-eval-provider-adapter.ts`
- `docs/THINKFORGE_DEEPSEEK_PRODUCTION_GATE_2026_06_14.md`
- `docs/THINKFORGE_NORTHSTAR_PRIVACY_PROVIDER_PLAN_2026_06_14.md`

Current decision: Gemini remains production default for private creative authoring. DeepSeek/OpenRouter remain eval/safe-public/sanitized only.

### Eval And Quality Harnesses

- `scripts/prompt-optimization/eval-thinkforge-author.ts`
- `scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts`
- `scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts`
- `scripts/prompt-optimization/eval-thinkforge-ideas.ts`
- `scripts/prompt-optimization/eval-thinkforge-safe-canary.ts`
- `scripts/prompt-optimization/thinkforge-eval-provider-adapter.ts`
- `tests/thinkforge/safe-canary.test.ts`
- `tests/thinkforge/eval-provider-adapter.test.ts`

Important previous gate: 95 percent should apply as both average and minimum-run gate. Provider comparison harness had to be corrected to enforce an absolute floor, not only relative winner comparison.

## What Is Left

### 1. Prompt / Output Quality Pass

Goal: make ThinkForge outputs actually sharper, not just better wired.

This is the next highest-value ThinkForge-core task.

Scope:

- Audit the actual `ScriptAuthorAgent` prompt.
- Use `docs/creative-content-knowledge.md` as context/authority, not rigid templates.
- Run real seeds for:
  - LinkedIn post
  - Instagram caption
  - carousel
  - video script
  - shootable creator script
  - agency campaign content
  - film/content-house production brief
- Identify failures: generic hooks, fake specificity, weak CTA, poor brand adherence, bad rhythm, bad hidden JSON, poor image prompt, missing editable text plan.

Relevant files:

- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/data/writing-graph-query.ts`
- `lib/thinkforge/services/gemini-writing-context-cache.ts`
- `docs/creative-content-knowledge.md`
- `scripts/prompt-optimization/eval-thinkforge-author.ts`

Acceptance:

- Output improvements are proven through seed evals, not vibes.
- No prompt change lands without before/after examples and failing case notes.

### 2. Seed Eval Expansion

Goal: build a stronger eval set for the ICP: brands, agencies, film houses, content teams.

Needed case groups:

- Agency campaign planning content.
- Brand founder thought leadership.
- Film-house treatment / production pitch.
- Product launch carousel.
- Trend/meme repurposing for a niche brand.
- User filming script with equipment constraints.
- Static post with Clickatron-ready image sidecar.
- Low-context prompt that must ask for missing info or avoid fake claims.

Relevant files:

- `scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts`
- `scripts/prompt-optimization/eval-thinkforge-author.ts`
- `scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts`
- `scripts/prompt-optimization/eval-thinkforge-safe-canary.ts`
- `.artifacts/thinkforge-provider-eval/`
- `.artifacts/thinkforge-safe-canary/`

Acceptance:

- Scoreboard includes output quality, JSON/schema validity, forbidden-term obedience, brand voice match, sidecar completeness, latency, cost, and failure modes.
- 95 percent average and minimum-run gates are enforced.
- DeepSeek is not called on private cases unless privacy gateway approves.

### 3. Brand Vault And Learning Layer Depth

Goal: verify ThinkForge uses the right brand/intelligence source at runtime.

Questions to answer in code:

- Is ThinkForge using BrandDNA, UnifiedBrand, Brand Vault, or a mix?
- Which object is the source of truth before generation?
- Do voice fingerprint, exemplars, kill list, preferred vocabulary, structural habits, DataBank facts, and interaction patterns reach the author prompt?
- Which learning events become durable and which are only ephemeral context?

Relevant files:

- `lib/thinkforge/context/fetchContextSources.ts`
- `lib/thinkforge/context/assembleContext.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/data/voice-signature.ts`
- `app/api/services/thinkforge/brand-dna/route.ts`
- `app/api/services/thinkforge/databank/route.ts`
- `app/api/services/thinkforge/events/observe/route.ts`
- `app/api/services/thinkforge/events/post-mortem/route.ts`

Acceptance:

- Produce a source-of-truth map with producer, decision owner, runtime object, prompt consumer, and tests.
- Add tests proving forbidden terms, proof points, brand voice constraints, and learned user preferences survive into authoring setup.

### 4. Production Quality Gate

Goal: move from "tests prove wiring" to "system blocks weak creative output."

Needed checks:

- Brand adherence.
- Signal use.
- Creative specificity.
- Factual grounding.
- Output usefulness.
- JSON/sidecar validity.
- Export readiness.
- Clickatron image prompt quality.
- Editable text layer completeness.

Relevant files:

- `lib/thinkforge/data/quality-scorer.ts`
- `lib/thinkforge/signals/content-profile-compliance.ts`
- `scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts`
- `tests/thinkforge/content-profile-compliance.test.ts`
- `tests/thinkforge/clickatron-creative-sidecar.test.ts`

Acceptance:

- 95 percent gate is explicit.
- Failure modes identify owner: model issue, prompt contract issue, eval rubric issue, provider issue.
- Weak outputs do not silently pass as production-ready.

### 5. Calendar And Trend Intelligence

Goal: turn planning from storage into content intelligence.

Scope:

- Wire active planning UI to real content cards.
- Add campaign, client, platform, publish window, series, and status fields.
- Add manual/public trend inbox first.
- Store trend suggestions with provenance, niche match, brand fit, expiry.
- Generate repurposing briefs from trends before final content generation.

Relevant files:

- `app/api/services/thinkforge/content-planning/route.ts`
- `app/api/services/thinkforge/content-planning/[id]/route.ts`
- `app/dashboard/thinkforge/hooks/useContentPlanning.ts`
- `lib/thinkforge/planning/content-card-contract.ts`
- `tests/thinkforge/content-card-contract.test.ts`

Acceptance:

- Agencies can plan content weeks/months ahead.
- Trend suggestions are auditable and dismissible.
- Public/safe trend routes do not send private Brand Vault data to DeepSeek.

### 6. Provider / Privacy Completion

Goal: keep DeepSeek useful but safe.

Current decision:

- Gemini: production default for private Brand Vault, user memory, client docs, and main authoring.
- DeepSeek/OpenRouter: eval, fake/synthetic, public trend/meme ideation, generic safe drafts only.

Remaining:

- Build minimal external-provider context builder.
- Add durable provider audit storage.
- Add sanitized confidential eval equivalents.
- Add route-level safe canary logs.
- Do not approve private DeepSeek until DPDP/legal review.

Relevant files:

- `lib/thinkforge/privacy/provider-privacy-gateway.ts`
- `lib/thinkforge/agents/model-factory.ts`
- `scripts/prompt-optimization/thinkforge-eval-provider-adapter.ts`
- `docs/THINKFORGE_DEEPSEEK_PRODUCTION_GATE_2026_06_14.md`

### 7. Shoot Guidance Visuals

Goal: make shootable scripts operational for real user setups.

Needed:

- User filming setup profile: cameras, lights, room, mic, background, constraints.
- Per-scene production guidance: camera position, lighting angle, framing, body position, emotion, props, warnings.
- Stickman/diagram prompt or renderable plan.
- Attach guidance to scripts and later Editron export metadata.

This is core ThinkForge product work, but downstream rendering/export can be separate.

## Suggested Next Work Order

1. Prompt/output quality audit with real seeds.
2. Patch the authoring prompt/contract only after recorded failures.
3. Expand seed evals for ICP cases and enforce the 95 percent gate.
4. Brand Vault + learning runtime source-of-truth audit.
5. Quality gate hardening.
6. Calendar/trend intelligence.
7. Provider/privacy completion.
8. Shoot guidance visuals.

## What Not To Do Next

- Do not redo the signalTrace persistence work; it is already on `main`.
- Do not treat Clickatron/Editron/Alyzi integration polish as the next ThinkForge-core task unless the user explicitly moves scope there.
- Do not switch production private authoring to DeepSeek before privacy/provider routing is finished.
- Do not patch prompts based on taste alone. Use seed outputs, failure notes, and before/after evidence.
- Do not call Brand Vault integration unified until the runtime source-of-truth chain is verified in code.

## Known Gotchas

- Full `npx tsc --noEmit` is baseline-red. Do not treat full tsc failure as proof your touched files are broken; filter touched files after recording the baseline failure.
- `docs/THINKFORGE_CURRENT_STATE_BRIEF_2026_06_13.md` is useful but stale in one important way: it says `creative-content-knowledge.md` only has Part 0. As of 2026-06-15, the doc has Parts 0-8 and the header was corrected.
- ThinkForge uses Vercel AI SDK models in `BaseAgent`, but Gemini context caching uses Google's native SDK. The current cache wiring is intentionally limited to `ScriptAuthorAgent.writeDocument()` and falls back to the old path.
- Do not call Brand Vault integration "unified" until the exact runtime producer/source/consumer chain is verified.
- Do not send raw Brand Vault, user memory, private client docs, or child data to DeepSeek/OpenRouter.
- DeepSeek may not support true deterministic seed. Use fixed cases, low temperature, repeated runs, and stability scoring.
- The user cares about real output quality, not only architecture. Always show seed outputs and failures before prompt patching.
