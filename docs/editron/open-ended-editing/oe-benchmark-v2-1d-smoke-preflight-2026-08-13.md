# Editron OE Benchmark V2-1D — No-Spend Smoke Preflight

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Status: frozen preflight only; zero provider network calls

## Result

V2-1D freezes the smallest fair paid-smoke candidate without spending money or pretending the current transport is ready to dispatch. The same `DEV-02/BASELINE` difficult-reference packet is selected for every route. Text-evidence arms are planned for Luna, Terra, Gemini Flash-Lite, and Gemini Flash. Multimodal arms are planned only for the two Gemini routes because the frozen DEV-02 packet includes video that the OpenAI codec does not accept and DeepSeek is text-only.

The frozen fixture also contains a 40-row applicability matrix: five provider routes × four development tasks × two input arms. Every text-evidence pair is modality-applicable. Only Google is modality-applicable to the frozen multimodal packets; OpenAI and DeepSeek are `NOT_APPLICABLE`, never failed or silently reduced to text.

The planned six-call contractual ceiling is **$0.48**: six stage-one rows × the existing cumulative stage ceiling of $0.08. That cap already includes the one permitted repair; a repair never adds another $0.08. Dispatch is still blocked because V2-1C does not yet price OpenAI cache-write tokens, so it cannot enforce that ceiling honestly.

No provider call, token-count call, project read/write, graph execution, render, or holdout read occurred.

## Provider truth as of 2026-08-13

| Benchmark route | Request model | Identity truth | Standard price per 1M input/output tokens | Frozen arm |
| --- | --- | --- | --- | --- |
| Luna | `gpt-5.6-luna` | provider route; no dated snapshot is exposed | $1 / $6 | text evidence |
| Terra | `gpt-5.6-terra` | provider route; no dated snapshot is exposed | $2.50 / $15 | text evidence |
| Gemini Flash-Lite | `gemini-3.5-flash-lite` | Google stable route | $0.30 / $2.50 | text + multimodal |
| Gemini Flash | `gemini-3.6-flash` | Google stable route | $1.50 / $7.50 | text + multimodal |
| DeepSeek comparison | `deepseek-v4-flash` | **not the claimed `DeepSeek-V4-Flash-0731` snapshot** | $0.14 / $0.28 | blocked |

OpenAI prices and modality truth come from the official [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) model pages. Google model IDs, stable-route status, and prices come from the official [latest-model](https://ai.google.dev/gemini-api/docs/latest-model), [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash), and [pricing](https://ai.google.dev/gemini-api/docs/pricing) pages. DeepSeek route and pricing truth come from the official [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion) and [pricing](https://api-docs.deepseek.com/quick_start/pricing/) pages.

The earlier V1 receipt field `modelSnapshot: DeepSeek-V4-Flash-0731` was supplied by the benchmark caller. The actual provider request used `deepseek-v4-flash`. Current official DeepSeek documentation exposes no `0731` request model. V2-1D therefore excludes that row instead of treating a logical label as provider proof. A later run may test current `deepseek-v4-flash`, but it must be recorded as a new comparison identity and cannot be presented as the exact 0731 model without provider evidence.

## Preflight token strategy

- **OpenAI text arms:** the reviewed official API material exposes post-response usage but no verified provider-native pre-generation counter for these exact Responses requests. The frozen fallback is a conservative offline upper bound: UTF-8 bytes of the entire exact serialized request body, including its output schema, plus 256 tokens of transport allowance. DEV-02 fits below the 6,000-token stage ceiling under that bound.
- **Google text and multimodal arms:** use the official [`models.countTokens`](https://ai.google.dev/api/tokens) endpoint with the exact `GenerateContentRequest`, including schema, system material, and attachments. Count results must be persisted before generation. This is a provider network call and remains blocked by the operator gate.
- **DeepSeek:** no official pre-generation count endpoint was verified. The same conservative local bound could protect a current text-only route, but the requested 0731 comparison is already blocked on identity.

Missing counts remain `null`; they never become zero. The generator does not read API keys and does not invoke a counter.

## New blocker found in V2-1C

The provider responses contain native identity evidence that V2-1C currently discards:

- OpenAI: response ID and response model;
- Google: `responseId` and `modelVersion`;
- DeepSeek: response ID, response model, and `system_fingerprint`.

V2-1C receipts currently write the caller's `modelSnapshot` field instead. Dispatching now would repeat the V1 identity-label problem. Every smoke row is therefore blocked until native response identity is normalized and persisted by the receipt boundary.

V2-1C also records OpenAI `cache_write_tokens` but its cost estimator ignores them. Official Luna and Terra documentation prices cache writes at 1.25× uncached input: $1.25/MTok for Luna and $3.125/MTok for Terra. This is another dispatch blocker, not an acceptable rounding error.

## Persistence and confirmation

The future smoke artifact may persist packet/request hashes, provider request ID, native model identity/fingerprint, usage, calculated cost, finish reason, schema diagnostics, raw-response hash, and the parsed stage artifact.

It must not persist API-key values, authorization headers, raw media, base64 media, raw provider responses, or user project state. Keys may only be read from `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `DEEPSEEK_API_KEY` at dispatch time.

Before **any** provider network call—including Google token counting—the operator must echo:

1. the frozen plan hash;
2. the $0.48 maximum spend;
3. operator identity;
4. confirmation timestamp.

That confirmation authorizes only the six development stage-one smoke rows. It never authorizes holdout access, project mutation, proxy execution, rendering, or production registration.

## Changed files

- `lib/editron/research/open-ended-planner/smoke-preflight-v2.ts`
- `scripts/build-open-ended-planner-v2-smoke-preflight.ts`
- `tests/fixtures/editron/open-ended-planner-v2/development-smoke-preflight-v2.json`
- `tests/editron/open-ended-planner-v2-smoke-preflight.test.ts`
- this document

## Next bounded slice

V2-1E should add native provider-model identity fields to the V2 response normalizer and immutable attempt receipt, and price cache writes separately, with fake-provider tests for missing/conflicting identity and cache-write cost. It must still make no live provider call. After V2-1E passes, an operator can review this plan hash and explicitly authorize the six-call, $0.48 smoke.
