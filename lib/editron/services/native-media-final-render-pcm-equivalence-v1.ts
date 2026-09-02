import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_V1' as const;

export type NativeMediaFinalRenderPcmRangeEvidenceV1 = Readonly<{
  segmentOrdinal: string;
  sourceStartSampleFrame: string;
  sourceEndExclusiveSampleFrame: string;
  rangeSha256: string;
}>;

export type NativeMediaFinalRenderSilenceEvidenceV1 = Readonly<{
  segmentOrdinal: string;
  sampleFrameCount: string;
}>;

export type NativeMediaFinalRenderPcmEquivalenceReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1;
  transformSha256: string;
  audioMappingSha256: string;
  sourceDecodedPcmSha256: string;
  artifactDecodedPcmSha256: string;
  sampleRate: string;
  channelCount: number;
  decodedSampleFrameCount: string;
  pcmRanges: readonly NativeMediaFinalRenderPcmRangeEvidenceV1[];
  silenceRanges: readonly NativeMediaFinalRenderSilenceEvidenceV1[];
  receiptSha256: string;
}>;

type ReceiptMaterialV1 = Omit<NativeMediaFinalRenderPcmEquivalenceReceiptV1, 'receiptSha256'>;

const RECEIPT_FIELDS_V1 = Object.freeze([
  'artifactDecodedPcmSha256',
  'audioMappingSha256',
  'channelCount',
  'decodedSampleFrameCount',
  'kind',
  'pcmRanges',
  'receiptSha256',
  'sampleRate',
  'schemaVersion',
  'silenceRanges',
  'sourceDecodedPcmSha256',
  'transformSha256',
] as const);

const MAX_SEGMENTS_V1 = 200_001;

export function createNativeMediaFinalRenderPcmEquivalenceReceiptV1(
  input: ReceiptMaterialV1,
): NativeMediaFinalRenderPcmEquivalenceReceiptV1 {
  if (!input || input.schemaVersion !== 1
    || input.kind !== NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1
    || !Number.isSafeInteger(input.channelCount) || input.channelCount < 1
    || !Array.isArray(input.pcmRanges) || !Array.isArray(input.silenceRanges)
    || input.pcmRanges.length + input.silenceRanges.length < 1
    || input.pcmRanges.length + input.silenceRanges.length > MAX_SEGMENTS_V1) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_INVALID');
  }
  const pcmRanges = input.pcmRanges.map((value) => Object.freeze({
    segmentOrdinal: nonNegativeIntegerText(value.segmentOrdinal),
    sourceStartSampleFrame: nonNegativeIntegerText(value.sourceStartSampleFrame),
    sourceEndExclusiveSampleFrame: positiveIntegerText(value.sourceEndExclusiveSampleFrame),
    rangeSha256: sha256(value.rangeSha256),
  }));
  const silenceRanges = input.silenceRanges.map((value) => Object.freeze({
    segmentOrdinal: nonNegativeIntegerText(value.segmentOrdinal),
    sampleFrameCount: positiveIntegerText(value.sampleFrameCount),
  }));
  const ordinals = [...pcmRanges, ...silenceRanges]
    .map(({ segmentOrdinal }) => BigInt(segmentOrdinal))
    .sort(compareBigInt);
  if (ordinals.some((value, index) => value !== BigInt(index))) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_SEGMENT_ORDER_INVALID');
  }
  let observedSampleFrames = BigInt(0);
  for (const range of pcmRanges) {
    const count = BigInt(range.sourceEndExclusiveSampleFrame)
      - BigInt(range.sourceStartSampleFrame);
    if (count <= BigInt(0)) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_RANGE_INVALID');
    }
    observedSampleFrames += count;
  }
  for (const range of silenceRanges) {
    observedSampleFrames += BigInt(range.sampleFrameCount);
  }
  const decodedSampleFrameCount = positiveIntegerText(input.decodedSampleFrameCount);
  if (observedSampleFrames !== BigInt(decodedSampleFrameCount)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_COVERAGE_MISMATCH');
  }
  const material = Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1,
    transformSha256: sha256(input.transformSha256),
    audioMappingSha256: sha256(input.audioMappingSha256),
    sourceDecodedPcmSha256: sha256(input.sourceDecodedPcmSha256),
    artifactDecodedPcmSha256: sha256(input.artifactDecodedPcmSha256),
    sampleRate: positiveIntegerText(input.sampleRate),
    channelCount: input.channelCount,
    decodedSampleFrameCount,
    pcmRanges: Object.freeze(pcmRanges),
    silenceRanges: Object.freeze(silenceRanges),
  });
  return Object.freeze({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderPcmEquivalenceReceiptV1(
  value: unknown,
): NativeMediaFinalRenderPcmEquivalenceReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_RECEIPT_INVALID');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECEIPT_FIELDS_V1.length
    || keys.some((key, index) => key !== RECEIPT_FIELDS_V1[index])) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_FIELDS_INVALID');
  }
  const { receiptSha256, ...material } = record;
  const recreated = createNativeMediaFinalRenderPcmEquivalenceReceiptV1(
    material as ReceiptMaterialV1,
  );
  if (recreated.receiptSha256 !== receiptSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_HASH_INVALID');
  }
  return recreated;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_HASH_INVALID');
  }
  return value;
}

function nonNegativeIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_INTEGER_INVALID');
  }
  return BigInt(value).toString();
}

function positiveIntegerText(value: unknown): string {
  const normalized = nonNegativeIntegerText(value);
  if (normalized === '0') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_INTEGER_INVALID');
  }
  return normalized;
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
