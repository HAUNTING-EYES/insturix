import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { captureMediaSourceVersionEvidenceV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { mediaSourceAudioAvailabilityAssetViewV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  resolveProjectSelectedSourceAudioEvidenceV1,
} from '@/lib/editron/services/project-selected-source-audio-evidence-v1';
import type { NativeMediaExactAudioEvidenceV1 }
  from '@/lib/editron/services/native-media-exact-audio-evidence-v1';
import { createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3 }
  from '@/lib/editron/services/video-source-time-transform-v1';
import { TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1 }
  from './helpers/native-media-timestamp-analysis-materialization-fixture';
import { buildMediaProxyMasterAudioLineageFixtureV1 }
  from './helpers/media-proxy-master-audio-lineage-fixture';
import { issueSourceMediaRightsV1 }
  from '@/lib/editron/services/source-media-rights-owner-v1';

const VISUAL_TRANSFORM_SHA256 = 'a'.repeat(64);

describe('project selected source audio evidence V1', () => {
  it('binds exact private audio evidence to the selected project source and revision', async () => {
    const fixture = buildFixture('project-audio-bound');
    const reader = {
      readArtifactSet: vi.fn(fixture.reader.readArtifactSet.bind(fixture.reader)),
    };

    const result = await run(fixture, { reader });

    expect(result).toMatchObject({
      disposition: 'EXACT_AUDIO_EVIDENCE_BOUND',
      projectId: 'project-audio',
      sequenceId: 'main',
      overlayId: '4',
      projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
      sourceRole: 'MASTER',
      sourceVersionEvidenceSha256: fixture.evidence.evidenceSha256,
      sourceVersionSha256: fixture.source.sourceVersionSha256,
      storageVersionSha256:
        fixture.source.storageVersion.storageVersionSha256,
      sourceAudioArtifactStateSha256:
        fixture.masterAudioAvailabilityEvidence.availability.disposition
          === 'DECODED_ARTIFACT_SET'
          ? fixture.masterAudioAvailabilityEvidence.availability
            .sourceAudioArtifactsStateSha256V1
          : 'unexpected',
      decodedSampleFrameCount: '480000',
      sourceMediaRightsAuthorizationReceiptSha256:
        expect.stringMatching(/^[a-f0-9]{64}$/),
      pcmWindowProofSha256: null,
    });
    expect(result).toHaveProperty('evidenceSha256');
    expect(reader.readArtifactSet).toHaveBeenCalledTimes(1);
  });

  it('binds exact PCM bytes to the selected source and visual transform', async () => {
    const fixture = buildFixture('project-audio-pcm-bound');
    const record = audioRecord(fixture);
    const createTimestampConform = vi.fn(async (request: Parameters<
      typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3
    >[0]) => conformResult(request.audio!.evidence, VISUAL_TRANSFORM_SHA256));
    const readPcmSampleRange = vi.fn(async (request: Readonly<{
      startSampleFrame: string;
      endExclusiveSampleFrame: string;
    }>) => {
      const bytes = pcmBytes(
        request.startSampleFrame,
        request.endExclusiveSampleFrame,
        record.channelCount,
      );
      return {
        manifestSha256: record.manifestSha256,
        audioSampleEpochMapSha256: record.audioSampleEpochMapSha256,
        decodedPcmSha256: record.decodedPcmSha256,
        streamId: record.streamId,
        sampleRate: record.sampleRate,
        channelCount: record.channelCount,
        startSampleFrame: request.startSampleFrame,
        endExclusiveSampleFrame: request.endExclusiveSampleFrame,
        pcmBytes: bytes,
        rangeSha256: digest(bytes),
      };
    });

    const result = await run(fixture, {
      pcmWindow: pcmWindow(),
      createTimestampConform,
      pcmReader: { readPcmSampleRange },
      storedObjectReader: { read: vi.fn() },
    });

    expect(result).toMatchObject({
      disposition: 'EXACT_AUDIO_EVIDENCE_BOUND',
      pcmWindowProofSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      pcmWindowProof: {
        disposition: 'PCM_WINDOW_VERIFIED',
        projectId: 'project-audio',
        projectRevision: TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
        sourceVersionSha256: fixture.source.sourceVersionSha256,
        storageVersionSha256:
          fixture.source.storageVersion.storageVersionSha256,
        windowProjectStartFrame: 0,
        windowProjectEndExclusiveFrame: 1,
        canonicalWindowStartSamplePosition: position('0'),
        canonicalWindowEndExclusiveSamplePosition: position('1600'),
        readOperations: 1,
        totalPcmBytes: 12_800,
        pcmSegmentCount: 1,
        silenceSegmentCount: 0,
        proofSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(createTimestampConform).toHaveBeenCalledWith(expect.objectContaining({
      firstFrameOrdinal: '0',
      endExclusiveFrameOrdinal: '300',
      timelineFrameQueries: ['0'],
      sourceAnchorFrameOrdinal: '0',
    }));
    expect(readPcmSampleRange).toHaveBeenCalledWith(expect.objectContaining({
      startSampleFrame: '0',
      endExclusiveSampleFrame: '1600',
    }));
    if (result.disposition !== 'EXACT_AUDIO_EVIDENCE_BOUND'
      || result.pcmWindowProof === null) {
      throw new Error('TEST_PCM_WINDOW_PROOF_REQUIRED');
    }
    expect(JSON.stringify(result.pcmWindowProof)).not.toContain('"pcmBytes"');
    expect(JSON.stringify(result.pcmWindowProof))
      .not.toContain(record.manifestReference.objectKey);
  });

  it('blocks a PCM read when audio and visual transforms do not match', async () => {
    const fixture = buildFixture('project-audio-transform-mismatch');
    const createTimestampConform = vi.fn(async (request: Parameters<
      typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3
    >[0]) => conformResult(request.audio!.evidence, 'b'.repeat(64)));
    const readPcmSampleRange = vi.fn();

    const result = await run(fixture, {
      pcmWindow: pcmWindow(),
      createTimestampConform,
      pcmReader: { readPcmSampleRange },
      storedObjectReader: { read: vi.fn() },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PCM_WINDOW_TRANSFORM_MISMATCH',
      diagnostic: null,
    });
    expect(readPcmSampleRange).not.toHaveBeenCalled();
  });

  it('requires the exact selected source candidate before loading evidence', async () => {
    const fixture = buildFixture('project-audio-wrong-source');
    const loadSourceVersionEvidence = vi.fn(async () => fixture.evidence);

    const result = await run(fixture, {
      candidates: [fixture.proxyAudioAvailabilityEvidence.sourceVersionV1],
      loadSourceVersionEvidence,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SELECTED_SOURCE_CANDIDATE_REQUIRED',
      diagnostic: null,
    });
    expect(loadSourceVersionEvidence).not.toHaveBeenCalled();
  });

  it('rejects absent and stale immutable source-version evidence', async () => {
    const fixture = buildFixture('project-audio-missing-evidence');
    const missing = await run(fixture, {
      loadSourceVersionEvidence: vi.fn(async () => null),
    });
    expect(missing).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED',
      diagnostic: null,
    });

    const stale = await run(fixture, {
      selectedEvidenceSha256: 'f'.repeat(64),
    });
    expect(stale).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SELECTED_SOURCE_EVIDENCE_MISMATCH',
      diagnostic: null,
    });
  });

  it('blocks ambiguous source audio streams without inventing a default', async () => {
    const fixture = buildFixture('project-audio-multistream', [1, 2]);
    const reader = { readArtifactSet: vi.fn() };

    const result = await run(fixture, { reader });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_AUDIO_STREAM_SELECTION_REQUIRED',
      diagnostic: null,
    });
    expect(reader.readArtifactSet).not.toHaveBeenCalled();
  });

  it('preserves private artifact read failure without falling back', async () => {
    const fixture = buildFixture('project-audio-read-failure');

    const result = await run(fixture, {
      reader: {
        readArtifactSet: vi.fn(async () => {
          throw new Error('private locator must not escape');
        }),
      },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_AUDIO_ARTIFACT_READ_FAILED',
      diagnostic: null,
    });
  });

  it('blocks missing current rights before reading private audio artifacts', async () => {
    const fixture = buildFixture('project-audio-rights-missing');
    const readArtifactSet = vi.fn();

    const result = await run(fixture, {
      reader: { readArtifactSet },
      rightsReader: { read: vi.fn(async () => null) },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_MEDIA_RIGHTS_BLOCKED',
      diagnostic: 'SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING',
    });
    expect(readArtifactSet).not.toHaveBeenCalled();
  });

  it('rejects invalid project revision scope before storage work', async () => {
    const fixture = buildFixture('project-audio-invalid-revision');
    const loadSourceVersionEvidence = vi.fn(async () => fixture.evidence);

    const result = await run(fixture, {
      projectRevision: {
        ...TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
        value: -1,
      },
      loadSourceVersionEvidence,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INPUT_INVALID',
    });
    expect(loadSourceVersionEvidence).not.toHaveBeenCalled();
  });
});

