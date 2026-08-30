import { describe, expect, it } from 'vitest';

import {
  R2_MAX_OBJECT_BYTES,
  R2_MAX_PART_BYTES,
  R2_MAX_PARTS,
  R2_MIN_PART_BYTES,
  isValidPartSize,
  resolveMultipartPlan,
} from '@/lib/editron/services/r2-upload-limits';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const TiB = 1024 * GiB;

describe('R2 upload limits', () => {
  it('binds Cloudflare exact object, request, part, and count ceilings', () => {
    expect(R2_MAX_OBJECT_BYTES).toBe(5 * TiB - 5 * GiB);
    expect(R2_MIN_PART_BYTES).toBe(5 * MiB);
    expect(R2_MAX_PART_BYTES).toBe(5 * GiB - 5 * MiB);
    expect(R2_MAX_PARTS).toBe(10_000);
    expect(isValidPartSize(R2_MIN_PART_BYTES)).toBe(true);
    expect(isValidPartSize(R2_MAX_PART_BYTES)).toBe(true);
    expect(isValidPartSize(R2_MIN_PART_BYTES - 1)).toBe(false);
    expect(isValidPartSize(R2_MAX_PART_BYTES + 1)).toBe(false);
  });

  it('plans the exact maximum and rejects every invalid numeric boundary', () => {
    const maximum = resolveMultipartPlan(R2_MAX_OBJECT_BYTES);
    expect(maximum.totalParts).toBeLessThanOrEqual(R2_MAX_PARTS);
    expect(maximum.partSize).toBeGreaterThanOrEqual(R2_MIN_PART_BYTES);
    expect(maximum.partSize).toBeLessThanOrEqual(R2_MAX_PART_BYTES);
    expect(() => resolveMultipartPlan(R2_MAX_OBJECT_BYTES + 1))
      .toThrow('file-exceeds-r2-max-object');
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveMultipartPlan(invalid)).toThrow('invalid-total-size');
    }
  });
});
