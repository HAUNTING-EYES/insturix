import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_LONG_FORM_REAL_MEDIA_TRIAL_VERSION_V1 =
  'EDITRON_OE_STAGE25_LONG_FORM_REAL_MEDIA_TRIAL_V1_1' as const;
export const STAGE25_LONG_FORM_REAL_MEDIA_DURATION_SECONDS_V1 = 16_200 as const;
export const STAGE25_LONG_FORM_REAL_MEDIA_FRAME_COUNT_V1 = 485_515 as const;
export const STAGE25_LONG_FORM_REAL_MEDIA_WINDOW_FRAMES_V1 = 60 as const;

export interface Stage25LongFormRealMediaArtifactV1 {
  fileName: string;
  sha256: string;
  byteLength: number;
}

export interface Stage25LongFormRealMediaWindowV1 {
  windowId: 'START' | 'MIDDLE' | 'END';
  priorityOrdinal: 0 | 1 | 2;
  startFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  startPts: string;
  endExclusivePts: string;
  video: Stage25LongFormRealMediaArtifactV1 & Readonly<{
    frameCount: number;
    width: number;
    height: number;
    videoCodec: string;
    audioCodec: string;
  }>;
  still: Stage25LongFormRealMediaArtifactV1;
  audio: Stage25LongFormRealMediaArtifactV1 & Readonly<{
    sampleRate: number;
    channelCount: number;
    sampleCount: number;
  }>;
}

export interface Stage25LongFormRealMediaTrialInputV1 {
  source: Readonly<{
    commitSha: string;
    treeSha: string;
    relevantScopeSha256: string;
    relevantTrackedFileCount: number;
    relevantStatusEntries: readonly string[];
  }>;
  toolchain: Readonly<{ ffmpegIdentity: string; ffprobeIdentity: string }>;
  media: Readonly<{
    artifact: Stage25LongFormRealMediaArtifactV1;
    sourceVersionSha256: string;
    technicalObservationSha256: string;
    mapBindingSha256: string;
    width: number;
    height: number;
    videoCodec: string;
    audioCodec: string;
    averageFrameRate: string;
    sourceTimebase: string;
    sourceStartPts: string;
    sourceEndExclusivePts: string;
    frameCount: number;
    uniformFrameDurationTicks: string;
    sampleRate: number;
    channelCount: number;
  }>;
  ptsIndex: Readonly<{
    manifestContentSha256: string;
    verificationSha256: string;
    coverageSha256: string;
    batchCount: number;
    verifiedFrameCount: string;
    startPts: string;
    endExclusivePts: string;
    cadence: 'CFR' | 'VFR';
    peakRssBytes: number;
  }>;
  windows: readonly Stage25LongFormRealMediaWindowV1[];
  timings: Readonly<{
    materializeMs: number;
    ptsScanAndVerifyMs: number;
    hydrateMs: number;
  }>;
  localFixtureCodecCalls: number;
  localArtifactCount: number;
}

export type Stage25LongFormRealMediaTrialReceiptV1 = Readonly<
  ReturnType<typeof buildReceiptMaterial> & { receiptSha256: string }
>;

export function finalizeStage25LongFormRealMediaTrialV1(
  input: Readonly<Stage25LongFormRealMediaTrialInputV1>,
): Stage25LongFormRealMediaTrialReceiptV1 {
  validateInput(input);
  const windows = [...input.windows].sort((left, right) => (
    left.priorityOrdinal - right.priorityOrdinal
  ));
  const fullHydration = hydrate(windows, { maxWindows: 3, maxBytes: 16 * 1024 * 1024 });
  const constrainedHydration = hydrate(windows, { maxWindows: 2, maxBytes: 4 * 1024 * 1024 });
  if (fullHydration.disposition !== 'PASS_COMPLETE_CONTEXT' || fullHydration.omitted.length) {
    fail('FULL_CONTEXT_INCOMPLETE');
  }
  if (constrainedHydration.disposition !== 'UNVERIFIABLE_CONTEXT_BUDGET'
    || constrainedHydration.omitted.length < 1) fail('CONSTRAINED_CONTEXT_FALSE_PASS');
  const material = buildReceiptMaterial(input, windows, fullHydration, constrainedHydration);
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  }) as Stage25LongFormRealMediaTrialReceiptV1;
}

