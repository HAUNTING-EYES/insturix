# Organization Credits & Billing — Build Plan (2026-08-02)

Eng-reviewed build plan for org-owned credit wallets. Self-contained: verified
current reality with file:line evidence, locked decisions, phases ≤5 files,
CRITICAL regression tests, risk registry, and the open founder decisions.

**Founder ruling locked 2026-08-02:** deduction resolution is
**org project → org wallet. No silent fallback to the member's personal wallet.**

---

## 1. Verified current reality (the "before")

| Fact | Evidence |
|---|---|
| Wallet is embedded in the User document, two pools (main+media), sub+top-up each | `schemas/user.ts:102,133,327,420` |
| Entire billing API is keyed `clerkUserId`; static class methods | `lib/services/creditsService.ts:98-917` (`getBalance:102`, `deductCredits:186`, `addCredits:375`, `refundCredits:450`, `addTopupCredits:585`, `grantSubscriptionCredits:678`, `adjustCredits:917`) |
| Zero org-awareness in billing: no `orgId` in creditsService, creditsMiddleware, creditCosts, subscription routes, webhooks | grep verified 2026-08-02 |
| Atomic update pattern exists and is reusable | `creditsService.ts:212` `User.findOneAndUpdate` conditional |
| Idempotency exists (Razorpay duplicate no-op) | `CreditsPurchaseResult.duplicate:70` |
| Transaction history is capped at 100 embedded entries | `MAX_CREDIT_HISTORY`, `creditsService.ts:23` |
| Organization schema exists — NO wallet/billing fields | `schemas/Organization.ts` (`clerkOrgId,name,slug,createdBy,memberCount,settings`) |
| OrgMember schema: roles, invites, `(clerkOrgId, role)` index | `schemas/OrgMember.ts` |
| Org routes: CRUD, members, org projects (`allowMemberProjects` setting) | `app/api/org/**` (5 routes) |
| Editron projects already store `orgId` + `visibility:'org'` with membership checks | `lib/editron/services/project-service.ts:48,89-90,105,121,139` (`createOrgProject:139`) |
| Active-org context propagates from the switcher into project creation | `components/org/OrgSwitcher.tsx:41-45` (Clerk `setActive`) → `from-batch/route.ts:269-271` (`auth().orgId`) |
| Deduction call sites (project-bound): editron chat stream, from-batch, storyboard regen, import-from-script | grep `deductCredits` consumers |
| Deduction call sites (non-project): alyzitron, clickatron, calos make-image, thinkforge chat | same grep — **out of scope v1** (stay personal) |
| Insufficient-credit error already returns typed 402 with `creditsInfo {required, available}` | observed live 2026-07-25 battle probe |
| Precedent for org-scoping rollout: Brand Vault R5 dual-read, `has({role:'org:admin'})` gating | `app/api/brand-vault/brands/route.ts:17,46` |

**The asymmetry being fixed:** org context propagates to DATA (projects, brands,
workers) but not MONEY. A member creating an org project bills their personal
wallet today.

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Org project (`project.orgId != null && visibility:'org'`) → **org wallet**. Personal project → personal wallet. | Founder ruling. Ownership signal already exists per project. |
| D2 | **No fallback** org→personal. Empty org wallet = typed 402 `walletOwner:'org'`, message directs member to their admin. | Silent fallback surprise-drains members — the exact bug class this plan removes. |
| D3 | Org wallet **reuses `creditsBalanceSchema`** (both pools) embedded on the Organization document. | Mirrors the proven user pattern incl. `findOneAndUpdate` atomicity; no new wallet semantics to test. |
| D4 | Org transactions go to a **separate `org_credit_transactions` collection**, not a capped embedded array. | Agencies need per-member spend reporting; 100-entry cap is a reporting dead end. Embedded cap stays for the fast-path duplicate check only. |
| D5 | Wallet owner is resolved **once at operation start** and recorded on the operation/job (`billedWallet: {type,id}`); refunds route by the recorded owner, never re-resolved. | Member may leave / project may change visibility mid-job. Refund must hit the wallet that paid. |
| D6 | Purchases/grants for an org are gated `has({role:'org:admin'})`. Members can VIEW org balance, not fund or spend-admin it. | Matches Brand Vault's existing role pattern. |
| D7 | Everything ships behind `ORG_WALLET_BILLING` flag, default off; preview battle test before prod. | Existing org projects instantly start charging a 0-balance wallet when this lands — must be a deliberate flip with comms, not a surprise. |
| D8 | Non-project surfaces (Alyzitron, Clickatron, Calos image, ThinkForge chat) remain personal in v1. | Scope control; they have no org-ownership signal today. Revisit after v1. |

## 3. Data contract

