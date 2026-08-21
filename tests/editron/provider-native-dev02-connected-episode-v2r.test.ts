import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { runProviderNativeDev02ConnectedEpisodeV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev02-connected-episode-v2r';
import type { ProviderNativeEpisodeContextV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

type JsonRecord = Record<string, unknown>;
const roots: string[] = [];
const realIt = process.env.RUN_PROVIDER_NATIVE_DEV02_REAL_RENDER === '1' ? it : it.skip;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('V2R provider-native DEV-02 connected episode', () => {
  it('binds the model-selected generated operation to specialist source and hybrid proof', async () => {
    const mechanics = vi.fn(async ({ hybridGraph }: { hybridGraph?: unknown }) => {
      const graph = hybridGraph as JsonRecord;
      const island = graph.sourceIslandGraph as JsonRecord;
      const bundle = island.previewInputBundle as JsonRecord;
      expect((bundle.program as JsonRecord).generator).toMatchObject({ kind: 'MODEL_GENERATED' });
      return mechanicsPass();
    });
    const source = vi.fn(sourceCandidate);
    const receipt = await run(baselineInvoke(), source, mechanics as never);

    expect(receipt.version).toBe('EDITRON_PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_V2R_6');
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.providerEpisode.selectedOperatorIds).toEqual([
      'read_project_file', 'list_user_assets', 'generated_composition_program',
    ]);
    expect(source).toHaveBeenCalledTimes(1);
    expect(mechanics).toHaveBeenCalledTimes(1);
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS', stateUnchanged: true,
      generated: { candidateOrdinal: 0, mechanicsResult: mechanicsPass() },
      session: { generatedSucceeded: true, attemptedUnsafeSubstitutes: [], stateEffects: [] },
    });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('rejects source not bound to the exact orchestrator arguments', async () => {
    const mechanics = vi.fn(async () => mechanicsPass());
    const receipt = await run(async (request) => {
      const turn = (request.body.input as unknown[]).filter((item) => (
        (item as JsonRecord).type === 'function_call_output'
      )).length;
      return turn === 0 ? response('generated', 'generated_composition_program', generatedArgs())
        : finish('FAIL');
    }, async (request) => ({
      ...(await sourceCandidate(request)), orchestratorSpecSha256: 'f'.repeat(64),
    }), mechanics as never);
    expect(receipt.productOutcome).toBe('FAIL');
    expect(receipt.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'FAIL', output: { code: 'PROVIDER_NATIVE_DEV02_GENERATED_SPEC_BINDING_DRIFT' },
    });
    expect(mechanics).not.toHaveBeenCalled();
  });

  it('rejects native imitation and premature success', async () => {
    let turn = 0;
    const unsafe = await run(async () => {
      turn += 1;
      return turn === 1 ? response('overlay', 'add_overlay', {
        projectId: 'oe-dev-02', expectedProjectRevision: 'R3', assetId: 'dev02-wide',
        targetRange: { startFrame: 0, endFrame: 180 },
      }) : finish('FAIL');
    }, sourceCandidate, vi.fn(async () => mechanicsPass()) as never);
    expect(unsafe.productOutcome).toBe('FAIL');
    expect(unsafe.execution).toMatchObject({
      reasonCodes: ['UNAUTHORIZED_NATIVE_SUBSTITUTE_ATTEMPTED'],
      session: { attemptedUnsafeSubstitutes: ['add_overlay'] },
    });

    const premature = await run(async () => finish('PASS'), sourceCandidate,
      vi.fn(async () => mechanicsPass()) as never);
    expect(premature.productOutcome).toBe('FAIL');
    expect(premature.execution).toMatchObject({ reasonCodes: ['GENERATED_EXECUTION_NOT_PROVEN'] });
  });

  it('isolates every candidate directory across repeated generated tool calls', async () => {
    const outputRoots: string[] = [];
    const mechanics = vi.fn(async ({ outputRoot }: { outputRoot: string }) => {
      outputRoots.push(outputRoot);
      if (outputRoots.length <= 2) throw new Error('intentional first-call render failure');
      return mechanicsPass();
    });
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      if (turn === 1) return response('generated-1', 'generated_composition_program', {
        ...generatedArgs(), constraints: { preserveNativeContinuation: true, projectMutation: 'DENY', attempt: 1 },
      });
      if (turn === 2) return response('generated-2', 'generated_composition_program', {
        ...generatedArgs(), constraints: { preserveNativeContinuation: true, projectMutation: 'DENY', attempt: 2 },
      });
      return finish('READY_FOR_PROOF');
    }, sourceCandidate, mechanics as never);

    expect(receipt.productOutcome).toBe('PASS');
    expect(outputRoots).toHaveLength(3);
    expect(new Set(outputRoots).size).toBe(3);
    expect(outputRoots.every((root) => /turn-\d+-candidate-[01]$/.test(root))).toBe(true);
  });

  realIt('renders the argument-bound model source through the real hybrid path', async () => {
    const receipt = await run(baselineInvoke(), sourceCandidate);
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.execution).toMatchObject({
      generated: { mechanicsResult: { diagnostics: [] } },
    });
  }, 300_000);
});

