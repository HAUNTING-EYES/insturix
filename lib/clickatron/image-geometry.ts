const ASPECT_RATIO_PATTERN = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
const MIN_ASPECT_RATIO = 1 / 16;
const MAX_ASPECT_RATIO = 16;
const DIMENSION_STEP = 8;

const CANONICAL_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "4:5",
  "5:4",
  "21:9",
  "3:2",
  "2:3",
  "1.91:1",
] as const;

export class ClickatronAspectRatioError extends Error {
  readonly code = "UNSUPPORTED_ASPECT_RATIO";

  constructor(message: string) {
    super(message);
    this.name = "ClickatronAspectRatioError";
  }
}

export interface ClickatronImageGeometry {
  ratio: string;
  width: number;
  height: number;
  numericRatio: number;
}

function canonicalizeAspectRatio(width: number, height: number): string {
  const numericRatio = width / height;
  const knownRatio = CANONICAL_ASPECT_RATIOS.find((candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
    return Math.abs(candidateWidth / candidateHeight - numericRatio) < 0.000001;
  });

  return knownRatio ?? `${width}:${height}`;
}

function roundDimension(value: number): number {
  return Math.max(DIMENSION_STEP, Math.round(value / DIMENSION_STEP) * DIMENSION_STEP);
}

export function resolveClickatronImageGeometry(
  aspectRatio: string,
  targetLongEdge = 1024,
): ClickatronImageGeometry {
  const normalizedInput = aspectRatio.trim();
  const match = ASPECT_RATIO_PATTERN.exec(normalizedInput);
  if (!match) {
    throw new ClickatronAspectRatioError(`Invalid Clickatron aspect ratio: ${aspectRatio}`);
  }

  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  const numericRatio = widthRatio / heightRatio;
  if (
    !Number.isFinite(numericRatio)
    || widthRatio <= 0
    || heightRatio <= 0
    || numericRatio < MIN_ASPECT_RATIO
    || numericRatio > MAX_ASPECT_RATIO
  ) {
    throw new ClickatronAspectRatioError(`Unsupported Clickatron aspect ratio: ${aspectRatio}`);
  }

  if (!Number.isInteger(targetLongEdge) || targetLongEdge < 256 || targetLongEdge > 4096) {
    throw new ClickatronAspectRatioError(`Invalid Clickatron target image edge: ${targetLongEdge}`);
  }

  const ratio = canonicalizeAspectRatio(widthRatio, heightRatio);
  const width = numericRatio >= 1
    ? targetLongEdge
    : roundDimension(targetLongEdge * numericRatio);
  const height = numericRatio >= 1
    ? roundDimension(targetLongEdge / numericRatio)
    : targetLongEdge;

  return { ratio, width, height, numericRatio };
}
