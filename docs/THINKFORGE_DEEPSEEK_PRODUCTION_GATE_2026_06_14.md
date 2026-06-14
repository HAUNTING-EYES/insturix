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

## Live Safe Canary Result

Command class: ThinkForge safe public canary, Gemini vs DeepSeek, one run per provider, 95 percent gate.

Artifact generated locally:

`.artifacts/thinkforge-safe-canary/phase6-live-safe-canary.json`

Result: FAIL.

Failures:

- Gemini baseline failed because the locally loaded Gemini API key was invalid.
- DeepSeek passed the public trend/meme repurposing case at 100 percent.
- DeepSeek scored 83.33 percent on the generic LinkedIn draft case.
- DeepSeek scored 37.5 percent on the Clickatron static sidecar case.
- The Clickatron sidecar failure included invalid/missing sidecar JSON, missing image prompt, missing editable text layers, and missing static asset contract.

Because the Gemini baseline failed, this run cannot approve DeepSeek by comparison. Because DeepSeek independently failed two safe public quality cases, DeepSeek also does not meet the 95 percent production gate.

## Why DeepSeek Remains Gated

The blocker is not cost. The blockers are:

1. Privacy: ThinkForge prompts can contain business confidential, personal, and brand-memory data.
2. Quality: the current safe canary shows weak sidecar JSON and weak Clickatron handoff reliability.
3. Evidence: no valid Gemini baseline was available in the latest live canary.
4. Compliance: there is no DPDP/legal approval for hosted DeepSeek on private ThinkForge context.

## Required Before Private Production Use

DeepSeek can be reconsidered for private ThinkForge generation only when all are true:

- A valid Gemini key is available and the Gemini baseline runs successfully.
- DeepSeek passes route-specific safe canaries at 95 percent or better.
- Clickatron sidecar cases pass with valid JSON, image prompts, editable text layers, and asset contract completeness.
- Privacy audit records prove no raw Brand Vault, user memory, private client docs, or child data was sent during safe-route tests.
- The provider router still blocks unsafe route/privacy combinations before network calls.
- A DPDP/legal review approves the specific data flow and provider use.

Until then, DeepSeek remains approved only for sanitized eval/public-context experimentation, not private production ThinkForge authoring.
