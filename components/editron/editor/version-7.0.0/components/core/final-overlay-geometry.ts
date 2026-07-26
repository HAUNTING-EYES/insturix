import {
  EDITRON_CAPTION_SAFE_BOTTOM_MARGIN,
  EDITRON_CAPTION_SAFE_TOP_MARGIN,
} from '@/lib/editron/shared/overlay-safe-zone-contract';

const TITLE_SAFE_MARGIN = 0.1;
const EPSILON = 0.001;

export interface FinalOverlayGeometry {
  left: number;
  top: number;
  scale: number;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  constrained: boolean;
}

export function constrainFinalOverlayGeometry(input: {
  overlayType: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  rotationDegrees: number;
  transformOrigin: string;
  canvasWidth: number;
  canvasHeight: number;
}): FinalOverlayGeometry {
  assertFiniteGeometry(input);

  if (input.overlayType !== 'text' && input.overlayType !== 'caption') {
    return {
      left: input.left,
      top: input.top,
      scale: input.scale,
      bounds: transformedBounds(input),
      constrained: false,
    };
  }

  const safeTopMargin = input.overlayType === 'caption'
    ? EDITRON_CAPTION_SAFE_TOP_MARGIN
    : TITLE_SAFE_MARGIN;
  const safeBottomMargin = input.overlayType === 'caption'
    ? EDITRON_CAPTION_SAFE_BOTTOM_MARGIN
    : TITLE_SAFE_MARGIN;
  const safe = {
    left: input.canvasWidth * TITLE_SAFE_MARGIN,
    top: input.canvasHeight * safeTopMargin,
    right: input.canvasWidth * (1 - TITLE_SAFE_MARGIN),
    bottom: input.canvasHeight * (1 - safeBottomMargin),
  };
  const requestedBounds = transformedBounds(input);
  const requestedWidth = requestedBounds.right - requestedBounds.left;
  const requestedHeight = requestedBounds.bottom - requestedBounds.top;
  const safeWidth = safe.right - safe.left;
  const safeHeight = safe.bottom - safe.top;
  const fitRatio = Math.min(
    1,
    requestedWidth > EPSILON ? safeWidth / requestedWidth : 1,
    requestedHeight > EPSILON ? safeHeight / requestedHeight : 1,
  );
  const scale = input.scale * fitRatio;
  let left = input.left;
  let top = input.top;
  let bounds = transformedBounds({ ...input, left, top, scale });

  if (bounds.left < safe.left) left += safe.left - bounds.left;
  if (bounds.right > safe.right) left -= bounds.right - safe.right;
  if (bounds.top < safe.top) top += safe.top - bounds.top;
  if (bounds.bottom > safe.bottom) top -= bounds.bottom - safe.bottom;

  bounds = transformedBounds({ ...input, left, top, scale });
  return {
    left,
    top,
    scale,
    bounds,
    constrained: !nearlyEqual(left, input.left)
      || !nearlyEqual(top, input.top)
      || !nearlyEqual(scale, input.scale),
  };
}

function transformedBounds(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  rotationDegrees: number;
  transformOrigin: string;
}): FinalOverlayGeometry['bounds'] {
  const origin = parseTransformOrigin(input.transformOrigin, input.width, input.height);
  const radians = input.rotationDegrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [0, 0],
    [input.width, 0],
    [input.width, input.height],
    [0, input.height],
  ].map(([x, y]) => {
    const relativeX = (x - origin.x) * input.scale;
    const relativeY = (y - origin.y) * input.scale;
    return {
      x: input.left + origin.x + (relativeX * cosine) - (relativeY * sine),
      y: input.top + origin.y + (relativeX * sine) + (relativeY * cosine),
    };
  });

  return {
    left: Math.min(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    right: Math.max(...corners.map((point) => point.x)),
    bottom: Math.max(...corners.map((point) => point.y)),
  };
}

function parseTransformOrigin(value: string, width: number, height: number): { x: number; y: number } {
  const parts = value.trim().split(/\s+/);
  const first = parts[0] ?? 'center';
  const second = parts[1] ?? 'center';
  const verticalFirst = isVerticalKeyword(first) && isHorizontalKeyword(second);
  const xPart = verticalFirst ? second : first;
  const yPart = verticalFirst ? first : second;
  const x = parseOriginPart(xPart, width, 'x');
  const y = parseOriginPart(yPart, height, 'y');
  return { x, y };
}

function isHorizontalKeyword(value: string): boolean {
  return value === 'left' || value === 'right' || value === 'center';
}

function isVerticalKeyword(value: string): boolean {
  return value === 'top' || value === 'bottom' || value === 'center';
}

function parseOriginPart(value: string, size: number, axis: 'x' | 'y'): number {
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? size * percent / 100 : size / 2;
  }
  if (value.endsWith('px')) {
    const pixels = Number.parseFloat(value);
    return Number.isFinite(pixels) ? pixels : size / 2;
  }
  if (value === 'center') return size / 2;
  if (value === 'left' || value === 'top') return 0;
  if (value === 'right' || value === 'bottom') return size;
  if ((axis === 'x' && (value === 'top' || value === 'bottom'))
    || (axis === 'y' && (value === 'left' || value === 'right'))) {
    return size / 2;
  }
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : size / 2;
}

function assertFiniteGeometry(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  rotationDegrees: number;
  canvasWidth: number;
  canvasHeight: number;
}): void {
  const values = [
    input.left,
    input.top,
    input.width,
    input.height,
    input.scale,
    input.rotationDegrees,
    input.canvasWidth,
    input.canvasHeight,
  ];
  if (!values.every(Number.isFinite)
    || input.width <= 0
    || input.height <= 0
    || input.canvasWidth <= 0
    || input.canvasHeight <= 0) {
    throw new Error('Final overlay geometry requires finite coordinates and positive dimensions.');
  }
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}
