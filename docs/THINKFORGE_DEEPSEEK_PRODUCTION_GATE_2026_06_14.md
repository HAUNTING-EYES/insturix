# ThinkForge DeepSeek Production Gate

Date: 2026-06-14
Branch: main
Status: DeepSeek is not approved for private production ThinkForge generation.

This is a technical product/security decision note, not legal sign-off. DPDP/legal approval is still required before sending private Brand Vault, user memory, client documents, or personal data to a hosted third-party provider.

## Current Decision

Keep Gemini as the default provider for:

- private Brand Vault or BrandDNA context
- user memory and DataBank context
- client documents, client strategy, campaign plans, or unreleased business data
- personal data
- child/minor data
- main ThinkForge creative authoring routes

DeepSeek/OpenRouter can be used only for:

- sanitized evals
- fake or synthetic test cases
- public trend/meme ideation
- generic drafts without private brand, user, client, or campaign context

## Live Public Provider Comparison Result

Command class: ThinkForge provider comparison eval, Gemini vs DeepSeek, three runs per provider, 95 percent average and minimum-run gate.

Latest artifacts generated locally:

`.artifacts/thinkforge-provider-eval/live-public-both-*.json`

Scope: nine privacy-approved public/synthetic ideas cases only. The 18 author and Clickatron sidecar cases that contain business-confidential Brand Vault or campaign context remain blocked from external non-approved providers by the local privacy gateway.

Summary:

- Gemini: 8 of 9 case groups passed the 95 percent gate, 99.6 percent average across case averages, 88.9 percent worst run, about $0.0437 total estimated cost, about 9.9s average latency.
- DeepSeek: 8 of 9 case groups passed the 95 percent gate, 97.1 percent average across case averages, 22.2 percent worst run, about $0.0090 total estimated cost, about 13.2s average latency.
- Gemini miss: `ideas_agency_campaign` had one run fail forbidden-term obedience. This is accepted as a prompt-hardening follow-up, not a production provider blocker.
- DeepSeek miss: `ideas_public_trend_calendar` had one run fail JSON/schema contract and specificity checks. This keeps DeepSeek below the production quality gate.

Product decision: Gemini is accepted as the production default for ThinkForge private and creative authoring routes. DeepSeek remains cheaper and useful for safe public/synthetic experimentation, but it is not approved for private production ThinkForge generation.

## Live Safe Canary Result

Command class: ThinkForge safe public canary, Gemini vs DeepSeek, one run per provider, 95 percent gate.

Latest artifact generated locally:

`.artifacts/thinkforge-safe-canary/production-sidecar-calibrated-rerun.json`

Result: PASS for safe public/synthetic canary only.

Results:

- Gemini baseline ran successfully with a valid key.
- Privacy audit passed: all canary prompts were public and artifact-only.
- DeepSeek passed the public trend/meme repurposing case at 100 percent.
- DeepSeek passed the generic LinkedIn draft case at 100 percent.
- DeepSeek passed the Clickatron static sidecar case at 100 percent after the canary was corrected to use the real `THINKFORGE_CLICKATRON_EXPORT` wrapper and valid `post_graphic` asset intent.
- Gemini also scored 100 percent on all three safe canary cases.

This means DeepSeek is viable for sanitized/public-context experimentation on these canary routes. It does not approve DeepSeek for private ThinkForge generation.

## Why DeepSeek Remains Gated

The blocker is not cost or the safe-public canary. The remaining blockers are:

1. Privacy: ThinkForge prompts can contain business confidential, personal, and brand-memory data.
2. Evidence scope: the passing canary used public/synthetic prompts only, not raw Brand Vault, user memory, or client documents.
3. Compliance: there is no DPDP/legal approval for hosted DeepSeek on private ThinkForge context.
4. Product risk: the latest nine-case public eval still had a DeepSeek contract stability failure.
5. Production authoring still needs sanitized route-level canaries before user-visible rollout.

## Required Before Private Production Use

DeepSeek can be reconsidered for private ThinkForge generation only when all are true:

- A valid Gemini key is available and the Gemini baseline runs successfully.
- DeepSeek passes route-specific safe canaries at 95 percent or better.
- Clickatron sidecar cases pass with valid JSON, image prompts, editable text layers, and asset contract completeness.
- Privacy audit records prove no raw Brand Vault, user memory, private client docs, or child data was sent during safe-route tests.
- The provider router still blocks unsafe route/privacy combinations before network calls.
- A DPDP/legal review approves the specific data flow and provider use.

Until then, DeepSeek remains approved only for sanitized eval/public-context experimentation, not private production ThinkForge authoring.
