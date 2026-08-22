import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  buildSealedH03GeneratedCompositionModelPacketV3R,
  materializeSealedH03GeneratedCompositionModelCandidateV3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-model-candidate-v3r';
import {
  SEALED_H03_GENERATED_SOURCE_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';

const SOURCE_A = `sha256:${'a'.repeat(64)}`;
const SOURCE_B = `sha256:${'b'.repeat(64)}`;
const PROMPT_HASH = 'c'.repeat(64);

describe('sealed H03 model-generated source candidate V3R', () => {
  it('builds a source prompt from public target facts without leaking the human source', () => {
    const packet = buildSealedH03GeneratedCompositionModelPacketV3R({
      apiImplementationHash: 'd'.repeat(64),
      sourceAArtifactSha256: SOURCE_A,
      sourceBArtifactSha256: SOURCE_B,
      orchestratorArguments: argumentsV3R(),
    });
    const serialized = JSON.stringify(packet);
    expect(packet.packetHash).toHaveLength(64);
    expect(serialized).toContain('EVENT\\nMOMENT');
    expect(serialized).toContain(SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R);
    expect(serialized).not.toContain(SEALED_H03_GENERATED_SOURCE_V2R);
    expect(serialized).not.toContain('build 0-107');
    expect(packet.packet.modelInput).toMatchObject({
      benchmarkContract: 'EDITRON_OE_SEALED_H03_MODEL_SOURCE_CONTRACT_V3R_1',
      orchestratorOperationRequest: {
        argumentsSha256: hashCanonicalJsonV1(argumentsV3R()),
      },
      sourceAcceptanceContract: { fileCount: 1, maxSourceBytes: 64 * 1024 },
    });
  });

  it('binds accepted source to the model, prompt, program and canonical verifier', () => {
    const candidate = materializeSealedH03GeneratedCompositionModelCandidateV3R({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
      candidateOrdinal: 0,
      sourceAArtifactSha256: SOURCE_A,
      sourceBArtifactSha256: SOURCE_B,
      orchestratorArguments: argumentsV3R(),
    });
    const verification = verifyGeneratedCompositionProgramV1(candidate);
    expect(verification).toMatchObject({ disposition: 'CONTRACT_PASS', diagnostics: [] });
    expect(candidate.program.generator).toMatchObject({
      kind: 'MODEL_GENERATED',
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
    });
    expect(candidate.program.referenceBinding.blueprintId)
      .toBe(SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R);
  });

  it('rejects hidden-input drift and unsafe rehashed source', () => {
    const wrongTitle = structuredClone(argumentsV3R());
    wrongTitle.typographySpec.text = 'INVENTED';
    expect(() => buildSealedH03GeneratedCompositionModelPacketV3R({
      apiImplementationHash: 'd'.repeat(64),
      sourceAArtifactSha256: SOURCE_A,
      sourceBArtifactSha256: SOURCE_B,
      orchestratorArguments: wrongTitle,
    })).toThrow('SEALED_H03_MODEL_ORCHESTRATOR_ARGUMENTS_INVALID');
    expect(() => buildSealedH03GeneratedCompositionModelPacketV3R({
      apiImplementationHash: 'd'.repeat(64),
      sourceAArtifactSha256: SOURCE_A,
      sourceBArtifactSha256: SOURCE_B,
      orchestratorArguments: argumentsV3R(),
      repair: {
        repairOrdinal: 1,
        failureStage: 'CONTRACT_VERIFIER',
        diagnostics: ['bounded diagnostic'],
        priorSource: 'x'.repeat(64 * 1024 + 1),
      },
    })).toThrow('SEALED_H03_MODEL_REPAIR_INVALID');

    const unsafe = SEALED_H03_GENERATED_SOURCE_V2R.replace(
      'const frame = useCurrentFrame();',
      "const frame = useCurrentFrame(); fetch('https://example.com/escape');",
    );
    const candidate = materializeSealedH03GeneratedCompositionModelCandidateV3R({
      source: unsafe,
      modelId: 'contract-test-model',
      promptHash: PROMPT_HASH,
      candidateOrdinal: 1,
      sourceAArtifactSha256: SOURCE_A,
      sourceBArtifactSha256: SOURCE_B,
      orchestratorArguments: argumentsV3R(),
    });
    expect(verifyGeneratedCompositionProgramV1(candidate).diagnostics).toEqual(
      expect.arrayContaining([
        'SOURCE_DANGEROUS_NETWORK_FETCH:GeneratedComposition.tsx',
        'SOURCE_EXTERNAL_LOCATION_FORBIDDEN:GeneratedComposition.tsx',
      ]),
    );
  });
});

function argumentsV3R() {
  return {
    projectId: 'oe-hold-03',
    expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: {
      panelCount: 6,
      geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS',
      gutters: true,
      titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
    },
    motionSpec: {
      entryFrames: [0, 24],
      stableFrames: [24, 150],
      exitFrames: [150, 180],
      relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
    },
    typographySpec: {
      text: 'EVENT\nMOMENT',
      alignment: 'CENTER',
      fontAssetId: 'font-noto-sans-v27-regular',
    },
    constraints: {
      referencePixelsForbidden: true,
      preserveOutsideRange: true,
      returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
      titleFaceOverlapMaximumPixels: 0,
    },
    evidenceIds: ['E1', 'E2', 'E3'],
  };
}
