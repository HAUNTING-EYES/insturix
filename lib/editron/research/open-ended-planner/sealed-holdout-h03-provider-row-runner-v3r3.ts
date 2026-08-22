import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  runGeneratedCompositionSourceProviderCallV1,
  type GeneratedCompositionProviderCallV1,
} from './generated-composition-model-benchmark-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { ProviderNativeCohortRouteV2R }
  from './provider-native-cohort-manifest-v2r';
import { generateSealedH03ProviderSourceV3R2 }
  from './sealed-holdout-h03-provider-source-adapter-v3r2';
import type { SealedH03ProviderCohortManifestV3R3 }
  from './sealed-holdout-h03-provider-cohort-v3r3';
import type { SealedH03ProviderSourceRequestV3R3 }
  from './sealed-holdout-h03-provider-preflight-v3r3';
import { proveSealedHoldoutH03HybridOutcomeV3R2 }
  from './sealed-holdout-h03-hybrid-proof-v3r2';
import { runSealedHoldoutH03ConnectedEpisodeV3R2 }
  from './sealed-holdout-episode-v3r2';
import { evaluateSealedHoldoutH03TraceV3R3 }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import { buildSealedHoldoutSelectedOperationTraceV3R2 }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type CohortRow = SealedH03ProviderCohortManifestV3R3['rows'][number];
type BudgetArm = SealedH03ProviderCohortManifestV3R3['budgetArms'][number];
type ProveInput = Parameters<typeof proveSealedHoldoutH03HybridOutcomeV3R2>[0];

export const SEALED_H03_PROVIDER_ROW_VERSION_V3R3 =
  'EDITRON_OE_SEALED_H03_PROVIDER_ROW_V3R3_1' as const;

