# Studio smoke tests

## smoke-write-turn.ts — Phase 2 write capability, end-to-end
Runs one real turn through the studio orchestrator against ThinkForge
(real brand scope, real 0.2cr charge, real Gemini generation, real persisted
script). Requires a dev user with an accepted brand profile:

    BRAND_VAULT_MONGODB_DB_NAME=insturix_dev npx tsx --env-file=.env.local scripts/studio/smoke-write-turn.ts

Exit 0 = turn.done; 1 = turn.error; 2 = capability gap (user has no brand).
The hardcoded user (`user_39th…`) owns the accepted brand in insturix_dev;
swap it if the dev data changes.
