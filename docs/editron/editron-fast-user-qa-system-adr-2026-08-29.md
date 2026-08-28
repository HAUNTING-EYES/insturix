# Editron fast user QA system ADR

Date: 2026-08-29
Status: `ACCEPTED_DESIGN / IMPLEMENTATION_NOT_STARTED`
Decision owner: Editron programme
Applies to: local development, pull requests, nightly/release certification and human review

## Decision

Editron will build a dedicated, one-command QA system around complete user
journeys. A passing unit test or successful render is not enough. The fast
lane must let a developer open one evidence bundle and answer:

1. What did the user ask for?
2. What plan and route did Editron choose?
3. What exactly changed in the project and timeline?
4. Does the result play across the edited boundaries with the expected audio?
5. Can the user correct, undo, redo, reload and export it?
6. Were any errors, stale writes, hidden retries or false-success messages
   observed?

The system has three separate proof layers:

- **Exact technical proof:** hashes, project revisions, timeline diffs, frame
  and sample boundaries, receipts, locks, rights and A/V synchronization.
- **Perceptual regression proof:** deterministic screenshots, frame
  comparisons and reference-based quality metrics. These detect change; they
  do not decide editorial taste.
- **Human editorial proof:** route-blind or clearly labelled non-blind review,
  task-specific questions and measured correction time. This is the only layer
  allowed to approve taste, readability, pacing or usefulness.

No metric is allowed to impersonate another layer.

## Verified current state

The repository already has useful foundations:

- Vitest is the primary contract and integration test runner.
- Playwright is configured, and the existing Editron browser suite proves
  authenticated project/chat isolation across navigation and refresh.
- Render, PCM, receipt, ProjectService and research proof owners can supply
  lower-level evidence.
- ThinkForge has stronger run-scoped database/provider-off fixture patterns
  that can inform an Editron implementation after their dependencies and
  ownership boundaries are explicitly reconciled.

The existing Editron Playwright suite does **not** perform an edit, play the
result, inspect a timeline mutation, compare audio/video, exercise correction
or undo, export a result, or emit a reusable user-facing evidence bundle.

During this ADR audit no Editron application server or authenticated isolated
fixture was available at the inspected local endpoints. Port 8080 served only
the PostgreSQL status page. Therefore no live browser-edit pass is claimed.

## Why this is required

Editron can produce code and low-level proofs quickly, but today the evidence
is scattered across tests, receipts, renders and documents. A developer can
learn that a function passed without learning whether a user could finish the
editing task.

The QA system shortens that loop by making the default test artifact the same
thing a reviewer needs: a playable before/after result, the exact project
change and the trace explaining how it happened.

It also prevents recurring category errors:

- “The renderer returned 0” is not “the edit looks good.”
- “PCM matched” is not “room tone sounds natural.”
- “A screenshot matched” is not “the video stayed synchronized.”
- “A model proposed a plan” is not “ProjectService applied a safe edit.”
- “One synthetic five-minute audio render passed” is not “a complete
  five-minute visual timeline passed.”

## Architecture

### 1. Rights-cleared deterministic fixture bundles

Each fixture is immutable and content-addressed. It contains:

- source media and source-version hashes;
- project and timeline seed state;
- exact rational timebases, PTS epochs and audio sample rate;
- declared people/objects/speech/music/room-tone regions where relevant;
- rights and allowed-use metadata;
- expected preservation regions and prohibited changes;
- pinned fonts, colour profile, viewport, browser, codec and render settings;
- the supported project class and resource limits.

Synthetic fixtures remain useful for exact edge cases, but they are labelled
as synthetic. Rights-cleared real material is required for production
retrieval, long-form and editorial-quality claims.

### 2. One-command isolated runtime

Every QA execution receives a unique run ID and isolated namespaces for:

- tenant/user and project IDs;
- Mongo database or collection prefix;
- object-store prefix;
- job/queue IDs;
- render output directory;
- trace and evidence output directory.

Provider inference is off by default. Network access is deny-by-default except
for explicitly declared local services. Cleanup removes only the exact
run-scoped fixtures and verifies their absence. Customer data, production
projects and shared mutable test rows are forbidden.

The command should eventually be equivalent to:

```text
editron qa run <scenario-id> --lane fast
```

It must start or verify its dependencies, seed the fixture, run the scenario,
finalize the evidence bundle, open the QA cockpit and return a machine-readable
status.

### 3. Versioned scenario manifest

`EditronQaScenarioManifestV1` will bind:

- scenario and fixture identity;
- user request and expected task family;
- allowed registered owners and route candidates;
- required evidence, preservation and mutation prerequisites;
- expected user steps;
- exact, perceptual and human assertions;
- correction, undo/redo, reload and export expectations;
- timeout, memory, render and optional spend ceilings;
- expected safe-stop families;
- every artifact required in the final bundle.

