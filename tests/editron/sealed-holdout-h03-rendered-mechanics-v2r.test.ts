import { describe, expect, it } from 'vitest';

import { measureSealedH03DirectionalMotionV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-rendered-mechanics-v2r';
import { SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';

const WIDTH = 1080;
const HEIGHT = 1920;
type Offset = Readonly<{ x: number; y: number }>;

describe('sealed HOLD-03 directional rendered-motion measurement', () => {
  it('accepts every declared entry/exit direction and exposes each panel delta', () => {
    const result = measureSealedH03DirectionalMotionV2R({
      entry: frame([
        { x: -24, y: 0 }, { x: -24, y: 0 }, { x: 0, y: -24 },
        { x: 0, y: 24 }, { x: 24, y: 0 }, { x: 24, y: 0 },
      ]),
      settled: frame(Array.from({ length: 6 }, () => ({ x: 0, y: 0 }))),
      exit: frame([
        { x: 24, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 24 },
        { x: 0, y: -24 }, { x: -24, y: 0 }, { x: -24, y: 0 },
      ]),
      width: WIDTH,
      height: HEIGHT,
    });
    expect(result.entryEdgeLumaDelta).toBeGreaterThan(100);
    expect(result.exitEdgeLumaDelta).toBeGreaterThan(100);
    expect(Object.keys(result.entryDirectionalEdgeLumaDeltas)).toEqual([
      'leftTop', 'leftBottom', 'centreTop', 'centreBottom', 'rightTop', 'rightBottom',
    ]);
    expect(Object.values(result.exitDirectionalEdgeLumaDeltas))
      .toEqual(expect.arrayContaining([expect.any(Number)]));
  });

  it('rejects stationary and reversed motion instead of checking two convenient edges', () => {
    const settled = frame(Array.from({ length: 6 }, () => ({ x: 0, y: 0 })));
    const stationary = measureSealedH03DirectionalMotionV2R({
      entry: settled,
      settled,
      exit: settled,
      width: WIDTH,
      height: HEIGHT,
    });
    expect(stationary.entryEdgeLumaDelta).toBeLessThan(20);
    expect(stationary.exitEdgeLumaDelta).toBeLessThan(20);

    const reversed = measureSealedH03DirectionalMotionV2R({
      entry: frame([
        { x: 24, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 24 },
        { x: 0, y: -24 }, { x: -24, y: 0 }, { x: -24, y: 0 },
      ]),
      settled,
      exit: frame([
        { x: -24, y: 0 }, { x: -24, y: 0 }, { x: 0, y: -24 },
        { x: 0, y: 24 }, { x: 24, y: 0 }, { x: 24, y: 0 },
      ]),
      width: WIDTH,
      height: HEIGHT,
    });
    expect(reversed.entryEdgeLumaDelta).toBeLessThan(20);
    expect(reversed.exitEdgeLumaDelta).toBeLessThan(20);
  });

  it('fails closed on malformed decoded-frame dimensions', () => {
    expect(() => measureSealedH03DirectionalMotionV2R({
      entry: Buffer.alloc(3),
      settled: Buffer.alloc(3),
      exit: Buffer.alloc(3),
      width: WIDTH,
      height: HEIGHT,
    })).toThrow('SEALED_H03_MECHANICS_FRAME_SIZE_DRIFT');
  });
});

function frame(offsets: readonly Offset[]): Buffer {
  if (offsets.length !== 6) throw new Error('TEST_PANEL_OFFSET_COUNT_INVALID');
  const output = Buffer.alloc(WIDTH * HEIGHT * 3);
  SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R.layoutObservation.panelBounds
    .forEach((bounds, index) => paint(output, bounds, offsets[index]));
  return output;
}

function paint(
  output: Buffer,
  bounds: Readonly<{ left: number; top: number; width: number; height: number }>,
  offset: Offset,
): void {
  const left = Math.round(bounds.left * WIDTH + offset.x);
  const right = Math.round((bounds.left + bounds.width) * WIDTH + offset.x);
  const top = Math.round(bounds.top * HEIGHT + offset.y);
  const bottom = Math.round((bounds.top + bounds.height) * HEIGHT + offset.y);
  for (let y = Math.max(0, top); y < Math.min(HEIGHT, bottom); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(WIDTH, right); x += 1) {
      const position = (y * WIDTH + x) * 3;
      output[position] = 200;
      output[position + 1] = 200;
      output[position + 2] = 200;
    }
  }
}
