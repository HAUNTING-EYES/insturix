import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import dev02BoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { getCanonicalDev04ConnectedChainV2 } from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import { evaluateDev02Stage2RoleCompilabilityV2 } from '@/lib/editron/research/open-ended-planner/dev02-stage4-role-resolver-v2';
import { evaluateConnectedDevelopmentStageArtifactV2 } from '@/lib/editron/research/open-ended-planner/development-connected-source-evaluator-v2';

type JsonRecord = Record<string, unknown>;
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 connected source-relative evaluator', () => {
  it('accepts each canonical Stage-2 policy without depending on another claim namespace', () => {
    const dev01 = getCanonicalDev01Stage123V2();
    const dev03 = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const dev04 = getCanonicalDev04ConnectedChainV2();
    const cases = [
      {
        taskId: 'DEV-01' as const,
        priorArtifact: dev01.referenceBlueprints.BASELINE,
        artifact: dev01.editorialIntent,
        disposition: 'PASS',
      },
      {
        taskId: 'DEV-02' as const,
        priorArtifact: dev02BlueprintJson,
        artifact: dev02IntentJson,
        disposition: 'EXPECTED_CAPABILITY_GAP',
      },
      {
        taskId: 'DEV-03' as const,
        priorArtifact: dev03.referenceBlueprints.BASELINE,
        artifact: dev03.editorialIntent,
        disposition: 'PASS',
      },
      {
        taskId: 'DEV-04' as const,
        priorArtifact: dev04.referenceBlueprint,
        artifact: dev04.editorialIntent,
        disposition: 'EXPECTED_CAPABILITY_GAP',
      },
    ];
    for (const candidate of cases) {
      const evaluation = evaluateConnectedDevelopmentStageArtifactV2({
        taskId: candidate.taskId,
        stage: 2,
        priorArtifact: candidate.priorArtifact,
        artifact: candidate.artifact,
      });
      expect(evaluation, candidate.taskId).toMatchObject({
        disposition: candidate.disposition,
        diagnostics: [],
      });
    }
  });

  it('rejects an unnecessary destructive audio/timeline substitution in DEV-03', () => {
    const source = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const artifact = structuredClone(source.editorialIntent) as JsonRecord;
    const nodes = artifact.nodes as JsonRecord[];
    (nodes[0].candidateCapabilityIds as string[]).push('cut_section');
    const evaluation = evaluateConnectedDevelopmentStageArtifactV2({
      taskId: 'DEV-03', stage: 2,
      priorArtifact: source.referenceBlueprints.BASELINE,
      artifact,
    });
    expect(evaluation).toMatchObject({ disposition: 'FAIL' });
    expect(evaluation.diagnostics).toContain('DEV03_FORBIDDEN_CAPABILITY:cut_section');
  });

  it('routes a speech-timed music claim to ducking rather than the cut owner', () => {
    const source = getCanonicalDev01Stage123V2();
    const blueprint = structuredClone(source.referenceBlueprints.BASELINE) as JsonRecord;
    const duckClaim = (blueprint.targetClaims as JsonRecord[])
      .find(({ claimId }) => claimId === 'claim-dialogue-ducking');
    if (!duckClaim) throw new Error('DEV-01 duck claim fixture is missing');
    duckClaim.evidenceIds = ['EV-DEV01-A1', 'EV-DEV01-T1'];
    expect(evaluateConnectedDevelopmentStageArtifactV2({
      taskId: 'DEV-01', stage: 2, priorArtifact: blueprint, artifact: source.editorialIntent,
    })).toMatchObject({ disposition: 'PASS', diagnostics: [] });
  });

  it('rejects ambiguous DEV-02 continuation roles before Stage 3', () => {
    const artifact = structuredClone(dev02IntentJson) as unknown as JsonRecord;
    const nodes = artifact.nodes as JsonRecord[];
    const continuation = nodes.find(({ intentNodeId }) => intentNodeId === 'node-native-continuation');
    if (!continuation) throw new Error('DEV-02 continuation fixture node is missing');
    nodes.push({ ...structuredClone(continuation), intentNodeId: 'node-native-continuation-duplicate' });
    expect(evaluateDev02Stage2RoleCompilabilityV2(artifact)).toEqual([
      expect.stringMatching(/NATIVE_CONTINUATION_AMBIGUOUS/),
    ]);
  });

  it('does not mistake a post-island continuity read for the missing native continuation', () => {
    const artifact = structuredClone(dev02IntentJson) as unknown as JsonRecord;
    const nodes = artifact.nodes as JsonRecord[];
    const continuation = nodes.find(({ intentNodeId }) => intentNodeId === 'node-native-continuation');
    if (!continuation) throw new Error('Missing DEV-02 continuation fixture node');
    continuation.candidateCapabilityIds = ['get_timeline_view'];
    const evaluation = evaluateConnectedDevelopmentStageArtifactV2({
      taskId: 'DEV-02', stage: 2,
      priorArtifact: dev02BlueprintJson,
      artifact,
    });
    expect(evaluation.disposition).toBe('FAIL');
    expect(evaluation.diagnostics).toEqual(expect.arrayContaining([
      'DEV02_NATIVE_CONTINUATION_AFTER_GENERATED_MISSING',
      'DEV02_NATIVE_CONTINUATION_BEFORE_PROOF_MISSING',
    ]));
    expect(evaluation.diagnostics.some((entry) =>
      entry.startsWith('DEV02_NATIVE_CONTINUATION_CLAIM_NOT_COVERED:'))).toBe(true);
  });

  it('accepts a catalogued native mutation candidate for the post-island continuation', () => {
    const artifact = structuredClone(dev02IntentJson) as unknown as JsonRecord;
    const nodes = artifact.nodes as JsonRecord[];
    const continuation = nodes.find(({ intentNodeId }) => intentNodeId === 'node-native-continuation');
    if (!continuation) throw new Error('Missing DEV-02 continuation fixture node');
    continuation.candidateCapabilityIds = ['move_retime_overlay', 'trim_overlay', 'update_overlay'];
    expect(evaluateConnectedDevelopmentStageArtifactV2({
      taskId: 'DEV-02', stage: 2,
      priorArtifact: dev02BlueprintJson,
      artifact,
    })).toMatchObject({ disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: [] });
  });

  it('accepts canonical Stage-3 bindings relative to each exact Stage-2 graph', () => {
    const dev01 = getCanonicalDev01Stage123V2();
    const dev03 = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const dev04 = getCanonicalDev04ConnectedChainV2();
    const cases = [
      {
        taskId: 'DEV-01' as const,
        priorArtifact: dev01.editorialIntent,
        evidencePack: dev01.evidencePacks.BASELINE,
        artifact: dev01.evidenceBoundIntents.BASELINE,
        disposition: 'PASS',
      },
      {
        taskId: 'DEV-02' as const,
        priorArtifact: dev02IntentJson,
        evidencePack: dev02EvidencePackJson,
        artifact: dev02BoundJson,
        disposition: 'EXPECTED_CAPABILITY_GAP',
      },
      {
        taskId: 'DEV-03' as const,
        priorArtifact: dev03.editorialIntent,
        evidencePack: dev03.evidencePacks.BASELINE,
        artifact: dev03.evidenceBoundIntents.BASELINE,
        disposition: 'PASS',
      },
      {
        taskId: 'DEV-04' as const,
        priorArtifact: dev04.editorialIntent,
        evidencePack: dev04.evidencePacks.BASELINE,
        artifact: dev04.evidenceBoundIntent,
        disposition: 'EXPECTED_CAPABILITY_GAP',
      },
    ];
    for (const candidate of cases) {
      expect(evaluateConnectedDevelopmentStageArtifactV2({
        taskId: candidate.taskId,
        stage: 3,
        priorArtifact: candidate.priorArtifact,
        evidencePack: candidate.evidencePack,
        artifact: candidate.artifact,
      }), candidate.taskId).toMatchObject({
        disposition: candidate.disposition,
        diagnostics: [],
      });
    }
  });

  it('rejects dangling node references that Stage 4 cannot safely compile', () => {
    const artifact = structuredClone(dev02BoundJson) as unknown as JsonRecord;
    const node = (artifact.nodes as JsonRecord[])[0];
    node.preservationIds = ['missing-preservation'];
    node.proofObligationIds = ['missing-proof'];
    node.unresolvedRequirementIds = ['missing-requirement'];
    const evaluation = evaluateConnectedDevelopmentStageArtifactV2({
      taskId: 'DEV-02', stage: 3,
      priorArtifact: dev02IntentJson,
      evidencePack: dev02EvidencePackJson,
      artifact,
    });
    expect(evaluation.disposition).toBe('FAIL');
    expect(evaluation.diagnostics).toEqual(expect.arrayContaining([
      'CONNECTED_STAGE3_UNKNOWN_PRESERVATION_REF:node-source-resolution/missing-preservation',
      'CONNECTED_STAGE3_UNKNOWN_PROOF_REF:node-source-resolution/missing-proof',
      'CONNECTED_STAGE3_UNKNOWN_UNRESOLVED_REF:node-source-resolution/missing-requirement',
    ]));
  });
});
