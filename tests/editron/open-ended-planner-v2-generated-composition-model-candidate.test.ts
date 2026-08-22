import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1, sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  applyDev02HostExecutionPolicyCorrectionV1,
  buildDev02GeneratedCompositionModelPacketV1,
  GENERATED_COMPOSITION_MODEL_API_SURFACE_V2,
  materializeDev02GeneratedCompositionModelCandidateV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import { verifyGeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const API_HASH = 'a'.repeat(64);
const PROMPT_HASH = 'b'.repeat(64);

describe('open-ended planner V2 model-generated composition candidate', () => {
  it('states layer-kind bindings and pixel units without leaking task motion', () => {
    const serialized = JSON.stringify(GENERATED_COMPOSITION_MODEL_API_SURFACE_V2);
    expect(GENERATED_COMPOSITION_MODEL_API_SURFACE_V2.contractVersion)
      .toBe('EDITRON_GENERATED_COMPOSITION_MODEL_API_SURFACE_V2');
    expect(serialized).toContain('declared SOURCE_PANEL layer');
    expect(serialized).toContain('declared TEXT layer');
    expect(serialized).toContain('CSS pixel offsets');
    expect(serialized).toContain('never inside Panel');
    expect(serialized).not.toContain('24px');
    expect(serialized).not.toContain('SEALED_H03_GENERATED_SOURCE');
  });

  it('builds a stable source-synthesis packet without leaking the human implementation', () => {
    const first = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: API_HASH });
    const second = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: API_HASH });
    const serialized = JSON.stringify(first);
    expect(first).toEqual(second);
    expect(first.packetHash).toHaveLength(64);
    expect(first.transportAttachments).toEqual([]);
    expect(serialized).not.toContain(DEV02_GENERATED_COMPOSITION_SOURCE_V1);
    expect(serialized).not.toContain(DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1.files[0].sha256);
    expect(serialized).not.toContain('const centreTravel');
    expect(serialized).not.toContain('exitSourceFrame');
    expect(serialized).toContain('claim-ref-opposed-motion');
    expect(serialized).toContain('@editron/generated-composition-api/v1');
    expect(first.packet.modelInput).toMatchObject({
      benchmarkContract: 'EDITRON_DEV02_MODEL_GENERATED_SOURCE_V2',
      renderedAcceptanceContract: {
        contractId: 'EDITRON_DEV02_GENERATED_SOURCE_ACCEPTANCE_CONTRACT_V1',
        requiredFrames: [0, 24, 108, 144, 145, 179],
        thresholds: {
          minimumNonBlackRatio: 0.02,
          minimumOpposedTravelPixelsAt1080x1920: 100,
        },
      },
      sourceAcceptanceContract: {
        maxSourceBytes: 64 * 1024,
        encoding: 'UTF-8',
        fileCount: 1,
      },
    });
    expect(serialized).toContain('FRAME_INTEGRITY');
    expect(serialized).toContain('OPPOSED_PANEL_MOTION');
  });

  it('hash-binds the orchestrator operation request into the specialist prompt', () => {
    const orchestratorSpec = {
      projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
      layoutSpec: { objective: 'relational multi-panel island' },
      motionSpec: { objective: 'build, hold, then centre takeover' },
    };
    const packet = buildDev02GeneratedCompositionModelPacketV1({
      apiImplementationHash: API_HASH, orchestratorSpec,
    });
    expect(packet.packet.modelInput.orchestratorOperationRequest).toEqual({
      arguments: orchestratorSpec,
      argumentsSha256: hashCanonicalJsonV1(orchestratorSpec),
    });
    expect(() => buildDev02GeneratedCompositionModelPacketV1({
      apiImplementationHash: API_HASH, orchestratorSpec: {},
    })).toThrow('MODEL_PACKET_ORCHESTRATOR_SPEC_EMPTY');
  });

  it('binds accepted source to model and prompt identity before the canonical verifier', () => {
    const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
      source: DEV02_GENERATED_COMPOSITION_SOURCE_V1,
      modelId: 'benchmark-model',
      promptHash: PROMPT_HASH,
      candidateOrdinal: 0,
    });
    const verification = verifyGeneratedCompositionProgramV1({
      ...candidate,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    });
    expect(verification.disposition).toBe('CONTRACT_PASS');
    expect(candidate.program.generator).toMatchObject({
      kind: 'MODEL_GENERATED', modelId: 'benchmark-model', promptHash: PROMPT_HASH,
    });
    expect(candidate.program.sourceBundleHash).toBe(verification.sourceBundleHash);
  });

  it('does not hide an unsafe model repair behind rehashing', () => {
    const unsafe = DEV02_GENERATED_COMPOSITION_SOURCE_V1.replace(
      'const frame = useCurrentFrame();',
      "const frame = useCurrentFrame(); fetch('https://example.com/escape');",
    );
    const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
      source: unsafe, modelId: 'benchmark-model', promptHash: PROMPT_HASH, candidateOrdinal: 1,
    });
    const verification = verifyGeneratedCompositionProgramV1({
      ...candidate,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    });
    expect(candidate.sourceBundle.files[0].sha256).toBe(sha256TextV1(unsafe));
    expect(verification.disposition).toBe('CONTRACT_FAIL');
    expect(verification.diagnostics).toEqual(expect.arrayContaining([
      'SOURCE_DANGEROUS_NETWORK_FETCH:GeneratedComposition.tsx',
      'SOURCE_EXTERNAL_LOCATION_FORBIDDEN:GeneratedComposition.tsx',
    ]));
  });

  it('corrects the host-authored proxy budget without changing model-authored source or semantics', () => {
    const current = materializeDev02GeneratedCompositionModelCandidateV1({
      source: DEV02_GENERATED_COMPOSITION_SOURCE_V1, modelId: 'benchmark-model', promptHash: PROMPT_HASH, candidateOrdinal: 0,
    });
    const historicalProgram = structuredClone(current.program);
    historicalProgram.resourceBudget.maxCpuMs = 60_000;
    historicalProgram.resourceBudget.maxWallTimeMs = 90_000;
    const corrected = applyDev02HostExecutionPolicyCorrectionV1({
      sourceProgram: historicalProgram, sourceBundle: current.sourceBundle, candidateOrdinal: 0,
    });
    expect(corrected.program).toEqual(current.program);
    expect(corrected.sourceBundle).toEqual(current.sourceBundle);
    expect(corrected.amendment).toMatchObject({
      policyId: 'DEV02_PLAYABLE_PROXY_BUDGET_CORRECTION_V1',
      changedPaths: ['resourceBudget.maxCpuMs', 'resourceBudget.maxWallTimeMs'],
      sourceProgramHash: hashCanonicalJsonV1(historicalProgram),
      executionProgramHash: hashCanonicalJsonV1(current.program),
      stateEffects: [],
    });
    expect(corrected.program.resourceBudget).toMatchObject({ maxCpuMs: 120_000, maxWallTimeMs: 180_000 });
    expect(DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget).toMatchObject({ maxCpuMs: 120_000, maxWallTimeMs: 180_000 });
    const drifted = structuredClone(historicalProgram);
    drifted.canvas.width = 720;
    expect(() => applyDev02HostExecutionPolicyCorrectionV1({
      sourceProgram: drifted, sourceBundle: current.sourceBundle, candidateOrdinal: 0,
    })).toThrow('DEV02_HOST_POLICY_NON_BUDGET_DRIFT');
  });
});
