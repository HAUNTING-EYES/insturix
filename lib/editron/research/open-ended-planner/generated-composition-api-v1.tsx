import React, { createContext, useContext, type ReactNode } from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';

export interface GeneratedCompositionRuntimeManifestV1 {
  canvas: { width: number; height: number };
  parameters: Readonly<Record<string, string | number>>;
  sources: readonly {
    slotId: string;
    publicFileName: string;
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

export function GeneratedCompositionProvider({
  manifest,
  children,
}: {
  manifest: GeneratedCompositionRuntimeManifestV1;
  children: ReactNode;
}) {
  assertUnique(manifest.sources.map(({ slotId }) => slotId), 'source slot');
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
  translateY,
  entryScale = 1,
  takeoverProgress = 0,
  children,
}: {
  layerId: string;
  column: 'left' | 'centre' | 'right';
  row: 'top' | 'centre' | 'bottom';
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
    canvas: manifest.canvas, gutter, column, row, takeoverProgress,
  });
  const scale = finiteNumber(entryScale, 'entryScale');
  return (
    <div style={{
      position: 'absolute', left: geometry.left, top: geometry.top, width: geometry.width,
      height: geometry.height, padding: geometry.padding,
      boxSizing: 'border-box', overflow: 'visible', zIndex: layer.zIndex,
      transform: `translateY(${finiteNumber(translateY, 'translateY')}px) scale(${scale})`,
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
  column: 'left' | 'centre' | 'right';
  row: 'top' | 'centre' | 'bottom';
  takeoverProgress: number;
}): { left: number; top: number; width: number; height: number; padding: number } {
  const progress = finiteNumber(input.takeoverProgress, 'takeoverProgress');
  if (progress < 0 || progress > 1) throw new Error(`Generated composition takeoverProgress is outside [0,1]: ${progress}`);
  const columnWidth = input.canvas.width / 3;
  const baseLeft = input.column === 'left' ? 0 : input.column === 'centre' ? columnWidth : columnWidth * 2;
  const baseTop = input.row === 'top' ? 0 : input.row === 'bottom' ? input.canvas.height / 2 : input.canvas.height / 3;
  const baseHeight = input.row === 'centre' ? input.canvas.height / 3 : input.canvas.height / 2;
  return {
    left: baseLeft * (1 - progress),
    top: baseTop * (1 - progress),
    width: columnWidth + (input.canvas.width - columnWidth) * progress,
    height: baseHeight + (input.canvas.height - baseHeight) * progress,
    padding: (finiteNumber(input.gutter, 'gutter') / 2) * (1 - progress),
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
  return (
    <Sequence from={frame - sourceFrame} layout="none">
      <OffthreadVideo
        src={staticFile(source.publicFileName)}
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition }}
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

function assertUnique(values: string[], label: string): void {
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new Error(`Generated composition ${label} identities are invalid`);
  }
}
