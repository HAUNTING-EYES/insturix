# Editron OE benchmark V2-1E2 closeout and next-run truth

Date: 2026-08-13

Branch: `infrastructure-improvs-+Editron`

Status: no-spend closeout; the expected V2 paid smoke did not run

## Exact result

V2 has made **zero live provider calls**. No V2 paid-response, stage-one result,
provider receipt, graph, proxy render or editor score exists.

The local calibration tree contains deterministic development media and the
no-provider plan. It has no `provider-smoke/` directory. Repository search finds
only the smoke-preflight builder; there is no V2 live runner.

This corrects the earlier conversational impression that a spending run was
underway. Historical V1/OE-2A calls did spend money, but they belong to the
superseded one-shot benchmark. They are not V2 results.

## What V2-1E and V2-1E2 actually completed

`4d6cbc38f` completed the no-live V2-1E transport correction:

- persist provider-returned request/model/fingerprint identity separately from
  the caller's requested/logical label;
- price OpenAI cache writes at their separate rate;
- make worst-case preflight use the maximum applicable input-token rate;
- fail closed on missing/conflicting identity or missing cache-write price.

`84ce8a2ec` completed the no-live V2-1E2 Google preflight binding:

- serialize `models.countTokens` from the exact Google generation request;
- bind its request hash to the generation request/model;
- keep Google rows blocked until the network count is executed and persisted;
- refresh the deterministic smoke-preflight fixture.

These are genuine prerequisite fixes. Neither commit dispatches a provider.

## Current frozen preflight

Plan hash:

```text
336ae3e0c1d7b11a6baa102a1f005fed798e22f1ffd55a32cb65b6e432a8034a
```

The fixture contains six eligible `DEV-02/BASELINE` stage-one rows:

- Luna text evidence;
- Terra text evidence;
- Gemini Flash-Lite text evidence and multimodal;
- Gemini Flash text evidence and multimodal.

Maximum contractual spend remains **$0.48**: six rows at no more than $0.08
each, including the one permitted repair within each row's ceiling.

Current dispositions:

- OpenAI rows: blocked only on recorded operator confirmation;
- Google rows: blocked on official `countTokens` plus operator confirmation;
- claimed `DeepSeek-V4-Flash-0731`: excluded because the configured official
  request route is `deepseek-v4-flash` and does not prove that snapshot identity;
- required provider environment variables are not present in the current
  worktree process. Secrets pasted into chat are not persisted into source or
  calibration artifacts.

## New contract defect found before spending

The current stage-one output contract accepts observable targets as arbitrary
strings, and stage two accepts open node/edge objects. Therefore this smoke
would not test the newly required observable-target grammar or defensible
native/generated/hybrid routing. Spending now would validate transport against
an under-specified scientific instrument.

This is not a reason for another broad redesign. It is one bounded correction
to the exact stages the benchmark already claims to separate.

## Next execution order

### V2-1F — target/routing contract correction, no provider call

Touch no more than five research files. Freeze:

1. closed `ObservableTargetClaimV1` fields in `ReferenceBlueprintV2`;
2. a closed route-decision trace and target/form coverage matrix in
   `EditorialIntentGraphV2`;
3. source/project/composition rational coordinate references;
4. filmstrip-island generated/full-reel hybrid evaluator truth;
5. mixed-rate, invalidation and no-invented-evidence adversarial tests.

The model still chooses the conceptual decomposition. The schema does not
supply hidden answers or a technique template.

### V2-1G — operator-confirmed six-row paid stage-one smoke

Add the smallest research-only live runner around the existing V2 codec and
transport. Before any provider network call, record the exact plan hash,
maximum spend, operator identity and timestamp. Execute Google `countTokens`
first; abort the affected row if it exceeds its ceiling. Persist only allowed
hashes, native identity, usage/cost, finish reason, diagnostics and parsed
artifact. Never persist API keys, authorization headers, raw media/base64 or
raw provider bodies.

This run answers only whether the providers can return the corrected stage-one
target artifact under the transport and budget contract. It does not rank
models or prove editing.

### Remaining V2-1 mechanics

After the stage-one transport smoke passes, continue the four development tasks
through route selection, evidence binding, compilation, truthful stop/proceed,
network-denied proxy execution and blind editor review. Every stage remains
separate. Only after those mechanics pass may V2-2 buy the repeated development
matrix and open the locked holdouts for the final `GO`, `MODIFY` or `NO-GO`.

## Root-cause statement

The holdup was not provider latency. Work stopped after building and repairing
the preflight instrument, while conversation implied the paid experiment was
next or active. The absence of a live runner, confirmation artifact and receipt
should have been reported immediately. The next status report must distinguish
`preflight ready`, `network count complete`, `provider dispatched`, `receipt
persisted` and `stage passed` instead of calling them all a "run".
