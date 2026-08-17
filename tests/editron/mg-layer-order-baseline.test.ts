import { describe, expect, it } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import { resolveLayerZIndex } from '@/components/editron/editor/version-7.0.0/components/core/layer';

describe('MG sequence current compositing-order baseline', () => {
  it('reproduces the row-derived ordering that puts a code-generated MG behind source video', () => {
    const sourceVideoZIndex = resolveLayerZIndex(OverlayType.VIDEO, 2);
    const codeGeneratedMgZIndex = resolveLayerZIndex(OverlayType.MG_SEQUENCE, 6);

    // This is a defect fixture, not the desired long-term contract.  The
    // canonical visual stacking change must replace this expectation with
    // semantic stacking evidence in its own approved phase.
    expect(sourceVideoZIndex).toBe(80);
    expect(codeGeneratedMgZIndex).toBe(40);
    expect(codeGeneratedMgZIndex).toBeLessThan(sourceVideoZIndex);
  });
});
