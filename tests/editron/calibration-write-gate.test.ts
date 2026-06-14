import { describe, expect, it } from 'vitest';
import {
  evaluateCalibrationWriteGate,
  formatCalibrationWriteGateDecision,
} from '../../lib/editron/services/calibration-write-gate';

describe('calibration write gate', () => {
  it('keeps dry-run calibration bandit-safe', () => {
    const decision = evaluateCalibrationWriteGate({
      dryRun: true,
      allowBanditWrite: true,
    });

    expect(decision).toEqual({
      allowed: false,
      mode: 'dry-run',
      reason: 'dry-run skips calibration bandit writes',
    });
    expect(formatCalibrationWriteGateDecision(decision)).toContain('BANDIT WRITE BLOCKED');
  });

  it('blocks accidental non-dry-run writes without explicit operator approval', () => {
    const decision = evaluateCalibrationWriteGate({ dryRun: false });

    expect(decision.allowed).toBe(false);
    expect(decision.mode).toBe('blocked');
    expect(decision.reason).toContain('--allow-bandit-write');
  });

  it('allows writes only when explicitly requested', () => {
    const decision = evaluateCalibrationWriteGate({
      dryRun: false,
      allowBanditWrite: true,
    });

    expect(decision).toEqual({
      allowed: true,
      mode: 'allowed',
      reason: 'explicit --allow-bandit-write provided',
    });
  });

  it('does not allow failed artifact evidence to train bandits', () => {
    const decision = evaluateCalibrationWriteGate({
      dryRun: false,
      allowBanditWrite: true,
      artifactStatus: 'fail',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('artifact status is fail');
  });
});
