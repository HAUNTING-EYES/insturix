# Outbound Email Lane — Handoff

**Written 2026-08-02. Repo `Insturix/Front-End`, branch `main`, HEAD `f900b8ad2`.**

Self-contained. Everything below was verified against running systems on 2026-08-02,
not inferred. Where something is unverified it says so.

---

## 1. What is already done

| Commit | What landed | Verified how |
|---|---|---|
| `51e58601` | OAuth sign-ups without a username no longer 400 the Clerk webhook | tsc + eslint clean; 5/5 tests |
| `808f81f9` | Idempotent Clerk welcome email (`EmailLifecycleDelivery`, unique idempotency key, 2-min send lease) | 5/5 tests; deployed, Vercel green |
| `7d05c89b2` | Twenty lead import + sending-eligibility classification | 12/12 tests; real run against live Twenty + Atlas |
| `f900b8ad2` | Classifier v2: compound role tokens, unroutable TLDs, placeholders | 18/18 tests; 547 contacts reclassified |

**Live data state:** `insturix_prod.outreach_contacts` holds **547 contacts**, all at
`classifierVersion: 2`. Tier A 59, B 280, C 17, D 191, blocked 2.
`eligibility` is `manual_outreach` for 545, `blocked_or_unknown` for 2.
**Zero sends have occurred.** No campaign, sequence or delivery code exists yet.

### Test commands (email tests are `node:test`, NOT vitest)

`vitest.config.ts` only includes `tests/**`, so these files are invisible to `npx vitest`:

```bash
npx tsx --test lib/services/email/__tests__/outreach-import.test.ts
```

```bash
npx tsx --test lib/services/email/__tests__/lifecycle-service.test.ts
```

Full type check (see landmine 4 before trusting the exit code):

```bash
npx tsc --noEmit --skipLibCheck
```

---

## 2. Landmines — read before touching anything

1. **Twenty REST pagination is `starting_after`, snake_case.** The camelCase
   `startingAfter` is silently ignored: the API returns page 1 again *and still
   reports* `hasNextPage: true`. Any new Twenty reader must fail loud on a
   non-advancing cursor (`lib/services/email/outreach/twenty-source.ts` does).

2. **Mongo credentials.** `Front-End-main/.env.local` points at cluster
   `main-cluster.glgebdc` with a **rotated/stale password — auth fails**. The working
   URI lives in `../editron-worktree/.env.local`, cluster `development.oplh9lr`,
   which **despite the name hosts `insturix_prod`** (123 users, 6 newsletters).
   Fixing `.env.local` is unclaimed work. Never print the URI.

3. **`errors` is a reserved Mongoose schema path.** `OutreachImportBatchSchema` uses
   `importErrors` for this reason. Do not reintroduce `errors` on a new schema.

4. **`npx tsc --noEmit` currently exits 2 on two pre-existing errors** in
   `tests/calos/publish-queue-contract.test.ts` — an untracked test whose
   implementation half was never landed. It is unrelated to this lane. Filter it:
   `npx tsc --noEmit --skipLibCheck 2>&1 | grep -v publish-queue-contract`.
   Also: `next.config` sets `typescript.ignoreBuildErrors: true`, so **Vercel will
   deploy type-broken code silently** — tsc is the only gate.

5. **`git stash@{0}` = `calos-publish-wip-pre-email-land-2026-08-02`** holds another
   session's unfinished CalOS publish work, stashed to land the email lane. It
   conflicts against current `origin/main` and needs its owner to rebase it. Do not
   drop it.

6. **Twenty is local-only.** Docker `localhost:3000`, Postgres container `twenty-db-1`,
   workspace schema `workspace_9840ranpw86v1gobk8bex8ux6`. **Vercel cannot reach it.**
   Any Twenty sync must run locally or via a machine-local worker — never a Vercel cron.
   API key file: `D:\salesos\secrets\twenty-api-key.current`.

