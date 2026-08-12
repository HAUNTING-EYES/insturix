import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
  sha256TextV1,
  type CandidateGraphV1,
  type MaterializedPlannerPacketArtifactV1,
  type PlannerPricingV1,
  type PlannerProviderAdapterV1,
  type PlannerTokenUsageV1,
  type PlannerTrialRecordV1,
  type ProviderDispositionV1,
} from './contracts-v1';

const PROMPT_TEMPLATE_V1 = {
  version: 'OE1_PROVIDER_NEUTRAL_PROMPT_V1',
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
  instructions: [
    'Return exactly one JSON object conforming to candidateGraphOutputContract.',
    'Use only operators, versions, evidence IDs, project revision, and envelope hash present in the packet.',
    'Do not call tools, browse, mutate state, copy format-only identifiers, or claim rendered success.',
    'When the packet cannot support the observable target, use clarifications or declines instead of inventing support.',
  ],
} as const;

export const OE1_PROMPT_TEMPLATE_HASH_V1 = hashCanonicalJsonV1(PROMPT_TEMPLATE_V1);

export async function runPlannerTrialV1(input: {
  trialId: string;
  artifact: MaterializedPlannerPacketArtifactV1;
  adapter: PlannerProviderAdapterV1;
  pricing: PlannerPricingV1;
  signal?: AbortSignal;
  now?: () => Date;
}): Promise<Readonly<PlannerTrialRecordV1>> {
  validateTrialConfiguration(input.trialId, input.pricing);
  const now = input.now ?? (() => new Date());
  const started = now();
  const prompt = canonicalizeJsonV1({
    ...PROMPT_TEMPLATE_V1,
    packet: input.artifact.packet,
  });
  const promptHash = hashCanonicalJsonV1({
    promptTemplateHash: OE1_PROMPT_TEMPLATE_HASH_V1,
    provider: input.adapter.provider,
    modelSnapshot: input.adapter.modelSnapshot,
    conditionId: input.artifact.packet.conditionId,
    prompt: JSON.parse(prompt) as unknown,
  });
  const base = {
    trialId: input.trialId,
    taskId: input.artifact.packet.taskId,
    conditionId: input.artifact.packet.conditionId,
    provider: input.adapter.provider,
    modelSnapshot: input.adapter.modelSnapshot,
    reasoningMode: input.adapter.reasoningMode,
    packetHash: input.artifact.packetHash,
    promptTemplateHash: OE1_PROMPT_TEMPLATE_HASH_V1,
    promptHash,
    envelopeHash: input.artifact.packet.envelopeHash,
    startedAt: started.toISOString(),
  };
  if (input.signal?.aborted) {
    return finishTrial(base, started, now(), 'PROVIDER_CANCELLED', 'NOT_ATTEMPTED', '', zeroUsage(), input.pricing, 'Cancelled before dispatch');
  }

  let result;
  try {
    result = await input.adapter.invoke({
      prompt,
      promptHash,
      envelopeHash: input.artifact.packet.envelopeHash,
      signal: input.signal,
    });
  } catch (error) {
    const cancelled = input.signal?.aborted === true;
    return finishTrial(
      base,
      started,
      now(),
      cancelled ? 'PROVIDER_CANCELLED' : 'PROVIDER_ERROR',
      'NOT_ATTEMPTED',
      '',
      zeroUsage(),
      input.pricing,
      cancelled ? 'Cancelled during provider call' : providerThrowDetail(error),
    );
  }
  const completed = now();
  const inspectedUsage = inspectUsage(result.usage);
  if (inspectedUsage.error) {
    return finishTrial(
      base,
      started,
      completed,
      'PROVIDER_ERROR',
      'NOT_ATTEMPTED',
      result.disposition === 'SUCCESS' ? result.text : '',
      zeroUsage(),
      input.pricing,
      inspectedUsage.error,
    );
  }
  if (input.signal?.aborted) {
    return finishTrial(
      base,
      started,
      completed,
      'PROVIDER_CANCELLED',
      'NOT_ATTEMPTED',
      result.disposition === 'SUCCESS' ? result.text : '',
      inspectedUsage.usage,
      input.pricing,
      'Cancelled during provider call',
    );
  }
  if (result.disposition !== 'SUCCESS') {
    return finishTrial(
      base,
      started,
      completed,
      result.disposition,
      'NOT_ATTEMPTED',
      '',
      inspectedUsage.usage,
      input.pricing,
      `Provider adapter returned ${result.disposition}`,
    );
  }
  const usage = inspectedUsage.usage;
  const raw = result.text;
  if (!raw.trim()) {
    return finishTrial(base, started, completed, 'SUCCESS', 'EMPTY_RESPONSE', raw, usage, input.pricing);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return finishTrial(base, started, completed, 'SUCCESS', 'MALFORMED_JSON', raw, usage, input.pricing);
  }
  const candidate = parseCandidateGraphShape(parsed);
  if (!candidate) {
    return finishTrial(base, started, completed, 'SUCCESS', 'INVALID_GRAPH_SHAPE', raw, usage, input.pricing);
  }
  const envelopeFailure = validateCandidateEnvelope(candidate, input.artifact);
  return finishTrial(
    base,
    started,
    completed,
    'SUCCESS',
    envelopeFailure ? 'ENVELOPE_REJECTED' : 'PARSED_ENVELOPE_BOUND',
    raw,
    usage,
    input.pricing,
    envelopeFailure,
    candidate,
  );
}

