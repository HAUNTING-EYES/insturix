import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import { buildProviderNativeFinishControlSchemaV2R }
  from './provider-native-tool-catalog-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import { SealedHoldoutOwnerSessionV2R } from './sealed-holdout-owner-session-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';
import {
  SealedHoldoutRuntimeBudgetControllerV2R,
  type SealedHoldoutInputTokenBoundV2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
  type SealedHoldoutRuntimeBudgetReceiptV2R,
} from './sealed-holdout-runtime-budget-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_EPISODE_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V2R_2' as const;
export const BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V2R_3' as const;
export const SEALED_HOLDOUT_FINISH_SCHEMA_V2R =
  buildProviderNativeFinishControlSchemaV2R([
    'READY_FOR_PROOF', 'PASS', 'FAIL', 'UNVERIFIABLE', 'CAPABILITY_GAP',
    'CLARIFICATION_REQUIRED', 'POLICY_BLOCKED', 'CONFLICT',
  ]);

export interface SealedHoldoutEpisodeManifestV2R {
  sharedModelContext: Readonly<JsonRecord>;
  sharedModelContextSha256: string;
  cases: readonly Readonly<{
    caseId: string;
    publicCase: Readonly<JsonRecord>;
  }>[];
}

export function buildSealedHoldoutEpisodeContextV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
}): Readonly<ProviderNativeEpisodeContextV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  return buildSealedHoldoutEpisodeContextFromManifestV2R({
    manifest,
    caseId: input.caseId,
    episodeVersion: SEALED_HOLDOUT_EPISODE_VERSION_V2R,
  });
}

export function buildSealedHoldoutEpisodeContextFromManifestV2R(input: {
  manifest: Readonly<SealedHoldoutEpisodeManifestV2R>;
  caseId: string;
  episodeVersion: string;
}): Readonly<ProviderNativeEpisodeContextV2R> {
  const { manifest } = input;
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) fail(`SEALED_HOLDOUT_EPISODE_CASE_MISSING:${input.caseId}`);
  const publicCase = record(taskCase.publicCase);
  const project = record(publicCase.project);
  const shared = record(manifest.sharedModelContext);
  const planningSheet = record(shared.planningToolSheet);
  const resultReferenceSupplements = buildGenericResultReferenceSupplements(shared);
  const unavailableIds = new Set(strings(shared.unavailableOperatorIds));
  const unavailableOperatorRecords = records(planningSheet.operators)
    .filter((operator) => unavailableIds.has(text(operator.operatorId)));
  const context = deepFreezeV1({
    episodeId: `${input.episodeVersion}:${taskCase.caseId}`,
    objective: text(publicCase.request),
    activeTarget: {
      case: taskCase.publicCase,
      unavailableOperatorRecords,
      completeCapabilityContextSha256: manifest.sharedModelContextSha256,
    },
    revisionBinding: {
      projectId: text(project.projectId),
      expectedProjectRevision: text(project.expectedProjectRevision),
    },
    projectState: {
      project: publicCase.project,
      media: publicCase.media,
    },
    evidence: records(publicCase.evidenceAvailability),
    preservationRules: [
      'Preserve every explicit user do-not-change requirement.',
      'Do not infer or fabricate evidence that an owner tool did not return.',
      'Do not claim rendered proof before the isolated proof stage supplies it.',
    ],
    authorityAndPolicy: {
      ...record(publicCase.policy),
      projectAuthority: 'DENIED_RESEARCH_CLONE_ONLY',
      evaluatorKnowledge: 'DENIED',
      unavailableOperationsAreVisibleButNotCallable: true,
      completeCapabilityDossier: {
        sharedModelContextSha256: manifest.sharedModelContextSha256,
        outputHandoffPolicy: 'SCHEMA_DERIVED_SAME_FIELD_PLUS_WRITER_REVISION_V1',
        plannerRecordSupplements: resultReferenceSupplements,
      },
    },
    budget: { maxTurns: 24, maxOutputTokensPerTurn: 4096, maxIdenticalCalls: 2 },
  } satisfies ProviderNativeEpisodeContextV2R);
  assertNoEvaluatorLeakV2(context);
  return context;
}

