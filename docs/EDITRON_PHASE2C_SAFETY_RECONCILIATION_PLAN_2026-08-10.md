# Phase 2C Safety Reconciliation Plan

**Status:** read-only plan. No Phase 2C runtime code is in this branch.

## Plain-English goal

An old browser tab, old AI job, retry or undo must not erase a newer edit. Each
rollback must use the precise version created by its own edit, rather than ask
for whichever project version happens to be current later.

## Important correction

`7e9b4dd7…`, previously called Phase 2C, is not a standalone import. It is the
last step of a missing four-commit safety ladder:

| Step | Commit       | Plain-English effect                                                                                    | Files |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------- | ----: |
| A    | `3bccdf885…` | Browser save/autosave checks its expected version and returns the newly written version.                |     5 |
| B    | `b928ccc66…` | Checkpoint restore becomes a ProjectService compare-and-swap operation. Unsafe restore changes nothing. |     5 |
| C    | `90f70fb6…`  | Chat jobs and rollback callers carry a project and expected revision instead of restoring blindly.      |    12 |
| D    | `7e9b4dd7…`  | The writer gives rollback its actual post-write revision, closing the competing-write race.             |    19 |

This branch shares merge base `d1085cb8…` with the ladder but is not a
descendant. Its later organisation/billing, SFX and user work must be
preserved, so this is a reconciliation, not a blind cherry-pick.

## Why IF1 failed by itself

IF1 is the frozen vocabulary for commands, revisions, receipts, proof, undo and
replay. Its adapter requires `ProjectMutationReceiptV1`, which the missing
safety ladder defines. The isolated IF1 import passed focused tests and ESLint,
but TypeScript correctly rejected that absent native type. The artifact was
immediately reverted. The solution is not copying a type or adding an issuer.

## The race we are closing

```text
Unsafe
  A writes revision 7
  B writes revision 8
  A's old rollback reads “current” and receives 8
  A can target B's newer work

Safe
  A writes revision 7 and gets writer-issued R_after = 7
  B writes revision 8
  A's rollback carries expected revision 7
  Restore CAS sees 8, changes nothing and reports unsafe undo
```

## Small reviewed phases

No phase exceeds five files. Every phase is re-read against the dirty worktree
before implementation and ends with its own test proof.

| Phase                              | User result                                                           | Scope                                                                                 | Proof / stop condition                                            |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A1: save safety                    | A stale browser tab cannot overwrite a newer save.                    | ProjectService, save route, autosave route, editor autosave hook, save test.          | Stale save returns conflict and makes zero mutation.              |
| B1: restore safety                 | An old checkpoint cannot restore over newer work.                     | ProjectService, checkpoint service, checkpoint list/restore routes, transaction test. | Stale restore returns structured unsafe undo and changes nothing. |
| C1: scoped rollback                | Chat transaction runtime carries project scope and expected revision. | Checkpoint service, transaction runtime, tools, status route, focused test.           | Unscoped restore is rejected.                                     |
| C2: dubbing                        | Dubbing completes and rolls back only with its own writer receipt.    | Provider/test, then job/test.                                                         | Competing write becomes safe non-destructive failure.             |
| C3: Director job callers           | Editorial and reference jobs retain their own receipt.                | Implementation/test pairs.                                                            | Receipt-less legacy completion is rejected.                       |
| D1: writer receipt core            | A ProjectService writer reports its real post-write revision.         | ProjectService, checkpoint service, restore route and two focused tests.              | Competing-write adversarial test preserves original R_after.      |
| D2: chat/Director receipt plumbing | Chat and Director pass the exact writer receipt to rollback.          | Stream route, transaction runtime, tools, agent graph, Director.                      | No later “current revision” read is used.                         |
| D3: remaining writers              | Dubbing, editorial, reference and status migrate.                     | Two-to-four-file caller/test pairs.                                                   | Every caller has stale/unsafe-undo coverage.                      |
| E: IF1 import                      | The frozen contract sits on a working native owner.                   | The five IF1 artifact files.                                                          | IF1 test, typecheck and no-second-owner checks pass.              |

## Deliberately excluded

- No overlay pruning, caption, transition, MG, media or audio migration.
- No new project, timeline, journal, checkpoint, registry, proof or job owner.
- No model, external provider, billing, rights-policy or user-data change.
- No reset, clean, stash or overwrite of the current worktree.

## Evidence already established

- Current focused baseline: `project-save-payload` plus
  `chat-ai-edit-transaction-runtime`, **30 passing tests**.
- Temporary IF1: **10 passing focused tests** and ESLint, then a correct TypeScript
  dependency failure.
- General `tsc` has independent pre-existing SES provider and untracked script
  failures. They are reported separately and not attributed to this migration.

## Next approval card

**User result:** a stale browser save cannot overwrite a newer edit.  
**Change:** A1 only, exactly five files.  
**Will not touch:** overlays, captions, transitions, MG, audio, project data or
feature behaviour.  
**Proof:** a stale-save test must return conflict with zero mutation.  
**Stop:** no later phase begins until this result is reviewed.