export async function runSealedH03ProviderRowV3R3(input: Readonly<{
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  cohortManifest: Readonly<SealedH03ProviderCohortManifestV3R3>;
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  row: Readonly<CohortRow>;
  sourceRequest: Readonly<SealedH03ProviderSourceRequestV3R3>;
  environment: Readonly<Record<string, string | undefined>>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  executionId: string;
  createdAt: string;
  sandboxEnvironment: ProveInput['sandboxEnvironment'];
  repoRoot: string;
  runProviderCall?: typeof runGeneratedCompositionSourceProviderCallV1;
  sandboxExecutor?: ProveInput['sandboxExecutor'];
}>) {
  const arm = input.cohortManifest.budgetArms.find(({ armId }) => (
    armId === input.row.armId
  ));
  if (!arm || input.row.routeId !== input.routeEntry.route.routeId) {
    fail('SEALED_H03_PROVIDER_ROW_ROUTE_OR_ARM_DRIFT');
  }
  const budgeted = createBudgetedH03SourceGeneratorV3R3({
    arm,
    routeEntry: input.routeEntry,
    environment: input.environment,
    ...(input.runProviderCall ? { runProviderCall: input.runProviderCall } : {}),
  });
  let turn = 0;
  const connected = await runSealedHoldoutH03ConnectedEpisodeV3R2({
    manifest: input.baseManifest,
    caseId: 'HOLD-03:C1',
    route: input.routeEntry.route,
    apiImplementationHash: input.sourceRequest.apiImplementationHash,
    generateSource: budgeted.generateSource,
    invoke: async () => scriptedOwnerResponse(
      input.routeEntry.route,
      ++turn,
      input.sourceRequest.arguments,
    ),
  });
  const accounting = budgeted.snapshot();
  assertAccounting(input.row, arm, accounting);
  let proof: Awaited<ReturnType<typeof proveSealedHoldoutH03HybridOutcomeV3R2>> | null = null;
  let disposition: 'PASS_RENDERED' | 'SOURCE_NOT_ACCEPTED' | 'PROOF_UNVERIFIABLE' =
    'SOURCE_NOT_ACCEPTED';
  let failureDiagnostic: string | null = null;
  let traceSha256: string | null = null;
  let evaluationSha256: string | null = null;
  if (connected.disposition === 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF') {
    const accepted = connected.generatedCandidate
      ?? fail('SEALED_H03_PROVIDER_ROW_ACCEPTED_SOURCE_MISSING');
    if (accepted.orchestratorArgumentsSha256 !== input.sourceRequest.orchestratorSpecSha256
      || accepted.ownerAuthorizationOutputSha256
        !== input.sourceRequest.ownerAuthorizationOutputSha256) {
      fail('SEALED_H03_PROVIDER_ROW_SOURCE_LINEAGE_DRIFT');
    }
    try {
      const trace = buildSealedHoldoutSelectedOperationTraceV3R2({
        manifest: input.baseManifest,
        caseId: 'HOLD-03:C1',
        providerEpisode: connected.providerEpisode,
      });
      const evaluation = evaluateSealedHoldoutH03TraceV3R3({
        manifest: input.baseManifest,
        caseId: 'HOLD-03:C1',
        trace,
        connectedEpisode: connected,
      });
      traceSha256 = trace.artifactSha256;
      evaluationSha256 = evaluation.receiptSha256;
      proof = await proveSealedHoldoutH03HybridOutcomeV3R2({
        manifest: input.baseManifest,
        caseId: 'HOLD-03:C1',
        connectedEpisode: connected,
        trace,
        evaluation,
        mediaManifest: input.mediaManifest,
        outputDirectory: input.outputDirectory,
        executionId: input.executionId,
        createdAt: input.createdAt,
        sandboxEnvironment: input.sandboxEnvironment,
        repoRoot: input.repoRoot,
        ...(input.sandboxExecutor ? { sandboxExecutor: input.sandboxExecutor } : {}),
      });
      disposition = 'PASS_RENDERED';
    } catch (error) {
      disposition = 'PROOF_UNVERIFIABLE';
      failureDiagnostic = boundedError(error);
    }
  }
  const material = {
    version: SEALED_H03_PROVIDER_ROW_VERSION_V3R3,
    authority: 'RESEARCH_PROVIDER_SANDBOX_ROW_NO_PROJECT_MUTATION' as const,
    rowId: String(input.row.rowId),
    routeId: String(input.row.routeId),
    armId: String(input.row.armId),
    repetition: Number(input.row.repetition),
    manifestSha256: input.cohortManifest.manifestSha256,
    disposition,
    providerEpisodeReceiptSha256: connected.providerEpisode.receiptSha256,
    connectedEpisodeReceiptSha256: connected.receiptSha256,
    traceArtifactSha256: traceSha256,
    evaluationReceiptSha256: evaluationSha256,
    proofReceiptSha256: proof?.receiptSha256 ?? null,
    renderedAssessment: proof?.assessment ?? null,
    outputVideoSha256: proof?.outputArtifact.sha256 ?? null,
    failureDiagnostic,
    accounting,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    receipt: { ...material, receiptSha256: hashCanonicalJsonV1(material) },
    providerCalls: budgeted.providerCalls(),
    proof,
  });
}

export function createBudgetedH03SourceGeneratorV3R3(input: Readonly<{
  arm: Readonly<BudgetArm>;
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  runProviderCall?: typeof runGeneratedCompositionSourceProviderCallV1;
}>) {
  const calls: Readonly<GeneratedCompositionProviderCallV1>[] = [];
  const indeterminateProviderFailures: string[] = [];
  const generateSource = async (
    request: Parameters<typeof generateSealedH03ProviderSourceV3R2>[0]['request'],
  ) => {
    if (request.candidateOrdinal >= input.arm.maximumSourceCandidates
      || (request.repair && input.arm.maximumVerifierRepairs < 1)) {
      fail(`SEALED_H03_ARM_BUDGET_EXHAUSTED_BEFORE_PROVIDER:${input.arm.armId}`);
    }
    return generateSealedH03ProviderSourceV3R2({
      routeEntry: input.routeEntry,
      environment: input.environment,
      request,
      runProviderCall: async (providerInput) => {
        try {
          const call = await (input.runProviderCall
            ?? runGeneratedCompositionSourceProviderCallV1)(providerInput);
          calls.push(call);
          return call;
        } catch (error) {
          indeterminateProviderFailures.push(boundedError(error));
          throw error;
        }
      },
    });
  };
  return {
    generateSource,
    providerCalls: () => deepFreezeV1([...calls]),
    snapshot: () => accounting(calls, indeterminateProviderFailures, input.arm),
  };
}

