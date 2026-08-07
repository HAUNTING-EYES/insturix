# Brand Vault Remaining Work Refresh

Date: 2026-06-24
Branch checked: `infrastructure-improvs-+Editron`
Reference roadmap: `D:\Insturix-Brain\07-Roadmap\Multi-Brand-Workspace-Plan-2026-06-23.md`

## Current Position

Brand Vault is no longer only an intake/review island. Recent commits added real consumers and feedback plumbing:

- ThinkForge/CalOS can resolve brand context through the Vault-aware resolver.
- Clickatron prompt context resolves through the Vault-aware resolver.
- Editron motion/visual sockets exist for accepted Vault profiles.
- Brand Vault accepts reviewed drafts and can stage weighted learning events.
- Editron user overrides can emit weighted learning events.
- Clickatron committed thumbnails can stage weak visual asset evidence.

This is still partial convergence, not a merged brand brain. The production bar is higher because Insturix serves brands, businesses, and agencies. Multi-brand is core, and wrong-brand output is a client-losing failure.

## Non-Negotiable Product Rule

Generation and retrieval must never use the wrong brand. For multi-brand agency use, any brand-aware generation that cannot resolve one unambiguous `{ orgId, brandId, userId }` scope must fail closed with a clear select-brand error. It must not fall back to latest/default/user-wide brand.

Every project, job, and generation must stamp `brandId` at creation and read that stamped value thereafter. The active brand selector can seed new work, but must not mutate in-flight work.

## Updated Remaining Work

### 1. Multi-brand foundation is now the first priority

Status: not done.

The roadmap requires Brand Vault records to key on `{ orgId, brandId, userId }`. Current Brand Vault store/resolver shape is still primarily `{ userId, brandId }`.

Required work:

- Add `orgId` to `BrandSignalProfile`, profile records, refinery jobs, repository filters, Mongo documents, events, and indexes.
- Add additive migration/backfill for existing records.
- Support transition reads without leaving records permanently `orgId: null`.
- Auto-create/resolve a personal Clerk org so there is one scoping path, not user-vs-org dual tenancy.
- Add tests that prove accepted profiles are isolated by org.

### 2. Brand list and active brand context

Status: not done.

Required work:

- Add `GET /api/brand-vault/brands` returning accepted brands for the active org.
- Add `listAcceptedBrands({ orgId })` at the store/repository layer.
- Build one shared `useActiveBrand()` context for Brand Vault, CalOS, Editron, ThinkForge, and generation.
- Brand == CalOS client. Do not create a second selector or a parallel client concept.

### 3. Acceptance visibility and downstream event emission

Status: still needs fixing.

Current concern:

- `app/api/brand-vault/signal-profiles/[id]/route.ts` emits `brand_updated` only when `learningEvents.length > 0`.
- Accepting a draft with no manual edits can become accepted without a downstream event.

Required work:

- Emit an acceptance/update event for every successful accept.
- Include whether manual learning events were produced as metadata, not as the condition for event emission.
- Ensure accepted profile reload uses scoped `{ orgId, brandId, userId }`.

### 4. Brand Vault UI cache after accept

Status: still incomplete.

Current concern:

- `components/dashboard/BrandVault/useBrandVault.ts` invalidates the profile record on accept, but not clearly the latest accepted query or job state.

Required work:

- Invalidate profile, latest accepted record, current job, and accepted brand list after accept/reject/create.
- Make accepted state visible after reload without relying on unscoped "latest for user".
- Once active brand exists, latest accepted should be latest for selected brand in org, not latest across all user brands.

### 5. Accepted scans must bind to real brand identity

Status: partially done for routes requiring `brandId`, not fully closed.

Current concern:

- Consumers query accepted Vault profiles by `userId + brandId`.
- Multi-brand roadmap now requires `orgId + brandId + userId`.
- A website scan accepted with missing `brandId` will not feed Editron, ThinkForge, Clickatron, or CalOS generation.

Required work:

- Require or resolve a brand/client before creating a generation-bound Vault scan.
- Allow unbranded exploratory scans only if clearly marked as not generation-bound.
- Add migration/repair path for accepted profiles with missing `brandId`.
- Add a test where accepted profile for Brand A cannot be loaded for Brand B.

### 6. Generation must become fail-closed when brand-aware

Status: not done.

Current concern:

- CalOS generation requires `brandId`, but brand context resolution is best-effort and proceeds without brand context.
- The roadmap says brand-aware generation must refuse if scope cannot resolve one brand.

Required work:

- Introduce a strict resolver mode for generation.
- Fail with a clear select/connect/approve-brand error when the scoped brand cannot be resolved.
- Keep best-effort behavior only for explicitly non-brand-aware drafts or legacy fallback modes.
- Add tests proving missing/ambiguous brand produces no output.

### 7. Editron still has a legacy read path

Status: partially converted.

Current concern:

- Most Editron motion/EDL paths have Vault hooks.
- `lib/pipeline/llm-scene-parser.ts` still calls legacy `getUnifiedBrand()` directly.

