import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import { runSealedHoldoutEpisodeV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r';
import { SealedHoldoutH04OwnerStateV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-owner-state-v3r';

type JsonRecord = Record<string, unknown>;

describe('sealed HOLD-04 evolving isolated owner state V3R', () => {
  it('applies the canonical cut and binds the resulting state to the writer revision', async () => {
    const manifest = await buildManifest();
    const owner = new SealedHoldoutH04OwnerStateV3R({
      manifest,
      caseId: 'HOLD-04:C1',
    });
    const before = owner.readTimeline({ currentProjectRevision: 'R6' });
    const transition = owner.executeMutation({
      operatorId: 'cut_section',
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        targetRange: { startFrame: 120, endFrame: 225 }, evidenceIds: ['E1', 'E2'],
      },
      beforeProjectRevision: 'R6',
      writerIssuedProjectRevision: 'OE-HOLD-test-writer',
    });
    const after = owner.readTimeline({ currentProjectRevision: 'OE-HOLD-test-writer' });

    expect(before).toMatchObject({
      stateReceipt: { projectRevision: 'R6', durationInFrames: 540 },
      projection: { captionSemanticState: { wordCount: 8, groupCount: 2 } },
    });
    expect(transition).toMatchObject({
      timelineCoordinateTransform: {
        beforeDurationInFrames: 540, afterDurationInFrames: 435,
        removedRange: { startFrame: 120, endFrame: 225 },
      },
      splitChildren: [{ beforeOverlayId: 401, rightSourceStartFrame: 225 }],
      isolatedStateTransition: {
        afterStateReceipt: {
          projectRevision: 'OE-HOLD-test-writer', durationInFrames: 435,
        },
        projection: {
          captionSemanticState: {
            text: 'our launch is Friday', wordCount: 4, groupCount: 1,
            presentationHash: 'sha256:caption-presentation-v1',
          },
        },
      },
    });
    expect(record(after.stateReceipt).stateSha256)
      .toBe(record(record(transition.isolatedStateTransition).afterStateReceipt).stateSha256);
    expect(() => owner.readTimeline({ currentProjectRevision: 'R6' }))
      .toThrow('SEALED_H04_STATE_READ_REVISION_CONFLICT');
    expect(owner.snapshot()).toMatchObject({ stateEffects: [] });
  });

  it('carries the actual post-cut state through the V3 provider-native episode', async () => {
    const manifest = await buildManifest();
    let turn = 0;
    const episode = await runSealedHoldoutEpisodeV3R({
      manifest,
      caseId: 'HOLD-04:C1',
      route: route(),
      invoke: vi.fn(async (request) => {
        turn += 1;
        const output = turn === 1
          ? call('transcript', 'get_video_transcription', {
            projectId: 'oe-hold-04', assetId: 'h04-host',
          })
          : turn === 2
            ? call('before', 'get_timeline_view', {
              projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
            })
            : turn === 3
              ? call('cut', 'cut_section', {
                projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
                targetRange: { startFrame: 120, endFrame: 225 },
                evidenceIds: ['E1', 'E2'],
                constraints: { retainOccurrence: 'SECOND', preserveCaptionPresentation: true },
              })
              : turn === 4
                ? call('after', 'get_timeline_view', {
                  projectId: 'oe-hold-04',
                  expectedProjectRevision: requireWriterRevision(request.body),
                })
                : finish('READY_FOR_PROOF', ['E1', 'E2']);
        return response(turn, output);
      }),
    });

    expect(episode.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(episode.selectedOperatorIds).toEqual([
      'get_video_transcription', 'get_timeline_view', 'cut_section', 'get_timeline_view',
    ]);
    expect(episode.turns.slice(0, 4).every(({ execution }) =>
      record(execution).disposition === 'OK')).toBe(true);
    const cutOutput = record(record(episode.turns[2].execution).output);
    const afterOutput = record(record(episode.turns[3].execution).output);
    const writerRevision = String(record(cutOutput.receipt).projectRevision);
    expect(cutOutput).toMatchObject({
      timelineCoordinateTransform: { afterDurationInFrames: 435 },
      splitChildren: [{ beforeOverlayId: 401, rightSourceStartFrame: 225 }],
      receipt: {
        proof: {
          isolatedStateTransition: {
            afterStateReceipt: { projectRevision: writerRevision, durationInFrames: 435 },
          },
        },
      },
    });
    expect(record(record(afterOutput.result).isolatedTimelineState)).toMatchObject({
      stateReceipt: { projectRevision: writerRevision, durationInFrames: 435 },
      projection: {
        captionSemanticState: { text: 'our launch is Friday', wordCount: 4, groupCount: 1 },
      },
    });
    expect(episode.stateEffects).toEqual([]);
  });

  it('returns a conflict for a stale post-cut reread instead of exposing old state', async () => {
    const manifest = await buildManifest();
    let turn = 0;
    const episode = await runSealedHoldoutEpisodeV3R({
      manifest,
      caseId: 'HOLD-04:C1',
      route: route(),
      invoke: vi.fn(async () => {
        turn += 1;
        return response(turn, turn === 1
          ? call('transcript', 'get_video_transcription', {
            projectId: 'oe-hold-04', assetId: 'h04-host',
          })
          : turn === 2
            ? call('before', 'get_timeline_view', {
              projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
            })
            : turn === 3
              ? call('cut', 'cut_section', {
                projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
                targetRange: { startFrame: 120, endFrame: 225 }, evidenceIds: ['E1', 'E2'],
              })
              : turn === 4
                ? call('stale', 'get_timeline_view', {
                  projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
                })
                : finish('UNVERIFIABLE', ['E1', 'E2']));
      }),
    });

    expect(record(episode.turns[2].execution).disposition).toBe('OK');
    expect(record(episode.turns[3].execution)).toMatchObject({ disposition: 'CONFLICT' });
    expect(episode.terminal.disposition).toBe('UNVERIFIABLE');
    expect(episode.stateEffects).toEqual([]);
  });
});

async function buildManifest() {
  const base = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  return buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: base,
  });
}
function route() {
  return {
    routeId: 'OPENAI_TERRA' as const, provider: 'openai' as const,
    model: 'gpt-5.6-terra' as const, claimedModelIdentity: 'gpt-5.6-terra',
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
function response(turn: number, output: JsonRecord) {
  return {
    status: 200,
    body: { id: `v3-h04-${turn}`, model: 'gpt-5.6-terra', status: 'completed', output: [output] },
  };
}
function requireWriterRevision(value: unknown): string {
  const revisions = collectStringsForKey(value, 'projectRevision')
    .filter((entry) => entry.startsWith('OE-HOLD-'));
  const revision = revisions.at(-1);
  if (!revision) throw new Error('TEST_H04_WRITER_REVISION_MISSING');
  return revision;
}
function collectStringsForKey(value: unknown, key: string): string[] {
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) return [];
    try {
      return collectStringsForKey(JSON.parse(candidate) as unknown, key);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap((entry) => collectStringsForKey(entry, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as JsonRecord).flatMap(([entryKey, entry]) => [
    ...(entryKey === key && typeof entry === 'string' ? [entry] : []),
    ...collectStringsForKey(entry, key),
  ]);
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
