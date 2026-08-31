import { describe, expect, it, vi } from 'vitest';

import { analyzeProjectTimestampVideoV1 }
  from '@/lib/editron/services/project-timestamp-video-analysis-v1';
import {
  buildNativeMediaTimestampAnalysisMaterializationFixtureV1,
  rehashNativeMediaTimestampAnalysisMaterializationFixtureV1,
  TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
} from './helpers/native-media-timestamp-analysis-materialization-fixture';

const SELECTED_SOURCE = Object.freeze({
  sourceVersionSha256: '5'.repeat(64),
  storageVersionSha256: '6'.repeat(64),
  sourcePtsCadenceMapStateSha256V3: 'f'.repeat(64),
});

describe('project timestamp video analysis V1', () => {
  it('materializes and maps exact project-coordinate evidence for the selected source', async () => {
    const materialize = vi.fn(async () =>
      buildNativeMediaTimestampAnalysisMaterializationFixtureV1());

    const result = await run(materialize);

    expect(materialize).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: '1',
      expectedProjectRevision:
        TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      windowLocalStartFrame: 0,
      windowDurationInFrames: 90,
      deliveryContract: 'ANALYSIS_RECEIPT_V1',
    });
    expect(result).toMatchObject({
      disposition: 'ANALYZED',
      sourceVersionSha256: SELECTED_SOURCE.sourceVersionSha256,
      storageVersionSha256: SELECTED_SOURCE.storageVersionSha256,
      vision: {
        sceneChanges: ['330'],
        summary: 'Interview summary',
      },
    });
  });

  it('rejects a valid materialization from a different selected source', async () => {
    const result = await run(vi.fn(async () =>
      buildNativeMediaTimestampAnalysisMaterializationFixtureV1({
        sourceVersionSha256: '1'.repeat(64),
      })));

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SELECTED_SOURCE_SCOPE_MISMATCH',
      diagnostic: null,
    });
  });

  it('rejects fully rehashed project-coordinate drift', async () => {
    const value = buildNativeMediaTimestampAnalysisMaterializationFixtureV1();
    value.analysisReceipt.projectId = 'project-other';
    rehashNativeMediaTimestampAnalysisMaterializationFixtureV1(value);

    const result = await run(vi.fn(async () => value));

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'MATERIALIZATION_INVALID',
      diagnostic:
        'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH',
    });
  });

  it('does not downgrade an exact source to the ordinary analysis path', async () => {
    const result = await run(vi.fn(async () => ({
      disposition: 'NOT_APPLICABLE',
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
    })));

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'EXACT_TIMESTAMP_SOURCE_REQUIRED',
      diagnostic: 'ASSET_NOT_TIMESTAMP_MANAGED',
    });
  });

  it('preserves an exact materializer stop without provider fallback', async () => {
    const result = await run(vi.fn(async () => ({
      disposition: 'UNVERIFIABLE',
      reason: 'ANALYSIS_RUNTIME_REQUIRED',
    })));

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'MATERIALIZATION_UNVERIFIABLE',
      diagnostic: 'ANALYSIS_RUNTIME_REQUIRED',
    });
  });

  it('sanitizes runtime diagnostics and rejects ambiguous semantic evidence', async () => {
    const unavailable = await run(vi.fn(async () => {
      throw new Error('private URL and token must not escape');
    }));
    expect(unavailable).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'MATERIALIZATION_UNAVAILABLE',
      diagnostic: null,
    });

    const value = buildNativeMediaTimestampAnalysisMaterializationFixtureV1();
    value.analysisReceipt.observations.push({
      kind: 'GLOBAL',
      signal: 'SUMMARY',
      detail: 'Conflicting summary',
      coordinateDisposition: 'NO_RANGE_COORDINATE',
    });
    rehashNativeMediaTimestampAnalysisMaterializationFixtureV1(value);
    const ambiguous = await run(vi.fn(async () => value));
    expect(ambiguous).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'VISION_MAPPING_INVALID',
      diagnostic: 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_VISION_SUMMARY_AMBIGUOUS',
    });
  });
});

function run(materialize: (input: unknown) => Promise<unknown>) {
  return analyzeProjectTimestampVideoV1({
    userId: 'user-1',
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 1,
    projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
    overlayFromFrame: 300,
    overlayDurationInFrames: 90,
    selectedSource: SELECTED_SOURCE,
    ports: { materialize },
  });
}
