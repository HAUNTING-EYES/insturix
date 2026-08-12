import { appendFileSync, writeFileSync } from 'node:fs';

import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v1/benchmark-contract-v1.json';
import developmentTasksJson from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';
import knowledgeEntriesJson from '@/tests/fixtures/editron/open-ended-planner-v1/knowledge-entries-v1.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v1/operator-specs-v1.json';

import {
  type BenchmarkContractV1,
  type KnowledgeEntryV1,
  type OperatorCatalogV1,
  type PlannerConditionIdV1,
  type PlannerPricingV1,
  type PlannerProviderAdapterV1,
  type PlannerProviderResultV1,
  type PlannerTaskFixtureV1,
  type PlannerTrialRecordV1,
} from './contracts-v1';
import { materializePlannerPacketV1 } from './materialize-packet-v1';
import { runPlannerTrialV1 } from './trial-harness-v1';

type FetchV1 = typeof fetch;
type ProviderKindV1 = 'openai' | 'ollama' | 'google' | 'deepseek';

const CANDIDATE_GRAPH_JSON_SCHEMA = (
  benchmarkJson.schemas.candidateGraphV1 as typeof benchmarkJson.schemas.candidateGraphV1 & {
    jsonSchema: Record<string, unknown>;
  }
).jsonSchema;

export interface DevelopmentRouteV1 {
  routeId: string;
  adapter: PlannerProviderAdapterV1;
  pricing: PlannerPricingV1;
}

export interface RouteAvailabilityV1 {
  routeId: string;
  modelSnapshot: string;
  status: 'AVAILABLE' | 'CREDENTIAL_INVALID' | 'INFERENCE_UNAUTHORIZED';
  evidence: string;
}

export interface DevelopmentBenchmarkReportV1 {
  reportVersion: 'OE1_DEVELOPMENT_REPORT_V1';
  benchmarkContractVersion: string;
  startedAt: string;
  completedAt: string;
  trialsPerModelCondition: number;
  routeAvailability: RouteAvailabilityV1[];
  records: PlannerTrialRecordV1[];
  summary: Array<{
    routeId: string;
    trials: number;
    providerSuccesses: number;
    schemaValid: number;
    envelopeBound: number;
    envelopeRejected: number;
    totalEstimatedModelCostUsd: number;
  }>;
}

export function createPlannerProviderAdapterV1(input: {
  kind: ProviderKindV1;
  apiKey: string;
  model: string;
  modelSnapshot?: string;
  fetchImpl?: FetchV1;
  timeoutMs?: number;
}): PlannerProviderAdapterV1 {
  if (!input.apiKey) throw new TypeError(`${input.kind} API key is required`);
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 120_000;
  return {
    provider: input.kind,
    modelSnapshot: input.modelSnapshot ?? input.model,
    reasoningMode: input.kind === 'ollama' || input.kind === 'deepseek' ? 'high' : 'medium',
    invoke: async ({ prompt, signal }) => {
      try {
        const response = await invokeProvider(input, prompt, fetchImpl, combineSignals(signal, timeoutMs));
        if (!response.ok) return mapHttpFailure(response.status);
        return parseProviderSuccess(input.kind, await response.json() as Record<string, unknown>);
      } catch (error) {
        return {
          disposition: isAbort(error) ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
          detail: error instanceof Error ? error.name : 'NonErrorFailure',
        };
      }
    },
  };
}

async function invokeProvider(
  input: { kind: ProviderKindV1; apiKey: string; model: string },
  prompt: string,
  fetchImpl: FetchV1,
  signal: AbortSignal,
): Promise<Response> {
  if (input.kind === 'openai') {
    return fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model, input: prompt, store: false,
        reasoning: { effort: 'medium' }, max_output_tokens: 8_192,
        text: {
          format: {
            type: 'json_schema', name: 'editron_candidate_graph_v1', strict: false,
            schema: CANDIDATE_GRAPH_JSON_SCHEMA,
          },
        },
      }),
    });
  }
  if (input.kind === 'ollama') {
    return fetchImpl('https://ollama.com/api/generate', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model, prompt, stream: false, format: CANDIDATE_GRAPH_JSON_SCHEMA, think: 'high',
        options: { num_predict: 8_192 },
      }),
    });
  }
  if (input.kind === 'deepseek') {
    return fetchImpl('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: 16_384,
        response_format: { type: 'json_object' },
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      }),
    });
  }
  return fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: 'POST', signal,
      headers: { 'x-goog-api-key': input.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: CANDIDATE_GRAPH_JSON_SCHEMA,
          maxOutputTokens: 8_192,
        },
      }),
    },
  );
}

