import { createHash } from 'node:crypto';

export const OE1_CONDITION_IDS = [
  'C0_SIGNATURES_ONLY',
  'C1_FULL_OPERATOR_SPECS',
  'C2_REVIEWED_KNOWLEDGE',
  'C3_UNRELATED_FORMAT_EXAMPLE',
  'C4_NOISY_OR_MISSING_EVIDENCE',
  'C5_CAPABILITY_GAP',
] as const;

export type PlannerConditionIdV1 = (typeof OE1_CONDITION_IDS)[number];
export type JsonValueV1 = null | boolean | number | string | JsonValueV1[] | {
  [key: string]: JsonValueV1;
};

export interface EvidenceBindingV1 {
  evidenceId: string;
  kind: string;
  binding: string;
  value: unknown;
}

export interface PlannerEnvelopeSourceV1 {
  projectId: string;
  projectRevision: string;
  actorScope: string;
  tenantScope: string;
  allowedOperatorIds: string[];
  deniedOperatorIds: string[];
  boundEvidenceIds: string[];
  rightsPolicy: string;
  privacyPolicy: string;
  networkPolicy: string;
  resourceBudget: Record<string, unknown>;
  preservationPredicates: string[];
  expiresAt: string;
}

export interface PlannerTaskFixtureV1 {
  taskId: string;
  version: string;
  project: Record<string, unknown> & {
    projectId: string;
    projectRevision: string;
  };
  behaviourBrief: Record<string, unknown>;
  evidence: EvidenceBindingV1[];
  conditionEvidence: {
    C4_NOISY_OR_MISSING_EVIDENCE: {
      omitEvidenceIds: string[];
      replaceEvidence: EvidenceBindingV1[];
    };
  };
  plannerEnvelope: PlannerEnvelopeSourceV1;
  eligibleDistractorIds: string[];
  revisionScenario?: {
    type: string;
    currentProjectRevision: string;
    plannerEnvelopeRevision: string;
    requiredDisposition: string;
  };
}

export interface OperatorSpecV1 extends Record<string, unknown> {
  operatorId: string;
  version: string;
  kind: string;
  plannerEligibility: string;
  inputPorts: string[];
  outputPorts: string[];
}

export interface OperatorCatalogV1 {
  version: string;
  operators: OperatorSpecV1[];
}

export interface KnowledgeEntryV1 extends Record<string, unknown> {
  entryId: string;
  version: string;
  applicableOperatorIds: string[];
  authority: string;
  reviewStatus: string;
}

export interface BenchmarkContractV1 {
  version: string;
  schemas: {
    candidateGraphV1: Record<string, unknown>;
  };
  knowledgeSelectionContract: {
    maximumEntries: number;
  };
  unrelatedFormatExample: Record<string, unknown>;
}

export interface MaterializedPlannerEnvelopeV1 extends PlannerEnvelopeSourceV1 {
  projectFacts: Record<string, unknown>;
  evidenceBindings: EvidenceBindingV1[];
  missingEvidenceIds: string[];
}

export interface OperatorSignatureV1 {
  operatorId: string;
  version: string;
  kind: string;
  inputPorts: string[];
  outputPorts: string[];
}

export interface PlannerPacketV1 {
  packetVersion: 'OE1_PLANNER_PACKET_V1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  benchmarkContractVersion: string;
  taskId: string;
  taskVersion: string;
  conditionId: PlannerConditionIdV1;
  envelopeHash: string;
  operatorCatalogVersion: string;
  knowledgeEntryVersions: Array<{ entryId: string; version: string }>;
  candidateGraphSchemaHash: string;
  behaviourBrief: Record<string, unknown>;
  materializedPlannerEnvelope: MaterializedPlannerEnvelopeV1;
  candidateGraphOutputContract: Record<string, unknown>;
  operatorNamesAndPorts?: OperatorSignatureV1[];
  fullAllowedOperatorSpecs?: OperatorSpecV1[];
  relevantReviewedKnowledgeEntries?: KnowledgeEntryV1[];
  oneUnrelatedGraphForOutputFormatting?: Record<string, unknown>;
}

