# ThinkForge Northstar, Privacy, And Provider Plan

Date: 2026-06-14
Branch: main
Status: planning document only. No runtime code change in this document.

This document answers two questions:

1. Which parts of the DeepSeek/privacy/provider plan are actually done?
2. What remains to reach the ThinkForge northstar for brands, agencies, and film/content teams?

## Executive Answer

Phase 3 and Phase 4 now have a first-pass implementation, but Phase 5 and Phase 6 are not done.

What exists today is eval-only DeepSeek support in prompt-optimization scripts, a privacy gateway, a privacy-aware ThinkForge model route resolver, and an improved ThinkForge output contract for Clickatron sidecars. Production private and creative ThinkForge routing still defaults to Gemini. OpenRouter-hosted DeepSeek can only be selected for explicitly safe route/privacy combinations such as public trend/eval routes.

The current safe decision is:

- Keep Gemini as the production provider for private BrandDNA, Brand Vault, user memory, project memory, client content, and intelligence-layer context.
- Accept Gemini as the current production default despite one public-eval stability miss; treat that as prompt-hardening follow-up, not a provider blocker.
- Use DeepSeek only for evals, fake/sanitized cases, and public/sanitized trend ideation routes that pass the privacy gateway.
- Do not send raw Brand Vault, user memory, client docs, or private campaign/session context to hosted DeepSeek until DPDP review and routing safeguards are implemented.

## Current Implementation Reality

### Done Or Mostly Done

1. Eval provider adapter
   - `scripts/prompt-optimization/thinkforge-eval-provider-adapter.ts` supports Gemini, DeepSeek, and OpenRouter for eval scripts.
   - It tracks latency, usage, estimated cost, and provider/model.
   - It does not route production ThinkForge calls.

2. Provider comparison scoreboard
   - `scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts` runs fixed ThinkForge cases across providers.
   - It uses low temperature and repeated runs because DeepSeek does not provide a true deterministic seed guarantee.
   - It gates by average score and minimum run score.
   - Latest live public/synthetic run: Gemini passed 8 of 9 case groups, 99.6 percent average, 88.9 percent worst run. Product decision: Gemini remains accepted as production default.
   - Latest live public/synthetic run: DeepSeek passed 8 of 9 case groups, 97.1 percent average, 22.2 percent worst run. DeepSeek remains below the production quality gate because of one JSON/schema contract failure.

3. Clickatron sidecar contract improvement
   - ThinkForge can ask the authoring model to append hidden `THINKFORGE_CLICKATRON_EXPORT` JSON.
   - The sidecar now requires root `renderPlan.imagePrompt`, editable text layers, slide plans for carousel, and grounded brand/proof constraints.
   - `script-draft-agent.ts` extracts the sidecar, enriches it with the resolved signal profile, and attaches it as `exportMeta.clickatron`.
   - The LinkedIn carousel sidecar eval moved to 100/100 across the DeepSeek rerun.

4. Signal profile wiring in the main draft path
   - `script-draft-agent.ts` calls `resolveContentSignalProfile()`.
   - It passes the profile into contract, outline, and authoring prompt context.
   - `script-author-agent.ts` injects the profile and signal execution rules.
   - Post-generation compliance can score outputs against profile constraints.

5. Privacy gateway
   - `lib/thinkforge/privacy/provider-privacy-gateway.ts` classifies prompt context as public, business confidential, personal, or child data.
   - It blocks business-confidential context for non-approved external providers.
   - It redacts common personal identifiers before non-approved provider calls where prompt-level redaction is possible.
   - It blocks child data before provider calls.
   - It produces audit records with provider, model, purpose, privacy class, fields sent, timestamps, fingerprints, redactions, and block reasons.

6. Production provider route abstraction
   - `lib/thinkforge/agents/model-factory.ts` resolves routes by purpose and privacy class.
   - Private creative authoring, structural work, and private brand context default to Gemini.
   - OpenRouter is available only for safe public/eval-style route purposes when explicitly preferred.
   - `tests/thinkforge/model-factory-provider-routing.test.ts` verifies the default Gemini routes and the OpenRouter block/allow boundaries.

### Partial

1. Content signal resolver
   - `lib/thinkforge/signals/content-signal-resolver.ts` exists and is useful.
   - It resolves output format, platform, target length, CTA type, audience, goal, tone, proof points, forbidden terms, visual needs, Clickatron intent, provenance, and warnings.
   - It is still heuristic and incomplete versus `docs/creative-content-knowledge.md`.
   - It does not implement the full 47-signal cascade across brand, campaign, format, project, act, scene, and beat.

2. Brand intelligence
   - ThinkForge has BrandDNA and DataBank context retrieval.
   - Clickatron can resolve shared brand context from the unified brand layer.
   - ThinkForge generation still primarily uses ThinkForge BrandDNA through `fetchContextSources()`, not the same unified Brand Vault runtime as downstream tools.
   - This is partial convergence, not full Brand Vault integration.

