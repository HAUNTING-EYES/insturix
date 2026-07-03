# Alyzitron Brand Lens and Content Intent Spec

Date: 2026-07-01
Branch target: `infrastructure-improvs-+Editron`
Status: Phase 1 spec, no runtime code in this document.

## Context

Alyzitron should become a brand-aware content analyst. The hard product boundary
is that Brand Vault is a read-only lens for Alyzitron, not a destination for
Alyzitron output. Alyzitron stores task-level analysis results. Brand Vault keeps
owning durable brand memory.

The UX also needs to understand whether the media is the user's own content,
competitor content, or general reference content. That intent changes the report
language:

- Own content: what is on brand, off brand, and worth improving.
- Competitor content: what works, what can be adapted, and what not to copy.
- Reference content: useful inspiration patterns and how to translate them.
- Unknown: general analysis first, with brand-fit caveats when a lens exists.

## Verified Current State

Verified on 2026-07-01 against `origin/infrastructure-improvs-+Editron` at
`a4a23be56060455ee812a6ca8bdf6b11112f1f74`.

| Area | Current behavior | Gap |
| --- | --- | --- |
| Brand read | `lib/alyzitron/services/brand-vault-context.ts` reads legacy brand data and accepted Brand Vault profiles. | The lens is flattened into prompt text, not a structured contract. |
| Analyze route | `app/api/services/alyzitron/analyze/route.ts` accepts and stores `brandId` when present. | Normal dashboard upload does not reliably send active brand. |
| Processor | `app/api/services/alyzitron/processor/route.ts` rebuilds brand context and passes it to Gemini. | No content intent is persisted or passed to the model. |
| Prompt | `lib/services/vertexAiService.ts` has a brand alignment block. | Response schema has no first-class brand-fit or external-learning sections. |
| Upload UX | `components/dashboard/Alyzitron/ImmersiveModal.tsx` sends context to `startAnalysis`. | Debug `sourceType: file/link` is media transport, not ownership intent. |
| Upload hook | `app/dashboard/alyzitron/hooks/useVideoAnalysis.ts` sends URL, context, metadata, and storage. | No `brandId`, `contentIntent`, or inference metadata. |
| Active brand | `components/dashboard/ActiveBrand/ActiveBrandProvider.tsx` exposes active-brand helpers. | Alyzitron upload does not use them yet. |
| Report | `app/dashboard/alyzitron/report/[id]/components.tsx` renders generic results. | No Brand Fit, borrowable patterns, or do-not-copy sections. |
| Chat | `lib/alyzitron/chat/systemPrompt.ts` uses analysis and transcript. | Chat is not brand-lens or intent aware. |

The older `alyzitron-signal-integration.md` write-back plan is superseded.

## Product Model

### Brand Lens

The Brand Lens is the selected brand profile used to judge content. It must be
read-only and should use the fullest safe Brand Vault context available:

- Identity: name, category, positioning, audience, offers.
- Voice: formality, directness, humor, vocabulary, banned phrasing.
- Visuals: palette, contrast, typography, density, layout bias.
- Motion/editing: pacing, transition sharpness, rhythm, hook expectations.
- Content strategy: pillars, proof style, CTA style, recurring themes.
- Constraints: avoid lists, claims requiring evidence, compliance notes.
- Evidence quality: source, confidence, accepted-profile state, missing signals.

Weak or incomplete lens data should produce caveated recommendations, not fake
certainty.

### Content Intent

Content intent is separate from upload source.

```ts
export type AlyzitronContentIntent =
  | "own_content"
  | "competitor_content"
  | "reference_content"
  | "unknown";

export type AlyzitronIntentSource =
  | "user_selected"
  | "system_inferred"
  | "defaulted"
  | "unknown";

export interface AlyzitronIntentResolution {
  contentIntent: AlyzitronContentIntent;
  source: AlyzitronIntentSource;
  confidence: number;
  rationale: string[];
  userConfirmed: boolean;
}
```

Use `mediaSourceKind` for transport: file, image, youtube_url, external_url,
r2, or gcs. Use `contentIntent` for meaning: mine, competitor, reference, or
unknown.

## UX Requirements

The upload flow should stay fast.

1. Show the active Brand Vault brand as a pill near the upload surface.
2. Let users change or clear the lens without leaving Alyzitron.
3. Infer content intent after a file or link is selected.
4. Show the inferred intent as an editable chip.
5. Let explicit user selection override inference.
6. Do not block analysis when intent is unknown.
7. Block only when a user explicitly requested brand-aware analysis with a
   missing or invalid selected brand.

| Internal value | UI label | Report framing |
| --- | --- | --- |
| `own_content` | Mine | On-brand fit and next edits |
| `competitor_content` | Competitor | Borrowable patterns and differentiation |
| `reference_content` | Reference | Inspiration and translation notes |
| `unknown` | Not sure | General analysis with optional caveats |

## Intent Inference

Use a deterministic resolver before any model call.

High-confidence own-content signals:

- Local upload plus active brand.
- Owned Editron project source.
- Route metadata includes a matching `brandId`.
- Future connected account proves the handle/domain belongs to the user/org.

Medium-confidence external signals:

- Public URL from a handle/domain not known to belong to the user.
- User text says competitor, reference, inspo, what can we use, or why it worked.

Defaults:

- Local upload plus active brand: `own_content`, confidence 0.7.
- External URL: `reference_content`, confidence 0.45 unless competitor language
  is present.
- No active brand: `unknown`, confidence 0.3.

## API Contract

