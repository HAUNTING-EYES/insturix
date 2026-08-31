import { describe, expect, it, vi } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import { analyzeProjectFiveTrackV2 }
  from '@/lib/editron/services/project-five-track-analysis-v2';
import type { ProjectFiveTrackAnalysisPortsV2 }
  from '@/lib/editron/services/project-five-track-analysis-v2';
import type { AssetAnalysisSourceBindingV2 }
  from '@/lib/editron/services/asset-analysis-source-cache-v2';
import { createAssetTranscriptionSourceBindingV2 }
  from '@/lib/editron/services/asset-transcription-source-binding-v2';
import type {
  SourceBoundAssetTranscriptionPortsV2,
  SourceBoundAssetTranscriptionSuccessV2,
} from '@/lib/editron/services/source-bound-asset-transcription-v2';
import type { AssetAnalysis }
  from '@/lib/editron/services/five-track-analysis';
import {
  buildNativeVideoAudioRights,
  CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
} from '@/lib/editron/services/native-video-audio-rights';
import type { Project } from '@/lib/editron/services/project-service';
import { createProjectVideoSourceVersionPinV1 }
  from '@/lib/editron/services/project-video-source-version-pin-v1';
import type { SourceMediaRightsGrantStateV1 }
  from '@/lib/editron/services/source-media-rights-owner-v1';
import type { SourceMediaRightsLedgerStorePortsV1 }
  from '@/lib/editron/services/source-media-rights-ledger-v1';
import { buildVerifiedProxySourceV3FixtureV1 }
  from './helpers/verified-proxy-source-v3-fixture';
import {
  buildNativeMediaTimestampAnalysisMaterializationFixtureV1,
  TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
} from './helpers/native-media-timestamp-analysis-materialization-fixture';

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: vi.fn(),
}));

type LoadedAnalysisAssetV2 = Awaited<ReturnType<
ProjectFiveTrackAnalysisPortsV2['loadAssets']
>>[number];