function buildReceiptMaterial(
  input: Readonly<Stage25LongFormRealMediaTrialInputV1>,
  windows: readonly Stage25LongFormRealMediaWindowV1[],
  fullHydration: ReturnType<typeof hydrate>,
  constrainedHydration: ReturnType<typeof hydrate>,
) {
  return {
    version: STAGE25_LONG_FORM_REAL_MEDIA_TRIAL_VERSION_V1,
    artifactType: 'Stage25LongFormRealMediaTrialReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_COMPOSITION_OF_EXISTING_MEDIA_OWNERS' as const,
    source: input.source,
    toolchain: input.toolchain,
    media: input.media,
    ptsIndex: input.ptsIndex,
    windows,
    fullHydration,
    constrainedHydration,
    timings: input.timings,
    localFixtureCodecCalls: input.localFixtureCodecCalls,
    localArtifactCount: input.localArtifactCount,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    productRenderCalls: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
    assessment: 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS' as const,
    proofCeiling: 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE' as const,
    whatHasNotBeenChecked: [
      'REAL_CREATIVE_OR_CLIENT_MEDIA',
      'SEMANTIC_RETRIEVAL_ACCURACY',
      'LIVE_MEDIA_ASSETS_MONGO_R2_OR_QDRANT',
      'PROVIDER_NATIVE_MULTIMODAL_TOKEN_COUNT',
      'SOURCE_DISCONTINUITY_OR_EPOCH_SUPPORT',
      'MIXED_RATE_PROJECTSERVICE_CONSUMER',
      'PRODUCTION_RENDER_PLAYBACK_OR_DELIVERY',
    ] as const,
  };
}

