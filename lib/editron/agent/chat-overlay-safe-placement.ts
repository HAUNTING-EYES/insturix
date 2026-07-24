export const EDITRON_TITLE_SAFE_MARGIN = 0.1;
export const EDITRON_ACTION_SAFE_MARGIN = 0.05;

export interface ChatOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChatOverlayCanvas {
  width: number;
  height: number;
}

export interface ChatOverlayPlacementResolution extends ChatOverlayBounds {
  adjusted: boolean;
  margin: number;
  requested: ChatOverlayBounds;
}

export function constrainChatOverlayPlacement(input: {
  overlayType: string;
  bounds: ChatOverlayBounds;
  canvas: ChatOverlayCanvas;
}): ChatOverlayPlacementResolution {
  assertFinitePositiveCanvas(input.canvas);
  assertFinitePositiveBounds(input.bounds);

  const margin = safeMarginForOverlayType(input.overlayType);
  const safeLeft = input.canvas.width * margin;
  const safeTop = input.canvas.height * margin;
  const safeWidth = input.canvas.width * (1 - (margin * 2));
  const safeHeight = input.canvas.height * (1 - (margin * 2));
  const scale = Math.min(
    1,
    safeWidth / input.bounds.width,
    safeHeight / input.bounds.height,
  );
  const width = input.bounds.width * scale;
  const height = input.bounds.height * scale;
  const centeredLeft = input.bounds.left + ((input.bounds.width - width) / 2);
  const centeredTop = input.bounds.top + ((input.bounds.height - height) / 2);
  const left = clamp(centeredLeft, safeLeft, safeLeft + safeWidth - width);
  const top = clamp(centeredTop, safeTop, safeTop + safeHeight - height);
  const adjusted = !nearlyEqual(left, input.bounds.left)
    || !nearlyEqual(top, input.bounds.top)
    || !nearlyEqual(width, input.bounds.width)
    || !nearlyEqual(height, input.bounds.height);

  return {
    left,
    top,
    width,
    height,
    adjusted,
    margin,
    requested: { ...input.bounds },
  };
}

function safeMarginForOverlayType(overlayType: string): number {
  if (overlayType === 'text' || overlayType === 'caption') {
    return EDITRON_TITLE_SAFE_MARGIN;
  }
  if (overlayType === 'video') {
    return 0;
  }
  return EDITRON_ACTION_SAFE_MARGIN;
}

function assertFinitePositiveCanvas(canvas: ChatOverlayCanvas): void {
  if (!Number.isFinite(canvas.width) || !Number.isFinite(canvas.height)
    || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Chat overlay placement requires finite positive canvas dimensions.');
  }
}

function assertFinitePositiveBounds(bounds: ChatOverlayBounds): void {
  if (![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Chat overlay placement requires finite coordinates and positive dimensions.');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}