describe('project five-track analysis v2', () => {
  it('reads exact source-bound cache without provider work and admits a full source', async () => {
    const fixture = await sourceFixture('cached', ['3000', '3000', '3000']);
    const project = projectFixture(fixture, 3);
    const analysis = completedAnalysis(fixture.assetId, fixture.userId, 100);
    const readAnalysis = vi.fn(async (
      _binding: AssetAnalysisSourceBindingV2,
    ): Promise<AssetAnalysis | null> => analysis);
    const runAnalysis = vi.fn(async (
      _input: Parameters<ProjectFiveTrackAnalysisPortsV2['runAnalysis']>[0],
    ): Promise<AssetAnalysis> => analysis);

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'CACHE_ONLY',
      ports: ports(fixture.asset, readAnalysis, runAnalysis),
    });

    expect(result).toMatchObject({
      analyzed: 0,
      cached: 1,
      failed: 0,
      timedOut: false,
      overlays: [{
        analysisDisposition: 'CACHED',
        analysisBlockReason: null,
        timelineAdmission: {
          disposition: 'ADMITTED',
          timelineOffsetFrames: 30,
        },
      }],
    });
    expect(readAnalysis).toHaveBeenCalledTimes(1);
    const binding = readAnalysis.mock.calls[0]?.[0];
    expect(binding).toMatchObject({
      assetId: fixture.assetId,
      userId: fixture.userId,
      sourceRole: 'PROXY',
      sourceVersionSha256: fixture.verifiedBinding.sourceVersionSha256,
      storageVersionSha256: fixture.verifiedBinding.storageVersionSha256,
    });
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('can analyze exact bytes while blocking a trimmed legacy timeline consumer', async () => {
    const fixture = await sourceFixture('trimmed', ['3000', '3000', '3000']);
    const project = projectFixture(fixture, 2);
    const analysis = completedAnalysis(fixture.assetId, fixture.userId, 100);
    const readAnalysis = vi.fn(async (
      _binding: AssetAnalysisSourceBindingV2,
    ): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (
      _input: Parameters<ProjectFiveTrackAnalysisPortsV2['runAnalysis']>[0],
    ): Promise<AssetAnalysis> => analysis);

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      ports: ports(fixture.asset, readAnalysis, runAnalysis),
    });

    expect(result).toMatchObject({
      analyzed: 1,
      cached: 0,
      failed: 0,
      overlays: [{
        analysisDisposition: 'ANALYZED',
        timelineAdmission: {
          disposition: 'BLOCKED',
          reason: 'FULL_SOURCE_RANGE_REQUIRED',
        },
      }],
    });
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it('analyzes VFR in exact project coordinates without admitting the legacy EDL', async () => {
    const fixture = await sourceFixture(
      'vfr',
      ['3000', '1500', '4500'],
    );
    const project = projectFixture(fixture, 3);
    const readAnalysis = vi.fn(async (
      _binding: AssetAnalysisSourceBindingV2,
    ): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (
      _input: Parameters<ProjectFiveTrackAnalysisPortsV2['runAnalysis']>[0],
    ): Promise<AssetAnalysis> => completedAnalysis(
      fixture.assetId,
      fixture.userId,
      100,
    ));
    const materialization =
      buildNativeMediaTimestampAnalysisMaterializationFixtureV1({
        projectId: project.projectId,
        overlayId: '1',
        projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
        timelineStartFrame: '30',
        timelineEndExclusiveFrame: '33',
        sourceVersionSha256: fixture.verifiedBinding.sourceVersionSha256,
        storageVersionSha256: fixture.verifiedBinding.storageVersionSha256,
        sourcePtsCadenceMapStateSha256V3:
          fixture.verifiedBinding.sourcePtsCadenceMapStateSha256V3,
      });
    const materializeTimestampAnalysis = vi.fn(async () => materialization);
    const resolveSelectedSourceAudioEvidence = vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED' as const,
      diagnostic: null,
    }));
    const transcription = transcriptionSuccess(fixture);
    const resolveSelectedSourceTranscription = vi.fn(async (input: Parameters<
      NonNullable<ProjectFiveTrackAnalysisPortsV2['resolveSelectedSourceTranscription']>
    >[0]) => ({
      ...transcription,
      selectedSource: input.selectedSource!,
    }));

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      transcription: transcriptionOptions(),
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        materializeTimestampAnalysis,
        resolveSelectedSourceAudioEvidence,
        undefined,
        undefined,
        transcriptionPorts(),
        resolveSelectedSourceTranscription,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysis: null,
      analysisDisposition: 'PROJECT_COORDINATE_ANALYZED',
      analysisBlockReason: null,
      projectCoordinateAnalysis: {
        disposition: 'ANALYZED',
        vision: { sceneChanges: ['30'] },
        audioEvidence: {
          disposition: 'UNVERIFIABLE',
          reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED',
        },
        transcription: {
          disposition: 'GENERATED',
          timingBasis: 'MEASURED_WORD',
          wordCount: 2,
          analysisConsumption: 'TIMESTAMP_EVIDENCE_ONLY',
        },
      },
      timelineAdmission: {
        disposition: 'BLOCKED',
        reason: 'PROJECT_COORDINATE_FIVE_TRACK_CONSUMER_REQUIRED',
      },
    });
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(materializeTimestampAnalysis).toHaveBeenCalledTimes(1);
    expect(resolveSelectedSourceAudioEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        pcmWindow: {
          userId: fixture.userId,
          projectRate: { numerator: '30', denominator: '1' },
          overlayFromFrame: 30,
          overlayDurationInFrames: 3,
          windowLocalStartFrame: 0,
          windowDurationInFrames: 3,
          sourceStartFrame: '0',
          sourceEndExclusiveFrame: '3',
          timelineFrameQueries: ['30'],
          expectedVisualTransformSha256: materialization.transformSha256,
        },
        rightsScope: {
          tenantId: fixture.userId,
          userId: fixture.userId,
          orgId: null,
          projectOwnerId: fixture.userId,
        },
      }),
    );
    expect(materializeTimestampAnalysis.mock.invocationCallOrder[0])
      .toBeLessThan(
        resolveSelectedSourceAudioEvidence.mock.invocationCallOrder[0]!,
      );
    expect(result.overlays[0]?.projectCoordinateAnalysis?.audioEvidence)
      .toMatchObject({ reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED' });
  });

  it('feeds measured selected-source words into same-rate five-track analysis', async () => {
    const fixture = await sourceFixture(
      'transcription-bound',
      ['3000', '3000', '3000'],
    );
    const project = projectFixture(fixture, 3);
    const analysis = completedAnalysis(fixture.assetId, fixture.userId, 100);
    const readAnalysis = vi.fn(async (
      _binding: AssetAnalysisSourceBindingV2,
    ): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (input: Parameters<
      ProjectFiveTrackAnalysisPortsV2['runAnalysis']
    >[0]): Promise<AssetAnalysis> => {
      expect(input.options).toMatchObject({
        transcript: 'hello world',
        words: [
          { word: 'hello', startMs: 100, endMs: 300 },
          { word: 'world', startMs: 350, endMs: 700 },
        ],
      });
      return analysis;
    });
    const transcription = transcriptionSuccess(fixture);
    const resolveSelectedSourceTranscription = vi.fn(async (input: Parameters<
      NonNullable<ProjectFiveTrackAnalysisPortsV2['resolveSelectedSourceTranscription']>
    >[0]) => ({
      ...transcription,
      selectedSource: input.selectedSource!,
    }));

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      transcription: transcriptionOptions(),
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        undefined,
        undefined,
        undefined,
        undefined,
        transcriptionPorts(),
        resolveSelectedSourceTranscription,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'ANALYZED',
      analysisBlockReason: null,
      transcription: {
        disposition: 'GENERATED',
        timingBasis: 'MEASURED_WORD',
        wordCount: 2,
        analysisConsumption: 'SAME_RATE_FIVE_TRACK_INPUT',
      },
    });
    expect(resolveSelectedSourceTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
        selectedSource: expect.objectContaining({
          sourceRole: 'PROXY',
          sourceVersion: expect.objectContaining({
            sourceVersionSha256: fixture.verifiedBinding.sourceVersionSha256,
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(readAnalysis).toHaveBeenCalledTimes(1);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it('keeps cache-only transcription misses provider-free and analysis-free', async () => {
    const fixture = await sourceFixture(
      'transcription-cache-miss',
      ['3000', '3000', '3000'],
    );
    const project = projectFixture(fixture, 3);
    const readAnalysis = vi.fn(async (
      _binding: AssetAnalysisSourceBindingV2,
    ): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (
      _input: Parameters<ProjectFiveTrackAnalysisPortsV2['runAnalysis']>[0],
    ): Promise<AssetAnalysis> => completedAnalysis(
      fixture.assetId,
      fixture.userId,
      100,
    ));
    const resolveSelectedSourceTranscription = vi.fn(async () => ({
      disposition: 'BLOCKED' as const,
      diagnosticCode: 'ASSET_TRANSCRIPTION_CACHE_MISS',
    }));
    const providerTranscriber = { transcribe: vi.fn() };

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'CACHE_ONLY',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      transcription: transcriptionOptions(),
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        undefined,
        undefined,
        undefined,
        undefined,
        transcriptionPorts({ providerTranscriber }),
        resolveSelectedSourceTranscription,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysis: null,
      analysisDisposition: 'UNAVAILABLE',
      analysisBlockReason:
        'SELECTED_SOURCE_TRANSCRIPTION_ASSET_TRANSCRIPTION_CACHE_MISS',
      transcription: {
        disposition: 'BLOCKED',
        diagnosticCode: 'ASSET_TRANSCRIPTION_CACHE_MISS',
      },
    });
    expect(resolveSelectedSourceTranscription).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'CACHE_ONLY' }),
      expect.any(Object),
    );
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(providerTranscriber.transcribe).not.toHaveBeenCalled();
  });

  it('blocks before visual or provider analysis when current source rights fail', async () => {
    const fixture = await sourceFixture('rights-blocked', ['3000', '1500']);
    const project = projectFixture(fixture, 2);
    const readAnalysis = vi.fn(async (): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (): Promise<AssetAnalysis> =>
      completedAnalysis(fixture.assetId, fixture.userId, 100));
    const materializeTimestampAnalysis = vi.fn();
    const authorizeCurrentSourceRights = vi.fn(async () => ({
      disposition: 'BLOCKED' as const,
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_REVOKED',
    }));

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        materializeTimestampAnalysis,
        undefined,
        authorizeCurrentSourceRights as never,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'UNAVAILABLE',
      analysisBlockReason:
        'SELECTED_SOURCE_RIGHTS_SOURCE_MEDIA_RIGHTS_REVOKED',
      sourceMediaRightsAuthorizationReceiptSha256: null,
    });
    expect(materializeTimestampAnalysis).not.toHaveBeenCalled();
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('migrates an exact stored attestation before provider work in full mode', async () => {
    const fixture = await sourceFixture('rights-migrated', ['3000', '3000']);
    const asset = {
      ...fixture.asset,
      audioRights: buildNativeVideoAudioRights({
        sourceAssetId: fixture.assetId,
        userId: fixture.userId,
        attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
        attestedAt: new Date('2026-08-31T10:00:00.000Z'),
      }),
    } as LoadedAnalysisAssetV2;
    const project = projectFixture({ ...fixture, asset }, 2);
    const readAnalysis = vi.fn(async (): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (): Promise<AssetAnalysis> =>
      completedAnalysis(fixture.assetId, fixture.userId, 100));
    const rights = rightsStoreRuntime();

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      ports: ports(
        asset,
        readAnalysis,
        runAnalysis,
        undefined,
        undefined,
        null,
        rights.store,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'ANALYZED',
      analysisBlockReason: null,
      sourceMediaRightsAuthorizationReceiptSha256:
        expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(rights.commit).toHaveBeenCalledTimes(1);
    expect(rights.commit.mock.invocationCallOrder[0])
      .toBeLessThan(readAnalysis.mock.invocationCallOrder[0]!);
    expect(readAnalysis.mock.invocationCallOrder[0])
      .toBeLessThan(runAnalysis.mock.invocationCallOrder[0]!);
  });

  it('blocks missing legacy attestation before cache or provider work', async () => {
    const fixture = await sourceFixture('rights-unattested', ['3000', '3000']);
    const project = projectFixture(fixture, 2);
    const readAnalysis = vi.fn(async (): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (): Promise<AssetAnalysis> =>
      completedAnalysis(fixture.assetId, fixture.userId, 100));
    const rights = rightsStoreRuntime();

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'FULL',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        undefined,
        undefined,
        null,
        rights.store,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'UNAVAILABLE',
      analysisBlockReason:
        'SELECTED_SOURCE_RIGHTS_PROJECT_SOURCE_RIGHTS_MIGRATION_ATTESTATION_REQUIRED',
      sourceMediaRightsAuthorizationReceiptSha256: null,
    });
    expect(rights.commit).not.toHaveBeenCalled();
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('keeps cache-only analysis read-only when a durable grant is missing', async () => {
    const fixture = await sourceFixture('rights-cache-only', ['3000', '3000']);
    const project = projectFixture(fixture, 2);
    const readAnalysis = vi.fn(async (): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (): Promise<AssetAnalysis> =>
      completedAnalysis(fixture.assetId, fixture.userId, 100));
    const rights = rightsStoreRuntime();

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'CACHE_ONLY',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        undefined,
        undefined,
        null,
        rights.store,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'UNAVAILABLE',
      analysisBlockReason:
        'SELECTED_SOURCE_RIGHTS_SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING',
    });
    expect(rights.commit).not.toHaveBeenCalled();
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('does not materialize timestamp analysis in cache-only mode', async () => {
    const fixture = await sourceFixture('vfr-cache', ['3000', '1500', '4500']);
    const project = projectFixture(fixture, 3);
    const readAnalysis = vi.fn(async (): Promise<AssetAnalysis | null> => null);
    const runAnalysis = vi.fn(async (): Promise<AssetAnalysis> =>
      completedAnalysis(fixture.assetId, fixture.userId, 100));
    const materializeTimestampAnalysis = vi.fn();

    const result = await analyzeProjectFiveTrackV2({
      project,
      userId: fixture.userId,
      mode: 'CACHE_ONLY',
      projectRevisionV1: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      ports: ports(
        fixture.asset,
        readAnalysis,
        runAnalysis,
        materializeTimestampAnalysis,
      ),
    });

    expect(result.overlays[0]).toMatchObject({
      analysisDisposition: 'UNAVAILABLE',
      analysisBlockReason: 'TIMESTAMP_ANALYSIS_CACHE_MISS',
      projectCoordinateAnalysis: null,
    });
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(materializeTimestampAnalysis).not.toHaveBeenCalled();
  });
});

