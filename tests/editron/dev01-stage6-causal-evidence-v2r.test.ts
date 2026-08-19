import { describe, expect, it } from 'vitest';

import {
  assertDev01Stage6CausalEvidenceBindingV2R,
  dev01Stage6CausalEvidenceV2R,
  withDev01Stage6CausalVisualEvidenceV2R,
} from '@/lib/editron/research/open-ended-planner/dev01-stage6-causal-evidence-v2r';
import { getCanonicalDev01NativeProxyFixtureV2 } from '@/lib/editron/research/open-ended-planner/dev01-native-proxy-fixture-v2';

describe('DEV-01 causal evidence V2R', () => {
  it('binds one immutable evidence record to the frozen fixture', () => {
    const fixture = getCanonicalDev01NativeProxyFixtureV2();
    const evidence = dev01Stage6CausalEvidenceV2R(fixture);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(evidence.transcriptWords.map(({ word }) => word)).toEqual(['here', 'it', 'is', 'next']);
    expect(evidence.visual).toMatchObject({ startFrame: 205, endFrame: 221 });
    expect(() => assertDev01Stage6CausalEvidenceBindingV2R(fixture)).not.toThrow();
  });

  it('rejects fixture drift and projects visual evidence without mutating the source', () => {
    const fixture = getCanonicalDev01NativeProxyFixtureV2();
    const projected = withDev01Stage6CausalVisualEvidenceV2R(fixture.project, fixture);
    const projectedOverlays = projected.overlays as Array<Record<string, unknown>>;
    const projectedHost = projectedOverlays.find(({ id }) => id === 101) as Record<string, unknown>;
    const sourceHost = fixture.project.overlays.find(({ id }) => id === 101) as Record<string, unknown>;
    expect(JSON.stringify(projectedHost)).toContain('product box reveal');
    expect(JSON.stringify(sourceHost)).not.toContain('product box reveal');

    const changed = structuredClone(fixture);
    changed.project.durationInFrames -= 1;
    expect(() => assertDev01Stage6CausalEvidenceBindingV2R(changed))
      .toThrow('DEV01_STAGE6_CAUSAL_EVIDENCE_FIXTURE_DRIFT');
  });
});