```ts
// schemas/Organization.ts — add
creditsBalance: ICreditsBalance;          // same subdocument schema as user

// NEW schemas/OrgCreditTransaction.ts
{
  clerkOrgId: string;      // indexed
  actorUserId: string;     // WHO spent/funded — the per-member report key
  projectId?: string;
  pool: 'main' | 'media';
  type: 'deduct' | 'topup' | 'subscription_grant' | 'refund' | 'adjust';
  amount: number;
  balanceAfter: number;
  operationId?: string;    // idempotency join to the editing operation
  razorpayEventId?: string;
  createdAt: Date;
}
// indexes: (clerkOrgId, createdAt), (clerkOrgId, actorUserId), unique sparse (razorpayEventId)

// lib/services/creditsService.ts — the only new abstraction
type WalletRef = { type: 'user'; clerkUserId: string } | { type: 'org'; clerkOrgId: string };
resolveBillingOwner(userId: string, project?: { orgId?: string|null; visibility?: string }): WalletRef
// org iff project.orgId && visibility === 'org' (D1); every existing caller
// that passes no project resolves to user — zero behavior change until wired.
```

Ownership: `creditsService.ts` remains the SOLE writer of both wallets. No route
touches balances directly. `resolveBillingOwner` is the single resolution
authority; call sites never inline the rule.

## 4. Phases (≤5 files each; tsc + eslint + vitest per phase; commit per phase)

**P1 — Wallet storage + service core** *(no callers; invisible)*
`schemas/Organization.ts`, `schemas/OrgCreditTransaction.ts`,
`lib/services/creditsService.ts` (WalletRef + org read/write internals reusing
the `:212` atomic pattern), `tests/services/org-credits-core.test.ts`.
Exit: all existing credit tests green untouched; org wallet ops proven incl.
**concurrent-deduction test** (two parallel deducts, final balance exact, no
lost update — the shared-wallet race is THE new failure mode).

**P2 — Resolution + deduction at project-bound chokepoints** *(flagged)*
`lib/services/creditsMiddleware.ts`, `app/api/services/editron/chat/stream/route.ts`,
`app/api/services/editron/auto-edit/from-batch/route.ts`,
`lib/pipeline/storyboard-scene-regeneration.ts`, +1 test file.
Exit — CRITICAL regression tests:
1. org project + funded org wallet → org debited, member wallet UNTOUCHED
2. org project + empty org wallet → typed 402 `walletOwner:'org'`, **zero
   personal deduction** (D2 — the no-fallback invariant)
3. flag off → byte-identical behavior to today
4. personal project + active org context → PERSONAL wallet (context ≠ billing;
   only project ownership decides)

**P3 — Refund routing + recorded owner**
`from-batch` refund path (incl. Director-Mode rescue `autoEditRefunded`),
`chat-ai-edit-transaction-runtime.ts` refund seam, `creditsService.refundCredits`
(accept WalletRef), +2 tests.
Exit: refund lands on the recorded `billedWallet` even when the actor left the
org between charge and refund.

**P4 — Funding: top-up + grants**
Org top-up route (admin-gated, Razorpay, idempotent via `razorpayEventId`
unique index), `grantSubscriptionCredits` org variant, admin grant script for
founder comps, +2 tests.
Exit: duplicate webhook replay is a no-op; member hitting the fund route gets 403.