The manifest describes required outcomes, not hidden creative implementation.
It must not duplicate a family resolver's final form authority.

### 4. User-journey driver

The browser driver exercises the visible product path in order:

```text
sign in to isolated fixture
-> open/import project
-> inspect playable baseline
-> submit edit request
-> inspect proposal and warnings
-> apply through the real product owner
-> play before, through and after every affected boundary
-> inspect timeline/project result
-> request one bounded correction
-> undo, redo and reload
-> export or render the declared result
-> verify the user-visible status matches owner truth
```

The driver records a Playwright trace, screenshots, console events, failed
requests, action timings and accessible UI state. Playwright traces are useful
because they preserve action, DOM, network and console context; visual
snapshots still require a pinned environment to be meaningful.

### 5. Technical evidence collectors

Collectors run beside the user journey but do not mutate projects. Depending
on the scenario, the evidence bundle includes:

- canonical project before/after snapshots and a structured timeline diff;
- proposal, ProjectService mutation, undo/redo and render receipts;
- exact affected and preserved ranges in their coordinate systems;
- decoded audio sample count, channel/rate identity, PCM comparison and
  boundary discontinuity checks;
- selected decoded video frames, frame timestamps and entry/exit mappings;
- A/V synchronization observations across beginning, edit boundaries and end;
- render fingerprints, codec/colour/font identity and deterministic visual
  snapshots;
- proxy/master relation, relink and invalidation receipts;
- locks, rights, evidence freshness and source/project revision checks;
- browser, worker, queue, database and renderer errors;
- wall time, CPU/GPU/memory where available, render cost and separately
  authorized provider cost.

OpenTimelineIO may later be used as a route-neutral interchange view for
timeline inspection and diffing. It must remain an adapter; Editron's canonical
project and ProjectService receipts remain authoritative.

### 6. Perceptual regression collectors

Visual snapshot comparisons and reference-based metrics such as VMAF may flag
unexpected degradation under a controlled environment. They cannot approve
layout, pacing, subject clearance, typography or creative intent. A threshold
failure blocks or requests review; a threshold pass never creates a human
quality receipt.

### 7. QA evidence bundle

Every run finalizes one immutable directory and manifest:

```text
qa-runs/<run-id>/
  manifest.json
  result.json
  trace.zip
  before-project.json
  after-project.json
  project-diff.json
  before.mp4
  after.mp4
  audio-proof.json
  video-boundary-proof.json
  receipts/
  screenshots/
  logs/
  metrics/
  human-review/        # absent until a real review occurs
```

`result.json` reports `PASS`, `FAIL`, `SAFE_STOP`, `UNVERIFIABLE` or
`INFRASTRUCTURE_FAILURE` per proof layer. It never collapses an unavailable
human judgment into a technical pass.

### 8. QA cockpit

The QA cockpit is a local, read-only page over one evidence bundle. It shows:

- the user request and declared scenario;
- playable before and after media with linked timeline position;
- the structured project/timeline diff;
- waveform, speech/room-tone and A/V boundary markers;
- selected frame comparisons and visual-regression overlays;
- proposal, route, owner, mutation and undo/redo receipts;
- console/network/worker errors and timings;
- exact reasons for every fail, safe stop or unverifiable result;
- a human-review form when the scenario requires taste judgment.

The cockpit has no project mutation authority. It reads finalized evidence.

## Execution lanes

### Fast commit lane

Target: a few minutes, provider-off, deterministic and runnable repeatedly.

Required minimum:

- one small rights-cleared or synthetic fixture;
- visible edit request through the real product path;
- playback across the changed region;
- project/timeline diff and owner receipts;
- correction, undo/redo and reload;
- console/network error collection;
- exact cleanup;
- evidence bundle plus cockpit link.

### Pull-request lane

Adds rendered A/V comparison, deterministic frame snapshots, audio/sample and
sync checks, accessibility checks and representative supported project
classes. It must exercise both success and expected safe-stop paths.

### Nightly and release lane

Adds long-form and high-resource scenarios, mixed CFR/VFR/discontinuity media,
proxy/master relink, hosted queue interruption/recovery, parallel render,
delivery/export, performance and memory envelopes, retrieval evaluation and
the complete supported-project-class matrix.

### Human evaluation lane

Uses finalized playable bundles and task-specific contracts. Route-blind
review is used only when route identity has genuinely not been disclosed;
otherwise feedback is labelled non-blind. Correction time is measured in a
fresh isolated clone and is kept separate from renderer wall time.

## Initial scenario matrix

The QA programme expands in certified verticals rather than one giant suite:

1. Core timeline: cut, trim, split, move, ripple, stale revision, overlap,
   locks, safe rebase, undo/redo and reload.
2. Graphics/captions: overlay, image, typography/font identity, safe zones,
   animation, caption timing and editability.