7. **P0 data-loss bug, unfixed, unrelated to email but in the same call path.**
   Four lazy-init sites pass the literal string `"default-username"` to
   `UserInitializationService.ensureUserExists`
   (`app/api/user/initialize/route.ts:28` and `:99`,
   `lib/services/creditsMigrationService.ts:43`, `lib/services/getUserData.ts:60`).
   The username-conflict handler **deletes the conflicting user's account and
   Socialize profile**. Two OAuth users colliding on that fallback means the second
   signup destroys the first user's account. `ensureUserExists` now accepts
   `username: string | undefined` — pass `clerkUser.username || undefined` and
   reconsider whether the delete branch should exist at all.

---

## 3. The blocking problem: the lead list is contaminated at source

This is the single most important finding and it **cannot be fixed with email rules**.

A decision-maker lookup over 20 tier-A domains returned 6 matches, and the matches
revealed that the scrape pulled in companies that are not agencies at all:

| Domain in list | What it actually is |
|---|---|
| `barco.com` | Barco — Belgian display-technology manufacturer |
| `fiserv.com` | Fiserv — US fintech |
| `acrocorp.com` | Acro Service Corp — Michigan staffing firm |
| `bluetokaicoffee.com` | Blue Tokai Coffee Roasters |
| `itchotels.com` | ITC Hotels |
| `madison.com` | A Wisconsin newspaper, matched instead of Madison Media the agency |

Cold-pitching video editing to Barco's IT director generates spam complaints, and
complaints on a young sending domain are far more expensive than a missed lead.

**Do this before writing any sending code.** Qualification needs an industry signal
per company, not another regex. Two available sources:

- The local enrichment service (`C:\Users\admin\leads gen\insturix-enrichment`,
  FastAPI on :8100, keyless, unlimited). It already computes `fitVerdict`, `fitScore`
  and `fitReason` per company and writes them to Twenty — **check whether those are
  populated before building anything new.**
- Lusha MCP (free plan, 48 credits, 100/day). `decision_makers_search` costs
  **0 credits** and returns company industry; `revealEmail` costs 1. Hit rate on
  small Indian agencies measured at 6/20, so treat it as a verifier, not a source.

Acceptance: every tier A/B contact carries a qualification verdict, and
non-agencies are excluded from the first cohort.

---

## 4. Remaining work, in dependency order

### Phase 1 — Qualify the list (blocking; see §3)
Add an industry/fit verdict per contact and exclude non-agencies. Prefer reusing the
enrichment service's existing `fitVerdict` over building a new classifier.
**Do not skip to Phase 3 without this.**

### Phase 2 — Sending identity
- Separate outbound subdomain (`outreach.insturix.com` or `sales.insturix.com`),
  isolated from transactional/product mail so cold-outreach reputation can never
  contaminate password resets or receipts.
- SPF/DKIM/DMARC on that subdomain. Existing runbook:
  `docs/EMAIL_DELIVERABILITY_RUNBOOK.md`.
- Decide the sending path: SES on the isolated subdomain, or connected business
  mailboxes. Insturix must own suppression and results either way.
- Reply-capable From address. A cold email that cannot receive a reply is worthless.

### Phase 3 — Campaigns and sequences
New schemas alongside the existing outreach ones:
- `OutreachCampaign` — name, sender identity, segment query, subject, body template,
  variables, approval state, send window.
- `OutreachSequenceStep` — step index, delay, stop conditions.
- `OutreachDelivery` — **per lead per step**: campaign id, step, contact id, provider
  message id, status, attempt count, **idempotency key**. This is what prevents
  duplicate sends on retry; the welcome-email lifecycle service is the reference
  implementation of that pattern (`lib/services/email/lifecycle-service.ts`).

Stop conditions are non-negotiable: stop on reply, unsubscribe, bounce, complaint.

### Phase 4 — Sending safety
- Per-mailbox daily cap and per-recipient-domain throttle.
  `OutreachContact` already has a `companyDomain` index for exactly this.
  **190 of 547 contacts are consumer mailboxes (tier D)** — Gmail is the single
  most complaint-sensitive destination; keep tier D out of the first cohorts.
