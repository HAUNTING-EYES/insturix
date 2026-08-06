import { createHash } from 'node:crypto';

export const SFX_RENDER_CANARY_VERSION = 'editron-sfx-render-canary-v1' as const;
export const SFX_RENDER_CANARY_FPS = 30;
export const SFX_RENDER_CANARY_DURATION_FRAMES = 450;
export const SFX_RENDER_CANARY_TRANSITION_FRAME = 30;
export const SFX_RENDER_CANARY_MG_ANCHOR_FRAME = 210;
export const SFX_RENDER_CANARY_SILENCE_FRAME = 390;

export interface CanarySoundEvidence {
  surface: 'transition' | 'motion-graphic';
  sourceOverlayId: number;
  soundOverlayId: number;
  assetId: string;
  audioUrl: string;
  from: number;
  durationInFrames: number;
  syncFrame: number;
  selectionLane: 'catalog';
  rights: {
    source: 'library';
    licensed: true;
    sourceAssetId: string;
    licenseId: string;
  };
  semanticRetrieval?: {
    version: string;
    releaseReceiptDigestSha256: string;
    promotedManifestDigestSha256: string;
    queryDigestSha256: string;
    indexedAssetCount: number;
    candidateCount: number;
  };
}

export interface Pcm16Wav {
  audioFormat: 1 | 0xfffe;
  sampleRateHz: number;
  channelCount: number;
  bitsPerSample: 16;
  blockAlign: number;
  sampleFrameCount: number;
  pcm: Buffer;
  pcmHashSha256: string;
  peakSample: number;
  nonZeroSamples: number;
}

export interface PcmWindowEvidence {
  startFrame: number;
  endFrame: number;
  sampleCount: number;
  nonZeroSamples: number;
  peakSample: number;
  rms: number;
}

export function buildSfxRenderCanaryOverlays(): Array<Record<string, unknown>> {
  return [
    {
      id: 1_001,
      type: 'transition',
      transitionStyle: 'whip-pan',
      from: SFX_RENDER_CANARY_TRANSITION_FRAME,
      durationInFrames: 12,
      clipAId: 1,
      clipBId: 2,
      row: 2,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      metadata: {},
    },
    {
      id: 2_001,
      type: 'motion-graphic',
      from: 180,
      durationInFrames: 90,
      row: 1,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      metadata: {
        kineticSfxEvents: [{
          version: 'kinetic-sfx-event-v1',
          eventId: `2001:entrance-pop:${SFX_RENDER_CANARY_MG_ANCHOR_FRAME}`,
          surface: 'motion-graphic',
          kind: 'entrance-pop',
          sourceOverlayId: 2_001,
          anchorFrame: SFX_RENDER_CANARY_MG_ANCHOR_FRAME,
          fps: SFX_RENDER_CANARY_FPS,
          cue: 'very subtle editorial entrance pop tick',
          ruleId: 'mapping:sound.sfx_for_editorial_moments',
          energy: 0.84,
          speechEnergy: 0.08,
          silenceAllowed: true,
          evidence: [
            'canary:stored-finalized-mg-event',
            'graphic-type:callout',
            'speech-energy:low',
          ],
        }],
      },
    },
    {
      id: 1_002,
      type: 'transition',
      transitionStyle: 'dip-to-black',
      from: SFX_RENDER_CANARY_SILENCE_FRAME,
      durationInFrames: 18,
      clipAId: 2,
      clipBId: 3,
      row: 2,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      metadata: {},
    },
  ];
}

export function validateSfxRenderCanaryPlacements(
  overlays: unknown[],
  placementResult: unknown,
  options: { requireSemanticRetrieval?: boolean } = {},
): CanarySoundEvidence[] {
  const result = requiredRecord(placementResult, 'placement result');
  if (result.placed !== 1) {
    throw new Error(`Canary expected one transition SFX, received ${String(result.placed)}`);
  }

  const motionGraphics = requiredRecord(result.motionGraphics, 'motion graphic placement result');
  if (motionGraphics.placed !== 1) {
    throw new Error(`Canary expected one motion-graphic SFX, received ${String(motionGraphics.placed)}`);
  }

  const transition = findOverlay(overlays, 1_001);
  const transitionPlacement = requiredNestedRecord(transition, ['metadata', 'transitionSfxPlacement']);
  requirePlacementStatus(transitionPlacement, 'placed', 'transition');

  const motionGraphic = findOverlay(overlays, 2_001);
  const mgPlacement = requiredNestedRecord(motionGraphic, ['metadata', 'kineticSfxPlacement']);
  requirePlacementStatus(mgPlacement, 'placed', 'motion graphic');

  const silenceTransition = findOverlay(overlays, 1_002);
  const silencePlacement = requiredNestedRecord(silenceTransition, ['metadata', 'transitionSfxPlacement']);
  requirePlacementStatus(silencePlacement, 'suppressed', 'silence transition');
  if (!String(silencePlacement.reason).includes('silence')) {
    throw new Error(`Canary silence transition used an unexpected reason: ${String(silencePlacement.reason)}`);
  }

  const transitionSound = findSoundBySource(overlays, 'transition-sfx-placer');
  const mgSound = findSoundBySource(overlays, 'kinetic-sfx-service');
  const evidence = [
    buildSoundEvidence('transition', 1_001, transitionSound, transitionPlacement),
    buildSoundEvidence('motion-graphic', 2_001, mgSound, mgPlacement),
  ];
  if (
    options.requireSemanticRetrieval
    && evidence.some(item => !item.semanticRetrieval)
  ) {
    throw new Error('Canary required semantic retrieval evidence for every placed SFX');
  }

  const silenceSound = overlays
    .filter(isRecord)
    .find((overlay) =>
      overlay.type === 'sound'
      && readNested(overlay, ['metadata', 'transitionOverlayId']) === 1_002
    );
  if (silenceSound) {
    throw new Error('Canary dip-to-black unexpectedly produced a sound overlay');
  }

  return evidence;
}