async function sourceFixture(tag: string, frameDurations: readonly string[]) {
  const fixture = await buildVerifiedProxySourceV3FixtureV1({
    tag,
    userId: `user-${tag}`,
    frameDurations,
  });
  const objectKey = `private/editron/test/${tag}/proxy-source.mkv`;
  return {
    ...fixture,
    asset: {
      ...fixture.asset,
      assetId: fixture.assetId,
      userId: fixture.userId,
      type: 'video' as const,
      filename: `${tag}.mkv`,
      source: 'user-upload' as const,
      gcsPath: null,
      cachedUrl: `https://cdn.example.test/asset/${objectKey}`,
      urlExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
      size: 1_048_576,
      duration: frameDurations.length / 30,
      uploadedAt: new Date('2026-08-31T00:00:00.000Z'),
      r2Key: objectKey,
    } as unknown as LoadedAnalysisAssetV2,
  };
}

function projectFixture(
  fixture: Awaited<ReturnType<typeof sourceFixture>>,
  overlayFrameCount: number,
): Project {
  const pin = createProjectVideoSourceVersionPinV1({
    projectId: `project-${fixture.assetId}`,
    overlayId: 1,
    assetId: fixture.assetId,
    sourceRole: 'PROXY',
    sourceVersionSha256: fixture.verifiedBinding.sourceVersionSha256,
    storageVersionSha256: fixture.verifiedBinding.storageVersionSha256,
    authority: {
      kind: 'PROJECT_PROXY_SOURCE_BINDING',
      bindingSha256: 'a'.repeat(64),
      proxyTimeMapReferenceSha256: fixture.proxyTimeMapReferenceSha256,
    },
    issuedAt: new Date('2026-08-31T00:01:00.000Z'),
  });
  return {
    projectId: `project-${fixture.assetId}`,
    userId: fixture.userId,
    name: 'Project five-track fixture',
    overlays: [{
      id: 1,
      type: OverlayType.VIDEO,
      assetId: fixture.assetId,
      content: fixture.asset.cachedUrl,
      src: fixture.asset.cachedUrl,
      sourceStartFrame: 0,
      sourceEndFrame: overlayFrameCount,
      sourceVersionPinV1: pin,
      durationInFrames: overlayFrameCount,
      from: 30,
      height: 1080,
      row: 0,
      left: 0,
      top: 0,
      width: 1920,
      isDragging: false,
      rotation: 0,
      styles: {},
    }],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 300,
    createdAt: new Date('2026-08-31T00:00:00.000Z'),
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    projectRevision: 7,
    visibility: 'private',
  };
}

