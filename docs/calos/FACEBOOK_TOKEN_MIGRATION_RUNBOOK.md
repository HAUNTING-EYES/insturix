# Facebook OAuth Token Migration Runbook

## Purpose

This runbook migrates legacy plaintext values in
`users.facebookTokens.userAccessToken` and
`users.facebookTokens.pages[].pageAccessToken` to the versioned
`oauth:v1:` AES-256-GCM envelope.

The migration:

- is dry-run by default;
- scans a bounded number of users per invocation;
- never prints token values;
- skips already-enveloped values;
- uses per-secret compare-and-set updates;
- can resume after a stopped or partially completed invocation; and
- does not require a normal connected user to reconnect Facebook.

The script does not change Facebook account identity, Page assignment, expiry,
or campaign data.

## Preconditions

1. Deploy a build containing the encrypted Facebook readers and encrypted OAuth
   callback from `3f538d8a` or later.
2. Confirm the target environment has the same
   `CALOS_TOKEN_ENCRYPTION_KEY` used by the running application.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME` for exactly one intended
   environment.
4. Take a database snapshot before the first apply run.
5. Ensure no pre-`3f538d8a` application deployment is still accepting
   Facebook OAuth callbacks.

Do not print, paste, or export any token field while investigating a migration
result.

## Commands

Show options without connecting to Mongo:

```bash
npx tsx scripts/migrate-facebook-oauth-tokens.ts --help
```

Audit the first bounded page:

```bash
npx tsx scripts/migrate-facebook-oauth-tokens.ts \
  --dry-run \
  --limit 500 \
  --batch-size 100
```

Apply the first bounded page:

```bash
npx tsx scripts/migrate-facebook-oauth-tokens.ts \
  --apply \
  --limit 500 \
  --batch-size 100
```

When `hasMore` is `true`, continue from the exact `nextAfterId` returned by the
previous invocation:

```bash
npx tsx scripts/migrate-facebook-oauth-tokens.ts \
  --apply \
  --limit 500 \
  --batch-size 100 \
  --after-id <nextAfterId>
```

The maximum limit is 5,000 users per invocation. Keep production runs small
enough to observe database load between pages.

## Report Fields

| Field                   | Meaning                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `mode`                  | `dry-run` or `apply`.                                                             |
| `usersScanned`          | Users inspected in this bounded invocation.                                       |
| `usersNeedingMigration` | Users with at least one plaintext token, including unsafe Page records.           |
| `plaintextUserTokens`   | Legacy plaintext Facebook user tokens found.                                      |
| `plaintextPageTokens`   | Legacy plaintext Page tokens found.                                               |
| `envelopedTokens`       | Values already using `oauth:v1:` and left unchanged.                              |
| `invalidTokenFields`    | Missing, empty, or structurally invalid token fields.                             |
| `unsafePageTokens`      | Plaintext Page tokens not updated because Page identity is missing or duplicated. |
| `writesAttempted`       | Compare-and-set writes attempted in apply mode.                                   |
| `tokensMigrated`        | Secrets successfully replaced with encrypted values.                              |
| `compareAndSetMisses`   | Secrets changed after the scan and therefore were not overwritten.                |
| `requiresAttention`     | At least one race or unsafe Page record needs a fresh audit or manual review.     |
| `hasMore`               | More users remain after this page.                                                |
| `nextAfterId`           | Resume cursor for the next page.                                                  |

`usersNeedingMigration` can exceed `usersMigrated` when a Page record is unsafe
or a concurrent OAuth reconnect wins the compare-and-set race.

## Production Procedure

1. Run dry-run pages from the beginning until `hasMore` is `false`.
2. Sum plaintext and unsafe counts across every page.
3. Confirm the database and expected volume before apply.
4. Run apply pages until `hasMore` is `false`.
5. If `compareAndSetMisses` is nonzero, start a fresh dry-run sweep from the
   beginning. Never force-write the stale value.
6. If `unsafePageTokens` is nonzero, inspect only Page IDs and structural
   metadata. Repair duplicate/missing Page identity or reconnect only the
   affected corrupted account.
7. Run a final dry-run sweep from the beginning through every page.

The migration is complete only when the full final sweep reports:

```text
plaintextUserTokens = 0
plaintextPageTokens = 0
unsafePageTokens = 0
compareAndSetMisses = 0
```

Re-running apply after completion must report `writesAttempted = 0`.

## Failure And Resume

- Missing or invalid `CALOS_TOKEN_ENCRYPTION_KEY` aborts before the next write.
- A process or network failure may leave earlier secrets encrypted and later
  secrets plaintext. This is safe; rerun the current page or restart from the
  beginning.
- A compare-and-set miss means another writer changed that exact secret. The
  migration does not retry stale data.
- A malformed Page record is counted and left untouched.

Never add an unconditional update or whole-`facebookTokens` replacement to
"finish" a failed run. That could overwrite a fresh OAuth reconnect.

## Rollback

Application rollback is permitted only to a build that can read `oauth:v1:`
Facebook credentials. Do not roll back below the encrypted-reader commits after
any apply run.

If application behavior regresses:

1. Stop apply invocations.
2. Keep `CALOS_TOKEN_ENCRYPTION_KEY` unchanged.
3. Roll back to the latest known-good build that includes encrypted readers.
4. Validate Facebook Page status and one controlled publish.
5. Resume the migration only after the application issue is resolved.

Do not decrypt and restore plaintext as a routine rollback. A database snapshot
is an incident-recovery measure only; restoring it reintroduces the exposure
this migration removes.

## Key Rotation Limitation

`oauth:v1:` currently identifies the envelope format, not a key ID. The runtime
accepts one `CALOS_TOKEN_ENCRYPTION_KEY`. Replacing that environment value
directly would make existing encrypted tokens unreadable.

A no-outage key rotation requires a separate phase:

1. Add a keyring and a new envelope/key identifier.
2. Deploy dual-key reads while new writes use the new key.
3. Re-encrypt old envelopes with a compare-and-set migration.
4. Verify zero old-key envelopes across every page.
5. Remove the old key only after the verification window.

Until that phase ships, preserve and back up the current key according to the
production secret-management policy. This script migrates plaintext to the
current key; it does not rotate keys.

## Removing Legacy Reads

Do not remove plaintext compatibility from `resolveUserOAuthToken` immediately
after one clean sweep. First confirm:

- all environments ran the full migration;
- no old deployment can write plaintext;
- repeated scheduled audits remain at zero; and
- Facebook connect, status, assignment, Brand Vault ingestion, and publishing
  remain healthy.

Then remove legacy plaintext reads in a separately reviewed phase with focused
reader tests.
