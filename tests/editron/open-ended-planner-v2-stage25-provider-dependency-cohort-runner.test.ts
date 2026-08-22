import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildStage25ProviderDependencyCohortManifestV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1';
import { runStage25ProviderDependencyCohortV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-runner-v1';
import { STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

const MANIFEST = buildStage25ProviderDependencyCohortManifestV1({
  sourceCommit: 'a'.repeat(40),
  evaluatorSourceSha256: 'b'.repeat(64),
});

describe('Stage 2.5 provider dependency cohort runner', () => {
  it('runs an isolated passing row through trace and zero-add schedule projection', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'editron-stage25-pass-'));
    const receipt = await runStage25ProviderDependencyCohortV1({
      manifest: MANIFEST,
      outputRoot: path.join(root, 'cohort'),
      routeIds: ['OPENAI_TERRA'],
      presentationOrdinals: [1],
      createTransport: ({ route }) => scriptedTransport(route.model),
    });
    expect(receipt).toMatchObject({
      rowCount: 1,
      passCount: 1,
      failCount: 0,
      providerInfrastructureUnverifiableCount: 0,
      harnessErrorCount: 0,
      stateEffects: [],
    });
    const row = records(receipt.rows)[0];
    expect(row).toMatchObject({
      assessment: 'PASS',
      evaluation: { assessment: 'PASS', diagnostics: [] },
      schedule: { receipt: { zeroAdd: true, zeroDrop: true } },
      stateEffects: [],
    });
  });

  it('does not score a provider rate limit as an editing failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'editron-stage25-infra-'));
    const receipt = await runStage25ProviderDependencyCohortV1({
      manifest: MANIFEST,
      outputRoot: path.join(root, 'cohort'),
      routeIds: ['OPENAI_LUNA'],
      presentationOrdinals: [2],
      createTransport: () => ({
        invoke: async () => ({ status: 429, body: { error: { message: 'rate limit' } } }),
        snapshot: () => ({ calls: [], stateEffects: [] }),
      }),
    });
    expect(receipt).toMatchObject({
      passCount: 0,
      failCount: 0,
      providerInfrastructureUnverifiableCount: 1,
      harnessErrorCount: 0,
    });
  });

  it('rejects unknown route and presentation selections before creating rows', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'editron-stage25-invalid-'));
    await expect(runStage25ProviderDependencyCohortV1({
      manifest: MANIFEST,
      outputRoot: path.join(root, 'route'),
      routeIds: ['UNKNOWN'],
      createTransport: () => scriptedTransport('unused'),
    })).rejects.toThrow('ROUTE_SELECTION_INVALID');
    await expect(runStage25ProviderDependencyCohortV1({
      manifest: MANIFEST,
      outputRoot: path.join(root, 'presentation'),
      presentationOrdinals: [4],
      createTransport: () => scriptedTransport('unused'),
    })).rejects.toThrow('PRESENTATION_SELECTION_INVALID');
  });
});

function scriptedTransport(model: string) {
  const requests: SerializedProviderNativeTurnV2R[] = [];
  return {
    invoke: async (request: SerializedProviderNativeTurnV2R) => {
      requests.push(request);
      const turn = requests.length;
      if (turn === 1) return response(model, 'visual', 'find_visual_moment', {
        projectId: 'project-42', query: 'verified product reveal moment',
      });
      if (turn === 2) return response(model, 'audio', 'find_audio_moment', {
        projectId: 'project-42', query: 'measured strong music impacts',
        assetIds: ['music-1'], targetRange: { startFrame: 0, endFrame: 360 },
      });
      if (turn === 3) return response(model, 'sync', 'sync_cuts_to_beats', {
        projectId: 'project-42', expectedProjectRevision: 'R42',
        overlayIds: [1, 2, 3],
        beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
        evidenceIds: ['EV-A'], argumentReferences: [{
          targetField: 'beatPlan',
          resultReferenceId: outputReferenceId(request, 'audio', 'result'),
        }],
      });
      if (turn === 4) return response(model, 'resolve', 'resolve_keyframe_edit', {
        projectId: 'project-42', intent: {
          direction: 'in', durationFrames: 24, scaleDelta: 0.1,
          replaceExistingScaleKeyframes: false,
        }, evidenceIds: ['EV-V'], argumentReferences: [
          ref(request, 'sync', 'receipt.projectRevision', 'expectedProjectRevision'),
          ref(request, 'visual', 'overlayId', 'overlayId'),
          ref(request, 'visual', 'targetFrame', 'targetFrame'),
          ref(request, 'visual', 'focalPoint', 'focalPoint'),
          ref(request, 'visual', 'evidenceStrength', 'evidenceStrength'),
        ],
      });
      if (turn === 5) return response(model, 'keyframes', 'set_keyframes', {
        projectId: 'project-42', evidenceIds: ['EV-V'], argumentReferences: [
          ref(request, 'sync', 'receipt.projectRevision', 'expectedProjectRevision'),
          ref(request, 'resolve', 'proposedOperation.arguments.overlayId', 'overlayId'),
          ref(request, 'resolve', 'proposedOperation.arguments.keyframes', 'keyframes'),
          ref(request, 'resolve', 'proposedOperation.arguments.focalPoint', 'focalPoint'),
        ],
      });
      if (turn === 6) return response(model, 'filter', 'apply_filter', {
        projectId: 'project-42', targetRange: { startFrame: 600, endFrame: 720 },
        effectPlan: { filterIntent: 'warmer' },
        argumentReferences: [
          ref(request, 'keyframes', 'receipt.projectRevision', 'expectedProjectRevision'),
          ref(request, 'resolve', 'proposedOperation.arguments.overlayId', 'overlayId'),
        ],
      });
      return response(model, 'finish', 'finish_editron_research_episode', {
        disposition: 'READY_FOR_PROOF', reasonCodes: ['ISOLATED_EDITS_COMPLETE'],
        evidenceIds: ['EV-A', 'EV-V'], summary: 'Ready for bounded proof.',
      });
    },
    snapshot: () => ({ calls: requests.length, stateEffects: [] }),
  };
}

function response(model: string, callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model, status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}
function ref(
  request: SerializedProviderNativeTurnV2R,
  callId: string,
  source: string,
  targetField: string,
) {
  return { targetField, resultReferenceId: outputReferenceId(request, callId, source) };
}
function outputReferenceId(
  request: SerializedProviderNativeTurnV2R,
  callId: string,
  source: string,
): string {
  const history = request.body.input as JsonRecord[];
  const item = [...history].reverse().find((candidate) => (
    candidate.type === 'function_call_output' && candidate.call_id === callId
  ));
  const envelope = item ? JSON.parse(String(item.output)) as JsonRecord : {};
  const reference = records(envelope.resultReferences)
    .find(({ sourceOutputField }) => sourceOutputField === source);
  if (typeof reference?.resultReferenceId !== 'string') {
    throw new Error(`TEST_REFERENCE_MISSING:${callId}:${source}`);
  }
  return reference.resultReferenceId;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry)
      && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}
