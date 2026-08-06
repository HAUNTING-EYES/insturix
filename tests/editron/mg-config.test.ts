import { describe, expect, it } from 'vitest';

import { mgRuntimeConfigSnapshot, validateMgConfig } from '@/lib/editron/motion-graphics/codegen/mg-config';

describe('typed MG config + unsafe-combination validation (brief §20)', () => {
  it('defaults: judge packet 960/480, detail ON, motion frames OFF, everything flagged OFF', () => {
    const s = mgRuntimeConfigSnapshot({});
    expect(s.judgeCompositeWidth).toBe(960);
    expect(s.judgeStressWidth).toBe(480);
    expect(s.detailCropsEnabled).toBe(true);
    expect(s.motionFramesEnabled).toBe(false);
    expect(s.watchlistShipEnabled).toBe(false);
    expect(validateMgConfig({}).ok).toBe(true);
  });

  it('watchlist shipping WITHOUT a calibration version is an unsafe combo (fails validation)', () => {
    const r = validateMgConfig({ MG_WATCHLIST_SHIP_ENABLED: '1' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('MG_JUDGE_CALIBRATION_VERSION');
  });

  it('subject hard veto is uncalibrated → flagged', () => {
    const r = validateMgConfig({ MG_SUBJECT_HARD_VETO_ENABLED: '1' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('UNCALIBRATED');
  });

  it('motion-transition frames parse from env', () => {
    expect(mgRuntimeConfigSnapshot({ MG_JUDGE_MOTION_FRAMES: '1' }).motionFramesEnabled).toBe(true);
  });
});