3. Calendar/content planning
   - Content card storage and types exist.
   - Calendar UI pieces exist.
   - The active Planning surface still needs product wiring.
   - No trend/news/meme suggestion loop exists yet.

### Not Done

1. Minimal external-provider context builder and durable audit storage
   - The privacy gateway exists, but it still sees a full prompt string in eval/tooling paths.
   - There is no dedicated minimal-context builder that strips raw Brand Vault internals into a safe resolved summary for hosted non-approved providers.
   - Audit records exist in process, but there is no durable production telemetry store for provider, model, purpose, privacy class, fields sent, timestamps, redactions, and block reasons.

2. Sanitized confidential eval coverage
   - The 18 author and Clickatron sidecar cases that contain business-confidential Brand Vault/campaign context are correctly blocked from DeepSeek/OpenRouter.
   - They still need synthetic or redacted equivalents before DeepSeek can be evaluated against the same product surfaces.
   - Clickatron sidecar cases still need route-specific sanitized tests for JSON validity, image prompt quality, editable text layers, and asset contract completeness.

3. Production A/B canary
   - No production canary sends safe ThinkForge routes to DeepSeek.
   - No side-by-side user-facing comparison between Gemini and DeepSeek in production.
   - No canary telemetry tied to output quality, privacy class, cost, and provider failures.

4. Production DeepSeek decision
   - No approval exists to use hosted DeepSeek for private ThinkForge generation.
   - DeepSeek remains eval/safe-public only until sanitized route evals pass the 95 percent gate and DPDP/legal approves the specific data flow.

5. Alyzitron loop
   - ThinkForge does not yet export post/script content to Alyzitron as an analysis workflow.
   - Alyzitron results do not feed back into ThinkForge signals, BrandDNA, or calendar planning.

6. Production guidance visuals
   - No user filming setup profile.
   - No camera/light/room schema.
   - No stickman-style production diagram generation.
   - No per-scene visual shoot plan tied to actual user equipment.

## Northstar Coverage Matrix

| Northstar Capability | Current State | Next Required Move |
| --- | --- | --- |
| Ideation | Exists, brand-aware, not deeply signal-driven | Route ideas through the same signal resolver and output contracts |
| Scripting | Exists, multi-agent, context-aware | Split output contracts by content type and tighten script quality gates |
| Copywriting | Exists through the script pipeline | Create first-class post/caption/ad/email output contracts |
| Hidden session JSON | Partial through signal profile and Clickatron sidecar | Define one standard hidden output contract for all exports |
| Clickatron images | Partial and improving | Populate calendar/session metadata and expose readiness UI |
| Editron export | Exists for scripts/video | Attach stronger signal traces and production guidance |
| Alyzitron analysis | Not wired from ThinkForge | Add ThinkForge analysis handoff route and feedback ingestion |
| Calendar planning | Storage/UI pieces exist, active product incomplete | Wire real planning mode, campaign fields, and Clickatron links |
| Trend/meme suggestions | Not implemented | Start with manual/public trend inbox plus provenance |
| Brand Vault connection | Partial BrandDNA plus shared downstream brand context | Resolve unified brand context before ThinkForge generation |
| Learning/intelligence layer | Partial DataBank/observer/post-mortem | Feed outcomes into signals, Brand Vault, and content planning |
| Shoot guidance visuals | Not implemented | Add filming setup profile and production diagram contract |

## Final Execution Plan

### Phase 1: Stabilize And Land Current ThinkForge Improvements

Goal: make the current uncommitted ThinkForge work safe to build on.

Scope:

- Keep DeepSeek support eval-only.
- Keep Clickatron sidecar contract improvements.
- Keep signal resolver/main draft path wiring.
- Run focused ThinkForge tests and touched-file type filtering.
- Commit only the intentional ThinkForge files after user approval.

Acceptance:

- Focused ThinkForge tests pass.
- Scoped ESLint passes on touched files.
- Touched-file TypeScript filter is clean.
- No API keys or private eval artifacts are committed.

### Phase 2: Brand And Signal Source Of Truth

Goal: make ThinkForge generation use the real brand/intelligence context, not a weaker copy.

Scope, max 5 files per implementation step:

- Decide the runtime source of truth between BrandDNA, UnifiedBrand, and future Brand Vault records.
- Resolve a shared brand context before ThinkForge generation.
- Preserve voice fingerprint and exemplars through effective BrandDNA resolution.
- Attach a `signalTrace` to generated outputs: profile used, selected techniques, enforced brand constraints, missing warnings.
- Add tests proving brand constraints, proof points, and forbidden terms survive generation setup.

Acceptance:

- Producer path, decision owner, data source of truth, and consumer are verified in code.
- No claim of "unified Brand Vault" unless ThinkForge generation and Clickatron consume the same verified brand source.

### Phase 3: Privacy Gateway

Goal: block unsafe provider routing before any production DeepSeek usage.

Scope:

