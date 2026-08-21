# Editron V3R4 provider-native handoff/order results

Date: 2026-08-22
Status: `VALID_EVIDENCE / RESEARCH_PROVEN` for the bounded DEV-03 claim only
Production authority: none
Real-project mutation authority: none

## Question tested

Can Luna, Terra and Gemini 3.7 execute the same three-step native-edit episode
through provider-native tool calls when:

1. measured beat evidence must first be obtained from its owner;
2. beat-sync writes an isolated project clone and issues a new project revision;
3. camera shake must consume both semantic outputs and that exact writer-issued
   post-mutation revision;
4. one arm carries values directly and the other uses opaque result references;
5. tool presentation order changes without changing the task; and
6. a real rendered proxy must pass while real Editron project state remains
   untouched?

This is a sequential native-operation and result-handoff test. It is not a
general editorial-quality, reference-understanding, routing or production
mutation certification.

## Frozen identity

| Binding | Value |
| --- | --- |
| Experiment version | `EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_V3R_4` |
| Experiment ID | `EDITRON_V3R_DEV03_WRITER_REVISION_HANDOFF_ORDER_V4` |
| Manifest SHA-256 | `fa9ecac3b160aed417035d5530e4ab4f2cd568a3b4271b4c4835a6d0559d00e1` |
| Visibility receipt SHA-256 | `6418ce8c5d7d7eea5a393e47777f846b1340cba86b038b8736a0c872cb914ffd` |
| Evaluator policy SHA-256 | `fbb7acedb99727037b11c77f09155a3f9bb8a5c5b7a10956db54c9c520098606` |
| Evaluator source SHA-256 | `1f27c0f4211b00908965e241ad5e3ff4903e0cfbba8f1ae158e439e03a411ede` |
| CAP-2A V3 manifest SHA-256 | `180e5699ee939b9514dfc50b41513361c525fb7a0b433bda4226b466553cbf2a` |
| CAP-2A normalized source snapshot | `f9d7ed86323aa83605e491bb5d240235f4c228036fc69b9b9ade686e4b9b6655` |
| Valid preflight receipt SHA-256 | `b165a6f3968106c0f44d505227466bcb07b0986e85e2ec0a109640b63db1a84e` |
| Experiment receipt SHA-256 | `8bfa419764920bf497cd0f7866e3711f9d62cdf54235492cd9ef4ec9b7bb8491` |

The valid preflight performed three model-metadata GETs and six Google
`countTokens` calls, with zero inference calls. Its credential selection receipt
records `GOOGLE_GENERATIVE_AI_API_KEY`, pulled from the linked Vercel Production
environment. An earlier no-inference preflight at `20260821180027` selected the
local `GEMINI_API_KEY`; it is operationally invalid and supplies no benchmark
evidence. No model call occurred under that discarded preflight.

## Cohort

- Models: `gpt-5.6-luna`, `gpt-5.6-terra`, `gemini-3.7-flash`.
- Arms: `DIRECT_ARGUMENTS`, `OPAQUE_RESULT_REFERENCES`.
- Presentation permutations: three.
- Rows: 18 total, six per model, nine per arm, six per permutation.
- Raw root:
  `.calibration-temp/open-ended-planner-v2/provider-native-handoff-order-v3-run-20260821180228/`.
- Preserved raw inventory: 291 files, 193,699,575 bytes, including 18 row
  receipts, 36 MP4 files, 54 WAV files and 180 PNG files.

## Results

| Metric | Result |
| --- | ---: |
| Correct first relevant operation | 18/18 |
| Eventual causal execution | 18/18 |
| Required semantic result handoff | 18/18 |
| Writer-issued revision handoff | 18/18 |
| Rendered product proof | 18/18 |
| No real-project mutation | 18/18 |
| Safe outcome | 18/18 |
| Evaluator failures | 0 |
| Provider-infrastructure unverifiable | 0 |
| Render-infrastructure unverifiable | 0 |
| Harness errors | 0 |
| Premature dependent calls | 0 |