3. Audio: dialogue preservation, room tone, music ducking, channel/sample
   identity, transitions, loudness and export.
4. Route strategies: equivalent native/generated/hybrid proposals with hard
   preservation gates and route-neutral evidence.
5. Media time: same-rate, mixed rational CFR, VFR, negative PTS, gaps,
   overlaps, resets, wraps, edit lists and corrupt/unmapped safe stops.
6. VFX/tracking/colour: selected-subject tracking, all-frame clearance,
   relighting/colour transforms, low-confidence stop and render round-trip.
7. Long form: rights-cleared multi-hour retrieval, visual/audio playback,
   compaction/resume, memory, hosted recovery and final delivery.
8. Collaboration/review: project isolation, comments, versions, approvals,
   guest review and concurrent stale-write rejection.

RHC-01 through RHC-04 seed route and handoff regressions only. They do not
replace this matrix or the CAP-1/CAP-2 certification programme.

## Status semantics

- `PASS`: every required assertion in that proof layer passed.
- `FAIL`: the system ran and produced evidence of an incorrect result.
- `SAFE_STOP`: an unsafe or unsupported operation was correctly prevented and
  accurately explained with zero forbidden mutation.
- `UNVERIFIABLE`: required evidence or qualified judgment was unavailable.
- `INFRASTRUCTURE_FAILURE`: the scenario was not fairly evaluated because its
  isolated runtime failed.

A product-level pass requires zero false success. If the UI says an edit or
export succeeded while the authoritative receipt says otherwise, the scenario
fails regardless of visual appearance.

## Acceptance criteria for the first usable fast lane

The first QA implementation is usable only when all of the following are true:

1. One command creates a fresh isolated Editron run with provider inference
   disabled.
2. A browser performs one real edit through the user-facing flow.
3. The resulting media is playable before, through and after the affected
   range.
4. The canonical before/after project diff matches the user-visible result.
5. Correction, undo, redo and reload agree with ProjectService receipts.
6. Console, failed-network and worker errors are collected and visible.
7. The exact run-scoped fixture is removed and verified absent.
8. One immutable evidence bundle and QA-cockpit view are produced.
9. A deliberately stale or unsafe edit produces `SAFE_STOP`, zero forbidden
   mutation and an accurate visible explanation.
10. The command exits non-zero for `FAIL` or infrastructure breakage and never
    reports a false pass.

## Delivery slices

1. **Q0 - harness and evidence schema:** run ID, isolated fixture, provider-off
   policy, scenario manifest, bundle finalizer and CLI.
2. **Q1 - first visible journey:** one core timeline edit, playback, correction,
   undo/redo/reload, project diff, Playwright trace and minimal cockpit.
3. **Q2 - rendered A/V proof:** decoded samples/frames, boundary and sync checks,
   visual regression and export.
4. **Q3 - mutation and media matrix:** representative owners, stale/lock/rebase,
   route strategies and mixed-rate/epoch fixtures.
5. **Q4 - long-form production lane:** rights-cleared multi-hour material,
   retrieval, proxy/master, recovery, delivery, performance and cost.
6. **Q5 - human review integration:** qualified blind/non-blind receipts and
   measured correction sessions without conflating them with telemetry.

Each slice must preserve ProjectService as the sole project/timeline writer.
The QA harness observes product owners and validates receipts; it never writes
around them.

## Rejected alternatives

- **Only add more unit tests:** fast but cannot prove the user journey,
  playback or UI truth.
- **Only add browser tests:** cannot prove decoded media, source bindings,
  receipts or exact project mutation.
- **Only compare renders:** misses editability, undo/reload, stale writes,
  rights and false-success UI.
- **Use VMAF or screenshots as the quality gate:** useful regression signals,
  not editorial judgment.
- **Run against shared development data:** faster initially but non-isolated,
  nondeterministic and unsafe.
- **Call the existing RHC packet complete QA:** it covers four canaries and
  currently contains known fixture/review defects.

## External technical references

- Playwright trace inspection: <https://playwright.dev/docs/trace-viewer-intro>
- Playwright testing practices: <https://playwright.dev/docs/best-practices>
- Playwright visual comparisons: <https://playwright.dev/docs/next/test-snapshots>
- Netflix VMAF: <https://github.com/Netflix/vmaf>
- OpenTimelineIO documentation: <https://opentimelineio.readthedocs.io/en/latest/index.html>
- OpenTimelineIO adapters: <https://opentimelineio.readthedocs.io/en/latest/tutorials/adapters.html>

These references inform tooling choices only. They do not certify Editron.

## Current disposition

`FAST_USER_QA_DESIGN_ACCEPTED_IMPLEMENTATION_OPEN`

No browser-edit QA pass, human-quality promotion, production deployment,
provider inference, customer-project mutation or Stage 2.5 readiness change is
created by this ADR.
