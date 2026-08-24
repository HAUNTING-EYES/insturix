# Stage 2.5 R1 zero-spend resume specification freeze

Date: 2026-08-25

Authority: local zero-spend specification fixture only

Provider dispatch: disabled

Canonical project mutation: none

## Frozen identities

- Freeze: `a48733380427170a0b3bbab3d2f2db0dc4bdd28d668c06893f7c046d81c36a6a`
- Fixture assessment: `SPECIFICATION_FIXTURE_ONLY`
- Resume-readiness disposition: `NOT_ESTABLISHED`
- Executable owner evidence bound: `false`
- Paid-resume disposition: `NOT_AUTHORIZED`
- Proof ceiling: `LOCAL_ZERO_SPEND_SPECIFICATION_FIXTURE_ONLY`

No resume-readiness receipt is issued by this artifact. The validator accepts
caller-supplied specification examples only. Even a perfectly matching example
set produces `NOT_ESTABLISHED`; it cannot become executable-owner evidence by
self-description, by matching hashes or by adding a claimed success field.

## Existing authority reused

This phase did not add a provider loop, checkpoint store, durable lifecycle,
project owner or proof owner. The freeze binds the current existing path:

```text
accepted PlanService execution definition
  -> existing durable Plan worker/job lifecycle
  -> ProviderNativeToolEpisodeV2R fresh/resumed execution owner
  -> existing checkpoint codec and leased resume-state CAS
  -> isolated ProjectService proposal clone
  -> writer-issued proposal revision and pure committed-writer replay
  -> existing V2 outcome finalizer
```

The fixture validator can only reject or summarize illustrative examples. It
does not capture results from the owners above and cannot dispatch, resume,
retry, mutate or prove an edit.

## Public zero-spend specification sentinels

1. An interruption checkpoint is eligible only after a writer turn and its
   writer-issued proposal revision have committed.
2. Serialized checkpoint and proposal-recovery state must hydrate under a
   distinct runtime identity before a separate-runtime suffix is represented.
3. Recovery may purely replay committed writers into the isolated clone, but
   committed prefix provider calls must not be invoked again.
4. A stale checkpoint fails before provider invocation.
5. A tampered checkpoint, opaque result, proposal recovery state or outer hash
   fails before suffix execution.
6. Runtime guard, route, pricing, cumulative usage or reservation drift fails
   before provider invocation.
7. An unresolved persisted dispatch intent is conservatively accounted,
   receives zero automatic retries and terminalizes without another provider
   call.
8. `dispatchAuthorized` remains `false` and every fixture receipt records zero
   provider calls, zero canonical ProjectService mutations and zero state
   effects.

The validator rejects self-rehashed changes to the compiled owner bindings or
public expectation bodies. A valid outer hash cannot rewrite the policy. These
checks establish specification integrity, not that the owner behavior ran.

## Executable current-code checks

The new specification test and the existing owner tests are run separately but
can be executed in one developer command:

- `stage25-resume-readiness-v1.test.ts`
- `provider-native-plan-resumed-execution-owner-v2r.test.ts`
- `provider-native-plan-fresh-native-proof-v2r.test.ts`
- `provider-native-dispatch-intent-resume-v2r.test.ts`
- `provider-native-episode-runtime-budget-resume-v2r.test.ts`
- `provider-native-episode-resume-v2r.test.ts`
- `provider-native-failed-attempt-resume-v2r.test.ts`
- `provider-native-episode-separate-process-resume-v2r.test.ts`
- `provider-native-cut-focal-process-resume-v2r.test.ts`

The separate owner tests exercise distinct operating-system processes,
captured/local suffix work, committed writer checkpoints, pure writer replay,
stale/tampered state rejection, runtime-budget restoration/drift and unresolved
dispatch handling. Their test-run outcome is not imported, hashed or promoted
by the fixture receipt. An independently generated executable test-run receipt
remains future work.

Repository `pnpm exec tsc --noEmit` and `pnpm exec eslint . --quiet` both pass.

## Deliberate proof limits

The following remain unverified and are not promoted by this freeze:

- executable owner outcomes bound into a receipt;
- a hash-bound test-run receipt;
- paid provider resume;
- live Atlas recovery;
- live QStash redelivery;
- authenticated hosted worker ingress;
- canonical ProjectService proposal apply and reload;
- rendered visual or audible acceptance.

No paid resume call is allowed from this artifact. A later paid trial requires
a successor task packet, current-source closure, exact provider route and
pricing, a new zero-spend gate and separate explicit capped authorization.
