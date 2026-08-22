import { beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  issueStage25RouteAblationPaidAuthorizationV1,
  type Stage25RouteAblationPaidAuthorizationV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-paid-authorization-v1';
import { buildStage25RouteAblationProviderManifestV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1';
import {
  preflightStage25RouteAblationProvidersV1,
  type Stage25RouteAblationPreflightReceiptV1,
  type Stage25RouteAblationRequestCaptureV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1';
import {
  runStage25RouteAblationPaidCohortV1,
  type Stage25RouteAblationPaidRowResultV1,
}
  from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-paid-runner-v1';
import { stage25RouteAblationTargetClaimIdsV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-v1';

type JsonRecord = Record<string, unknown>;
const environment = {
  OPENAI_API_KEY: 'unit-openai-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'unit-google-secret',
};
const manifest = buildStage25RouteAblationProviderManifestV1();
let preflight: Stage25RouteAblationPreflightReceiptV1;
let captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
let authorization: Readonly<Stage25RouteAblationPaidAuthorizationV1>;

describe('Stage 2.5 route-ablation paid Stage-2 runner V1', () => {
  beforeAll(async () => {
    const result = await preflightStage25RouteAblationProvidersV1({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: preflightFetch,
    });
    preflight = result.receipt;
    captures = result.requestCaptures;
    authorization = issueStage25RouteAblationPaidAuthorizationV1({
      manifest, preflight, captures, approval: approval(),
    });
  });

  it('runs all 24 rows once, evaluates them, and persists no authority or secret', async () => {
    const fetchImpl = vi.fn(inferenceFetch);
    const completed: unknown[] = [];
    const result = await runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      fetchImpl, now: '2026-08-22T12:00:00.000Z',
      onRowCompleted: async (row) => { completed.push(row); },
    });
    expect(result.rows).toHaveLength(24);
    expect(completed).toHaveLength(24);
    expect(fetchImpl).toHaveBeenCalledTimes(24);
    expect(result.receipt).toMatchObject({
      rows: 24, providerInferenceCalls: 24, googleRepairCountTokensCalls: 0,
      runDispositions: { ARTIFACT_ACCEPTED: 24 },
      hiddenEvaluationDispositions: { HONEST_CAPABILITY_GAP: 24 },
      rowsWithUnverifiableCost: 0, projectReads: 0, projectMutations: 0,
    });
    expect(JSON.stringify(result)).not.toContain(environment.OPENAI_API_KEY);
    expect(JSON.stringify(result)).not.toContain(environment.GOOGLE_GENERATIVE_AI_API_KEY);
  });

  it('resumes completed rows without duplicate provider calls', async () => {
    const first = await runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      fetchImpl: inferenceFetch, now: '2026-08-22T12:00:00.000Z',
    });
    const fetchImpl = vi.fn(async () => { throw new Error('DUPLICATE_INFERENCE'); });
    const resumed = await runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      completedRows: first.rows, fetchImpl, now: '2026-08-22T12:01:00.000Z',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resumed.receipt.receiptSha256).toBe(first.receipt.receiptSha256);

    const { resultSha256: _oldHash, ...baseMaterial } = structuredClone(first.rows[0]);
    const material = {
      ...baseMaterial,
      evaluation: { ...baseMaterial.evaluation, diagnostics: ['FORGED_PASS'] },
    };
    const forged = ({ ...material, resultSha256: hashCanonicalJsonV1(material) }) as
      Stage25RouteAblationPaidRowResultV1;
    await expect(runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      completedRows: [forged, ...first.rows.slice(1)], fetchImpl,
      now: '2026-08-22T12:01:00.000Z',
    })).rejects.toThrow('STAGE25_ROUTE_PAID_RESUME_ROW_INVALID');

    const { resultSha256: _oldCountHash, ...countMaterial } = structuredClone(first.rows[0]);
    const forgedCountMaterial = { ...countMaterial, providerInferenceCalls: 2 };
    const forgedCount = ({
      ...forgedCountMaterial,
      resultSha256: hashCanonicalJsonV1(forgedCountMaterial),
    }) as Stage25RouteAblationPaidRowResultV1;
    await expect(runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      completedRows: [forgedCount, ...first.rows.slice(1)], fetchImpl,
      now: '2026-08-22T12:01:00.000Z',
    })).rejects.toThrow('STAGE25_ROUTE_PAID_RESUME_ROW_INVALID');
  });

  it('rejects forged capture and authorization bindings', async () => {
    const forgedCaptures = [...captures];
    forgedCaptures[0] = { ...forgedCaptures[0], boundedInputTokens: 1 };
    expect(() => issueStage25RouteAblationPaidAuthorizationV1({
      manifest, preflight, captures: forgedCaptures, approval: approval(),
    })).toThrow('STAGE25_ROUTE_PREFLIGHT_BUNDLE_INVALID');
    await expect(runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization: ({
        ...authorization, projectReadsAuthorized: 1,
      } as unknown as Stage25RouteAblationPaidAuthorizationV1),
      environment, fetchImpl: inferenceFetch, now: '2026-08-22T12:00:00.000Z',
    })).rejects.toThrow('STAGE25_ROUTE_PAID_AUTHORIZATION_INVALID');
  });

  it('rejects provider identity drift', async () => {
    await expect(runStage25RouteAblationPaidCohortV1({
      manifest, preflight, captures, authorization, environment,
      fetchImpl: async (url, init) => {
        const response = await inferenceFetch(url, init);
        const body = await response.json() as JsonRecord;
        if (String(url).endsWith('/responses')) body.model = 'gpt-5.6-wrong';
        return json(body);
      },
      now: '2026-08-22T12:00:00.000Z',
    })).rejects.toThrow('STAGE25_ROUTE_PAID_PROVIDER_IDENTITY_DRIFT');
  });
});