async function run(
  invoke: (request: SerializedProviderNativeTurnV2R) => Promise<{ status: number; body: unknown }>,
  generateSource: Parameters<typeof runProviderNativeDev02ConnectedEpisodeV2R>[0]['generateSource'],
  executeMechanics?: Parameters<typeof runProviderNativeDev02ConnectedEpisodeV2R>[0]['executeMechanics'],
) {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'editron-provider-dev02-'));
  roots.push(outputRoot);
  return runProviderNativeDev02ConnectedEpisodeV2R({
    route: { routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' },
    context: context(), invoke, outputRoot, executionId: 'dev02-connected-1',
    createdAt: '2026-08-20T00:00:00.000Z', generateSource,
    ...(executeMechanics ? { executeMechanics } : {}),
  });
}

function context(): ProviderNativeEpisodeContextV2R {
  return {
    episodeId: 'dev02-provider-native-baseline',
    objective: 'Recreate the reference as a bounded generated island and preserve its native continuation.',
    activeTarget: { taskId: 'DEV-02', conditionId: 'BASELINE', referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1 },
    revisionBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3' },
    projectState: { projectId: 'oe-dev-02', projectRevision: 'R3', durationInFrames: 345 },
    evidence: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1.facts as readonly JsonRecord[],
    preservationRules: ['preserve-reference-not-inserted', 'preserve-following-timing', 'preserve-project-duration', 'preserve-title-legibility'],
    authorityAndPolicy: { mutation: 'ISOLATED_PROXY_ONLY', targetBlueprintAuthority: 'UPSTREAM_REFERENCE_RECONSTRUCTION' },
    budget: { maxTurns: 8, maxOutputTokensPerTurn: 2048, maxIdenticalCalls: 1 },
  };
}

function baselineInvoke() {
  let turn = 0;
  return async () => {
    turn += 1;
    if (turn === 1) return response('project', 'read_project_file', { projectId: 'oe-dev-02', expectedProjectRevision: 'R3' });
    if (turn === 2) return response('assets', 'list_user_assets', { projectId: 'oe-dev-02' });
    if (turn === 3) return response('generated', 'generated_composition_program', generatedArgs());
    return finish('READY_FOR_PROOF');
  };
}

function generatedArgs(): JsonRecord {
  return {
    projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
    assetIds: ['dev02-wide', 'dev02-close'], targetRange: { startFrame: 0, endFrame: 180 },
    referenceBlueprintId: 'DEV-02-CANONICAL-REFERENCE-V2',
    layoutSpec: { objective: 'relational stacked multi-panel island with varied crops' },
    motionSpec: { objective: 'sparse build, stable hold, centre takeover' },
    typographySpec: { objective: 'centered readable title matching the reference hierarchy' },
    constraints: { preserveNativeContinuation: true, projectMutation: 'DENY' },
    evidenceIds: ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1'],
    audioCueIntents: [],
  };
}

async function sourceCandidate(request: { orchestratorSpecSha256: string }) {
  return {
    source: DEV02_GENERATED_COMPOSITION_SOURCE_V1,
    modelId: 'test-specialist-explicit-fixture', promptHash: 'd'.repeat(64),
    orchestratorSpecSha256: request.orchestratorSpecSha256,
    generationReceipt: { authority: 'TEST_FIXTURE_EXPLICIT_NOT_LIVE_MODEL', stateEffects: [] },
  };
}

function mechanicsPass() {
  return {
    sourceStage6ReceiptHash: '1'.repeat(64), sourceStage6ReceiptPath: 'source-receipt.json',
    hybridStage6ReceiptHash: '2'.repeat(64), hybridStage6ReceiptPath: 'hybrid-receipt.json',
    hybridVideoPath: 'hybrid.mp4', diagnostics: [] as string[],
  };
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: { id: `response-${callId}`, model: 'gpt-5.6-terra', status: 'completed', output: [{ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) }] } };
}

function finish(disposition: 'READY_FOR_PROOF' | 'PASS' | 'FAIL') {
  return response(`finish-${disposition}`, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`],
    evidenceIds: disposition === 'PASS' ? ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1'] : [],
    summary: disposition,
  });
}