export interface MaterializedPlannerPacketArtifactV1 {
  packet: PlannerPacketV1;
  packetHash: string;
}

export interface CandidateGraphNodeV1 {
  nodeId: string;
  operatorId: string;
  operatorVersion: string;
  inputs: Record<string, unknown>;
  evidenceIds: string[];
  expectedOutputs: Record<string, unknown>;
  expectedStateEffects: unknown[];
  failureDisposition: string;
}

export interface CandidateGraphEdgeV1 {
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

export interface CandidateGraphV1 extends Record<string, unknown> {
  graphId: string;
  taskId: string;
  envelopeHash: string;
  projectRevision: string;
  nodes: CandidateGraphNodeV1[];
  edges: CandidateGraphEdgeV1[];
  expectedOutcome: string;
  preservationClaims: string[];
  clarifications: unknown[];
  declines: unknown[];
}

export type ProviderDispositionV1 =
  | 'SUCCESS'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_REFUSAL'
  | 'PROVIDER_CANCELLED'
  | 'PROVIDER_ERROR';

export interface PlannerTokenUsageV1 {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type PlannerProviderResultV1 =
  | { disposition: 'SUCCESS'; text: string; usage: PlannerTokenUsageV1 }
  | { disposition: Exclude<ProviderDispositionV1, 'SUCCESS'>; usage?: PlannerTokenUsageV1; detail?: string };

export interface PlannerProviderAdapterV1 {
  provider: string;
  modelSnapshot: string;
  reasoningMode: string;
  invoke(input: {
    prompt: string;
    promptHash: string;
    envelopeHash: string;
    signal?: AbortSignal;
  }): Promise<PlannerProviderResultV1>;
}

export interface PlannerPricingV1 {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
}

export interface PlannerTrialRecordV1 {
  trialId: string;
  taskId: string;
  conditionId: PlannerConditionIdV1;
  provider: string;
  modelSnapshot: string;
  reasoningMode: string;
  packetHash: string;
  promptTemplateHash: string;
  promptHash: string;
  envelopeHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedModelCostUsd: number;
  rawResponseHash: string;
  providerDisposition: ProviderDispositionV1;
  parseDisposition: string;
  verifierDisposition: 'NOT_RUN_OE1';
  renderDisposition: 'NOT_RUN_OE1';
  judgeDisposition: 'NOT_RUN_OE1';
  accepted: false;
  failureDetail?: string;
  candidateGraph?: CandidateGraphV1;
}

export function canonicalizeJsonV1(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>());
}

export function cloneCanonicalJsonV1<T>(value: T): T {
  return JSON.parse(canonicalizeJsonV1(value)) as T;
}

export function hashCanonicalJsonV1(value: unknown): string {
  return sha256TextV1(canonicalizeJsonV1(value));
}

export function sha256TextV1(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function deepFreezeV1<T>(value: T): Readonly<T> {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeV1(child);
  return Object.freeze(value);
}

function serializeCanonical(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('EDITRON_CANONICAL_JSON_V1 requires finite numbers and forbids negative zero');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`EDITRON_CANONICAL_JSON_V1 cannot serialize ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError('EDITRON_CANONICAL_JSON_V1 forbids cycles');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = Array.from({ length: value.length }, (_, index) => {
        if (!(index in value)) throw new TypeError('EDITRON_CANONICAL_JSON_V1 forbids sparse arrays');
        return serializeCanonical(value[index], seen);
      });
      return `[${entries.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('EDITRON_CANONICAL_JSON_V1 accepts only plain objects');
    }
    const normalized = Object.keys(value as Record<string, unknown>).map((key) => ({
      source: key,
      normalized: key.normalize('NFC'),
    }));
    if (new Set(normalized.map(({ normalized: key }) => key)).size !== normalized.length) {
      throw new TypeError('EDITRON_CANONICAL_JSON_V1 rejects keys that collide after NFC normalization');
    }
    normalized.sort((left, right) => left.normalized < right.normalized ? -1 : left.normalized > right.normalized ? 1 : 0);
    const object = value as Record<string, unknown>;
    return `{${normalized.map(({ source, normalized: key }) =>
      `${JSON.stringify(key)}:${serializeCanonical(object[source], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}