Every row advanced from the supplied pre-write revision, passed the exact
writer-issued post-write revision to the downstream camera-shake CAS, and kept
the initial and post-write revisions distinct. All nine opaque-reference rows
also bound `expectedProjectRevision` specifically to
`sync_cuts_to_beats.receipt.projectRevision`; copied literals do not satisfy the
evaluator.

Per model, all six rows passed. Per arm, all nine rows passed. Per presentation
permutation, all six rows passed. Presentation order therefore did not change
the outcome in this bounded cohort.

## Provider telemetry and cost

The following estimate uses provider-returned token receipts and the pricing
snapshot frozen in the cohort manifest. OpenAI cache writes are priced
separately from ordinary input and cached reads. Google billed output includes
reported output, thought and tool-use tokens. It is an estimate, not invoice
truth.

| Model | Calls | Ordinary input | Cached reads | Cache writes | Billed output | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Luna | 26 | 78 | 216,392 | 75,447 | 5,364 | 0.029641990 |
| Terra | 26 | 78 | 216,911 | 74,393 | 5,639 | 0.297188700 |
| Gemini 3.7 Flash | 24 | 321,591 | 0 | 0 | 15,659 | 0.299914500 |
| **Total** | **76** |  |  |  |  | **0.626745190** |

The frozen worst-case authorization was `$21.126758`. Actual estimated usage
was far lower because rows terminated in four to five tool turns and OpenAI
prefix caching was effective.

## Integrity checks

- Canonical manifest, preflight and experiment-receipt hashes all recomputed.
- Evaluator source bytes match the source hash in the manifest.
- All 18 rows independently satisfy revision advancement, downstream equality
  to the writer receipt and arm-appropriate provenance.
- A boundary-aware recursive scan of all 291 files found zero OpenAI- or
  Google-shaped credentials.
- Transport receipts declare `secretsPersisted: false`.
- The temporary Production environment export was removed after the run.
- Raw artifact file hashes:
  - manifest JSON: `18d462b079bef3fdfb9a00a6a47f3ca05c9abac84cf4eca0d31e57d8f8f32fa7`;
  - preflight JSON: `2cbd78041032e68ffa2cd1ce26f8efeccb96b6fbc0c0eda727545f4d62316e15`;
  - experiment receipt JSON: `d5f08f53e1be551e764390c0cb8e0fe53f0ee537fc1d986c18ef3bb14296fd4d`.

## Verdict

`PASS` for this bounded claim:

> The three tested models can execute the DEV-03 native-operation dependency
> chain, carry semantic outputs and a writer-issued post-mutation revision
> directly or through opaque result references, and complete isolated rendered
> proof without mutating a real Editron project.

This is meaningful support for the open-ended-agent bet. It supersedes the old
V3 sequential verdict, which remains `INVALID_EVIDENCE` because that writer did
not expose `R_after`.

## What this does not prove

- It tests one synthetic DEV-03 dependency shape, not arbitrary editing.
- Its synthetic audio is not intelligible dialogue.
- It does not test reference reconstruction, HREF motion/audio understanding or
  general editorial taste.
- It does not compare native, generated and hybrid execution forms.
- It does not test stale user changes, overlap conflicts, safe rebase or locked
  ranges.
- It does not test compaction/resume or five-hour range planning.
- It mutates only an isolated clone; no production ProjectService mutation path
  is authorized.
- It does not certify any model, operation, agency workflow or film-post
  replacement claim for production.

## Remaining Stage 2.5 gates

1. Land the benchmark source, CAP-2A V3 bindings and this report reproducibly.
2. Complete HREF-01's usable human-review pack plus targeted dense motion/audio
   evidence.
3. Run seven unseen holdouts.
4. Test other dependency and invalidation shapes.
5. Force native, generated and hybrid alternatives on held-out tasks.
6. Test stale user edits, overlap conflicts, safe rebase and locked ranges.
7. Test context compaction/resume without losing plan or result identity.
8. Run long-form/range-planning trials against realistic evidence limits.
9. Obtain blind-editor quality, correction-time, latency and cost receipts.
10. Publish the frozen Stage 2.5 `GO`, `MODIFY` or `NO-GO` decision.
