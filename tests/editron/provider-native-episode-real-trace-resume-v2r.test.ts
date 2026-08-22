import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  runStage25ProviderDependencyResumeReplayV1,
  type Stage25ProviderDependencyReplaySourceV1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-resume-replay-v1';
import {
  STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
  STAGE25_DEPENDENCY_BEAT_PLAN_V1,
  Stage25ProviderDependencyOwnerV1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1';

type JsonRecord = Record<string, unknown>;

interface LunaReplayFixtureV1 {
  version: 'EDITRON_PROVIDER_NATIVE_LUNA_P1_V3R3_RAW_RESPONSES_V1';
  authority: 'IMMUTABLE_ZERO_INFERENCE_REPLAY_FIXTURE';
  source: Stage25ProviderDependencyReplaySourceV1;
  compression: 'DEFLATE_RAW_BASE64';
  rawResponsesJsonSha256: string;
  rawResponsesDeflateRawBase64: string;
  stateEffects: readonly [];
}

const FIXTURE = loadFixture();
const RAW_RESPONSES = decodeRawResponses(FIXTURE);
const GOLDEN_RECEIPT = loadJson(
  'docs/editron/open-ended-editing/'
    + 'stage25-provider-dependency-resume-replay-v1-receipt.json',
);

describe('provider-native real Luna trace checkpoint resume', () => {
  it('replays the exact paid P1 responses across a fresh-owner restart', async () => {
    const receipt = await runStage25ProviderDependencyResumeReplayV1({
      source: FIXTURE.source,
      rawResponses: RAW_RESPONSES,
    });
    expect(receipt).toMatchObject({
      authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION',
      interruption: {
        afterTurn: 4,
        freshOwnerRestored: true,
        prefixMutationsReplayed: false,
      },
      replay: {
        prefixProviderCalls: 4,
        suffixProviderCalls: 4,
        inferenceCalls: 0,
        selectedOperatorIds: [
          'find_audio_moment', 'sync_cuts_to_beats', 'find_visual_moment',
          'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
        ],
        terminalDisposition: 'READY_FOR_PROOF',
        finalProjectRevision: 'R45',
        finalOwnerStateSha256: FIXTURE.source.ownerAfterStateSha256,
        prefixRequestIdentityPreserved: true,
        suffixRequestIdentityChangedByCompactResumePrompt: true,
        semanticOutcomeMatchesUninterruptedSource: true,
      },
      whatHasNotBeenChecked: [
        'DURABLE_STORAGE', 'REAL_WORKER_RESTART', 'PROJECTSERVICE_MUTATION',
        'AUTHENTICATED_RESULT_STORE', 'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE',
      ],
      stateEffects: [],
    });
    const material = { ...receipt } as JsonRecord;
    delete material.receiptSha256;
    expect(receipt.receiptSha256).toBe(hashCanonicalJsonV1(material));
    expect(receipt).toEqual(GOLDEN_RECEIPT);
    expect(receipt.resumedEpisode).not.toMatchObject({
      receiptSha256: FIXTURE.source.episodeReceiptSha256,
      transcriptSha256: FIXTURE.source.episodeTranscriptSha256,
    });
  });

  it('rejects a changed captured response before executing the prefix', async () => {
    const tampered = structuredClone(RAW_RESPONSES);
    Object.assign(record(tampered[0]), { forged: true });
    await expect(runStage25ProviderDependencyResumeReplayV1({
      source: FIXTURE.source,
      rawResponses: tampered,
    })).rejects.toThrow('RAW_RESPONSE_1_MISMATCH');
  });

  it('rejects a rehashed owner snapshot containing non-canonical clone state', async () => {
    const owner = await buildPrefixOwner();
    const forged = structuredClone(owner.snapshot()) as JsonRecord;
    const project = record(forged.currentProject);
    const overlays = records(project.overlays);
    record(overlays.find(({ id }) => id === 42)).styles = { opacity: 0.25 };
    forged.afterStateHash = hashCanonicalJsonV1(project);
    const material = { ...forged };
    delete material.snapshotSha256;
    forged.snapshotSha256 = hashCanonicalJsonV1(material);
    expect(() => Stage25ProviderDependencyOwnerV1.restore(forged))
      .toThrow('RESTORE_AFTERSTATEHASH_MISMATCH');
  });
});

function loadFixture(): LunaReplayFixtureV1 {
  return loadJson(
    'tests/fixtures/editron/provider-native-luna-p1-v3r3-raw-responses.json',
  ) as unknown as LunaReplayFixtureV1;
}

function loadJson(relativePath: string): JsonRecord {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), relativePath), 'utf8'),
  ) as JsonRecord;
}

function decodeRawResponses(fixture: LunaReplayFixtureV1): unknown[] {
  expect(fixture).toMatchObject({
    version: 'EDITRON_PROVIDER_NATIVE_LUNA_P1_V3R3_RAW_RESPONSES_V1',
    authority: 'IMMUTABLE_ZERO_INFERENCE_REPLAY_FIXTURE',
    compression: 'DEFLATE_RAW_BASE64',
    stateEffects: [],
  });
  const payload = inflateRawSync(
    Buffer.from(fixture.rawResponsesDeflateRawBase64, 'base64'),
  ).toString('utf8');
  expect(createHash('sha256').update(payload).digest('hex'))
    .toBe(fixture.rawResponsesJsonSha256);
  const responses = JSON.parse(payload) as unknown[];
  expect(responses).toHaveLength(8);
  return responses;
}

async function buildPrefixOwner(): Promise<Stage25ProviderDependencyOwnerV1> {
  const owner = new Stage25ProviderDependencyOwnerV1();
  expect(await owner.execute({
    turn: 1, operatorId: 'find_audio_moment',
    arguments: { projectId: 'project-42', query: 'measured strong music impacts' },
  })).toMatchObject({ disposition: 'OK' });
  expect(await owner.execute({
    turn: 3, operatorId: 'sync_cuts_to_beats', arguments: {
      projectId: 'project-42', expectedProjectRevision: 'R42',
      overlayIds: [1, 2, 3], beatPlan: STAGE25_DEPENDENCY_BEAT_PLAN_V1,
      beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
    },
  })).toMatchObject({ disposition: 'OK' });
  expect(await owner.execute({
    turn: 4, operatorId: 'find_visual_moment',
    arguments: { projectId: 'project-42', query: 'verified product reveal moment' },
  })).toMatchObject({ disposition: 'OK' });
  return owner;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(
    (entry): entry is JsonRecord => Boolean(entry)
      && typeof entry === 'object' && !Array.isArray(entry),
  ) : [];
}