- Randomised send intervals; business-hours/timezone gating.
- **Re-check live suppression immediately before every send.** The eligibility stored
  on `OutreachContact` is a snapshot from import time and is explicitly documented as
  not being permission to send.
- Automatic campaign halt on a bounce or complaint rate threshold.

### Phase 5 — Reply, bounce, unsubscribe handling
- Ingest SES bounce/complaint into the existing shared `EmailSuppression` collection
  (`schemas/EmailSuppressionSchema.ts`) so cold and marketing lanes share one
  suppression list.
- Unsubscribe link on cold mail with an accurate physical sender address.
- Reply detection → mark the contact `replied` and stop the sequence.

### Phase 6 — Analytics and Twenty write-back
Attempted / sent / delivered / bounced / **replied / positive reply / meetings booked**.
Replies and meetings matter, opens do not. Write reply and conversion events back to
the Twenty opportunity. Ownership split: Twenty owns prospect, stage, owner, notes,
tasks; Insturix owns eligibility, suppression, campaigns, sequences, deliveries,
analytics.

### Phase 7 — Operations
CloudWatch alarms (**live AWS currently has zero**), DLQ replay tooling, Google
Postmaster Tools registration, controlled volume ramp, DMARC beyond `p=none`.

### Unblocked side items
- **Live Clerk signup test for the welcome email is still unrun.** Sign up with a
  fresh address on production and confirm one `sent` doc appears in
  `insturix_prod.email_lifecycle_deliveries`.
- Fix `.env.local` Mongo credentials (landmine 2).
- Fix the `default-username` data-loss bug (landmine 7).
- Land or drop the orphaned CalOS test (landmine 4).

---

## 5. Invariants that must not be broken

1. **Cold import can never produce `ses_marketing_eligible`.** That state requires
   recorded consent and is unreachable from the import path by construction. There is
   a test asserting this across every input permutation. Do not add a code path that
   promotes a cold lead into the marketing lane.
2. **An existing customer is never cold-pitched.** Import cross-checks the `users` and
   `newsletters` collections and assigns `customer_lifecycle_only`.
3. **Suppression outranks every other signal**, and must be re-checked at send time.
4. **Dry run is the default.** `scripts/outreach/import-from-twenty.ts` writes nothing
   without `--apply`. Keep that default for every new outreach script.
5. **Never guess at an address.** Decodable scraping artifacts are repaired and
   flagged (`emailRepaired`); undecodable ones are quarantined. Do not "fix" an
   address into someone else's mailbox.
6. **Report what was dropped.** An import that blocks rows must count them. v1 blocked
   two contacts while reporting "0 blocked" — the counters were added in `f900b8ad2`.

---

## 6. File map

| Path | Role |
|---|---|
| `lib/services/email/outreach/classification.ts` | Deterministic sendability rules, v2 |
| `lib/services/email/outreach/import-service.ts` | Source-agnostic import + audit, DI for testing |
| `lib/services/email/outreach/twenty-source.ts` | Read-only Twenty REST adapter |
| `lib/services/email/outreach/mongo-dependencies.ts` | Suppression / customer / upsert queries |
| `schemas/OutreachContactSchema.ts` | The lead record |
| `schemas/OutreachImportBatchSchema.ts` | Per-run audit, rollback by `importBatchId` |
| `scripts/outreach/import-from-twenty.ts` | Local CLI, dry run by default |
| `lib/services/email/lifecycle-service.ts` | Reference idempotency/lease pattern |
| `lib/services/email/marketing-policy.ts` | Existing consent + unsubscribe enforcement |
| `docs/EMAIL_DELIVERABILITY_RUNBOOK.md` | Existing deliverability runbook |

Re-run the import (reclassifies in place, safe):

```bash
npx tsx scripts/outreach/import-from-twenty.ts
```