function buildFixture(tag: string, streamIndexes: readonly number[] = [1]) {
  const fixture = buildMediaProxyMasterAudioLineageFixtureV1({
    tag,
    observedMasterAudioStreamIndexes: streamIndexes,
    selectedMasterAudioStreamIndexes: streamIndexes,
  });
  const source = fixture.masterAudioAvailabilityEvidence.sourceVersionV1;
  const evidence = captureMediaSourceVersionEvidenceV1(
    mediaSourceAudioAvailabilityAssetViewV1(
      fixture.masterAudioAvailabilityEvidence,
    ),
  );
  return { ...fixture, source, evidence };
}

function run(
  fixture: ReturnType<typeof buildFixture>,
  overrides: Readonly<{
    candidates?: readonly unknown[];
    selectedEvidenceSha256?: string | null;
    projectRevision?: typeof TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1;
    loadSourceVersionEvidence?: (scope: unknown) => Promise<unknown | null>;
    reader?: { readArtifactSet(reference: never): Promise<unknown> };
    pcmWindow?: unknown;
    storedObjectReader?: unknown;
    pcmReader?: unknown;
    createTimestampConform?: unknown;
    rightsReader?: { read(scope: never): Promise<unknown | null> };
  }> = {},
) {
  return resolveProjectSelectedSourceAudioEvidenceV1({
    projectId: 'project-audio',
    sequenceId: 'main',
    overlayId: 4,
    projectRevision: overrides.projectRevision
      ?? TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
    assetId: fixture.source.assetId,
    selectedSource: {
      disposition: 'RESOLVED',
      kind: 'EDITRON_PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_V1',
      sourceRole: 'MASTER',
      sourcePinSha256: '1'.repeat(64),
      activeMappingStateSha256: '2'.repeat(64),
      sourceVersionEvidenceSha256: overrides.selectedEvidenceSha256
        ?? fixture.evidence.evidenceSha256,
      binding: {
        assetId: fixture.source.assetId,
        sourceVersionSha256: fixture.source.sourceVersionSha256,
        storageVersionSha256:
          fixture.source.storageVersion.storageVersionSha256,
        sourcePtsCadenceMapStateSha256V3: '3'.repeat(64),
        bindingSha256: '4'.repeat(64),
        totalSourceFrameCount: '300',
      },
    } as never,
    sourceVersionCandidates: overrides.candidates ?? [fixture.source],
    rightsScope: rightsScope(fixture),
    ...(overrides.pcmWindow === undefined
      ? {}
      : { pcmWindow: overrides.pcmWindow as never }),
    ports: {
      loadSourceVersionEvidence: overrides.loadSourceVersionEvidence
        ?? vi.fn(async () => fixture.evidence),
      audioArtifactReader: (overrides.reader ?? fixture.reader) as never,
      rightsReader: (overrides.rightsReader ?? {
        read: vi.fn(async () => issueRights(fixture)),
      }) as never,
      rightsNow: () => new Date('2026-08-31T12:00:00.000Z'),
      ...(overrides.storedObjectReader === undefined
        ? {}
        : { storedObjectReader: overrides.storedObjectReader as never }),
      ...(overrides.pcmReader === undefined
        ? {}
        : { pcmReader: overrides.pcmReader as never }),
      ...(overrides.createTimestampConform === undefined
        ? {}
        : { createTimestampConform: overrides.createTimestampConform as never }),
    },
  });
}