**P5 — UI**
Org dashboard wallet card + per-member spend table (from
`org_credit_transactions`), billing page org section, the 402 CTA ("Ask
<admin> to add credits" for members / "Add credits" for admins), insufficient-
state per `design_system_v1`. ≤5 components.
Exit: member sees balance read-only; admin sees fund + ledger; personal wallet
UI unchanged.

**P6 — Rollout**
Flag on in preview → battle fixture: 1 org, 2 members, funded wallet →
member A renders org project (org debited), member B concurrently (no race),
empty-wallet 402, refund path, personal project untouched. Then prod flip with
release note to existing org owners (D7).

## 5. Risk registry

| Risk | Mitigation |
|---|---|
| Lost update on shared org wallet under concurrent renders | Reuse conditional `findOneAndUpdate` (`:212`); P1 concurrency test is a hard gate |
| Existing org projects suddenly 402 at flag-flip (wallets start at 0) | D7 flag + owner comms; 402 CTA routes admins straight to funding |
| Refund to wrong wallet after membership change | D5 recorded owner; P3 test |
| Double-grant on webhook retry | `razorpayEventId` unique sparse index + existing `duplicate` no-op pattern |
| Scope creep into non-project surfaces | D8 explicit; revisit post-v1 |
| Org deleted with balance | **Open founder decision** (§6) — until ruled: block deletion while balance > 0 (fail loud) |
| Two writers drifting (user wallet embedded / org ledger collection) | creditsService sole-writer rule; transactions written in same logical op as balance update, `operationId` joins them |

## 6. Open founder decisions (not blockers for P1-P2)

1. Org deleted with remaining balance: refund-to-owner, forfeit, or block
   deletion? (Interim: block.)
2. Subscription model for orgs: pooled org subscription vs per-seat later —
   P4 ships top-up + manual grant first; subscriptions can follow.
3. Should org admins be able to set per-member spend caps? (Natural v2; the
   `actorUserId` ledger makes it cheap later.)
4. D8 revisit: when do Calos/ThinkForge surfaces gain org billing? (They have
   `orgId?: string|null` marked "future team layer" in their schemas already —
   `calos-campaign.ts:50`.)

## 7. SELF-REVIEW AMENDMENTS (adversarial pass, 2026-08-02 — SUPERSEDES conflicting text above)

The §1 premise table and §4 phases were re-verified adversarially (Codex was
down; the review prompt was executed by the plan's author against itself).
Three findings are BLOCKING and amend the plan as follows. Verdict:
**SAFE WITH AMENDMENTS — do not build from the un-amended sections.**

### A1 (BLOCKING) — The call-site inventory in §1 was wrong: 51 sites, not ~5
Full grep found 51 files calling deduct/hasCredits/middleware. Critically,
these PROJECT-BOUND Editron sites were missing from P2's scope:
- `app/api/services/editron/cloudrun/render/route.ts` — **the render charge,
  the largest single deduction in the product.** Without it, an org project's
  render bills the member personally — violating D1 exactly where it costs most.
- `app/api/services/editron/auto-edit/from-asset/route.ts` — second auto-edit entry.
- `app/api/services/editron/media/upload/route.ts` — upload charges (resolve
  ownership: uploads happen before/into a project? verify at build time).
**P2 file list is superseded:** chat stream, from-batch, from-asset,
cloudrun/render (+1 test) = 5 files; media/upload + storyboard-scene-regeneration
move to a P2b (same pattern, next commit). Storyboard pipeline routes
(`app/api/services/pipeline/storyboard/**`) charge BEFORE a project exists →
remain personal in v1 by explicit rule, documented in the 402/UI copy.

### A2 (BLOCKING) — The D1 billing key is built on ambiguous data
`project-service.ts:120-121`: `createProject` hardcodes `visibility:'private'`
while stamping `orgId` from `auth().orgId` (from-batch `:269-271`). Therefore
every project created through the NORMAL flow while switched into an org has
`orgId` set + `visibility:'private'` — the data cannot distinguish "org
project" from "personal project created in org context". Either key choice
fails: `orgId`-alone surprise-bills the org for personal work;
`orgId+visibility:'org'` (original D1) never org-bills normal-flow creations.
**Amendment — new D9:** project ownership becomes EXPLICIT at creation: the
create flow (upload door + org dashboard) asks Personal vs Org-X whenever the
user has ≥1 org; the choice writes `visibility:'org'` + `orgId` together (org)
or `orgId:null` (personal). Ambient `auth().orgId` is NEVER the billing
signal. Existing rows with `orgId` set + `visibility:'private'` are
grandfathered as PERSONAL. D1's key (`orgId && visibility==='org'`) stands,
now backed by explicit intent. This adds a P0 phase (≤4 files: from-batch
orgId stamp change, project-service, upload-door UI choice, +1 test) BEFORE P2.

### A3 (BLOCKING) — D5's recorded owner has a concrete required home
`cloudrun/render/route.ts:349,399-403`: render charges at request time via a
`CreditCheckResult` closure whose `.refund()` fires on pre-render failure.
The `billedWallet` MUST be captured inside that closure (and in from-batch's
`autoEditRefunded` path) or refunds re-resolve and can hit the wrong wallet.
P3 scope now names both closures explicitly.

### Non-blocking findings
- **Storage-overage cron** (`storage-overage/route.ts:58`) charges a resolved
  `billingUserId` per storage OWNER and already fails gracefully (unstamped
  retry, no force-charge). Org-owned storage billing + org storage limits =
  **open decision #5** in §6; cron untouched in v1.
- **`lib/calos/reconcile-image-claims.ts`** deducts in a background
  reconciler — Calos surface, stays personal under D8; noted so it isn't
  "discovered" later.
- **D3 contention re-verified safe:** `memberCount` writes (`organizationService.ts:166`)
  are `$set` on a different field path than wallet `$inc`s; Mongo single-doc
  atomicity holds. Embedded wallet stands.
- **Fifth CRITICAL test added to P2:** a project with `orgId` set but
  `visibility:'private'` (the grandfathered ambiguous shape) must bill
  PERSONAL and emit a `grandfathered-ambiguous-ownership` audit log line.

## 8. Explicitly rejected

- Silent org→personal fallback (violates D2; surprise-drains members)
- Wallet on OrgMember (splits the pool; defeats central funding)
- Reusing the embedded 100-cap history for org reporting (D4 rationale)
- Billing by ACTIVE CONTEXT instead of project ownership (a member switching
  to personal context mid-edit must not flip who pays; the project decides)