export function buildBudgetedSealedHoldoutEpisodeContextV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
}): Readonly<ProviderNativeEpisodeContextV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) fail(`SEALED_HOLDOUT_EPISODE_CASE_MISSING:${input.caseId}`);
  const historical = buildSealedHoldoutEpisodeContextV2R({
    manifest, caseId: input.caseId,
  });
  const resourceBudget = record(record(taskCase.publicCase).resourceBudget);
  const maxNodes = positiveInteger(resourceBudget.maxNodes, 'SEALED_MAX_NODES_INVALID');
  const maxOutputTokens = positiveInteger(
    resourceBudget.maxOutputTokens,
    'SEALED_MAX_OUTPUT_TOKENS_INVALID',
  );
  const context = deepFreezeV1({
    ...historical,
    episodeId: `${BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V2R}:${taskCase.caseId}`,
    budget: {
      maxTurns: Math.min(32, maxNodes + 3),
      maxOutputTokensPerTurn: Math.min(4096, maxOutputTokens),
      maxIdenticalCalls: historical.budget.maxIdenticalCalls,
    },
  } satisfies ProviderNativeEpisodeContextV2R);
  assertNoEvaluatorLeakV2(context);
  return context;
}

export interface BudgetedSealedHoldoutEpisodeReceiptV2R {
  version: typeof BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_BUDGETED_NO_PROJECT_MUTATION';
  manifestSha256: string;
  caseId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  runtimeBudget: Readonly<SealedHoldoutRuntimeBudgetReceiptV2R>;
  receiptSha256: string;
}

export function assertBudgetedSealedHoldoutEpisodeReceiptV2R(
  value: unknown,
): Readonly<BudgetedSealedHoldoutEpisodeReceiptV2R> {
  if (!isRecord(value)) fail('BUDGETED_SEALED_HOLDOUT_EPISODE_RECEIPT_MISSING');
  const candidate = value as unknown as BudgetedSealedHoldoutEpisodeReceiptV2R;
  const { receiptSha256, ...material } = candidate;
  const { receiptSha256: providerReceiptSha256, ...providerMaterial } =
    candidate.providerEpisode;
  const { receiptSha256: budgetReceiptSha256, ...budgetMaterial } =
    candidate.runtimeBudget;
  const terminal = candidate.providerEpisode.terminal.disposition;
  const expectedBudgetAssessment = terminal === 'RESOURCE_ACCOUNTING_UNVERIFIABLE'
    ? 'ACCOUNTING_UNVERIFIABLE'
    : terminal === 'RESOURCE_BUDGET_EXHAUSTED'
      ? 'BUDGET_EXHAUSTED'
      : 'ACCOUNTED_WITHIN_BUDGET';
  if (candidate.version !== BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V2R
    || candidate.authority !== 'RESEARCH_ONLY_BUDGETED_NO_PROJECT_MUTATION'
    || !/^[a-f0-9]{64}$/.test(candidate.manifestSha256)
    || !candidate.caseId.trim()
    || providerReceiptSha256 !== hashCanonicalJsonV1(providerMaterial)
    || budgetReceiptSha256 !== hashCanonicalJsonV1(budgetMaterial)
    || candidate.runtimeBudget.episodeTerminalDisposition !== terminal
    || candidate.runtimeBudget.assessment !== expectedBudgetAssessment
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('BUDGETED_SEALED_HOLDOUT_EPISODE_RECEIPT_DRIFT');
  }
  return deepFreezeV1(structuredClone(candidate));
}

