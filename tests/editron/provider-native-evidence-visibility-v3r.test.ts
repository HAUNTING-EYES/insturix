import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildCanonicalDev03MeasuredEvidenceV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { runProviderNativeDev03ConnectedEpisodeV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev03-connected-episode-v2r';
import {
  buildProviderNativeDev03EvidenceVisibilityV3R,
  PROVIDER_NATIVE_DEV03_PRESENTATION_OPERATORS_V3R,
} from '@/lib/editron/research/open-ended-planner/provider-native-evidence-visibility-v3r';
import { buildProviderNativeHandoffOrderManifestV2R } from '@/lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v2r';
import type { ProviderNativeEpisodeContextV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

const roots: string[] = [];
let ownerContext: Readonly<ProviderNativeEpisodeContextV2R>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes,
    analyzerSourceBytes,
  });
  ownerContext = buildProviderNativeHandoffOrderManifestV2R(
    buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured }),
  ).caseEntry.context;
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe('provider-native V3 evidence visibility and prerequisite contract', () => {
  it('hides resolved beat values when resolver handoff is the declared contract', () => {
    const split = resolverSplit();
    const modelText = JSON.stringify(split.modelContext);
    const ownerText = JSON.stringify(split.ownerEvidenceContext);

    expect(ownerText).toContain('"strongPeakFrames":[119,239,359,479]');
    expect(modelText).not.toContain('"strongPeakFrames":[119,239,359,479]');
    expect(modelText).not.toContain('"finalStrongPeakFrame":479');
    expect(split.modelContext.evidence).toContainEqual(expect.objectContaining({
      evidenceId: 'EV-DEV03-B1',
      kind: 'OWNER_EVIDENCE_AVAILABLE',
      ownerOperatorId: 'find_audio_moment',
      availableOutput: 'result',
    }));
    expect(split.receipt).toMatchObject({
      mode: 'RESOLVER_HANDOFF_REQUIRED',
      authority: 'RESEARCH_CONTEXT_VISIBILITY_ONLY_NO_PROJECT_MUTATION',
      stateEffects: [],
    });
    expect(split.receipt.ownerEvidenceContextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(split.receipt.modelContextSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('puts accepted origins and causal prerequisites in model-visible dossier supplements', () => {
    const split = resolverSplit();
    const dossier = record(record(split.modelContext.authorityAndPolicy)
      .completeCapabilityDossier);
    const supplements = records(dossier.plannerRecordSupplements);
    expect(supplements).toContainEqual({
      selectableOperatorId: 'sync_cuts_to_beats',
      inputOrigins: {
        beatPlan: [{
          origin: 'OPERATOR_OUTPUT',
          operatorId: 'find_audio_moment',
          outputField: 'result',
          evidenceId: 'EV-DEV03-B1',
        }],
      },
      prerequisites: ['find_audio_moment.result'],
    });
    expect(supplements).toContainEqual({
      selectableOperatorId: 'apply_camera_shake',
      inputOrigins: {
        expectedProjectRevision: [{
          origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'receipt.projectRevision',
        }],
        overlayId: [{
          origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalHitOverlayId',
        }],
        targetFrame: [{
          origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalStrongPeakFrame',
        }],
      },
      prerequisites: [
        'sync_cuts_to_beats.result',
        'sync_cuts_to_beats.receipt.projectRevision',
      ],
    });
    expect(dossier.prerequisitePolicySha256).toBe(
      split.receipt.prerequisitePolicySha256,
    );
  });

  it('retains exact values and removes the redundant resolver prerequisite in pre-resolved mode', () => {
    const split = buildProviderNativeDev03EvidenceVisibilityV3R({
      ownerEvidenceContext: ownerContext,
      mode: 'PRE_RESOLVED_EVIDENCE',
      permutationSeed: 'dev03-pre-resolved-20260821',
      permutationCount: 3,
    });
    expect(JSON.stringify(split.modelContext))
      .toContain('"strongPeakFrames":[119,239,359,479]');
    const sync = records(split.prerequisitePolicy.records).find((entry) => (
      entry.selectableOperatorId === 'sync_cuts_to_beats'
    ));
    expect(sync).toMatchObject({
      inputOrigins: { beatPlan: [{ origin: 'VERSIONED_MODEL_VISIBLE_EVIDENCE' }] },
      prerequisites: [],
    });
  });

  it('freezes deterministic complete tool-menu permutations rather than runtime randomness', () => {
    const split = resolverSplit();
    const orders = split.presentationPermutations;
    expect(orders).toHaveLength(3);
    expect(new Set(orders.map((order) => order.join('|'))).size).toBe(3);
    for (const order of orders) {
      expect([...order].sort()).toEqual(
        [...PROVIDER_NATIVE_DEV03_PRESENTATION_OPERATORS_V3R].sort(),
      );
    }
    expect(new Set(orders.map((order) => order.indexOf('find_audio_moment'))).size)
      .toBeGreaterThan(1);
    expect(resolverSplit().presentationPermutations).toEqual(orders);
  });

  it('sends only model-visible evidence while the isolated owner retains its bound context', async () => {
    const split = resolverSplit();
    const requests: SerializedProviderNativeTurnV2R[] = [];
    const invoke = vi.fn(async (request: SerializedProviderNativeTurnV2R) => {
      requests.push(request);
      return finishUnverifiable();
    });
    const outputDir = await temporaryRoot();
    const receipt = await runProviderNativeDev03ConnectedEpisodeV2R({
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      context: split.modelContext,
      ownerEvidenceContext: split.ownerEvidenceContext,
      invoke,
      outputDir,
      executionId: 'dev03-separated-context-test',
      createdAt: '2026-08-21T00:00:00.000Z',
      eligibleOperatorIds: split.presentationPermutations[0],
    });

    expect(receipt.productOutcome).toBe('UNVERIFIABLE');
    expect(receipt.execution).toMatchObject({
      disposition: 'NOT_RUN_PROVIDER_TERMINAL',
      session: { mutationStages: [], changedPaths: [] },
    });
    expect(requests).toHaveLength(1);
    const requestText = JSON.stringify(requests[0]);
    expect(requestText).not.toContain('"strongPeakFrames":[119,239,359,479]');
    expect(requestText).toContain('find_audio_moment.result');
  });

  it('rejects an owner context whose revision-bound evidence hash does not match', async () => {
    const split = resolverSplit();
    const clonedOwner = clone(split.ownerEvidenceContext);
    const alteredOwner: ProviderNativeEpisodeContextV2R = {
      ...clonedOwner,
      evidence: clonedOwner.evidence.map((fact) => (
        fact.kind === 'HASH_BOUND_MEASURED_AUDIO'
          ? { ...fact, finalStrongPeakFrame: 478 }
          : fact
      )),
    };
    const outputDir = await temporaryRoot();
    await expect(runProviderNativeDev03ConnectedEpisodeV2R({
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      context: split.modelContext,
      ownerEvidenceContext: alteredOwner,
      invoke: vi.fn(),
      outputDir,
      executionId: 'dev03-owner-drift-test',
      createdAt: '2026-08-21T00:00:00.000Z',
      eligibleOperatorIds: split.presentationPermutations[0],
    })).rejects.toThrow('PROVIDER_NATIVE_DEV03_SEPARATED_CONTEXT_BINDING_INVALID');
  });
});

function resolverSplit() {
  return buildProviderNativeDev03EvidenceVisibilityV3R({
    ownerEvidenceContext: ownerContext,
    mode: 'RESOLVER_HANDOFF_REQUIRED',
    permutationSeed: 'dev03-resolver-handoff-20260821',
    permutationCount: 3,
  });
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-evidence-visibility-'));
  roots.push(root);
  return root;
}

function finishUnverifiable() {
  return {
    status: 200,
    body: {
      id: 'response-finish-unverifiable',
      model: 'gpt-5.6-luna',
      status: 'completed',
      output: [{
        type: 'function_call',
        call_id: 'finish-unverifiable',
        name: 'finish_editron_research_episode',
        arguments: JSON.stringify({
          disposition: 'UNVERIFIABLE',
          reasonCodes: ['TEST_STOP_BEFORE_MUTATION'],
          evidenceIds: [],
          summary: 'Deterministic visibility test stops before mutation.',
        }),
      }],
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}