- Add privacy classes: public, business confidential, personal, child data.
- Classify prompt context before provider selection.
- Redact personal/user/client identifiers from non-private routes.
- Strip raw Brand Vault internals before any external non-approved provider call.
- Build minimal resolved prompt context for external providers.
- Log provider, route purpose, privacy class, fields sent, model, timestamp, and block reason.
- Fail closed when privacy class and provider policy conflict.

Acceptance:

- Private Brand Vault/user memory cannot reach hosted DeepSeek.
- Tests cover public route allowed, confidential route blocked, personal data redacted, and child data blocked.
- Audit log records what was sent without storing full private prompts.

### Phase 4: Provider Abstraction

Goal: replace Google-only production model creation with privacy-aware task routing.

Provider route types:

- `structural`
- `creative_authoring`
- `eval`
- `public_trend`
- `private_brand_context`

Routing policy:

- `private_brand_context`: Gemini or another enterprise-safe provider only.
- `creative_authoring`: Gemini by default until privacy gateway and eval evidence allow alternatives.
- `eval`: Gemini, DeepSeek, OpenRouter allowed with fake/sanitized cases.
- `public_trend`: DeepSeek allowed only for public/sanitized trend briefs.
- fallback: Gemini.

Acceptance:

- Production callers request a task route, not a raw model string.
- Provider choice requires privacy class.
- Unsafe combinations throw before a network call.

### Phase 5: Safe A/B Canary

Goal: test DeepSeek in production-adjacent conditions without private data exposure.

Allowed canary routes:

- fake eval cases
- public trend/meme ideation
- generic content drafts without Brand Vault, user memory, client docs, or private campaign context

Scoreboard:

- output quality
- schema/JSON validity
- forbidden-term obedience
- brand voice match only on synthetic brands
- Clickatron sidecar completeness
- latency
- estimated cost
- provider failure modes

Acceptance:

- DeepSeek must match or beat Gemini on quality, not only cost.
- Canary logs must prove no private context was sent.
- Failed outputs do not reach users automatically.

### Phase 6: Calendar And Trend Intelligence

Goal: turn planning from storage into content intelligence.

Scope:

- Wire active Planning UI to real content cards.
- Add campaign, series, client, platform, publish window, and Clickatron status fields.
- Add manual/public trend inbox first.
- Store trend suggestions with provenance, niche match, brand fit, and expiry.
- Generate repurposing briefs from trends before generating final content.
- Connect static planned content to Clickatron export metadata.

Acceptance:

- Agencies can plan multi-week/month content.
- Trend suggestions are auditable and dismissible.
- Static cards can become Clickatron-ready without re-entering the full brief.

### Phase 7: Alyzitron And Learning Feedback

Goal: make analysis results improve future ThinkForge outputs.

Scope:

- Add ThinkForge-to-Alyzitron handoff for posts/scripts.
- Define analysis result schema for copy/script quality.
- Feed accepted findings into DataBank and shared brand events.
- Promote only after quality gates and user/product signals.
- Use analysis outcomes to tune signal defaults and output contracts.

Acceptance:

- Analysis result can be traced to source content.
- Promotion path is scoped and reviewable.
- Future generation can cite which learned pattern affected the prompt.

### Phase 8: Production Guidance Visuals

Goal: make shootable scripts operational for real user setups.

Scope:

- Add user filming setup profile: cameras, lights, room size, background, mic, constraints.
- Add production guidance schema per scene: camera position, lighting angle, framing, body position, emotion, props, warnings.
- Generate lightweight stickman/diagram prompt or renderable plan.
- Attach guidance to scripts and Editron export metadata.

Acceptance:

- Guidance changes when the user has 1 camera versus multiple cameras.
- Guidance changes when the user has no lights versus key/fill/back light.
- It is tied to scene emotion, stats, and content purpose.

## Immediate Recommendation

Do not expand provider production work beyond Gemini default plus safe public/sanitized evaluation yet.

The next product move should be Phase 1 landing plus Phase 2 brand/signal source of truth. Provider/privacy work matters, but DeepSeek is not the main product blocker while production private and creative authoring stays on Gemini. The biggest output-quality gain will come from making ThinkForge use the right brand, signal, proof, and output-contract context before the model writes.

After Phase 2, harden the existing privacy gateway and provider router with minimal-context builders, durable audit storage, and sanitized confidential-case evals.

## Definition Of Done For Production DeepSeek

DeepSeek can be considered for production ThinkForge routes only when all are true:

- Privacy gateway exists, fails closed, and records durable production audit evidence.
- Provider abstraction exists and routes by task plus privacy class.
- DeepSeek passes the relevant 95 percent quality gate against Gemini on sanitized route-specific cases.
- No raw Brand Vault, user memory, private client docs, or child data is sent.
- Canary logs prove what fields were sent and why.
- A DPDP review approves the relevant data flow.

Until then, DeepSeek remains an eval and safe-public-context provider only.
