import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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
import { runSealedHoldoutH03ConnectedEpisodeV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r2';
import type { SealedH03SourceGeneratorV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-source-executor-v3r2';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';

type JsonRecord = Record<string, unknown>;
type SourceRequest = Parameters<SealedH03SourceGeneratorV3R2>[0];
const API_HASH = 'a'.repeat(64);
const PROMPT_HASH = 'b'.repeat(64);

describe('sealed H03 connected model-source episode V3R2', () => {
  it('binds owner-authorized H03 arguments to verified model source without mutation', async () => {
    const generateSource = vi.fn(async (request: SourceRequest) => ({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: generationReceipt(request.packet.packetHash),
    }));
    const result = await run('HOLD-03:C1', generateSource, 'READY_FOR_PROOF');

    expect(generateSource).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      disposition: 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF',
      stateEffects: [],
      providerEpisode: { terminal: { disposition: 'READY_FOR_PROOF' }, stateEffects: [] },
      generatedCandidate: {
        candidateOrdinal: 0,
        verification: { disposition: 'CONTRACT_PASS', diagnostics: [] },
        candidate: {
          program: { generator: { kind: 'MODEL_GENERATED', modelId: 'contract-test-model' } },
        },
      },
    });
    expect(result.ownerSnapshot).toMatchObject({
      currentProjectRevision: 'R12', stateEffects: [],
    });
    expect(JSON.stringify(result.providerEpisode))
      .not.toContain(SEALED_H03_GENERATED_SOURCE_V2R.slice(0, 80));
  });

  it('never invokes source generation when the owner cannot resolve withheld evidence', async () => {
    const generateSource = vi.fn(async (_request: SourceRequest) => {
      throw new Error('SOURCE_GENERATION_MUST_NOT_RUN');
    });
    const result = await run('HOLD-03:C2', generateSource, 'UNVERIFIABLE');
    expect(generateSource).not.toHaveBeenCalled();
    expect(result.disposition).toBe('NOT_READY');
    expect(result.generatedCandidate).toBeNull();
    expect(result.providerEpisode.turns[2]).toMatchObject({
      execution: { disposition: 'UNVERIFIABLE' },
    });
    expect(result.stateEffects).toEqual([]);
  });

  it('permits one bounded source repair and rejects forged lineage', async () => {
    const unsafe = SEALED_H03_GENERATED_SOURCE_V2R.replace(
      'const frame = useCurrentFrame();',
      "const frame = useCurrentFrame(); fetch('https://example.com/escape');",
    );
    const repaired = vi.fn(async (request: SourceRequest) => ({
      source: request.candidateOrdinal === 0 ? unsafe : SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: generationReceipt(request.packet.packetHash),
    }));
    const repairedResult = await run('HOLD-03:C1', repaired, 'READY_FOR_PROOF');
    expect(repaired).toHaveBeenCalledTimes(2);
    expect(repaired.mock.calls[1][0].repair).toMatchObject({
      repairOrdinal: 1, failureStage: 'CONTRACT_VERIFIER',
    });
    expect(repairedResult.generatedCandidate?.candidateOrdinal).toBe(1);
    expect(repairedResult.generatedCandidate?.attempts).toHaveLength(2);

    const forged = vi.fn(async (request: SourceRequest) => ({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: generationReceipt('f'.repeat(64)),
    }));
    const forgedResult = await run('HOLD-03:C1', forged, 'FAIL');
    expect(forged).toHaveBeenCalledTimes(1);
    expect(forgedResult.disposition).toBe('NOT_READY');
    expect(forgedResult.generatedCandidate).toBeNull();
    expect(forgedResult.providerEpisode.turns[2]).toMatchObject({
      execution: { disposition: 'FAIL' },
    });
  });
});

async function run(
  caseId: 'HOLD-03:C1' | 'HOLD-03:C2',
  generateSource: SealedH03SourceGeneratorV3R2,
  finalDisposition: 'READY_FOR_PROOF' | 'UNVERIFIABLE' | 'FAIL',
) {
  let turn = 0;
  return runSealedHoldoutH03ConnectedEpisodeV3R2({
    manifest: await manifest(),
    caseId,
    route: route(),
    apiImplementationHash: API_HASH,
    argumentHandoffMode: 'DIRECT_ARGUMENTS',
    generateSource,
    invoke: vi.fn(async () => {
      turn += 1;
      return openAiResponse(turn, turn === 1
        ? call('visual', 'find_visual_moment', {
          projectId: 'oe-hold-03',
          query: 'Resolve the measured six-window reference layout and face-safe title region.',
          evidenceIds: ['E1', 'E2'],
        })
        : turn === 2
          ? call('timeline', 'get_timeline_view', {
            projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
          })
          : turn === 3
            ? call('generated', 'generated_composition_program', argumentsV3R())
            : finish(finalDisposition, caseId.endsWith('C1')
              ? ['E1', 'E2', 'E3'] : ['E1', 'E3']));
    }),
  });
}

function argumentsV3R(): JsonRecord {
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

async function manifest() {
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

function generationReceipt(packetHash: string): JsonRecord {
  return {
    authority: 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION',
    packetHash,
    stateEffects: [],
  };
}
function route() {
  return {
    routeId: 'OPENAI_LUNA' as const,
    provider: 'openai' as const,
    model: 'gpt-5.6-luna' as const,
    claimedModelIdentity: 'gpt-5.6-luna',
    reasoningMode: 'medium' as const,
  };
}
function call(callId: string, name: string, args: JsonRecord): JsonRecord {
  return { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) };
}
function finish(disposition: string, evidenceIds: readonly string[]): JsonRecord {
  return call('finish', 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds,
    summary: `Finished as ${disposition}`,
  });
}
function openAiResponse(turn: number, output: JsonRecord) {
  return {
    status: 200,
    body: {
      id: `h03-v3r2-response-${turn}`,
      model: 'gpt-5.6-luna', status: 'completed', output: [output],
    },
  };
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path.resolve(filePath))).digest('hex');
}