export function parsePcm16Wav(buffer: Buffer): Pcm16Wav {
  if (
    buffer.length < 12
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Rendered audio is not a RIFF/WAVE file');
  }

  let format: {
    audioFormat: 1 | 0xfffe;
    sampleRateHz: number;
    channelCount: number;
    bitsPerSample: 16;
    blockAlign: number;
  } | null = null;
  let pcm: Buffer | null = null;

  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > buffer.length) {
      throw new Error(`Rendered WAV chunk ${chunkId} exceeds the file boundary`);
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) throw new Error('Rendered WAV fmt chunk is truncated');
      const audioFormat = buffer.readUInt16LE(dataStart);
      const channelCount = buffer.readUInt16LE(dataStart + 2);
      const sampleRateHz = buffer.readUInt32LE(dataStart + 4);
      const blockAlign = buffer.readUInt16LE(dataStart + 12);
      const bitsPerSample = buffer.readUInt16LE(dataStart + 14);
      const extensiblePcm = audioFormat === 0xfffe
        && chunkSize >= 40
        && buffer.readUInt32LE(dataStart + 24) === 1;
      if (audioFormat !== 1 && !extensiblePcm) {
        throw new Error(`Rendered WAV must be PCM16, received format ${audioFormat}`);
      }
      if (bitsPerSample !== 16 || channelCount < 1 || sampleRateHz < 1 || blockAlign !== channelCount * 2) {
        throw new Error('Rendered WAV has an invalid PCM16 format declaration');
      }
      format = {
        audioFormat: audioFormat as 1 | 0xfffe,
        sampleRateHz,
        channelCount,
        bitsPerSample: 16,
        blockAlign,
      };
    } else if (chunkId === 'data') {
      pcm = buffer.subarray(dataStart, dataEnd);
    }

    offset = dataEnd + (chunkSize % 2);
  }

  if (!format || !pcm) throw new Error('Rendered WAV is missing fmt or data');
  if (pcm.length % format.blockAlign !== 0) {
    throw new Error('Rendered WAV PCM data is not aligned to complete sample frames');
  }

  let peakSample = 0;
  let nonZeroSamples = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    const absolute = Math.abs(sample);
    if (absolute > peakSample) peakSample = absolute;
    if (sample !== 0) nonZeroSamples++;
  }

  return {
    ...format,
    sampleFrameCount: pcm.length / format.blockAlign,
    pcm,
    pcmHashSha256: createHash('sha256').update(pcm).digest('hex'),
    peakSample,
    nonZeroSamples,
  };
}

export function measurePcmFrameWindow(
  wav: Pcm16Wav,
  startFrame: number,
  endFrame: number,
  videoFps: number,
): PcmWindowEvidence {
  if (!(videoFps > 0) || endFrame <= startFrame) {
    throw new Error('PCM evidence window must have positive FPS and duration');
  }
  const startSampleFrame = Math.max(0, Math.floor(startFrame * wav.sampleRateHz / videoFps));
  const endSampleFrame = Math.min(
    wav.sampleFrameCount,
    Math.ceil(endFrame * wav.sampleRateHz / videoFps),
  );
  if (endSampleFrame <= startSampleFrame) {
    throw new Error(`PCM evidence window ${startFrame}-${endFrame} is outside rendered audio`);
  }

  const startByte = startSampleFrame * wav.blockAlign;
  const endByte = endSampleFrame * wav.blockAlign;
  let nonZeroSamples = 0;
  let peakSample = 0;
  let squareSum = 0;
  let sampleCount = 0;
  for (let offset = startByte; offset < endByte; offset += 2) {
    const sample = wav.pcm.readInt16LE(offset);
    const absolute = Math.abs(sample);
    if (sample !== 0) nonZeroSamples++;
    if (absolute > peakSample) peakSample = absolute;
    const normalized = sample / 32_768;
    squareSum += normalized * normalized;
    sampleCount++;
  }

  return {
    startFrame,
    endFrame,
    sampleCount,
    nonZeroSamples,
    peakSample,
    rms: sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0,
  };
}