function completedAnalysis(
  assetId: string,
  userId: string,
  durationMs: number,
): AssetAnalysis {
  return {
    assetId,
    userId,
    status: 'complete',
    durationMs,
    analyzedAt: new Date('2026-08-31T00:02:00.000Z'),
    shots: [],
    motionSegments: [],
    motionPeaks: [],
    audio: null,
    keyframeAnalyses: [],
    subjectTracks: [],
    speechSegments: [],
    musicStructure: null,
    naturalCutPoints: [],
    audioSyncPoints: [],
  };
}

function ports(
  asset: Awaited<ReturnType<typeof sourceFixture>>['asset'],
  readAnalysis: ProjectFiveTrackAnalysisPortsV2['readAnalysis'],
  runAnalysis: ProjectFiveTrackAnalysisPortsV2['runAnalysis'],
  materializeTimestampAnalysis?: NonNullable<
    ProjectFiveTrackAnalysisPortsV2['materializeTimestampAnalysis']
  >,
  resolveSelectedSourceAudioEvidence?: NonNullable<
    ProjectFiveTrackAnalysisPortsV2['resolveSelectedSourceAudioEvidence']
  >,
  authorizeCurrentSourceRights?: NonNullable<
    ProjectFiveTrackAnalysisPortsV2['authorizeCurrentSourceRights']
  > | null,
  rightsStore?: Readonly<SourceMediaRightsLedgerStorePortsV1>,
  transcription?: SourceBoundAssetTranscriptionPortsV2,
  resolveSelectedSourceTranscription?: NonNullable<
    ProjectFiveTrackAnalysisPortsV2['resolveSelectedSourceTranscription']
  >,
): ProjectFiveTrackAnalysisPortsV2 {
  const readArtifactSet = vi.fn();
  const authorizeRights = authorizeCurrentSourceRights === null
    ? null
    : authorizeCurrentSourceRights ?? vi.fn(async () => ({
        disposition: 'AUTHORIZED' as const,
        receipt: {
          receiptSha256: 'e'.repeat(64),
        },
      } as never));
  return {
    loadAssets: vi.fn(async (_assetIds: readonly string[]) => [asset]),
    loadSourceVersionEvidence: vi.fn(async () => null),
    readAnalysis,
    runAnalysis,
    ...(materializeTimestampAnalysis ? { materializeTimestampAnalysis } : {}),
    ...(resolveSelectedSourceAudioEvidence
      ? { resolveSelectedSourceAudioEvidence }
      : {}),
    audioArtifactReader: { readArtifactSet },
    rightsReader: rightsStore ?? { read: vi.fn() },
    ...(rightsStore ? { rightsStore } : {}),
    ...(authorizeRights ? { authorizeCurrentSourceRights: authorizeRights } : {}),
    ...(transcription ? { transcription } : {}),
    ...(resolveSelectedSourceTranscription
      ? { resolveSelectedSourceTranscription }
      : {}),
    rightsNow: () => new Date('2026-08-31T12:00:00.000Z'),
    nowMs: () => 0,
  };
}

