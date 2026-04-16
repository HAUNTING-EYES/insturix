# GCP Account Migration Runbook

**From:** `insturix-457914` (old business account)
**To:** `insturix-493414` (new individual account, project number `687396053572`)
**Region:** `us-central1` (unchanged)
**Bucket strategy:** `-v2` suffix on all new buckets

---

## Execution Order (CRITICAL — do in this sequence)

1. **PHASE 1** — `phase-1-gcloud-setup.sh`
   Sets up new GCP project: enables APIs, creates service account, creates buckets, applies CORS

2. **PHASE 2** — Download service account JSON key, encode to base64

3. **PHASE 3** — `phase-3-data-migration.sh`
   Copies ALL files from old buckets to new buckets (run while old account still active)

4. **PHASE 4** — Update Vercel env vars (see `vercel-env-checklist.md`)

5. **PHASE 5** — Apply code changes (see `code-changes.md`)

6. **PHASE 6** — `phase-6-mongodb-url-rewrite.mjs`
   Updates all MongoDB documents with old GCS URLs → new bucket URLs

7. **PHASE 7** — Deploy and verify (see `verification-checklist.md`)

8. **PHASE 8** — After 2 weeks of stability, decommission old GCP account

---

## Rollback Plan

Each phase is reversible UNTIL phase 8:

- **After phase 1-3:** Just don't deploy. Old account still active.
- **After phase 4:** Revert Vercel env vars to old values. Old account still active.
- **After phase 5:** `git revert` the migration commit, redeploy. Old account still active.
- **After phase 6:** MongoDB URL rewrite is REVERSIBLE via backup (script saves backup).
- **After phase 7:** Point Vercel back to old env vars, code will work with old buckets if they still exist.
- **After phase 8:** PERMANENT — old account gone.

---

## Files in this folder

- `phase-1-gcloud-setup.sh` — Run first. Creates new GCP infrastructure.
- `phase-3-data-migration.sh` — Run after phase 1 + key download.
- `phase-6-mongodb-url-rewrite.mjs` — Run after deploy to fix stored URLs.
- `vercel-env-checklist.md` — All env vars to update in Vercel dashboard.
- `code-changes.md` — Exact code file changes required.
- `verification-checklist.md` — Post-deploy tests.
- `troubleshooting.md` — Common issues and fixes.