```ts
export interface AlyzitronAnalyzeRequest {
  video_url: string;
  context?: ContextValues;
  metadata?: Record<string, unknown>;
  storage?: "gcs" | "r2";
  editronProjectId?: string;
  brandId?: string;
  mediaSourceKind?: "file" | "image" | "youtube_url" | "external_url" | "r2" | "gcs";
  contentIntent?: AlyzitronContentIntent;
  intentResolution?: AlyzitronIntentResolution;
}
```

Persist these Alyzitron-owned fields on the analysis task:

```ts
export interface AlyzitronTaskBrandLens {
  brandId?: string;
  brandName?: string;
  source: "brand_vault" | "legacy" | "none";
  profileVersion?: string;
  acceptedAt?: string;
  lensConfidence: number;
  missingSignals: string[];
}

export interface AlyzitronTaskIntentFields {
  mediaSourceKind?: string;
  contentIntent: AlyzitronContentIntent;
  intentSource: AlyzitronIntentSource;
  intentConfidence: number;
  intentRationale: string[];
  userConfirmedIntent: boolean;
}
```

Do not store full private Brand Vault profile payloads in public report data.

## Prompt and Result Contract

Prompt rules:

1. Separate observed media facts from brand-lens judgments.
2. For `own_content`, evaluate fit and practical edits.
3. For `competitor_content`, identify adaptable patterns and copying risks.
4. For `reference_content`, identify inspiration and translation notes.
5. For weak or missing lens data, caveat the brand-specific claims.
6. Do not claim ownership unless explicit selection or confidence supports it.
7. Do not create Brand Vault update candidates.

Keep existing result fields for compatibility, then add:

```ts
export interface AlyzitronBrandFitSection {
  score: number | null;
  verdict: "strong_fit" | "partial_fit" | "off_brand" | "insufficient_lens";
  onBrandSignals: string[];
  offBrandSignals: string[];
  evidence: string[];
  recommendedAdjustments: string[];
}

export interface AlyzitronExternalLearningSection {
  appliesTo: "competitor_content" | "reference_content";
  borrowablePatterns: string[];
  adaptationNotes: string[];
  doNotCopy: string[];
  differentiationOpportunities: string[];
  evidence: string[];
}
```

`brandFit` can exist for any intent when a lens exists. `externalLearning` only
exists for competitor/reference intent. Neither field implies Brand Vault writes.

## Report and Chat

Always show general quality, score, summary, strengths, improvements, and
compliance. When a lens exists, show Brand Fit, on-brand signals, off-brand
signals, lens confidence, and missing brand evidence. For competitor/reference,
show What We Can Use, How To Adapt It, What Not To Copy, and Differentiation
Opportunities.

Chat should receive the same task-level intent and safe lens metadata. It should
answer as an improvement coach for own content, a strategic analyst for
competitor content, an adaptation assistant for reference content, and a neutral
analyst for unknown intent. Chat must never claim it can update Brand Vault.

## Implementation Phases

Each code phase touches no more than five files and waits for approval before
continuing.

### Phase 2A - Contract and Intent Resolver

Files: `app/api/services/alyzitron/types/index.ts`,
`lib/alyzitron/analysis-intent.ts`, `tests/alyzitron/analysis-intent.test.ts`.

Acceptance: separate `contentIntent` from `mediaSourceKind`; explicit selection
wins; deterministic defaults are tested; no Brand Vault write helper appears.

### Phase 2B - Upload UX and Active Brand Wiring

Files: `components/dashboard/Alyzitron/VideoUpload.tsx`,
`components/dashboard/Alyzitron/ImmersiveModal.tsx`,
`app/dashboard/alyzitron/hooks/useVideoAnalysis.ts`, plus active-brand helper or
focused tests only if needed.

Acceptance: active `brandId`, `contentIntent`, and `intentResolution` are sent;
user can override intent; file/image/URL flows still work.

### Phase 2C - Analyze and Processor Persistence

Files: `app/api/services/alyzitron/analyze/route.ts`,
`app/api/services/alyzitron/processor/route.ts`,
`lib/alyzitron/services/brand-vault-context.ts`, and focused Alyzitron tests.

Acceptance: task persists intent/lens metadata; QStash forwards it; processor
reads Brand Vault but never writes; Editron quality sync remains unchanged.

### Phase 2D - Prompt, Schema, Normalization, Report

Files: `lib/services/vertexAiService.ts`, `lib/alyzitron/analysis-results.ts`,
`tests/alyzitron/analysis-results.test.ts`,
`app/dashboard/alyzitron/report/[id]/components.tsx`, and PDF export only if
needed.

Acceptance: Gemini schema includes brand-fit/external-learning sections;
normalizer preserves old fields; report renders intent-aware sections.

### Phase 2E - Chat Awareness

Files: `app/api/services/alyzitron/chat/route.ts`,
`lib/alyzitron/chat/systemPrompt.ts`, and a focused chat prompt test.

Acceptance: chat receives intent/lens context, follows the right framing, and
refuses Brand Vault write claims.

## Static Guardrail

Add or maintain a focused test that fails if Alyzitron adds a Brand Vault write
path. Forbidden concepts in Alyzitron service code include `decodeAndPushSignals`,
`brand-vault-integration.ts`, and direct Brand Vault evidence/profile writes.
Reads through `getLatestAcceptedProfile` remain allowed.

## Verification

Every code phase must run:

```bash
npx vitest run <focused Alyzitron tests>
npx eslint . --quiet
npx tsc --noEmit
```

If repo-wide TypeScript is baseline-red, record the first unrelated error and
prove touched Alyzitron files did not introduce a new one.

## Out of Scope

- Alyzitron write-back into Brand Vault.
- Automatic promotion of competitor/reference insights into brand memory.
- Reworking Editron, ThinkForge, or Clickatron Brand Vault consumption.
- Full Brand Vault schema redesign.
- Claiming content ownership when intent confidence is weak.