function parseProviderSuccess(kind: ProviderKindV1, body: Record<string, unknown>): PlannerProviderResultV1 {
  if (kind === 'openai') {
    const usage = asRecord(body.usage);
    const details = asRecord(usage.input_tokens_details);
    const text = typeof body.output_text === 'string' ? body.output_text : findOpenAIText(body.output);
    return success(text, usage.input_tokens, usage.output_tokens, details.cached_tokens);
  }
  if (kind === 'ollama') {
    return success(body.response, body.prompt_eval_count, body.eval_count);
  }
  if (kind === 'deepseek') {
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const message = asRecord(asRecord(choices[0]).message);
    const usage = asRecord(body.usage);
    return success(
      message.content,
      usage.prompt_tokens,
      usage.completion_tokens,
      usage.prompt_cache_hit_tokens,
    );
  }
  const usage = asRecord(body.usageMetadata);
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const content = asRecord(asRecord(candidates[0]).content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return success(asRecord(parts[0]).text, usage.promptTokenCount, usage.candidatesTokenCount);
}

function success(text: unknown, inputTokens: unknown, outputTokens: unknown, cached?: unknown): PlannerProviderResultV1 {
  if (typeof text !== 'string') return { disposition: 'PROVIDER_ERROR', detail: 'Missing provider text' };
  return {
    disposition: 'SUCCESS', text,
    usage: {
      inputTokens: finiteCount(inputTokens), outputTokens: finiteCount(outputTokens),
      ...(cached === undefined ? {} : { cachedInputTokens: finiteCount(cached) }),
    },
  };
}

function findOpenAIText(output: unknown): string {
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    const content = asRecord(item).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) if (asRecord(part).type === 'output_text') return String(asRecord(part).text ?? '');
  }
  return '';
}

function mapHttpFailure(status: number): PlannerProviderResultV1 {
  if (status === 429) return { disposition: 'PROVIDER_RATE_LIMIT' };
  if (status === 408 || status === 504) return { disposition: 'PROVIDER_TIMEOUT' };
  if (status === 401 || status === 403) return { disposition: 'PROVIDER_REFUSAL' };
  return { disposition: 'PROVIDER_ERROR', detail: `HTTP_${status}` };
}

export async function runDevelopmentBenchmarkV1(input: {
  routes: DevelopmentRouteV1[];
  routeAvailability: RouteAvailabilityV1[];
  outputPath: string;
  trialsPerModelCondition?: number;
  concurrency?: number;
  onProgress?: (complete: number, total: number) => void;
}): Promise<DevelopmentBenchmarkReportV1> {
  const benchmark = benchmarkJson as unknown as BenchmarkContractV1 & {
    conditionApplicability: Record<PlannerConditionIdV1, string[]>;
  };
  const tasks = developmentTasksJson.tasks as unknown as PlannerTaskFixtureV1[];
  const repetitions = input.trialsPerModelCondition ?? 3;
  const jobs = input.routes.flatMap((route) =>
    tasks.flatMap((task) => Object.entries(benchmark.conditionApplicability)
      .filter(([, taskIds]) => taskIds.includes(task.taskId))
      .flatMap(([conditionId]) => Array.from({ length: repetitions }, (_, index) => ({
        route, task, conditionId: conditionId as PlannerConditionIdV1, repetition: index + 1,
      })))),
  );
  const startedAt = new Date().toISOString();
  const recordStreamPath = `${input.outputPath}.records.jsonl`;
  writeFileSync(recordStreamPath, '', { encoding: 'utf8', flag: 'wx' });
  let complete = 0;
  const records = await runPool(jobs, input.concurrency ?? 2, async (job) => {
    const artifact = materializePlannerPacketV1({
      benchmarkContract: benchmark,
      task: job.task,
      conditionId: job.conditionId,
      operatorCatalog: operatorCatalogJson as unknown as OperatorCatalogV1,
      knowledgeEntries: knowledgeEntriesJson.entries as unknown as KnowledgeEntryV1[],
    });
    const record = await runPlannerTrialV1({
      trialId: `oe1-${job.route.routeId}-${job.task.taskId}-${job.conditionId}-r${job.repetition}`,
      artifact, adapter: job.route.adapter, pricing: job.route.pricing,
    });
    appendFileSync(recordStreamPath, `${JSON.stringify(record)}\n`, 'utf8');
    input.onProgress?.(++complete, jobs.length);
    return record as PlannerTrialRecordV1;
  });
  const report: DevelopmentBenchmarkReportV1 = {
    reportVersion: 'OE1_DEVELOPMENT_REPORT_V1', benchmarkContractVersion: benchmark.version,
    startedAt, completedAt: new Date().toISOString(), trialsPerModelCondition: repetitions,
    routeAvailability: input.routeAvailability, records,
    summary: input.routes.map(({ routeId }) => summarize(routeId, records)),
  };
  writeFileSync(input.outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return report;
}

function summarize(routeId: string, records: PlannerTrialRecordV1[]) {
  const selected = records.filter((record) => record.trialId.startsWith(`oe1-${routeId}-`));
  const count = (value: string) => selected.filter((record) => record.parseDisposition === value).length;
  return {
    routeId, trials: selected.length,
    providerSuccesses: selected.filter((record) => record.providerDisposition === 'SUCCESS').length,
    schemaValid: count('PARSED_ENVELOPE_BOUND') + count('ENVELOPE_REJECTED'),
    envelopeBound: count('PARSED_ENVELOPE_BOUND'), envelopeRejected: count('ENVELOPE_REJECTED'),
    totalEstimatedModelCostUsd: Number(selected.reduce((sum, record) => sum + record.estimatedModelCostUsd, 0).toFixed(6)),
  };
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('concurrency must be positive');
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
