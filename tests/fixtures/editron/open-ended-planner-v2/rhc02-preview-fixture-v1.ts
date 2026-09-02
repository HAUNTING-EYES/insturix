import {
  deepFreezeV1,
  hashCanonicalJsonV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';

export const RHC02_PREVIEW_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_PREVIEW_FIXTURE_V1' as const;

export const RHC02_PREVIEW_ASSET_IDS_V1 = Object.freeze([
  'rhc02-interview',
  'rhc02-still-a',
  'rhc02-still-b',
  'rhc02-room-tone',
] as const);

export const RHC02_PREVIEW_FONT_ID_V1 = 'rhc02-licensed-title' as const;

export interface Rhc02PreviewFixtureIdentityV1 {
  assetVersions: Readonly<Record<
    typeof RHC02_PREVIEW_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  rightsEvidenceVersions: Readonly<Record<
    typeof RHC02_PREVIEW_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  fontVersion: `sha256:${string}`;
  fontFileSha256: string;
}

const SOURCE_DESCRIPTORS = Object.freeze([
  {
    assetId: 'rhc02-interview',
    mediaKind: 'VIDEO_WITH_DIALOGUE_AUDIO',
    sourceRange: { startFrame: 270, endExclusiveFrame: 420 },
  },
  {
    assetId: 'rhc02-still-a',
    mediaKind: 'STILL_IMAGE',
    sourceRange: { startFrame: 0, endExclusiveFrame: 1 },
  },
  {
    assetId: 'rhc02-still-b',
    mediaKind: 'STILL_IMAGE',
    sourceRange: { startFrame: 0, endExclusiveFrame: 1 },
  },
  {
    assetId: 'rhc02-room-tone',
    mediaKind: 'AUDIO',
    sourceRange: { startFrame: 270, endExclusiveFrame: 420 },
  },
] as const);

/**
 * Freezes the RHC-02 evidence and handoff inputs without inventing missing
 * native/generated owners. Concrete media bytes are supplied by a later,
 * hash-bound materialization phase.
 */
export function buildRhc02PreviewFixtureV1(
  identity: Rhc02PreviewFixtureIdentityV1,
) {
  assertIdentity(identity);
  const projectId = 'stage25-rhc02-preview';
  const rate = { numerator: '30', denominator: '1' } as const;
  const timelineMapping = deepFreezeV1({
    coordinateDomain: 'PROJECT_FRAME' as const,
    rate,
    absoluteProofWindow: { startFrame: 270, endExclusiveFrame: 420 },
    absoluteTargetRange: { startFrame: 300, endExclusiveFrame: 390 },
    localProofWindow: { startFrame: 0, endExclusiveFrame: 150 },
    localTargetRange: { startFrame: 30, endExclusiveFrame: 120 },
    compositionRange: { startFrame: 0, endExclusiveFrame: 90 },
    compositionToProjectOffsetFrames: 300,
    interviewSourceToProjectOffsetFrames: 0,
  });
  const audioBaseline = deepFreezeV1({
    owner: 'NATIVE_TIMELINE_AUDIO' as const,
    projectRange: timelineMapping.absoluteProofWindow,
    candidateMayMutateAudio: false as const,
    requiredProof: 'DECODED_PCM_BASELINE_EQUIVALENCE' as const,
    tracks: [
      {
        role: 'DIALOGUE',
        assetId: 'rhc02-interview',
        assetVersion: identity.assetVersions['rhc02-interview'],
        sourceRange: { startFrame: 270, endExclusiveFrame: 420 },
        projectRange: timelineMapping.absoluteProofWindow,
      },
      {
        role: 'ROOM_TONE',
        assetId: 'rhc02-room-tone',
        assetVersion: identity.assetVersions['rhc02-room-tone'],
        sourceRange: { startFrame: 270, endExclusiveFrame: 420 },
        projectRange: timelineMapping.absoluteProofWindow,
      },
    ],
  });
  const boundaryHandoff = deepFreezeV1({
    timebase: {
      project: rate,
      composition: rate,
      sources: rate,
      conversion: 'IDENTITY_30_OVER_1_CFR' as const,
    },
    entry: {
      previousProjectFrame: 299,
      previousInterviewSourceFrame: 299,
      firstTargetProjectFrame: 300,
      firstCompositionFrame: 0,
      continuingInterviewSourceFrameUnderTarget: 300,
    },
    exit: {
      lastTargetProjectFrame: 389,
      lastCompositionFrame: 89,
      firstReturnProjectFrame: 390,
      firstReturnInterviewSourceFrame: 390,
    },
    audio: {
      owner: audioBaseline.owner,
      baselineHash: hashCanonicalJsonV1(audioBaseline),
      mutationAllowed: false as const,
      dialogueMustRemainCompleteAndIntelligible: true as const,
      roomToneMustRemainContinuousAtProjectFrames: [300, 390] as const,
    },
    outsideTargetState: 'BYTE_IDENTICAL_CANONICAL_STATE_REQUIRED' as const,
  });
  const evidencePack = deepFreezeV1({
    version: RHC02_PREVIEW_FIXTURE_VERSION_V1,
    taskId: 'RHC-02' as const,
    materializationDisposition: 'IDENTITIES_REQUIRED_BYTES_NOT_MATERIALIZED' as const,
    facts: [
      {
        factId: 'rhc02-project-revision',
        kind: 'PROJECT_REVISION',
        projectId,
        expectedProjectRevision: 'R1',
      },
      {
        factId: 'rhc02-project-timebase',
        kind: 'PROJECT_TIMEBASE',
        timebaseId: `${projectId}:timeline`,
        rate,
      },
      {
        factId: 'rhc02-canvas',
        kind: 'CANVAS',
        width: 1080,
        height: 1920,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
      },
      {
        factId: 'rhc02-authorized-target',
        kind: 'AUTHORIZED_TARGET_RANGE',
        ...timelineMapping.absoluteTargetRange,
      },
      ...SOURCE_DESCRIPTORS.map((source) => ({
        factId: `rhc02-source-${source.assetId}`,
        kind: 'SOURCE_MEDIA_IDENTITY',
        ...source,
        assetVersion: identity.assetVersions[source.assetId],
        rightsEvidenceVersion: identity.rightsEvidenceVersions[source.assetId],
        rightsStatus: 'INTERNAL_OWNED_FIXTURE',
        timebase: rate,
      })),
      {
        factId: 'rhc02-font',
        kind: 'FONT_IDENTITY',
        fontAssetId: RHC02_PREVIEW_FONT_ID_V1,
        fontAssetVersion: identity.fontVersion,
        fileSha256: identity.fontFileSha256,
        family: 'Noto Sans',
        face: 'Regular',
        weight: 700,
        rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
        licenseId: 'OFL-1.1-NOTO-SANS',
      },
      {
        factId: 'rhc02-audio-baseline',
        kind: 'IMMUTABLE_AUDIO_BASELINE',
        baselineHash: hashCanonicalJsonV1(audioBaseline),
      },
    ],
    proofRequirements: [
      { proofObligationId: 'rhc02-proof-both-stills-and-exact-title' },
      { proofObligationId: 'rhc02-proof-return-frame-continuity' },
      { proofObligationId: 'rhc02-proof-editable-bindings' },
      { proofObligationId: 'rhc02-proof-dialogue-intelligibility' },
      { proofObligationId: 'rhc02-proof-room-tone-continuity' },
      { proofObligationId: 'rhc02-proof-outside-range-unchanged' },
      { proofObligationId: 'rhc02-proof-source-font-rights' },
    ],
  });
  const material = {
    version: RHC02_PREVIEW_FIXTURE_VERSION_V1,
    artifactType: 'Rhc02PreviewFixtureV1' as const,
    authority: 'RESEARCH_INPUT_AND_HANDOFF_CONTRACT_NO_PROJECT_MUTATION' as const,
    taskId: 'RHC-02' as const,
    projectId,
    sourceDescriptors: SOURCE_DESCRIPTORS,
    sourceBindings: RHC02_PREVIEW_ASSET_IDS_V1.map((assetId) => ({
      assetId,
      assetVersion: identity.assetVersions[assetId],
      rightsEvidenceVersion: identity.rightsEvidenceVersions[assetId],
    })),
    fontBinding: {
      fontAssetId: RHC02_PREVIEW_FONT_ID_V1,
      fontAssetVersion: identity.fontVersion,
      fileSha256: identity.fontFileSha256,
    },
    timelineMapping,
    audioBaseline,
    boundaryHandoff,
    evidencePack,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    fixtureSha256: hashCanonicalJsonV1(material),
  });
}

function assertIdentity(identity: Rhc02PreviewFixtureIdentityV1): void {
  for (const assetId of RHC02_PREVIEW_ASSET_IDS_V1) {
    assertPrefixedSha(identity.assetVersions[assetId], `ASSET_${assetId}`);
    assertPrefixedSha(
      identity.rightsEvidenceVersions[assetId],
      `RIGHTS_${assetId}`,
    );
  }
  assertPrefixedSha(identity.fontVersion, 'FONT_VERSION');
  if (!/^[a-f0-9]{64}$/.test(identity.fontFileSha256)) {
    fail('FONT_FILE_SHA256_INVALID');
  }
}

function assertPrefixedSha(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
}

function fail(code: string): never {
  throw new Error(`RHC02_PREVIEW_FIXTURE_${code}`);
}
