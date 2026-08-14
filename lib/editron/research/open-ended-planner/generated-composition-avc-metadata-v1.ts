export interface GeneratedCompositionAvcMetadataV1 {
  chromaFormatIdc: number | null;
  bitDepthLumaMinus8: number | null;
  bitDepthChromaMinus8: number | null;
  videoFullRangeFlag: boolean | null;
  colourPrimaries: number | null;
  transferCharacteristics: number | null;
  matrixCoefficients: number | null;
}

const UNKNOWN_AVC_METADATA: GeneratedCompositionAvcMetadataV1 = {
  chromaFormatIdc: null,
  bitDepthLumaMinus8: null,
  bitDepthChromaMinus8: null,
  videoFullRangeFlag: null,
  colourPrimaries: null,
  transferCharacteristics: null,
  matrixCoefficients: null,
};

const EXTENDED_PROFILES = new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]);

export function parseGeneratedCompositionAvcMetadataV1(
  description: AllowSharedBufferSource | undefined,
): Readonly<GeneratedCompositionAvcMetadataV1> {
  try {
    const sps = firstSequenceParameterSet(toBytes(description));
    const reader = new BitReader(removeEmulationPrevention(sps.subarray(1)));
    const profileIdc = reader.readBits(8);
    reader.readBits(8);
    reader.readBits(8);
    reader.readUnsignedExpGolomb();

    let chromaFormatIdc = 1;
    let bitDepthLumaMinus8 = 0;
    let bitDepthChromaMinus8 = 0;
    if (EXTENDED_PROFILES.has(profileIdc)) {
      chromaFormatIdc = reader.readUnsignedExpGolomb();
      if (chromaFormatIdc === 3) reader.readBits(1);
      bitDepthLumaMinus8 = reader.readUnsignedExpGolomb();
      bitDepthChromaMinus8 = reader.readUnsignedExpGolomb();
      reader.readBits(1);
      if (reader.readBits(1)) {
        const scalingListCount = chromaFormatIdc === 3 ? 12 : 8;
        for (let index = 0; index < scalingListCount; index += 1) {
          if (reader.readBits(1)) skipScalingList(reader, index < 6 ? 16 : 64);
        }
      }
    }

    reader.readUnsignedExpGolomb();
    const picOrderCountType = reader.readUnsignedExpGolomb();
    if (picOrderCountType === 0) reader.readUnsignedExpGolomb();
    else if (picOrderCountType === 1) {
      reader.readBits(1);
      reader.readSignedExpGolomb();
      reader.readSignedExpGolomb();
      const cycleLength = reader.readUnsignedExpGolomb();
      for (let index = 0; index < cycleLength; index += 1) reader.readSignedExpGolomb();
    } else if (picOrderCountType !== 2) throw new Error('Unsupported AVC picture order count type');
    reader.readUnsignedExpGolomb();
    reader.readBits(1);
    reader.readUnsignedExpGolomb();
    reader.readUnsignedExpGolomb();
    const frameMbsOnlyFlag = reader.readBits(1);
    if (!frameMbsOnlyFlag) reader.readBits(1);
    reader.readBits(1);
    if (reader.readBits(1)) {
      reader.readUnsignedExpGolomb();
      reader.readUnsignedExpGolomb();
      reader.readUnsignedExpGolomb();
      reader.readUnsignedExpGolomb();
    }

    const base = { chromaFormatIdc, bitDepthLumaMinus8, bitDepthChromaMinus8 };
    if (!reader.readBits(1)) return { ...base, ...unknownVideoSignal() };
    skipVuiPrefix(reader);
    if (!reader.readBits(1)) return { ...base, ...unknownVideoSignal() };
    reader.readBits(3);
    const videoFullRangeFlag = reader.readBits(1) === 1;
    if (!reader.readBits(1)) return { ...base, videoFullRangeFlag, colourPrimaries: null, transferCharacteristics: null, matrixCoefficients: null };
    return {
      ...base,
      videoFullRangeFlag,
      colourPrimaries: reader.readBits(8),
      transferCharacteristics: reader.readBits(8),
      matrixCoefficients: reader.readBits(8),
    };
  } catch {
    return { ...UNKNOWN_AVC_METADATA };
  }
}

function toBytes(description: AllowSharedBufferSource | undefined): Uint8Array {
  if (!description) throw new Error('Missing AVC decoder configuration');
  return ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
}

function firstSequenceParameterSet(configuration: Uint8Array): Uint8Array {
  if (configuration.length < 8 || configuration[0] !== 1) throw new Error('Invalid AVC decoder configuration');
  const count = configuration[5] & 0x1f;
  if (count < 1) throw new Error('AVC decoder configuration has no SPS');
  const length = (configuration[6] << 8) | configuration[7];
  const sps = configuration.subarray(8, 8 + length);
  if (sps.length !== length || sps.length < 5 || (sps[0] & 0x1f) !== 7) throw new Error('Invalid AVC SPS');
  return sps;
}

function skipVuiPrefix(reader: BitReader): void {
  if (reader.readBits(1)) {
    const aspectRatioIdc = reader.readBits(8);
    if (aspectRatioIdc === 255) {
      reader.readBits(16);
      reader.readBits(16);
    }
  }
  if (reader.readBits(1)) reader.readBits(1);
}

function skipScalingList(reader: BitReader, size: number): void {
  let lastScale = 8;
  let nextScale = 8;
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) nextScale = (lastScale + reader.readSignedExpGolomb() + 256) % 256;
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

function unknownVideoSignal() {
  return { videoFullRangeFlag: null, colourPrimaries: null, transferCharacteristics: null, matrixCoefficients: null };
}

function removeEmulationPrevention(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (index >= 2 && bytes[index] === 3 && bytes[index - 1] === 0 && bytes[index - 2] === 0) continue;
    output.push(bytes[index]);
  }
  return Uint8Array.from(output);
}

class BitReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  readBits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.offset >= this.bytes.length * 8) throw new Error('AVC SPS ended unexpectedly');
      value = value * 2 + ((this.bytes[this.offset >> 3] >> (7 - (this.offset & 7))) & 1);
      this.offset += 1;
    }
    return value;
  }
  readUnsignedExpGolomb(): number {
    let leadingZeroes = 0;
    while (this.readBits(1) === 0) {
      leadingZeroes += 1;
      if (leadingZeroes > 30) throw new Error('AVC SPS Exp-Golomb value is too large');
    }
    return (2 ** leadingZeroes - 1) + (leadingZeroes ? this.readBits(leadingZeroes) : 0);
  }
  readSignedExpGolomb(): number {
    const code = this.readUnsignedExpGolomb();
    return code % 2 === 0 ? -(code / 2) : (code + 1) / 2;
  }
}
