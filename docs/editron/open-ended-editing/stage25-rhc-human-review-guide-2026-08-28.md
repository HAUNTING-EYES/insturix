# Stage 2.5 RHC human-review guide — 2026-08-28

## Where the review media is

The current public review packet is:

```text
D:\google downloads\Front-End-main\editron-worktree\.calibration-temp\open-ended-planner-v2\stage25-human-quality-evidence\stage25-human-quality-6071c0857-v1
```

The packet contains only public briefs, public predicates, review contracts and
the route-blinded media. It does not contain a human verdict.

## Two different kinds of feedback

### Programme-owner feedback

The programme owner can review every video now and report what looks or sounds
wrong. Because route identities have already been discussed in the engineering
chat, record this as:

```text
USER_NON_BLIND_AESTHETIC_FEEDBACK
```

It is valid product feedback and can drive corrections. It cannot create the
formal blind receipt, because the current contract requires a truthful statement
that route/candidate identity was not accessed before the review.

### Formal route-blind review

Use a different editor who:

1. has not read the engineering chat, route key or candidate implementation;
2. receives only a copy of `reviewer/`, `reviewer-packet.json` and
   `review-contracts.json` from the packet root;
3. truthfully records why they are qualified for this review;
4. fully plays every required video at normal speed with audio when present;
5. inspects every required contact sheet;
6. scores every declared dimension and records timecoded defects; and
7. submits before seeing any other reviewer decision or route identity.

The programme still needs a separately frozen reviewer-qualification policy.
Until it exists, qualification status must not be invented from a name or an
unverified claim.

## Programme-owner worksheet

Use this short form for immediate, non-blind feedback. Exact timecodes are much
more useful than “looks bad.”

```text
Reviewer label:
Review date/time:
Disposition: USER_NON_BLIND_AESTHETIC_FEEDBACK

RHC-01
- Preferred candidate order (A/B/C):
- Does FAST -> QUIET -> LIGHT reveal in order?
- Are all three visible together before release?
- Does the last source continue naturally into full screen?
- Text/layout/motion problems, with timecodes:
- Delivery-ready / needs correction / reject:

RHC-02
- Do both stills and “How we shipped it” appear?
- Is the return to the interview visually smooth?
- Is the spoken sentence complete and intelligible?
- Is room tone continuous at both boundaries?
- Text/layout/timing/audio problems, with timecodes:
- Delivery-ready / needs correction / reject:

RHC-03
- Are both views on the same action phase?
- Is the centered label readable and clear of both subjects?
- Does the return land on the authored-wide action frame?
- Is production audio unchanged and synchronized?
- Layout/timing/audio problems, with timecodes:
- Delivery-ready / needs correction / reject:

RHC-04
- Do 60, 30 and 10 stay paired with the correct closeups?
- Does it finish on the 10 percent closeup?
- Does the corrected version change only the requested number/source/hold?
- Motion/layout/legibility problems, with timecodes:
- Delivery-ready / needs correction / reject:

Across all four
- Biggest blocker:
- Best result and why:
- What a professional editor would change first:
```

Do not convert this worksheet into a blind receipt. Store it separately under
its non-blind disposition.

## Formal task contracts

### RHC-01 — feature board

Review all three A/B/C videos and all three contact sheets.

- `RHC01-T1`: FAST, QUIET and LIGHT reveal in that order.
- `RHC01-T2`: all three labelled sources are visible together before release.
- `RHC01-T3`: the final source continues over the board-to-full-screen boundary.
- `RHC01-T4`: text, colour, spacing and source bindings remain independently
  editable. This requires technical evidence as well as visual judgment.
- `RHC01-P1`: no out-of-range timeline/audio state changes.
- `RHC01-P2`: only declared licensed fonts and bound sources are used.
- Quality dimensions: motion/layout, title legibility and overall fidelity.

### RHC-02 — interview chapter moment

Play `candidate-A-video.mp4` in full with sound.

- both supplied stills and the exact chapter text appear;
- the return to the interview has no unintended visual jump;
- text and source bindings remain editable;
- the spoken sentence remains complete and intelligible;
- room tone remains continuous at entry and exit; and
- state outside the target range does not change.

### RHC-03 — synchronized split view

Play `candidate-A-video.mp4` in full with sound.

- the two views show the same marked action phase;
- the centered label is readable and covers neither subject;
- the return lands on the marked authored-wide action frame;
- view bindings, label and layout remain editable;
- production audio stays unchanged and synchronized; and
- timing/state outside the target range does not change.

### RHC-04 — results card

Play both `initial-video.mp4` and `corrected-video.mp4` in full.

- 60, 30 and 10 remain paired with their declared closeups;
- the final held state is the 10 percent closeup;
- numbers, sources and hold duration remain independently editable;
- no undeclared source/font/out-of-range state is introduced; and
- the correction does not regenerate unrelated approved state.

The formal measured correction trial is separate from watching the prebuilt
corrected video. It must run in a fresh isolated project clone and record start,
finish, pauses, active time, manual action count, before/corrected/proof/work-log
hashes and zero hidden rescue time. Do not estimate this and label it measured.

## Formal submission shape

`review-contracts.json` is the authority. One submission is required per task
and must bind the unchanged contract/public-pack/rubric/artifact hashes. The
existing owner
`finalizeBlindQualityReviewReceiptV1` validates:

- reviewer qualification and blinding declarations;
- complete playback confirmations;
- one result review for every bound result;
- every rubric dimension;
- decision, confidence, rationale and timecoded defects;
- correction disposition/evidence;
- ranking and preferred result; and
- hash identity.

Do not hand-edit a finalized receipt or mark missing evidence as pass. A Codex
operator can translate the completed reviewer worksheet into the typed
submission, run the existing finalizer and return validation errors for repair.
No provider call, project mutation or route-key access is required.

## What closes the current human gate

The minimum evidence is:

- one truthful qualified blind receipt for each of RHC-01 through RHC-04;
- the separately measured RHC-04 hands-on correction receipt;
- a versioned reviewer-qualification decision; and
- independent review/agreement if the future promotion policy requires more
  than the present single-reviewer research contract.

Technical pass receipts remain separate. A technically synchronized render may
still receive a human `FAIL`, and a visually pleasing render cannot override a
failed preservation proof.
