/**
 * MG Codegen — render scaffolding (E0 Phase D, PURE). The string builders + cache-id that turn a moment into
 * an isolated Remotion project, with NO heavy imports (no bundler/renderer/sharp) so they are trivially
 * unit-testable. frame-renderer.ts (the impure render step) consumes these.
 */

import { createHash } from 'node:crypto';

import type { Brand } from '../kit/brand';

/** The composition id the generated Root registers and the renderer selects. */
export const COMPOSITION_ID = 'MgMoment';

export interface MgRenderInput {
  /** The compile-ready component source (model body + injected kit imports — the SERVICE's output). */
  componentSource: string;
  /** The mapped brand (Phase A) — baked into the render as the component's `brand` prop. */
  brand: Brand;
  /** The fact's data — the component's own emergent props, baked in as the `data` prop (Law 5: a value edit
   *  re-renders from the same source). Shape is per-component (the model declares its own `Data`). */
  data: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

/** Root that registers the generated component as the only Composition, with brand+data baked into
 *  defaultProps (pure data — Brand and the fact data carry no functions, so JSON is faithful). */
export function buildRootSource(input: MgRenderInput): string {
  const props = JSON.stringify({ brand: input.brand, data: input.data });
  return `import React from 'react';
import { Composition } from 'remotion';
import './kit/fonts';
import { MgScene } from './MgScene';

export const Root = () => (
  <Composition
    id="${COMPOSITION_ID}"
    component={MgScene}
    durationInFrames={${Math.max(1, Math.round(input.durationInFrames))}}
    fps={${input.fps}}
    width={${Math.round(input.width)}}
    height={${Math.round(input.height)}}
    defaultProps={${props}}
  />
);
`;
}

export const ENTRY_SOURCE = `import { registerRoot } from 'remotion';
import { Root } from './Root';

registerRoot(Root);
`;

/** Deterministic workspace id — same inputs reuse the same folder name (no Math.random in the pipeline). */
export function workspaceId(input: MgRenderInput): string {
  return createHash('sha256')
    .update(input.componentSource)
    .update(JSON.stringify({ b: input.brand, d: input.data, w: input.width, h: input.height, f: input.fps, n: input.durationInFrames }))
    .digest('hex')
    .slice(0, 16);
}