Required work:

- Replace direct legacy read with `resolveEffectiveBrandWithProfile()` or the strict brand resolver where generation-bound.
- Prove an accepted Vault profile changes actual rendered/motion output, not only adapter output.

### 8. Editron manual brand CRUD must dual-write to Vault

Status: not clearly done.

Current concern:

- Editron brand setup/edit routes can still behave as a separate truth source.

Required work:

- Convert Editron manual brand edits into high-trust `manual_user_entry` Vault evidence.
- Preserve attribution with actor `userId`.
- Keep edits staged/reviewed according to policy, or auto-accept only where product explicitly allows.

### 9. Alyzitron is a Vault consumer, not a Vault writer

Status: correction applied to plan.

Earlier wording incorrectly treated Alyzitron as a producer-to-Vault path. The intended direction is Alyzitron reads Brand Vault context to analyze videos/assets in the brand's context.

Required work:

- Wire Alyzitron analysis input to accepted Brand Vault context.
- Scope by stamped `{ orgId, brandId, userId }`.
- Fail closed for brand-aware analysis if the selected brand cannot be resolved.
- Add tests proving Alyzitron analysis prompt/context changes with the scoped accepted brand.

Optional later work:

- If Alyzitron outputs user-reviewed insights that should teach the Vault, define a separate explicit feedback path. Do not imply this exists today.

### 10. Clickatron producer path is still partial

Status: partial.

Current behavior:

- Committed thumbnail can stage `assets.socialPreviewImages` evidence.

Missing:

- Richer visual composition evidence.
- Prompt/edit-result feedback.
- Palette/typography/layout learnings from accepted or corrected outputs.
- Tests proving those signals are staged and remain review-gated.

### 11. Vault does not natively own learned voice yet

Status: composed, not truly owned.

Current behavior:

- ThinkForge learned voice is preserved/composed with Vault.
- ThinkForge edits/exemplars can stage evidence.

Missing:

- First-class `voiceFingerprint` and `voiceExemplars` ownership in the Vault data model.
- Migration/adapter strategy so ThinkForge does not regress.
- Review UI support for learned voice evidence.

### 12. Flags and rollout proof

Status: not proven.

Required work:

- Confirm production values for `BRAND_VAULT_SOURCE_EDITRON`, `BRAND_VAULT_SOURCE_THINKFORGE`, and `BRAND_VAULT_SOURCE_CLICKATRON`.
- Decide whether CalOS uses the ThinkForge flag or needs its own flag.
- Add Alyzitron consumer flag or strict brand-context gate.
- Add a runtime diagnostics endpoint or log that shows which brand source was used.

### 13. Consumer proof is still the gate

Status: not done end-to-end.

Required proof:

- ThinkForge script uses accepted Vault context plus learned voice.
- Clickatron image prompt uses accepted Vault colors/brand context.
- Editron render/motion uses accepted Vault visual and motion signals.
- CalOS generated deliverable uses the stamped brand, not active-brand global state.
- Switching active brand affects new work only, not existing stamped work.

This is the gate before saying Brand Vault is production-wired into generation.

## Suggested Execution Order

1. Multi-brand P1: add `orgId` to Vault data model, store filters, indexes, and migration.
2. P2/P3: accepted brand list and shared active brand context.
3. Fix accept event/cache visibility while updating it to scoped queries.
4. Bind/refuse unbranded scans for generation-bound workflows.
5. Strict brand resolver for generation.
6. Convert remaining consumers: CalOS strict generation, Editron `llm-scene-parser`, Alyzitron consumer.
7. Manual brand CRUD dual-write into Vault.
8. Richer Clickatron feedback.
9. Native learned voice ownership in Vault.
10. End-to-end consumer proof and rollout flag verification.

## Verification Notes From 2026-06-24

Focused Brand Vault tests passed:

- `tests/brand-intelligence/brand-effective-resolver.test.ts`
- `tests/brand-intelligence/brand-signal-profile-repository.test.ts`
- `tests/brand-intelligence/brand-vault-refinery-api.test.ts`
- `tests/brand-intelligence/brand-vault-learning-events.test.ts`
- `tests/brand-intelligence/brand-learning-worker.test.ts`
- `tests/clickatron/brand-prompt-context.test.ts`
- `tests/thinkforge/content-signal-resolver.test.ts`
- `tests/editron/brand-vault-motion-socket.test.ts`

Nearby scope tests passed:

- `tests/brand-intelligence/brand-event-scope.test.ts`
- `tests/thinkforge/context-scope.test.ts`
- `tests/clickatron/thumbnail-commit-context.test.ts`
- `tests/clickatron/think-to-click-context.test.ts`
- `tests/clickatron/think-to-click-session-payload.test.ts`
- `tests/calos/cadence.test.ts`

Repo-wide `npx tsc --noEmit` is currently baseline-red with unrelated errors across multiple services, so use targeted tests plus touched-file type/lint checks until the baseline is cleaned.
