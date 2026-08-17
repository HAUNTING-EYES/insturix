# Editron Execution Control Board

**Purpose:** a plain-English operating view of the programme.  
**Rule:** the user does not need to supervise implementation details to keep
Editron on course. Each phase must state the product outcome, exact scope,
proof, risk and next decision in ordinary language.

## The destination

Editron should let a person bring footage, script, references and a brief, then
get a trustworthy editable video. AI proposes and executes useful editorial
work, while the system preserves user control, brand direction, legal assets,
safe undo and proof that the rendered output matches the requested edit.

That is a broad destination. We achieve it one verified capability at a time.
We never call a feature reliable merely because it produced something once.

## The one thing being solved now

**Current objective:** make edits safe enough that one old job, undo or retry
cannot overwrite a newer user edit, and so the product can honestly distinguish
“saved”, “rendering”, “verified”, “failed” and “cannot verify”.

This is not visible design work yet. It is the safety floor underneath every
overlay, caption, transition, graphic, audio edit and AI action.

## Current traffic light

| Area                                 | State              | Plain-English truth                                                                              |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------ |
| Existing editor and overlay renderer | Yellow             | It can make visible output, but several tools make the same kind of change differently.          |
| Captions                             | Yellow             | Word-timed captions work in paths, but brand/taste, manual ownership and proof are not reliable. |
| Transitions                          | Red                | Different paths disagree on timing; some can claim work without a correct visible result.        |
| AI motion graphics                   | Red                | Graphics can render behind footage and missing graphics can continue as degraded.                |
| Audio                                | Yellow             | Asset rights checks are meaningful, but mix/audible quality proof is missing.                    |
| Revision, rollback and proof safety  | Red on this branch | The accepted safety runtime exists on another branch, not in this worktree yet.                  |

## How we work from now on

Every phase uses the same short card:

```text
User result:       What becomes safer, faster or visibly better.
Change:            The one capability or safety rule being changed.
Will not touch:    Nearby systems deliberately excluded.
Proof:             Exact test or real output that must pass.
Failure meaning:   What users see if it cannot be proven.
Stop point:        The specific decision that needs your approval.
```

I will not silently choose a new product direction, create a second data owner,
delete a legacy path, broaden scope, or merge a large foreign branch because it
looks convenient. When an assumption matters, I will stop and explain it in
plain words before acting.

## Your role versus my role

| You decide                                                                               | I decide and prove                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The customer promise, creative taste, what feels valuable, and which risk is acceptable. | How to inspect the code, split work safely, find conflicts, write bounded changes and verify them. |
| Whether to spend time on a major new capability or a big migration.                      | Whether a proposed implementation is safe enough to present for approval.                          |
| Whether a visible result meets your taste.                                               | Whether the system actually performed, saved, reloaded and proved the result it claims.            |

You should never need to know whether a name is “Phase 2C”, “IF1” or an EDL
module in order to make a decision. I will translate it first.

## The immediate safety chain

```text
1. Bring the proven edit-safety machinery into this branch safely.
2. Add the frozen shared receipt/proof vocabulary on top of it.
3. Make one small editing action use that path end to end.
4. Prove it saves, reloads, renders, fails honestly and undoes safely.
5. Only then migrate more complicated things such as MG, transitions and audio.
```

Today we are at Step 1 planning, because the machinery was built on another
branch and cannot be copied as one giant blind merge.

## Non-negotiable stop rules

Work stops for your review if it would:

- add a new project, timeline, command, revision, proof or job owner;
- overwrite or delete current user work, legacy paths or saved-project data;
- move more than the approved small phase of files;
- change what customers see without a defined visible acceptance check;
- claim success when rendering, audio, rights or proof could not be verified;
- introduce a model, external provider, paid service or data-usage expansion.

## What “done” means for a phase

A phase is not done when code was written. It is done only when:

1. the promised user-facing or safety outcome is demonstrated;
2. the exact changed files are known and no unrelated work was altered;
3. focused tests pass and type/lint status is reported honestly;
4. failure states are visible rather than quietly falling back;
5. the next phase is simpler, not dependent on a new hidden authority.

## Next decision card

**User result:** future edits will have a real safety foundation instead of a
mix of independent saves and retries.  
**Change now:** read and split the missing 19-file safety commit into small,
compatible integration phases. No runtime import yet.  
**Will not touch:** overlay behaviour, captions, transitions, MG, audio,
projects or user data.  
**Proof:** every proposed phase has exact current-branch dependencies and a
focused test list before code is touched.  
**Stop point:** approval of the first small runtime phase after the plan is
reviewed.
