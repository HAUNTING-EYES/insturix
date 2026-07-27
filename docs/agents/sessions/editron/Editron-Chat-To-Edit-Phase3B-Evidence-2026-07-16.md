# Editron Chat-To-Edit Phase 3B Evidence - 2026-07-16

## Authority

This record supplements `Editron-Chat-To-Edit-Battle-Audit-2026-07-16.md`. It does not replace that document or upgrade any battle verdict without a real journey run.

## Status

Phase 3B harness implementation is complete locally. Real-project evidence collection remains pending per scenario.

## Implemented Contract

- `lib/editron/services/chat-edit-battle-harness.ts` defines 36 executable journeys matching every row in the battle audit.
- Each journey records the exact prompt, runtime mode, agent run id, selected tools, arguments, completion outputs, evidence reads, successful and failed mutations, Mongo before/after snapshots, editor API reload snapshot, and rendered evidence.
- Snapshot digests ignore expiring URLs but change for material overlay and timeline changes.
- Required evidence and owner tools must execute in order before mutation.
- Legacy `applyToAll` transition authority and legacy MG tools are explicit failures in the relevant vague-intent cases.
- Missing or stale render evidence, incomplete tool calls, invalid result envelopes, Mongo/reload disagreement, and absent scenarios fail closed.
- `buildChatEditBattleSuite([])` fails all 36 cases. Static registration cannot create a passing report.
- `scripts/run-chat-edit-battle.ts` runs one live-provider journey against a disposable project and requires `--allow-live-write`.

## Verification

- A deterministic Gemini fixture drives the real LangGraph agent through `read_project_file -> add_overlay -> final response`.
- That journey proves tool selection, argument capture, Mongo mutation, editor reload parity, and fresh rendered evidence.
- Adversarial tests prove stale rendered evidence cannot pass.
- Adversarial tests prove `add_transition({applyToAll:true})` cannot satisfy a content-owned transition request.
- URL-signature churn does not create a false reload mismatch, while an actual overlay-content change does.
- The live CLI lists all 36 journeys without executing or mutating anything.

## Live Usage

Run one case against a disposable fixture project:

```powershell
npx tsx scripts/run-chat-edit-battle.ts --project=proj_x --case=explicit-text --base-url=https://preview.example --auth-header-file=C:\tmp\editron-auth.json --allow-live-write
```

List every case:

```powershell
npx tsx scripts/run-chat-edit-battle.ts --list
```

One project should not be reused across destructive scenarios. Each journey needs its own known baseline or an exact full-state restore boundary.

## Honest Remaining Work

- Execute every scenario on a suitable disposable fixture and collect its report.
- Do not upgrade the original PASS/PARTIAL/FAIL table until the matching report passes.
- Phase 3C must provide canonical multimodal evidence for semantic transcript and visual references.
- Phase 3D must remove prompt recipes and route grounded jobs to existing family owners.
- Phase 3E must make mutations atomic, idempotent, and fully reversible.
- Phase 3F must repair client SSE/frame/context transport.
- Phase 3G must close HTML-scene, BGM replacement, and FPS gaps.
- Phase 3H must trigger and require fresh rendered postcondition evidence.