function accounting(
  calls: readonly Readonly<GeneratedCompositionProviderCallV1>[],
  indeterminateFailures: readonly string[],
  arm: Readonly<BudgetArm>,
) {
  const attempts = calls.flatMap(({ run }) => run.attempts);
  const material = {
    providerGeneratedCandidates: calls.length + indeterminateFailures.length,
    providerHttpAttempts: attempts.length + (
      indeterminateFailures.length * arm.maximumTransportAttemptsPerCandidate
    ),
    actualSpendUsd: roundUsd(attempts.reduce(
      (sum, attempt) => sum + Number(attempt.providerCostUsd ?? 0), 0,
    )),
    accountingDisposition: indeterminateFailures.length
      ? 'MAXIMUM_HTTP_ATTEMPTS_RESERVED_FOR_INDETERMINATE_PROVIDER_FAILURE'
      : 'EXACT_FROM_PROVIDER_RECEIPTS',
    indeterminateProviderFailures: indeterminateFailures.map((message) =>
      hashCanonicalJsonV1({ message })),
    callReceiptSha256s: calls.map((call) => hashCanonicalJsonV1(call)),
    dispositions: attempts.map(({ disposition }) => disposition),
  };
  return deepFreezeV1({ ...material, accountingSha256: hashCanonicalJsonV1(material) });
}

function assertAccounting(row: Readonly<CohortRow>, arm: Readonly<BudgetArm>, value: ReturnType<typeof accounting>): void {
  if (value.providerGeneratedCandidates > arm.maximumSourceCandidates
    || value.providerHttpAttempts > Number(row.maximumProviderHttpRequests)
    || value.actualSpendUsd > Number(row.absoluteMaxRowSpendUsd) + 0.000001) {
    fail('SEALED_H03_PROVIDER_ROW_ACCOUNTING_LIMIT_EXCEEDED');
  }
}

function scriptedOwnerResponse(
  route: Readonly<ProviderNativeCohortRouteV2R['route']>,
  turn: number,
  generatedArguments: Readonly<JsonRecord>,
) {
  const selected = turn === 1
    ? ['visual', 'find_visual_moment', { projectId: 'oe-hold-03', query: 'resolve reference layout', evidenceIds: ['E1', 'E2'] }]
    : turn === 2
      ? ['timeline', 'get_timeline_view', { projectId: 'oe-hold-03', expectedProjectRevision: 'R12' }]
      : turn === 3
        ? ['generated', 'generated_composition_program', generatedArguments]
        : ['finish', 'finish_editron_research_episode', {
          disposition: 'READY_FOR_PROOF', reasonCodes: ['OWNER_AUTHORIZED_SOURCE_SYNTHESIS'],
          evidenceIds: ['E1', 'E2', 'E3'], summary: 'Owner-authorized source ready for proof',
        }];
  const [callId, name, args] = selected as [string, string, JsonRecord];
  return route.provider === 'openai'
    ? { status: 200, body: { id: `h03-${callId}`, model: route.model, status: 'completed',
        output: [{ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) }] } }
    : { status: 200, body: { id: `h03-${callId}`, model: route.model, status: 'completed',
        steps: [{ type: 'function_call', id: callId, name, arguments: args }] } };
}

function roundUsd(value: number): number { return Number(value.toFixed(9)); }
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
    || 'SEALED_H03_PROVIDER_ROW_PROOF_UNVERIFIABLE';
}
function fail(code: string): never { throw new Error(code); }
