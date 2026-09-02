import React, { createContext, useContext, type ReactNode } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';

export interface GeneratedCompositionRuntimeManifestV1 {
  canvas: { width: number; height: number };
  parameters: Readonly<Record<string, string | number>>;
  sources: readonly {
    slotId: string;
    publicFileName: string;
    mediaKind: 'VIDEO' | 'STILL_IMAGE';
    startFrame: number;
    endExclusiveFrame: number;
  }[];
  fonts: readonly {
    slotId: string;
    publicFileName: string;
    family: string;
    weight: number;
  }[];
  textSlots: readonly { slotId: string; fontSlotId: string; parameterId: string }[];
  layers: readonly { layerId: string; kind: 'SOURCE_PANEL' | 'TEXT'; zIndex: number }[];
}

const RuntimeContext = createContext<GeneratedCompositionRuntimeManifestV1 | null>(null);
const GutterContext = createContext(0);

export interface GeneratedPanelBoundsV1 {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function GeneratedCompositionProvider({
  manifest,
  children,
}: {
  manifest: GeneratedCompositionRuntimeManifestV1;
  children: ReactNode;
}) {
  assertUnique(manifest.sources.map(({ slotId }) => slotId), 'source slot');
  for (const source of manifest.sources) {
    if (source.mediaKind !== 'VIDEO' && source.mediaKind !== 'STILL_IMAGE') {
      throw new Error(`Generated composition source media kind is unsupported: ${source.slotId}`);
    }
  }
  assertUnique(manifest.fonts.map(({ slotId }) => slotId), 'font slot');
  assertUnique(manifest.textSlots.map(({ slotId }) => slotId), 'text slot');
  assertUnique(manifest.layers.map(({ layerId }) => layerId), 'layer');
  return <RuntimeContext.Provider value={manifest}>{children}</RuntimeContext.Provider>;
}

export function useCompositionParameter<T extends string | number>(parameterId: string): T {
  const manifest = useRuntime();
  const value = manifest.parameters[parameterId];
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Generated composition parameter is missing: ${parameterId}`);
  }
  return value as T;
}

export function CompositionStage({
  background,
  gutter,
  children,
}: {
  background: string;
  gutter: number;
  children: ReactNode;
}) {
  const manifest = useRuntime();
  const safeGutter = finiteNumber(gutter, 'gutter');
  const fontCss = manifest.fonts.map((font) => (
    `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(staticFile(font.publicFileName))}) format("truetype");font-weight:${font.weight};font-style:normal;}`
  )).join('');
  return (
    <AbsoluteFill style={{ backgroundColor: background, overflow: 'hidden' }}>
      <style>{fontCss}</style>
      <GutterContext.Provider value={safeGutter}>{children}</GutterContext.Provider>
    </AbsoluteFill>
  );
}

export function Panel({
  layerId,
  column,
  row,
  bounds,
  translateX = 0,
  translateY,
  entryScale = 1,
  takeoverProgress = 0,
  children,
}: {
  layerId: string;
  column?: 'left' | 'centre' | 'right';
  row?: 'top' | 'centre' | 'bottom';
  bounds?: GeneratedPanelBoundsV1;
  translateX?: number;
  translateY: number;
  entryScale?: number;
  takeoverProgress?: number;
  children: ReactNode;
}) {
  const manifest = useRuntime();
  const gutter = useContext(GutterContext);
  const layer = manifest.layers.find((candidate) => candidate.layerId === layerId);
  if (!layer || layer.kind !== 'SOURCE_PANEL') throw new Error(`Generated composition source layer is undeclared: ${layerId}`);
  const geometry = resolveGeneratedPanelGeometryV1({
    canvas: manifest.canvas, gutter, column, row, bounds, takeoverProgress,
  });
  const scale = finiteNumber(entryScale, 'entryScale');
  const x = finiteNumber(translateX, 'translateX');
  const y = finiteNumber(translateY, 'translateY');
  return (
    <div style={{
      position: 'absolute', left: geometry.left, top: geometry.top, width: geometry.width,
      height: geometry.height, padding: geometry.padding,
      boxSizing: 'border-box', overflow: 'visible', zIndex: layer.zIndex,
      transform: x === 0
        ? `translateY(${y}px) scale(${scale})`
        : `translateX(${x}px) translateY(${y}px) scale(${scale})`,
      transformOrigin: 'center center',
    }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#000' }}>
        {children}
      </div>
    </div>
  );
}

export function resolveGeneratedPanelGeometryV1(input: {
  canvas: { width: number; height: number };
  gutter: number;
  column?: 'left' | 'centre' | 'right';
  row?: 'top' | 'centre' | 'bottom';
  bounds?: GeneratedPanelBoundsV1;
  takeoverProgress: number;
}): { left: number; top: number; width: number; height: number; padding: number } {
  const progress = finiteNumber(input.takeoverProgress, 'takeoverProgress');
  if (progress < 0 || progress > 1) throw new Error(`Generated composition takeoverProgress is outside [0,1]: ${progress}`);
  const canvasWidth = positiveFiniteNumber(input.canvas.width, 'canvas width');
  const canvasHeight = positiveFiniteNumber(input.canvas.height, 'canvas height');
  const hasGridPosition = input.column !== undefined || input.row !== undefined;
  if (input.bounds && hasGridPosition) throw new Error('Generated composition panel geometry must use bounds or grid position, not both');
  if (!input.bounds && (!input.column || !input.row)) throw new Error('Generated composition panel geometry is missing');
  const base = input.bounds
    ? resolveNormalizedBounds(input.bounds, canvasWidth, canvasHeight)
    : resolveGridBounds(input.column!, input.row!, canvasWidth, canvasHeight);
  return {
    left: base.left * (1 - progress),
    top: base.top * (1 - progress),
    width: base.width + (canvasWidth - base.width) * progress,
    height: base.height + (canvasHeight - base.height) * progress,
    padding: (finiteNumber(input.gutter, 'gutter') / 2) * (1 - progress),
  };
}

function resolveGridBounds(
  column: 'left' | 'centre' | 'right',
  row: 'top' | 'centre' | 'bottom',
  canvasWidth: number,
  canvasHeight: number,
): GeneratedPanelBoundsV1 {
  const columnWidth = canvasWidth / 3;
  return {
    left: column === 'left' ? 0 : column === 'centre' ? columnWidth : columnWidth * 2,
    top: row === 'top' ? 0 : row === 'bottom' ? canvasHeight / 2 : canvasHeight / 3,
    width: columnWidth,
    height: row === 'centre' ? canvasHeight / 3 : canvasHeight / 2,
  };
}

function resolveNormalizedBounds(
  bounds: GeneratedPanelBoundsV1,
  canvasWidth: number,
  canvasHeight: number,
): GeneratedPanelBoundsV1 {
  const left = finiteNumber(bounds.left, 'bounds.left');
  const top = finiteNumber(bounds.top, 'bounds.top');
  const width = finiteNumber(bounds.width, 'bounds.width');
  const height = finiteNumber(bounds.height, 'bounds.height');
  if (left < 0 || top < 0 || width <= 0 || height <= 0
    || left + width > 1 || top + height > 1) {
    throw new Error('Generated composition normalized panel bounds must be contained inside [0,1]');
  }
  return {
    left: left * canvasWidth,
    top: top * canvasHeight,
    width: width * canvasWidth,
    height: height * canvasHeight,
  };
}

export function AssetSlot({
  slotId,
  sourceFrame,
  crop,
}: {
  slotId: string;
  sourceFrame: number;
  crop: 'portrait-left' | 'centre' | 'portrait-right';
}) {
  const manifest = useRuntime();
  const frame = useCurrentFrame();
  const source = manifest.sources.find((candidate) => candidate.slotId === slotId);
  if (!source) throw new Error(`Generated composition source slot is undeclared: ${slotId}`);
  if (!Number.isSafeInteger(sourceFrame) || sourceFrame < source.startFrame || sourceFrame >= source.endExclusiveFrame) {
    throw new Error(`Generated composition source frame is outside ${slotId}: ${sourceFrame}`);
  }
  const objectPosition = crop === 'portrait-left' ? '25% 50%' : crop === 'portrait-right' ? '75% 50%' : '50% 50%';
  const style = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const, objectPosition };
  if (source.mediaKind === 'STILL_IMAGE') {
    return <Img src={staticFile(source.publicFileName)} style={style} />;
  }
  return (
    <Sequence from={frame - sourceFrame} layout="none">
      <OffthreadVideo
        src={staticFile(source.publicFileName)}
        muted
        style={style}
      />
    </Sequence>
  );
}

export function TextSlot({
  slotId,
  fontSlotId,
  parameterId,
  value,
  color,
  size,
  fixedToCanvas,
  visibleUntilFrame,
}: {
  slotId: string;
  fontSlotId: string;
  parameterId: string;
  value: string;
  color: string;
  size: number;
  fixedToCanvas?: boolean;
  visibleUntilFrame?: number;
}) {
  const manifest = useRuntime();
  const frame = useCurrentFrame();
  const textSlot = manifest.textSlots.find((candidate) => candidate.slotId === slotId);
  const font = manifest.fonts.find((candidate) => candidate.slotId === fontSlotId);
  const layer = manifest.layers.find((candidate) => candidate.layerId === slotId);
  if (!textSlot || textSlot.fontSlotId !== fontSlotId || textSlot.parameterId !== parameterId || !font || !layer || layer.kind !== 'TEXT') {
    throw new Error(`Generated composition text slot binding is invalid: ${slotId}`);
  }
  if (visibleUntilFrame !== undefined && frame >= visibleUntilFrame) return null;
  return (
    <div style={{
      position: fixedToCanvas ? 'absolute' : 'relative', inset: fixedToCanvas ? 0 : undefined,
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: layer.zIndex,
      padding: 64, boxSizing: 'border-box', textAlign: 'center', whiteSpace: 'pre-line',
      fontFamily: font.family, fontWeight: font.weight, fontSize: finiteNumber(size, 'font size'),
      lineHeight: 0.9, letterSpacing: -2, color, textShadow: '0 4px 0 rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.65)',
    }}>
      {value}
    </div>
  );
}

function useRuntime(): GeneratedCompositionRuntimeManifestV1 {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error('Generated composition API used outside its provider');
  return value;
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Generated composition ${label} must be finite`);
  return value;
}

function positiveFiniteNumber(value: number, label: string): number {
  const finite = finiteNumber(value, label);
  if (finite <= 0) throw new Error(`Generated composition ${label} must be positive`);
  return finite;
}

function assertUnique(values: string[], label: string): void {
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new Error(`Generated composition ${label} identities are invalid`);
  }
}
