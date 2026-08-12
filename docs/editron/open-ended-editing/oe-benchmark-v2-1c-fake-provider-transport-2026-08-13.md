# Editron OE Benchmark V2-1C — Fake-Provider Transport Boundary

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Status: provider request/receipt boundary verified against fake HTTP; no live provider dispatched

## Result

V2-1C converts the frozen V2 stage packet into provider-native request envelopes and immutable attempt receipts without authorizing a live benchmark run.

The boundary now:

- serializes the exact stage output contract and canonical packet;
- verifies every attachment against its declared asset ID, byte count, and SHA-256 before egress;
- requires an explicitly injected HTTP transport, so this slice cannot silently use global `fetch`;
- records every required V2 telemetry field and uses `null` when a provider does not report a value;
- preserves cache-hit, cache-write, cache-miss, visible-output, and reasoning-token fields separately when available;
- enforces cumulative input, visible-output, reasoning, wall-clock, and cost ceilings across both attempts;
- permits one repair only for malformed JSON or a locally schema-invalid artifact;
- never repairs refusal, timeout, truncation, unsupported modality, invalid transport, unverifiable telemetry, or exceeded budget;
- performs no ProjectService call, project read/write, graph execution, proxy render, or holdout access.

No model result, editing-quality score, executable graph, render, blind-editor verdict, or production-capability claim was produced.

## Existing-owner reconciliation

V1 remains the owner of the old one-shot benchmark transport:

- `createPlannerProviderAdapterV1` builds V1 provider requests;
- `runPlannerTrialV1` records V1 one-shot results;
- `runDevelopmentBenchmarkV1` schedules V1 trials.

Those files were not patched. Their contracts cannot truthfully represent V2 because V1:

- accepts one text prompt rather than staged packets plus media;
- expects one `CandidateGraphV1` output;
- does not preserve native finish reasons or reasoning-token counts;
- converts missing token usage to zero;
- has no cumulative two-attempt V2 budget.

V2-1C therefore adds a versioned research codec and recorder beside V1. This is not a second production provider authority: there is no production import, route registration, provider registry, project authority, or state mutation.

## Provider capability truth

| Route | Native output constraint | Frozen media accepted by this codec | Consequence |
| --- | --- | --- | --- |
| OpenAI Responses | Exact schema supplied through `text.format`; `strict: false` is recorded as `NATIVE_JSON_SCHEMA_NON_STRICT` | PNG/JPEG/WebP only | A V2 packet containing video or audio is `NOT_APPLICABLE`; it is never silently reduced to text or still images. |
| Google GenerateContent | Exact schema supplied through `responseJsonSchema` | PNG/JPEG/WebP, WAV, MP4 | Current development multimodal packets can be serialized after attachment integrity verification. |
| DeepSeek Chat Completions | Native JSON-object mode; exact schema remains in the canonical prompt and is enforced locally | Text only | Every current multimodal packet is `NOT_APPLICABLE`; text-evidence packets remain eligible. |

The OpenAI request shape and image-only model input truth were checked against the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Images and vision](https://developers.openai.com/api/docs/guides/images-vision), and [model catalog](https://developers.openai.com/api/docs/models) documentation.

Google media parts and response-schema behavior were checked against the official [GenerateContent request structure](https://ai.google.dev/gemini-api/docs/generate-content/text-generation) and [structured-output migration reference](https://ai.google.dev/gemini-api/docs/migrate-to-interactions). DeepSeek JSON-object, reasoning, finish-reason, and usage fields were checked against the official [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion).

Ollama is deliberately absent from V2-1C. The final fair V1 DeepSeek result used the official DeepSeek endpoint, not Ollama, and the official [Ollama Structured Outputs documentation](https://docs.ollama.com/capabilities/structured-outputs) currently says Ollama Cloud does not support that feature. No Ollama result is promoted or fabricated from the earlier diagnostic route.

## Request integrity

Every request binds:

- provider kind, model route, and pinned model snapshot;
- packet hash and canonical prompt hash;
- request-body hash;
- stage, task, evidence condition, modality arm, and routing arm;
- exact output contract;
- remaining visible/reasoning output ceiling;
- attempt number;
- repair diagnostics and prior raw response only on attempt two.

Multimodal serialization also requires the provider-visible media descriptor SHA to equal the transport attachment SHA. The loaded bytes must then match both the declared byte count and SHA-256. Descriptor drift or byte tampering is `TRANSPORT_INVALID`; provider incompatibility is `NOT_APPLICABLE`.

## Telemetry and budget semantics

Every attempt receipt includes all 18 fields frozen by V2-0:

`provider`, `model`, `providerRequestId`, `inputArm`, `executionFormArm`, `attempt`, `inputTokens`, `cachedInputTokens`, `visibleOutputTokens`, `reasoningTokens`, `totalTokens`, `finishReason`, `truncated`, `latencyMs`, `providerCostUsd`, `parseStatus`, `schemaDiagnostics`, and `artifactSha256`.

Additional native cache-write/cache-miss values, prompt/request/raw-response hashes, schema mode, and terminal disposition are preserved.

Rules:

- missing provider telemetry is `null`, never fake zero;
- missing request ID, finish reason, visible-output count, or reasoning count makes an apparent success `TELEMETRY_UNVERIFIABLE`;
- cached-token absence does not invent a cache hit; cost is conservatively calculated as uncached;
- preflight input and worst-case cost must fit before HTTP;
- native usage, latency, and calculated cost must still fit after HTTP;
- attempt two receives only the remaining cumulative budget;
- any hard-limit breach is `BUDGET_EXCEEDED` and cannot become an accepted artifact.

The caller-supplied preflight input count is an explicit future handoff. A live slice must bind it to a tested provider/model tokenizer or count-tokens endpoint. V2-1C does not pretend its canonical JSON character length is a token count.

## Repair semantics

Repair is allowed only when the provider successfully returns:

- malformed JSON; or
- JSON that fails the frozen local output contract.

The repair request includes the first response and exact diagnostics. It consumes the same stage's remaining token, time, and cost budget. A second failure is final. Provider-specific hidden repair, a third attempt, and fallback to another model are forbidden.

## Changed files

- `lib/editron/research/open-ended-planner/provider-codecs-v2.ts`
- `lib/editron/research/open-ended-planner/provider-transport-v2.ts`
- `tests/editron/open-ended-planner-v2-provider-codecs.test.ts`
- `tests/editron/open-ended-planner-v2-provider-transport.test.ts`
- this document

## Verification

- Provider codecs: 6/6 passed.
- Provider transport: 9/9 passed.
- Existing staged-packet guard: 7/7 passed.
- Focused total: 22/22 passed.
- `pnpm exec tsc --noEmit`: passed with an 8 GB Node heap.
- `pnpm exec eslint . --quiet`: passed with an 8 GB Node heap.
- Live HTTP calls: zero; every test injects fake HTTP.
- API keys persisted in artifacts: zero.
- Production imports, project mutations, renders, and holdout reads: zero.
- Physical line counts: both implementation files remain below 300.

## Next bounded slice

V2-1D may prepare the first paid development smoke run, but only after it freezes:

1. exact route/model snapshots and current prices;
2. provider/model-specific preflight token counting;
3. route applicability for every task/modality pair;
4. a maximum-spend calculation for the selected smoke subset;
5. output persistence with secrets and raw media excluded;
6. operator confirmation before the first network call.

The first paid smoke should run one development stage-one packet per eligible provider/modality combination, not all 96 branches. Holdouts, project mutation, proxy execution, rendering, and production claims remain blocked.