function rightsScope(fixture: ReturnType<typeof buildFixture>) {
  const owner = fixture.source.owner;
  const projectOwnerId = owner.kind === 'USER' ? owner.userId : 'org-admin';
  return {
    tenantId: owner.kind === 'USER' ? owner.userId : owner.orgId,
    userId: projectOwnerId,
    orgId: owner.kind === 'ORG' ? owner.orgId : null,
    projectOwnerId,
  } as const;
}

async function issueRights(fixture: ReturnType<typeof buildFixture>) {
  const scope = rightsScope(fixture);
  const result = await issueSourceMediaRightsV1({
    tenantId: scope.tenantId,
    attestedByUserId: scope.userId,
    orgId: scope.orgId,
    projectId: 'project-audio',
    disposition: fixture.source.owner.kind === 'USER'
      ? 'OWNED_BY_USER'
      : 'OWNED_BY_ORG',
    sourceVersion: fixture.source,
    termsVersion: 'rights-terms-v1',
    termsContentSha256: 'c'.repeat(64),
    license: null,
    attestedAt: new Date('2026-08-31T11:00:00.000Z'),
    principalAuthority: {
      ownerId: 'PROJECT_ACCESS_AUTHORITY',
      ownerVersion: '1',
      authorize: vi.fn(async () => ({
        disposition: 'AUTHORIZED' as const,
        receiptSha256: 'd'.repeat(64),
      })),
    },
  });
  if (result.disposition !== 'ISSUED') {
    throw new Error(`TEST_RIGHTS_ISSUE_FAILED:${result.diagnosticCode}`);
  }
  return result.state;
}

