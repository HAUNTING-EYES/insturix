import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import { evaluateSealedHoldoutH03TraceV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import { runSealedHoldoutH03ConnectedEpisodeV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r2';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';
import {
  buildSealedHoldoutSelectedOperationTraceV3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

describe('sealed H03 lossless model-source trace and hidden evaluator V3R2', () => {
  it('binds verified source hashes without exposing raw TSX to the trace', async () => {
    const { manifest, connected } = await setup();
    const trace = buildSealedHoldoutSelectedOperationTraceV3R2({
      manifest, caseId: 'HOLD-03:C1', providerEpisode: connected.providerEpisode,
    });
    const evaluation = evaluateSealedHoldoutH03TraceV3R3({
      manifest, caseId: 'HOLD-03:C1', trace, connectedEpisode: connected,
    });
    const generated = trace.nodes.find(({ selectedOperatorId }) =>
      selectedOperatorId === 'generated_composition_program');
    expect(trace).toMatchObject({ assessment: 'PASS', diagnostics: [], stateEffects: [] });
    expect(generated?.generatedSourceBinding).toMatchObject({
      candidateOrdinal: 0,
      sourceContractStatus: 'CONTRACT_VERIFIED',
      modelId: 'contract-test-model',
      renderStatus: 'READY_FOR_BOUNDED_PROXY_RENDER',
      projectMutation: 'NONE',
    });
    expect(JSON.stringify(trace)).not.toContain(SEALED_H03_GENERATED_SOURCE_V2R.slice(0, 80));
    expect(evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF',
      executionForm: 'GENERATED_COMPOSITION',
      diagnostics: [],
      proofRequired: true,
      connectedEpisodeReceiptSha256: connected.receiptSha256,
      stateEffects: [],
    });
  });

  it('rejects a rehashed trace binding and raw source leakage', async () => {
    const { manifest, connected } = await setup();
    const trace = buildSealedHoldoutSelectedOperationTraceV3R2({
      manifest, caseId: 'HOLD-03:C1', providerEpisode: connected.providerEpisode,
    });
    const forgedTrace = structuredClone(trace) as any;
    const generated = forgedTrace.nodes.find((node: any) =>
      node.selectedOperatorId === 'generated_composition_program');
    generated.generatedSourceBinding.programHash = 'f'.repeat(64);
    refreshNode(generated);
    refreshTrace(forgedTrace);
    const evaluation = evaluateSealedHoldoutH03TraceV3R3({
      manifest, caseId: 'HOLD-03:C1', trace: forgedTrace, connectedEpisode: connected,
    });
    expect(evaluation.assessment).toBe('FAIL');
    expect(evaluation.diagnostics).toContain('EVAL_H03_MODEL_SOURCE_BINDING_DRIFT');

    const leakedEpisode = structuredClone(connected.providerEpisode) as any;
    leakedEpisode.turns[2].execution.output.codeBundle.source = 'export const leaked = true;';
    refreshEpisode(leakedEpisode);
    const leakedTrace = buildSealedHoldoutSelectedOperationTraceV3R2({
      manifest, caseId: 'HOLD-03:C1', providerEpisode: leakedEpisode,
    });
    expect(leakedTrace.assessment).toBe('FAIL');
    expect(leakedTrace.diagnostics)
      .toContain('TRACE_GENERATED_SOURCE_LEAKED_TO_PROVIDER_EPISODE');
  });
});

async function setup() {
  const manifest = await buildManifest();
  let turn = 0;
  const connected = await runSealedHoldoutH03ConnectedEpisodeV3R2({
    manifest, caseId: 'HOLD-03:C1', route: route(),
    apiImplementationHash: 'a'.repeat(64),
    generateSource: async (request) => ({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model', promptHash: 'b'.repeat(64),
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: {
        authority: 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION',
        packetHash: request.packet.packetHash, stateEffects: [],
      },
    }),
    invoke: vi.fn(async () => {
      turn += 1;
      return response(turn, turn === 1
        ? call('visual', 'find_visual_moment', {
          projectId: 'oe-hold-03', query: 'resolve reference layout',
          evidenceIds: ['E1', 'E2'],
        })
        : turn === 2
          ? call('timeline', 'get_timeline_view', {
            projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
          })
          : turn === 3
            ? call('generated', 'generated_composition_program', generatedArguments())
            : call('finish', 'finish_editron_research_episode', {
              disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY'],
              evidenceIds: ['E1', 'E2', 'E3'], summary: 'Ready for proof',
            }));
    }),
  });
  return { manifest, connected };
}

function generatedArguments(): JsonRecord {
  return {
    projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: {
      panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true,
      titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
    },
    motionSpec: {
      entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180],
      relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
    },
    typographySpec: {
      text: 'EVENT\nMOMENT', alignment: 'CENTER',
      fontAssetId: 'font-noto-sans-v27-regular',
    },
    constraints: {
      referencePixelsForbidden: true, preserveOutsideRange: true,
      returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
      titleFaceOverlapMaximumPixels: 0,
    },
    evidenceIds: ['E1', 'E2', 'E3'],
  };
}

async function buildManifest() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  return buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
}
function refreshNode(node: any): void {
  const { nodeSha256: _old, ...material } = node;
  node.nodeSha256 = hashCanonicalJsonV1(material);
}
function refreshTrace(trace: any): void {
  trace.traceSha256 = hashCanonicalJsonV1(trace.nodes);
  const { artifactSha256: _old, ...material } = trace;
  trace.artifactSha256 = hashCanonicalJsonV1(material);
}
function refreshEpisode(episode: any): void {
  episode.transcriptSha256 = hashCanonicalJsonV1(episode.turns);
  const { receiptSha256: _old, ...material } = episode;
  episode.receiptSha256 = hashCanonicalJsonV1(material);
}
function route() {
  return {
    routeId: 'OPENAI_LUNA' as const, provider: 'openai' as const,
    model: 'gpt-5.6-luna' as const, claimedModelIdentity: 'gpt-5.6-luna',
    reasoningMode: 'medium' as const,
  };
}
function call(callId: string, name: string, args: JsonRecord): JsonRecord {
  return { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) };
}
function response(turn: number, output: JsonRecord) {
  return { status: 200, body: {
    id: `h03-trace-${turn}`, model: 'gpt-5.6-luna', status: 'completed', output: [output],
  } };
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path.resolve(filePath))).digest('hex');
}
