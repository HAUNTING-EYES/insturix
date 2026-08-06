import { describe, expect, it } from 'vitest';

import {
  classifyAcceptance,
  DEFAULT_CLEAN_THRESHOLD,
  resolveWatchlistPolicy,
  STAGING_WATCHLIST_FLOOR,
  mgJudgeCalibrationSchema,
} from '@/lib/editron/motion-graphics/codegen/acceptance';

describe('classifyAcceptance (brief §13.2/§13.3 two-tier)', () => {
  it('clean ≥ 7.5 (legacy bar preserved)', () => {
    expect(classifyAcceptance(8.6)).toBe('clean');
    expect(classifyAcceptance(DEFAULT_CLEAN_THRESHOLD)).toBe('clean');
  });
  it('watchlist band = [6.5, 7.5) — never a hard failure (hard caps ≤4 sit below the floor)', () => {
    expect(classifyAcceptance(6.8)).toBe('watchlist');
    expect(classifyAcceptance(STAGING_WATCHLIST_FLOOR)).toBe('watchlist');
    expect(classifyAcceptance(6.49)).toBe('reject');
    expect(classifyAcceptance(3.9)).toBe('reject'); // a hard-failure-capped render can never be watchlisted
  });
});

describe('resolveWatchlistPolicy (brief §13.4/§20 unsafe-combination guard)', () => {
  it('default: shipping disabled (no calibration)', () => {
    const p = resolveWatchlistPolicy({});
    expect(p.shipEnabled).toBe(false);
  });
  it('ship=1 WITHOUT calibration version fails CLOSED with a documented reason', () => {
    const p = resolveWatchlistPolicy({ MG_WATCHLIST_SHIP_ENABLED: '1' });
    expect(p.shipEnabled).toBe(false);
    expect(p.reason).toContain('MG_JUDGE_CALIBRATION_VERSION');
  });
  it('ship=1 WITH calibration version enables shipping', () => {
    const p = resolveWatchlistPolicy({ MG_WATCHLIST_SHIP_ENABLED: '1', MG_JUDGE_CALIBRATION_VERSION: 'v1' });
    expect(p.shipEnabled).toBe(true);
    expect(p.reason).toContain('v1');
  });
  it('a calibration record is versioned + ties thresholds to an eval run + dataset hash', () => {
    const cal = mgJudgeCalibrationSchema.parse({
      version: 'v1', cleanThreshold: 7.5, watchlistFloor: 6.5,
      sourceEvalRunId: 'eval-123', datasetHash: 'abc', createdAt: '2026-08-05T00:00:00.000Z',
    });
    expect(cal.version).toBe('v1');
  });
});