function pcmWindow() {
  return {
    userId: 'project-audio-owner',
    projectRate: { numerator: '30', denominator: '1' },
    overlayFromFrame: 0,
    overlayDurationInFrames: 300,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 1,
    sourceStartFrame: '0',
    sourceEndExclusiveFrame: '300',
    timelineFrameQueries: ['0'],
    expectedVisualTransformSha256: VISUAL_TRANSFORM_SHA256,
  } as const;
}

function conformResult(
  evidence: NativeMediaExactAudioEvidenceV1['evidence'],
  transformSha256: string,
) {
  return {
    disposition: 'CONFORM_CREATED' as const,
    presentationWindow: {},
    transform: {
      transformSha256,
      projectRate: { numerator: '30', denominator: '1' },
      sourceBinding: {
        bindingSha256: '4'.repeat(64),
        sourcePtsCadenceMapStateSha256V3: '3'.repeat(64),
      },
      audioMapping: audioMapping(evidence),
    },
  } as unknown as Awaited<ReturnType<
    typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3
  >>;
}

function audioMapping(evidence: NativeMediaExactAudioEvidenceV1['evidence']) {
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_VERIFIED_AUDIO_SAMPLE_TIME_MAPPING_V3' as const,
    assetId: evidence.binding.assetId,
    sourceVersionSha256: evidence.binding.sourceVersionSha256,
    storageVersionSha256: evidence.binding.storageVersionSha256,
    sourceBindingSha256: '4'.repeat(64),
    technicalObservationSha256: '5'.repeat(64),
    audioSampleEpochMapSha256: evidence.audioSampleEpochMapSha256,
    audioStreamBindingSha256: evidence.binding.audioStreamBindingSha256,
    decodedPcmSha256: evidence.pcm.decodedPcmSha256,
    streamId: evidence.binding.streamId,
    audioStreamIndex: evidence.binding.audioStreamIndex,
    sampleRate: evidence.binding.sampleRate,
    channelCount: evidence.binding.channelCount,
    decodedSampleFrameCount: evidence.pcm.decodedSampleFrameCount,
    timelineStartFrame: '0',
    endExclusiveTimelineFrame: '300',
    canonicalTimelineStartSamplePosition: position('0'),
    canonicalTimelineEndExclusiveSamplePosition: position('480000'),
    policy: {
      epochAlignment: 'PAIRED_VERIFIED_VIDEO_AUDIO_EPOCH_ORDINAL_V1' as const,
      samplePhase: 'PRESERVE_EXACT_RATIONAL_NO_ROUNDING' as const,
      gaps: 'EXPLICIT_SILENCE_SEGMENTS' as const,
      overlapsAndResets: 'VERIFIED_CANONICAL_EPOCH_HANDOFF' as const,
      resampling: 'FORBIDDEN' as const,
      channelRemix: 'FORBIDDEN' as const,
    },
    segments: [{
      kind: 'PCM' as const,
      audioEpochId: 'audio-epoch-0',
      canonicalStartSamplePosition: position('0'),
      canonicalEndExclusiveSamplePosition: position('480000'),
      decodedStartSamplePosition: position('0'),
      decodedEndExclusiveSamplePosition: position('480000'),
    }],
  };
  return {
    ...material,
    audioMappingSha256: hashEditronCanonicalJsonV1(material),
  };
}

function audioRecord(fixture: ReturnType<typeof buildFixture>) {
  const availability = fixture.masterAudioAvailabilityEvidence.availability;
  if (availability.disposition !== 'DECODED_ARTIFACT_SET') {
    throw new Error('TEST_AUDIO_RECORD_REQUIRED');
  }
  const record = availability.sourceAudioArtifactsV1.records[0];
  if (!record) throw new Error('TEST_AUDIO_RECORD_REQUIRED');
  return record;
}

function position(numerator: string) {
  return {
    numerator,
    denominator: '1',
    disposition: 'INTEGER_SAMPLE_FRAME' as const,
  };
}

function pcmBytes(start: string, end: string, channelCount: number): Uint8Array {
  return new Uint8Array(
    Number(BigInt(end) - BigInt(start)) * channelCount * 4,
  );
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
