/**
 * Physics Engine Test Script
 * 
 * Run with: npx ts-node scripts/test-physics.ts
 * 
 * Tests:
 * 1. Collision detection
 * 2. Smart row packing
 * 3. Coordinate resolution
 */

// We need to use relative import since this is a standalone script
// Import the physics functions
import {
  doRangesOverlap,
  hasCollisionOnRow,
  findBestRow,
  resolvePosition,
  resolveSize,
  resolveCoordinates,
  getDefaultSize,
  OverlayType
} from '../lib/editron/core/physics.ts';

// Define types inline (TypeScript interfaces can't be imported in ESM strip mode)
interface ExistingOverlay {
  id: number;
  row: number;
  from: number;
  durationInFrames: number;
  type: string;
}

interface CanvasDimensions {
  width: number;
  height: number;
}

// Test helpers
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${e.message}`);
    failed++;
  }
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeCloseTo(expected: number, precision = 2) {
      const tolerance = Math.pow(10, -precision);
      if (Math.abs(value - expected) > tolerance) {
        throw new Error(`Expected ~${expected}, got ${value}`);
      }
    }
  };
}

// =====================
// TEST SUITE
// =====================

console.log('\n🧪 PHYSICS ENGINE TESTS\n');
console.log('='.repeat(50));

// --- Collision Detection ---
console.log('\n📐 Collision Detection Tests\n');

test('Overlapping ranges should be detected', () => {
  const a = { from: 0, duration: 100 };
  const b = { from: 50, duration: 100 };
  expect(doRangesOverlap(a, b)).toBe(true);
});

test('Adjacent ranges (touching) should NOT overlap', () => {
  const a = { from: 0, duration: 100 };
  const b = { from: 100, duration: 50 };
  expect(doRangesOverlap(a, b)).toBe(false);
});

test('Non-overlapping ranges should NOT overlap', () => {
  const a = { from: 0, duration: 50 };
  const b = { from: 100, duration: 50 };
  expect(doRangesOverlap(a, b)).toBe(false);
});

test('One range inside another should overlap', () => {
  const a = { from: 0, duration: 200 };
  const b = { from: 50, duration: 50 };
  expect(doRangesOverlap(a, b)).toBe(true);
});

// --- Row Collision ---
console.log('\n📊 Row Collision Tests\n');

test('Should detect collision on same row', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 100, type: OverlayType.VIDEO as any }
  ];
  const result = hasCollisionOnRow(0, { from: 50, duration: 30 }, overlays);
  expect(result).toBe(true);
});

test('Should NOT detect collision on different row', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 100, type: OverlayType.VIDEO as any }
  ];
  const result = hasCollisionOnRow(1, { from: 50, duration: 30 }, overlays);
  expect(result).toBe(false);
});

test('Should NOT detect collision when time does not overlap', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 100, type: OverlayType.VIDEO as any }
  ];
  const result = hasCollisionOnRow(0, { from: 150, duration: 30 }, overlays);
  expect(result).toBe(false);
});

// --- Smart Row Packing ---
console.log('\n🎯 Smart Row Packing Tests\n');

test('VIDEO on empty timeline should go to Row 0', () => {
  const row = findBestRow(OverlayType.VIDEO as any, { from: 0, duration: 100 }, []);
  expect(row).toBe(0);
});

test('TEXT on empty timeline should go to Row 0', () => {
  const row = findBestRow(OverlayType.TEXT as any, { from: 0, duration: 100 }, []);
  expect(row).toBe(0);
});

test('TEXT should stack ABOVE existing VIDEO', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 300, type: OverlayType.VIDEO as any }
  ];
  const row = findBestRow(OverlayType.TEXT as any, { from: 0, duration: 100 }, overlays);
  expect(row).toBe(1); // Should be on Row 1 (above Video on Row 0)
});

test('forceRow should override smart placement', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 300, type: OverlayType.VIDEO as any }
  ];
  const row = findBestRow(OverlayType.TEXT as any, { from: 0, duration: 100 }, overlays, 5);
  expect(row).toBe(5); // Should respect forceRow
});

test('VIDEO should pack in gap on Row 0 if available', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 100, type: OverlayType.VIDEO as any }
    // Gap from 100 onwards
  ];
  const row = findBestRow(OverlayType.VIDEO as any, { from: 150, duration: 100 }, overlays);
  expect(row).toBe(0); // Should fit in gap on Row 0
});

test('VIDEO should go to Row 1 if Row 0 has collision', () => {
  const overlays: ExistingOverlay[] = [
    { id: 1, row: 0, from: 0, durationInFrames: 300, type: OverlayType.VIDEO as any }
  ];
  const row = findBestRow(OverlayType.VIDEO as any, { from: 0, duration: 100 }, overlays);
  expect(row).toBe(1); // Collision on Row 0, go to Row 1
});

// --- Coordinate Resolution ---
console.log('\n📍 Coordinate Resolution Tests\n');

test('Should resolve percentage position correctly', () => {
  // 50% of 1920 = 960, center of 400px element = 960 - 200 = 760
  const result = resolvePosition('50%', 1920, 400, 0);
  expect(result).toBe(760);
});

test('Should resolve "center" keyword', () => {
  // Center of 1080 height for 100px element = (1080 - 100) / 2 = 490
  const result = resolvePosition('center', 1080, 100, 0);
  expect(result).toBe(490);
});

test('Should pass through numeric values', () => {
  const result = resolvePosition(123, 1920, 400, 0);
  expect(result).toBe(123);
});

test('Should use default for undefined', () => {
  const result = resolvePosition(undefined, 1920, 400, 999);
  expect(result).toBe(999);
});

test('resolveSize should handle percentages', () => {
  // 50% of 1920 = 960
  const result = resolveSize('50%', 1920, 0);
  expect(result).toBe(960);
});

test('resolveCoordinates should center by default', () => {
  const canvas: CanvasDimensions = { width: 1920, height: 1080 };
  const result = resolveCoordinates({}, canvas, { width: 400, height: 200 });
  // Left = (1920 - 400) / 2 = 760
  // Top = (1080 - 200) / 2 = 440
  expect(result.left).toBe(760);
  expect(result.top).toBe(440);
  expect(result.width).toBe(400);
  expect(result.height).toBe(200);
});

// --- Default Sizes ---
console.log('\n📦 Default Size Tests\n');

test('TEXT should have correct default size', () => {
  const size = getDefaultSize(OverlayType.TEXT as any);
  expect(size.width).toBe(600);
  expect(size.height).toBe(100);
});

test('VIDEO should have 1080p default size', () => {
  const size = getDefaultSize(OverlayType.VIDEO as any);
  expect(size.width).toBe(1920);
  expect(size.height).toBe(1080);
});

// =====================
// SUMMARY
// =====================
console.log('\n' + '='.repeat(50));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ Some tests failed. Please fix them before proceeding.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Physics Engine is ready.\n');
  process.exit(0);
}
