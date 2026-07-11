import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import {
  COMPOSITION_ID,
  ENTRY_SOURCE,
  buildRootSource,
  workspaceId,
  type MgRenderInput,
} from '@/lib/editron/motion-graphics/codegen/render/scaffold';

function input(over: Partial<MgRenderInput> = {}): MgRenderInput {
  return {
    componentSource: 'export const MgScene = () => null;',
    brand: INSTURIX,
    data: { value: 43, suffix: '%', label: 'preferred it' },
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 45,
    ...over,
  };
}

describe('buildRootSource - the generated Remotion Root', () => {
  it('registers MgScene as the composition with the right id, dims and fps', () => {
    const root = buildRootSource(input());
    expect(root).toContain(`id="${COMPOSITION_ID}"`);
    expect(root).toContain("import { MgScene } from './MgScene';");
    expect(root).toMatch(/component=\{MgScene\}/);
    expect(root).toContain('durationInFrames={45}');
    expect(root).toContain('fps={30}');
    expect(root).toContain('width={1280}');
    expect(root).toContain('height={720}');
  });

  it('bakes brand + data into defaultProps (Law 5: values are props, re-render not re-prompt)', () => {
    const inp = input();
    const root = buildRootSource(inp);
    // The baked props are the exact JSON of {brand, data} inside the JSX expression container.
    const expected = `defaultProps={${JSON.stringify({ brand: inp.brand, data: inp.data })}}`;
    expect(root).toContain(expected);
    expect(root).toContain('"value":43'); // data reaches the component
    expect(root).toContain(`"accent":${JSON.stringify(INSTURIX.colors.accent)}`); // brand tokens reach the component
  });

  it('clamps a fractional/zero duration to a valid frame count', () => {
    expect(buildRootSource(input({ durationInFrames: 0 }))).toContain('durationInFrames={1}');
    expect(buildRootSource(input({ durationInFrames: 89.6 }))).toContain('durationInFrames={90}');
  });
});

describe('ENTRY_SOURCE', () => {
  it('registers the root', () => {
    expect(ENTRY_SOURCE).toContain('registerRoot(Root)');
    expect(ENTRY_SOURCE).toContain("from 'remotion'");
  });
});

describe('workspaceId - deterministic cache folder', () => {
  it('same input → same id; a VALUE edit → different id (a value change re-renders)', () => {
    const a = workspaceId(input());
    expect(workspaceId(input())).toBe(a);
    expect(workspaceId(input({ data: { value: 99, suffix: '%', label: 'preferred it' } }))).not.toBe(a);
    expect(workspaceId(input({ durationInFrames: 60 }))).not.toBe(a);
    expect(workspaceId(input({ componentSource: 'export const MgScene = () => 1;' }))).not.toBe(a);
  });
});