function finishTrial(
  base: Omit<PlannerTrialRecordV1, 'completedAt' | 'latencyMs' | 'inputTokens' | 'outputTokens' | 'estimatedModelCostUsd' | 'rawResponseHash' | 'providerDisposition' | 'parseDisposition' | 'verifierDisposition' | 'renderDisposition' | 'judgeDisposition' | 'accepted'>,
  started: Date,
  completed: Date,
  providerDisposition: ProviderDispositionV1,
  parseDisposition: string,
  rawResponse: string,
  usage: PlannerTokenUsageV1,
  pricing: PlannerPricingV1,
  failureDetail?: string,
  candidateGraph?: CandidateGraphV1,
): Readonly<PlannerTrialRecordV1> {
  const record: PlannerTrialRecordV1 = {
    ...base,
    completedAt: completed.toISOString(),
    latencyMs: Math.max(0, completed.getTime() - started.getTime()),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedModelCostUsd: estimateCost(usage, pricing),
    rawResponseHash: sha256TextV1(rawResponse),
    ...(rawResponse ? { rawResponse } : {}),
    providerDisposition,
    parseDisposition,
    verifierDisposition: 'NOT_RUN_OE1',
    renderDisposition: 'NOT_RUN_OE1',
    judgeDisposition: 'NOT_RUN_OE1',
    accepted: false,
    ...(failureDetail ? { failureDetail: failureDetail.slice(0, 500) } : {}),
    ...(candidateGraph ? { candidateGraph } : {}),
  };
  return deepFreezeV1(record);
}

function parseCandidateGraphShape(value: unknown): CandidateGraphV1 | undefined {
  if (!isRecord(value)) return undefined;
  const stringFields = ['graphId', 'taskId', 'envelopeHash', 'projectRevision', 'expectedOutcome'];
  if (!stringFields.every((field) => typeof value[field] === 'string')) return undefined;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return undefined;
  if (!isStringArray(value.preservationClaims) || !Array.isArray(value.clarifications) || !Array.isArray(value.declines)) return undefined;
  for (const node of value.nodes) {
    if (!isRecord(node)) return undefined;
    if (!['nodeId', 'operatorId', 'operatorVersion', 'failureDisposition'].every((field) => typeof node[field] === 'string')) return undefined;
    if (!isRecord(node.inputs) || !isRecord(node.expectedOutputs) || !isStringArray(node.evidenceIds) || !Array.isArray(node.expectedStateEffects)) return undefined;
  }
  for (const edge of value.edges) {
    if (!isRecord(edge) || !['fromNodeId', 'fromPort', 'toNodeId', 'toPort'].every((field) => typeof edge[field] === 'string')) return undefined;
  }
  return value as CandidateGraphV1;
}

function validateCandidateEnvelope(
  graph: CandidateGraphV1,
  artifact: MaterializedPlannerPacketArtifactV1,
): string | undefined {
  const packet = artifact.packet;
  const envelope = packet.materializedPlannerEnvelope;
  if (graph.taskId !== packet.taskId) return 'Candidate taskId differs from the packet';
  if (graph.envelopeHash !== packet.envelopeHash) return 'Candidate envelopeHash differs from the packet';
  if (graph.projectRevision !== envelope.projectRevision) return 'Candidate projectRevision differs from the envelope';
  const exposed = packet.operatorNamesAndPorts ?? packet.fullAllowedOperatorSpecs ?? [];
  const versions = new Map(exposed.map((operator) => [operator.operatorId, operator.version]));
  const denied = new Set(envelope.deniedOperatorIds);
  const evidence = new Set(envelope.boundEvidenceIds);
  const maximumNodes = envelope.resourceBudget.maxNodes;
  if (typeof maximumNodes === 'number' && graph.nodes.length > maximumNodes) return 'Candidate exceeds the node budget';
  for (const node of graph.nodes) {
    if (denied.has(node.operatorId)) return `Candidate uses denied operator ${node.operatorId}`;
    const version = versions.get(node.operatorId);
    if (!version) return `Candidate uses unknown operator ${node.operatorId}`;
    if (version !== node.operatorVersion) return `Candidate uses the wrong version for ${node.operatorId}`;
    if (node.evidenceIds.some((evidenceId) => !evidence.has(evidenceId))) {
      return `Candidate node ${node.nodeId} cites unbound evidence`;
    }
  }
  return undefined;
}

function validateUsage(usage: PlannerTokenUsageV1): PlannerTokenUsageV1 {
  for (const [name, value] of Object.entries(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Invalid ${name} token count`);
  }
  if ((usage.cachedInputTokens ?? 0) > usage.inputTokens) throw new TypeError('cachedInputTokens exceeds inputTokens');
  return usage;
}

function inspectUsage(usage: PlannerTokenUsageV1 | undefined): {
  usage: PlannerTokenUsageV1;
  error?: string;
} {
  try {
    return { usage: usage ? validateUsage(usage) : zeroUsage() };
  } catch (error) {
    return { usage: zeroUsage(), error: internalErrorDetail(error) };
  }
}

function estimateCost(usage: PlannerTokenUsageV1, pricing: PlannerPricingV1): number {
  const cached = usage.cachedInputTokens ?? 0;
  const uncached = usage.inputTokens - cached;
  const inputCost = uncached * pricing.inputUsdPerMillion
    + cached * (pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion);
  return Number(((inputCost + usage.outputTokens * pricing.outputUsdPerMillion) / 1_000_000).toFixed(12));
}

function zeroUsage(): PlannerTokenUsageV1 {
  return { inputTokens: 0, outputTokens: 0 };
}

function validateTrialConfiguration(trialId: string, pricing: PlannerPricingV1): void {
  if (!trialId.trim()) throw new TypeError('OE-1 trialId is required');
  for (const [name, value] of Object.entries(pricing)) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`Invalid ${name} price`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function internalErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown internal OE-1 failure';
}

function providerThrowDetail(error: unknown): string {
  return `Provider adapter threw ${error instanceof Error ? error.name : 'a non-Error value'}`;
}
