import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import type { CompiledPortBindingEdgeV2R } from '@/lib/editron/research/open-ended-planner/compiled-port-binding-v2r';
import { DEV03_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev03-lowering-policy-v2r';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { lowerV2RBoundIntentGeneric } from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';

type JsonRecord = Record<string, unknown>;
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('DEV-03 generic causal lowering V2R', () => {
  it('keeps model-owned inputs in Stage 2 and does not require Stage-3 copies', () => {
    const canonical = source();
    const intentNodes = nodesById(canonical.editorialIntentV2R);
    expect(intentNodes.get('node-resolve-impacts')?.nodeInputs).toEqual({
      query: 'strongest measured musical impacts',
    });
    expect(intentNodes.get('node-final-shake')?.nodeInputs).toEqual({
      effectPlan: {
        goal: 'restrained bounded shake at the final strongest impact, returning to neutral',
        formIntent: 'restrained-impact',
      },
    });
    const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE);
    for (const node of records(evidenceBoundIntent.nodes)) delete node.nodeInputs;
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-03', editorialIntent: canonical.editorialIntentV2R,
      evidenceBoundIntent, evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV03_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.compileDisposition).toBe('COMPILED_RESEARCH_PROXY');
    const compiledNodes = records(result.compiled.nodes);
    expect(compiledNodes.find(({ operatorId }) => operatorId === 'find_audio_moment')?.inputs)
      .toMatchObject({ query: 'strongest measured musical impacts' });
    expect(compiledNodes.find(({ operatorId }) => operatorId === 'apply_camera_shake')?.inputs)
      .toMatchObject({
        effectPlan: {
          goal: 'restrained bounded shake at the final strongest impact, returning to neutral',
          formIntent: 'restrained-impact',
        },
      });
  });

  it('compiles all seven selected operators without adding or dropping one', () => {
    const result = lowerBaseline();
    expect(result.compiled.compileDisposition).toBe('COMPILED_RESEARCH_PROXY');
    expect(result.zeroAdd).toBe(true);
    expect(result.zeroDrop).toBe(true);
    expect(result.compiledOperatorIds).toEqual([
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake', 'read_project_file', 'get_timeline_view',
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('binds measured beats into sync and the post-alignment result into shake', () => {
    const result = lowerBaseline();
    const compiled = result.compiled;
    const nodes = records(compiled.nodes);
    const sync = nodes.find(({ operatorId }) => operatorId === 'sync_cuts_to_beats');
    const shake = nodes.find(({ operatorId }) => operatorId === 'apply_camera_shake');
    expect(sync?.inputs).toMatchObject({
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      overlayIds: ['dev03-card-1', 'dev03-card-2', 'dev03-card-3', 'dev03-card-4'],
      beatSyncConstraints: {
        maxSnapFrames: 12,
        protectedAudioRange: { startFrame: 250, endFrame: 350 },
        requireSourceHandles: true,
      },
    });
    expect(record(sync?.inputs)).not.toHaveProperty('beatPlan');
    expect(record(shake?.inputs)).toEqual({
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      effectPlan: {
        goal: 'restrained bounded shake at the final strongest impact, returning to neutral',
        formIntent: 'restrained-impact',
      },
    });

    const bindings = compiled.edges as CompiledPortBindingEdgeV2R[];
    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromNodeId: 'compile-node-resolve-impacts', fromPort: 'result',
        toNodeId: 'compile-node-align-boundaries', toPort: 'beatPlan', projectionPath: [],
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-align-boundaries', fromPort: 'result',
        toNodeId: 'compile-node-final-shake', toPort: 'overlayId', projectionPath: ['finalHitOverlayId'],
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-align-boundaries', fromPort: 'result',
        toNodeId: 'compile-node-final-shake', toPort: 'targetFrame', projectionPath: ['finalStrongPeakFrame'],
      }),
    ]));
  });

  it('stops before compilation when measured beat evidence is withheld', () => {
    const canonical = source();
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-03',
      editorialIntent: canonical.editorialIntentV2R,
      evidenceBoundIntent: canonical.evidenceBoundIntentsV2R.BEAT_EVIDENCE_WITHHELD,
      evidencePack: canonical.evidencePacks.BEAT_EVIDENCE_WITHHELD,
      policy: DEV03_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.compileDisposition).toBe('UNVERIFIABLE');
    expect(result.compiled.nodes).toEqual([]);
    expect(result.zeroDrop).toBe(false);
  });

  it('does not substitute a static fixture target when the sync result producer is absent', () => {
    const canonical = source();
    const editorialIntent = structuredClone(canonical.editorialIntentV2R) as JsonRecord;
    const boundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as JsonRecord;
    for (const artifact of [editorialIntent, boundIntent]) {
      const alignNode = records(artifact.nodes)
        .find(({ intentNodeId }) => intentNodeId === 'node-align-boundaries');
      if (alignNode) alignNode.selectedOperatorId = 'get_timeline_view';
    }
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-03', editorialIntent, evidenceBoundIntent: boundIntent,
      evidencePack: canonical.evidencePacks.BASELINE, policy: DEV03_LOWERING_POLICY_V2R,
    });
    expect(result.compiledOperatorIds).not.toContain('apply_camera_shake');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'INPUT_BINDING_MISSING:node-final-shake:overlayId',
      'INPUT_BINDING_MISSING:node-final-shake:targetFrame',
    ]));
  });
});

function source() {
  return getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
}

function lowerBaseline() {
  const canonical = source();
  return lowerV2RBoundIntentGeneric({
    taskId: 'DEV-03', editorialIntent: canonical.editorialIntentV2R,
    evidenceBoundIntent: canonical.evidenceBoundIntentsV2R.BASELINE,
    evidencePack: canonical.evidencePacks.BASELINE, policy: DEV03_LOWERING_POLICY_V2R,
  });
}

function nodesById(artifact: JsonRecord): Map<string, JsonRecord> {
  return new Map(records(artifact.nodes).map((node) => [String(node.intentNodeId), node]));
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )) : [];
}