function buildSoundEvidence(
  surface: CanarySoundEvidence['surface'],
  sourceOverlayId: number,
  sound: Record<string, unknown>,
  placement: Record<string, unknown>,
): CanarySoundEvidence {
  const providerReport = requiredRecord(placement.providerSearchReport, `${surface} provider report`);
  if (providerReport.selectionLane !== 'catalog') {
    throw new Error(`${surface} SFX escaped the bundled catalog lane`);
  }
  const semanticRetrieval = buildSemanticRetrievalEvidence(providerReport, surface);
  const rights = requiredRecord(sound.audioRights, `${surface} audio rights`);
  const rightsEvidence = requiredRecord(rights.evidence, `${surface} rights evidence`);
  if (
    rights.source !== 'library'
    || rights.licensed !== true
    || rightsEvidence.kind !== 'library-license'
  ) {
    throw new Error(`${surface} SFX does not carry a licensed library receipt`);
  }

  const assetId = requiredString(sound.assetId, `${surface} asset ID`);
  const sourceAssetId = requiredString(rightsEvidence.sourceAssetId, `${surface} rights source asset ID`);
  if (sourceAssetId !== assetId) {
    throw new Error(`${surface} rights receipt belongs to ${sourceAssetId}, not ${assetId}`);
  }

  return {
    surface,
    sourceOverlayId,
    soundOverlayId: requiredNumber(sound.id, `${surface} sound overlay ID`),
    assetId,
    audioUrl: requiredString(sound.src ?? sound.content, `${surface} audio URL`),
    from: requiredNumber(sound.from, `${surface} start frame`),
    durationInFrames: requiredNumber(sound.durationInFrames, `${surface} duration`),
    syncFrame: requiredNumber(
      readNested(sound, ['metadata', 'atomicSfxForm', 'timing', 'syncFrame']),
      `${surface} sync frame`,
    ),
    selectionLane: 'catalog',
    rights: {
      source: 'library',
      licensed: true,
      sourceAssetId,
      licenseId: requiredString(rightsEvidence.licenseId, `${surface} license ID`),
    },
    ...(semanticRetrieval ? { semanticRetrieval } : {}),
  };
}

function buildSemanticRetrievalEvidence(
  providerReport: Record<string, unknown>,
  surface: CanarySoundEvidence['surface'],
): CanarySoundEvidence['semanticRetrieval'] {
  if (providerReport.semanticRetrieval === undefined) return undefined;
  const report = requiredRecord(
    providerReport.semanticRetrieval,
    `${surface} semantic retrieval report`,
  );
  const indexedAssetCount = requiredNumber(
    report.indexedAssetCount,
    `${surface} semantic indexed asset count`,
  );
  if (!Number.isSafeInteger(indexedAssetCount) || indexedAssetCount < 1) {
    throw new Error(`${surface} semantic indexed asset count must be a positive integer`);
  }
  if (!Array.isArray(report.candidates) || report.candidates.length === 0) {
    throw new Error(`${surface} semantic retrieval returned no candidates`);
  }
  return {
    version: requiredString(report.version, `${surface} semantic version`),
    releaseReceiptDigestSha256: requiredSha256(
      report.releaseReceiptDigestSha256,
      `${surface} semantic release receipt digest`,
    ),
    promotedManifestDigestSha256: requiredSha256(
      report.promotedManifestDigestSha256,
      `${surface} semantic manifest digest`,
    ),
    queryDigestSha256: requiredSha256(
      report.queryDigestSha256,
      `${surface} semantic query digest`,
    ),
    indexedAssetCount,
    candidateCount: report.candidates.length,
  };
}

function requiredSha256(value: unknown, label: string): string {
  const digest = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Canary ${label} is not a lowercase SHA-256 digest`);
  }
  return digest;
}

function findSoundBySource(overlays: unknown[], source: string): Record<string, unknown> {
  const sound = overlays
    .filter(isRecord)
    .find((overlay) =>
      overlay.type === 'sound'
      && readNested(overlay, ['metadata', 'source']) === source
    );
  if (!sound) throw new Error(`Canary did not produce a ${source} sound overlay`);
  return sound;
}

function findOverlay(overlays: unknown[], id: number): Record<string, unknown> {
  const overlay = overlays.filter(isRecord).find((item) => item.id === id);
  if (!overlay) throw new Error(`Canary source overlay ${id} is missing`);
  return overlay;
}

function requirePlacementStatus(
  placement: Record<string, unknown>,
  expected: string,
  label: string,
): void {
  if (placement.status !== expected) {
    throw new Error(`Canary ${label} expected ${expected}, received ${String(placement.status)}`);
  }
}

function requiredNestedRecord(
  value: Record<string, unknown>,
  path: string[],
): Record<string, unknown> {
  return requiredRecord(readNested(value, path), path.join('.'));
}

function readNested(value: unknown, path: string[]): unknown {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Canary ${label} is missing`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Canary ${label} is missing`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Canary ${label} is missing`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
