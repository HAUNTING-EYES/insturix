import { describe, expect, it } from 'vitest';
import {
  getPlanStorageBytes,
  getPlanRetentionDays,
  getPlanLimitsFor,
  normalizePlanKey,
  DEFAULT_PLAN_LIMITS,
} from '../../lib/config/plan-limits';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const TB = 1024 * GB;

describe('plan-limits — central per-plan storage + retention', () => {
  it('storage: free 500MB · starter 1GB · growth 10GB · scale 1TB', () => {
    expect(getPlanStorageBytes('free')).toBe(500 * MB);
    expect(getPlanStorageBytes('agency_starter')).toBe(1 * GB);
    expect(getPlanStorageBytes('agency_growth')).toBe(10 * GB);
    expect(getPlanStorageBytes('agency_scale')).toBe(1 * TB);
  });

  it('retention: free/starter 7d · growth 30d · scale 90d', () => {
    expect(getPlanRetentionDays('free')).toBe(7);
    expect(getPlanRetentionDays('agency_starter')).toBe(7);
    expect(getPlanRetentionDays('agency_growth')).toBe(30);
    expect(getPlanRetentionDays('agency_scale')).toBe(90);
  });

  it('normalizes display names (type OR "Xxx Plan" form)', () => {
    expect(normalizePlanKey('Agency Scale Plan')).toBe('agency_scale');
    expect(normalizePlanKey('AGENCY_GROWTH')).toBe('agency_growth');
    expect(getPlanStorageBytes('Agency Scale Plan')).toBe(1 * TB);
    expect(getPlanRetentionDays('Agency Growth Plan')).toBe(30);
  });

  it('unknown/missing → free (smallest) tier, never throws', () => {
    expect(getPlanLimitsFor('mystery')).toEqual(DEFAULT_PLAN_LIMITS);
    expect(getPlanStorageBytes(undefined)).toBe(500 * MB);
    expect(getPlanStorageBytes(null)).toBe(500 * MB);
    expect(getPlanRetentionDays('')).toBe(7);
  });
});
