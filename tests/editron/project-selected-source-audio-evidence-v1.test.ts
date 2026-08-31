import { describe, expect, it, vi } from 'vitest';

import { captureMediaSourceVersionEvidenceV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { mediaSourceAudioAvailabilityAssetViewV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  resolveProjectSelectedSourceAudioEvidenceV1,
} from '@/lib/editron/services/project-selected-source-audio-evidence-v1';
import { TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1 }
  from './helpers/native-media-timestamp-analysis-materialization-fixture';
import { buildMediaProxyMasterAudioLineageFixtureV1 }
  from './helpers/media-proxy-master-audio-lineage-fixture';

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
    });
    expect(result).toHaveProperty('evidenceSha256');
    expect(reader.readArtifactSet).toHaveBeenCalledTimes(1);
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
      },
    },
    sourceVersionCandidates: overrides.candidates ?? [fixture.source],
    ports: {
      loadSourceVersionEvidence: overrides.loadSourceVersionEvidence
        ?? vi.fn(async () => fixture.evidence),
      audioArtifactReader: (overrides.reader ?? fixture.reader) as never,
    },
  });
}