function approval() {
  return {
    operatorId: 'admin', approvedAt: '2026-08-22T10:00:00.000Z',
    expiresAt: '2026-08-23T10:00:00.000Z',
    confirmedManifestSha256: manifest.manifestSha256,
    confirmedPreflightReceiptSha256: preflight.receiptSha256,
    confirmedRequestCaptureSetSha256: preflight.requestCaptureSetSha256,
    executeConfirmation: 'YES_I_CONFIRM_24_STAGE25_ROUTE_ROWS' as const,
    confirmedMaxSpendUsd: '33.60' as const,
  };
}

async function preflightFetch(url: URL | RequestInfo): Promise<Response> {
  const target = String(url);
  if (target.includes('/v1/models/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (target.includes('/v1/models/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (target.includes('/v1beta/models/gemini-3.7-flash') && !target.endsWith(':countTokens')) {
    return json({ name: 'models/gemini-3.7-flash' });
  }
  if (target.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected' }, 500);
}

async function inferenceFetch(url: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body)) as JsonRecord;
  const promptText = String(url).endsWith('/responses')
    ? String((((body.input as JsonRecord[])[0].content as JsonRecord[])[0]).text)
    : String((((body.contents as JsonRecord[])[0].parts as JsonRecord[])[0]).text);
  const prompt = JSON.parse(promptText) as JsonRecord;
  const packet = prompt.packet as JsonRecord;
  const scope = ((packet.modelInput as JsonRecord).routeAblationScope as JsonRecord);
  const artifact = gapArtifact(String(scope.scopeId), String(scope.arm));
  const model = String(url).endsWith('/responses') ? String(body.model) : 'gemini-3.7-flash';
  if (String(url).endsWith('/responses')) return json({
    id: `resp-${hashCanonicalJsonV1(artifact).slice(0, 12)}`, model,
    status: 'completed', system_fingerprint: 'unit',
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(artifact) }] }],
    usage: { input_tokens: 1_000, output_tokens: 500, total_tokens: 1_500,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 } },
  });
  return json({
    responseId: `resp-${hashCanonicalJsonV1(artifact).slice(0, 12)}`,
    modelVersion: model,
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(artifact) }] } }],
    usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 500,
      thoughtsTokenCount: 0, totalTokenCount: 1_500 },
  });
}

function gapArtifact(scopeId: string, arm: string): JsonRecord {
  const typedScope = scopeId as Parameters<typeof stage25RouteAblationTargetClaimIdsV1>[0];
  const claimIds = stage25RouteAblationTargetClaimIdsV1(typedScope);
  const form = arm === 'FORCED_NATIVE' ? 'NATIVE'
    : arm === 'FORCED_GENERATED_COMPOSITION' ? 'GENERATED_COMPOSITION'
    : arm === 'FORCED_HYBRID' ? 'HYBRID'
    : scopeId === 'DEV02_BOUNDED_FILMSTRIP_ISLAND' ? 'GENERATED_COMPOSITION' : 'HYBRID';
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-02', executionForm: 'CAPABILITY_GAP',
    routeDecision: {
      scopeClassification: 'CAPABILITY_GAP', coverageStatus: 'INCOMPLETE',
      candidateForms: [{ form, hardGateStatus: 'INELIGIBLE',
        claimCoverage: claimIds.map((claimId) => ({ claimId, status: 'UNCOVERED',
          ownerRefs: [], reasonCodes: ['CAPABILITY_NOT_AVAILABLE'] })),
        representabilitySignals: [], blockers: ['CAPABILITY_NOT_AVAILABLE'], ownerRefs: [], evidenceIds: [] }],
      selectedReasonCodes: ['HONEST_CAPABILITY_GAP'], generatedIslandClaimIds: [], nativeSurroundClaimIds: [],
    },
    nodes: [{ intentNodeId: 'node-capability-gap', operationFamily: 'route_baseline',
      targetClaimIds: claimIds, selectedOperatorId: null,
      alternativeOperatorIds: form === 'NATIVE' ? ['set_keyframes'] : ['generated_composition_program'],
      executionForm: form === 'NATIVE' ? 'NATIVE' : 'GENERATED_COMPOSITION', requiresNodeIds: [],
      invalidates: [], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'CAPABILITY_GAP' }],
    edges: [], preservationIntents: [], unresolvedRequirements: [{
      requirementId: 'route-owner-missing', kind: 'CAPABILITY',
      detail: 'No currently eligible owner covers the forced baseline.',
      targetClaimIds: claimIds, disposition: 'CAPABILITY_GAP',
    }],
  };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