function validateInput(input: Readonly<Stage25LongFormRealMediaTrialInputV1>): void {
  for (const value of [input.source.commitSha, input.source.treeSha]) sha(value, 40, 'SOURCE_SHA');
  sha(input.source.relevantScopeSha256, 64, 'SOURCE_SCOPE_SHA');
  if (!Number.isSafeInteger(input.source.relevantTrackedFileCount)
    || input.source.relevantTrackedFileCount < 1
    || input.source.relevantStatusEntries.length) fail('SOURCE_SCOPE_DIRTY_OR_EMPTY');
  if (!input.toolchain.ffmpegIdentity.trim() || !input.toolchain.ffprobeIdentity.trim()) {
    fail('TOOLCHAIN_IDENTITY_INVALID');
  }
  artifact(input.media.artifact);
  for (const value of [input.media.sourceVersionSha256,
    input.media.technicalObservationSha256, input.media.mapBindingSha256,
    input.ptsIndex.manifestContentSha256, input.ptsIndex.verificationSha256,
    input.ptsIndex.coverageSha256]) sha(value, 64, 'MEDIA_SHA');
  if (input.media.width !== 160 || input.media.height !== 90
    || input.media.videoCodec !== 'h264' || input.media.audioCodec !== 'aac'
    || input.media.averageFrameRate !== '30000/1001'
    || input.media.sourceTimebase !== '1/30000' || input.media.sourceStartPts !== '0'
    || input.media.uniformFrameDurationTicks !== '1001'
    || input.media.sampleRate !== 48_000 || input.media.channelCount !== 2) {
    fail('MEDIA_TECHNICAL_CONTRACT_INVALID');
  }
  if (input.media.frameCount !== STAGE25_LONG_FORM_REAL_MEDIA_FRAME_COUNT_V1
    || input.ptsIndex.verifiedFrameCount !== String(input.media.frameCount)
    || input.media.sourceEndExclusivePts
      !== String(BigInt(input.media.frameCount) * BigInt(1001))
    || input.ptsIndex.startPts !== input.media.sourceStartPts
    || input.ptsIndex.endExclusivePts !== input.media.sourceEndExclusivePts
    || input.ptsIndex.cadence !== 'CFR'
    || !Number.isSafeInteger(input.ptsIndex.batchCount) || input.ptsIndex.batchCount < 5
    || !Number.isSafeInteger(input.ptsIndex.peakRssBytes) || input.ptsIndex.peakRssBytes < 1) {
    fail('PTS_COVERAGE_INVALID');
  }
  if (input.windows.length !== 3
    || input.localFixtureCodecCalls !== 10
    || input.localArtifactCount !== input.ptsIndex.batchCount + 11) fail('TRIAL_COUNTS_INVALID');
  const ids = new Set<string>();
  const priorities = new Set<number>();
  for (const window of input.windows) {
    if (ids.has(window.windowId) || priorities.has(window.priorityOrdinal)) fail('WINDOW_DUPLICATED');
    ids.add(window.windowId); priorities.add(window.priorityOrdinal);
    const start = BigInt(window.startFrameOrdinal);
    const end = BigInt(window.endExclusiveFrameOrdinal);
    if (end - start !== BigInt(STAGE25_LONG_FORM_REAL_MEDIA_WINDOW_FRAMES_V1)
      || BigInt(window.startPts) !== start * BigInt(1001)
      || BigInt(window.endExclusivePts) !== end * BigInt(1001)) fail('WINDOW_RANGE_INVALID');
    artifact(window.video); artifact(window.still); artifact(window.audio);
    if (window.video.frameCount !== STAGE25_LONG_FORM_REAL_MEDIA_WINDOW_FRAMES_V1
      || window.video.width !== 160 || window.video.height !== 90
      || window.video.videoCodec !== 'h264' || window.video.audioCodec !== 'aac'
      || window.audio.sampleRate !== 48_000 || window.audio.channelCount !== 2) {
      fail('WINDOW_MEDIA_CONTRACT_INVALID');
    }
    if (window.audio.sampleCount < 96_000 || window.audio.sampleCount > 96_200) {
      fail('WINDOW_AUDIO_DURATION_INVALID');
    }
  }
  if (![0, 1, 2].every((value) => priorities.has(value))) fail('WINDOW_PRIORITY_INVALID');
  for (const value of Object.values(input.timings)) {
    if (!Number.isFinite(value) || value <= 0) fail('TIMING_INVALID');
  }
}

function hydrate(windows: readonly Stage25LongFormRealMediaWindowV1[], budget: {
  maxWindows: number; maxBytes: number;
}) {
  const selected: string[] = [];
  const omitted: Array<{ windowId: string; reason: string }> = [];
  let hydratedBytes = 0;
  for (const window of windows) {
    const bytes = window.video.byteLength + window.still.byteLength + window.audio.byteLength;
    const reason = selected.length >= budget.maxWindows ? 'WINDOW_COUNT_BUDGET'
      : hydratedBytes + bytes > budget.maxBytes ? 'HYDRATED_BYTE_BUDGET' : null;
    if (reason) omitted.push({ windowId: window.windowId, reason });
    else { selected.push(window.windowId); hydratedBytes += bytes; }
  }
  return {
    budget,
    disposition: omitted.length ? 'UNVERIFIABLE_CONTEXT_BUDGET' as const
      : 'PASS_COMPLETE_CONTEXT' as const,
    selected,
    omitted,
    hydratedBytes,
  };
}

function artifact(value: Stage25LongFormRealMediaArtifactV1): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.fileName)
    || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1) fail('ARTIFACT_INVALID');
  sha(value.sha256, 64, 'ARTIFACT_SHA');
}
function sha(value: string, length: number, code: string): void {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) fail(code);
}
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_REAL_MEDIA_${code}`);
}