function transcriptionPorts(
  overrides: Partial<SourceBoundAssetTranscriptionPortsV2> = {},
): SourceBoundAssetTranscriptionPortsV2 {
  return {
    cache: {
      get: vi.fn(async () => null),
      save: vi.fn(),
    },
    rightsReader: { read: vi.fn(async () => null) },
    projectRevisionReader: {
      getProjectRevision: vi.fn(async () =>
        TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1),
    },
    ...overrides,
  } as SourceBoundAssetTranscriptionPortsV2;
}

function transcriptionOptions() {
  return {
    requestedLanguage: null,
    precision: 'MEASURED_WORD_REQUIRED' as const,
    eligibleProviderIds: ['deepgram'] as const,
    privacyEgressPolicyRef: {
      ownerId: 'POLICY_SERVICE',
      artifactId: 'privacy-policy',
      artifactVersion: '1',
      artifactSha256: 'f'.repeat(64),
    },
  };
}

function transcriptionSuccess(
  fixture: Awaited<ReturnType<typeof sourceFixture>>,
): SourceBoundAssetTranscriptionSuccessV2 {
  const sourceVersion = fixture.asset.sourceVersionV1;
  if (!sourceVersion) throw new Error('TRANSCRIPTION_FIXTURE_SOURCE_MISSING');
  const sourceBindingV2 = createAssetTranscriptionSourceBindingV2({
    userId: fixture.userId,
    assetId: fixture.assetId,
    sourceRole: 'PROXY',
    sourceVersion,
    precision: 'MEASURED_WORD_REQUIRED',
  });
  return {
    disposition: 'GENERATED',
    projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
    sourceBindingV2,
    sourceRightsAuthorization: { receiptSha256: 'e'.repeat(64) } as never,
    evidence: {
      sourceBindingV2,
      transcription: {
        words: [
          { word: 'hello', startMs: 100, endMs: 300, confidence: 0.95 },
          { word: 'world', startMs: 350, endMs: 700, confidence: 0.9 },
        ],
        transcript: 'hello world',
        language: 'en',
        confidence: 0.95,
        generatedAt: new Date('2026-08-31T12:00:00.000Z'),
      },
      timingEvidence: {
        timingBasis: 'MEASURED_WORD',
        providerId: 'deepgram',
        modelId: 'nova-2',
        strategy: 'measured-stt',
        providerContractVersion: 'word-v1',
      },
      processingEvidence: {} as never,
      transcriptionSha256: 'd'.repeat(64),
      recordSha256: 'e'.repeat(64),
    },
  };
}

function rightsStoreRuntime() {
  let state: SourceMediaRightsGrantStateV1 | null = null;
  const commit = vi.fn(async ({ expectedState, nextState }: Parameters<
    SourceMediaRightsLedgerStorePortsV1['commit']
  >[0]) => {
    if ((state?.sourceMediaRightsStateSha256V1 ?? null)
      !== (expectedState?.sourceMediaRightsStateSha256V1 ?? null)) return false;
    state = nextState;
    return true;
  });
  const store: SourceMediaRightsLedgerStorePortsV1 = {
    read: vi.fn(async () => state),
    commit,
  };
  return { store, commit };
}