export async function runBudgetedSealedHoldoutEpisodeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
  countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  operatorPresentationOrder?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
  executeIsolated?: (call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>) => Promise<Readonly<ProviderNativeToolExecutionV2R>>;
}): Promise<Readonly<BudgetedSealedHoldoutEpisodeReceiptV2R>> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) fail(`SEALED_HOLDOUT_EPISODE_CASE_MISSING:${input.caseId}`);
  const expected = strings(record(manifest.sharedModelContext).callableOperatorIds);
  const operatorOrder = input.operatorPresentationOrder ?? expected;
  if (!sameSet(operatorOrder, expected)) fail('SEALED_HOLDOUT_EPISODE_OPERATOR_SET_DRIFT');
  const ownerSession = input.executeIsolated ? null : new SealedHoldoutOwnerSessionV2R({
    manifest, caseId: input.caseId,
  });
  const runtimeBudget = new SealedHoldoutRuntimeBudgetControllerV2R({
    publicCase: taskCase.publicCase,
    publicCaseSha256: taskCase.publicCaseSha256,
    manifestSha256: manifest.manifestSha256,
    route: input.route,
    authorization: input.authorization,
    countInputTokens: input.countInputTokens,
  });
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildBudgetedSealedHoldoutEpisodeContextV2R({
      manifest, caseId: input.caseId,
    }),
    eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: input.argumentHandoffMode,
    finishInputSchema: SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
    additionalInstructions: [
      'All forty planning records are represented: callable operations are tools; unavailable records are context-only and must never be fabricated as calls.',
      'Use POLICY_BLOCKED only when supplied rights, privacy, egress, or security policy forbids the required action.',
      'The opaque C1/C2 label carries no semantic meaning. Base every choice on the request and returned tool evidence.',
    ],
    invoke: input.invoke,
    runtimeGuard: runtimeBudget,
    executeIsolated: input.executeIsolated ?? ((call) => ownerSession!.execute(call)),
  });
  const budgetReceipt = runtimeBudget.receipt(providerEpisode.terminal.disposition);
  const material = {
    version: BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_BUDGETED_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    providerEpisode,
    runtimeBudget: budgetReceipt,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function runSealedHoldoutEpisodeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  operatorPresentationOrder?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
  executeIsolated?: (call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>) => Promise<Readonly<ProviderNativeToolExecutionV2R>>;
}): Promise<Readonly<ProviderNativeEpisodeReceiptV2R>> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const expected = strings(record(manifest.sharedModelContext).callableOperatorIds);
  const operatorOrder = input.operatorPresentationOrder ?? expected;
  if (!sameSet(operatorOrder, expected)) fail('SEALED_HOLDOUT_EPISODE_OPERATOR_SET_DRIFT');
  const ownerSession = input.executeIsolated ? null : new SealedHoldoutOwnerSessionV2R({
    manifest, caseId: input.caseId,
  });
  return runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildSealedHoldoutEpisodeContextV2R({ manifest, caseId: input.caseId }),
    eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: input.argumentHandoffMode,
    finishInputSchema: SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
    additionalInstructions: [
      'All forty planning records are represented: callable operations are tools; unavailable records are context-only and must never be fabricated as calls.',
      'Use POLICY_BLOCKED only when supplied rights, privacy, egress, or security policy forbids the required action.',
      'The opaque C1/C2 label carries no semantic meaning. Base every choice on the request and returned tool evidence.',
    ],
    invoke: input.invoke,
    executeIsolated: input.executeIsolated ?? ((call) => ownerSession!.execute(call)),
  });
}

function buildGenericResultReferenceSupplements(shared: JsonRecord): readonly JsonRecord[] {
  const callableIds = new Set(strings(shared.callableOperatorIds));
  const operators = records(record(shared.operatorCatalog).operators)
    .filter((operator) => callableIds.has(text(operator.operatorId)));
  const downstreamInputFields = new Set(operators.flatMap(
    (operator) => strings(record(operator.input).fields),
  ));
  const origins = operators.flatMap((source) => {
    const operatorId = text(source.operatorId);
    const outputFields = strings(record(source.output).fields);
    const sameFieldOrigins = outputFields
      .filter((field) => downstreamInputFields.has(field))
      .map((outputField) => ({ origin: 'OPERATOR_OUTPUT', operatorId, outputField }));
    return outputFields.includes('receipt') && downstreamInputFields.has('expectedProjectRevision')
      ? [...sameFieldOrigins, {
          origin: 'OPERATOR_OUTPUT', operatorId,
          outputField: 'receipt.projectRevision',
        }]
      : sameFieldOrigins;
  });
  const inputOrigins = Object.fromEntries(origins.map((origin, index) => [
    `schemaDerivedOrigin${index + 1}`, [origin],
  ]));
  return [{ selectableOperatorId: 'SCHEMA_DERIVED_HANDOFF', inputOrigins }];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(code);
  return Number(value);
}
