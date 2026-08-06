/**
 * Phase 8 (brief §20): TYPED MG CONFIG + unsafe-combination validation.
 *
 * One typed snapshot of every MG runtime flag + a `validateMgConfig` that FAILS LOUD on unsafe combinations
 * (watchlist shipping without calibration, uncalibrated subject veto, etc.). Run at worker/startup + in tests;
 * it never auto-fixes — it reports so rollouts can't be foot-gunned.
 */
export interface MgRuntimeConfigSnapshot {
  judgeCompositeWidth: number;
  judgeStressWidth: number;
  detailCropsEnabled: boolean;
  motionFramesEnabled: boolean;
  subjectHardVetoEnabled: boolean;
  subjectCoverHard: number;
  renderIntegrityPolicy: string;
  tasteContractLive: boolean;
  watchlistShipEnabled: boolean;
  calibrationVersion: string;
  pairwiseEnabled: boolean;
  tasteBankEnabled: boolean;
  preferenceMemoryEnabled: boolean;
}

const flag = (env: NodeJS.ProcessEnv, name: string): boolean => ['1', 'true', 'yes'].includes((env[name] ?? '').trim().toLowerCase());
const num = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const raw = Number(env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export function mgRuntimeConfigSnapshot(env: NodeJS.ProcessEnv = process.env): MgRuntimeConfigSnapshot {
  return {
    judgeCompositeWidth: num(env, 'MG_JUDGE_COMPOSITE_WIDTH', 960),
    judgeStressWidth: num(env, 'MG_JUDGE_STRESS_WIDTH', 480),
    detailCropsEnabled: env.MG_JUDGE_DETAIL_CROPS_ENABLED === undefined || flag(env, 'MG_JUDGE_DETAIL_CROPS_ENABLED'),
    motionFramesEnabled: flag(env, 'MG_JUDGE_MOTION_FRAMES'),
    subjectHardVetoEnabled: flag(env, 'MG_SUBJECT_HARD_VETO_ENABLED'),
    subjectCoverHard: num(env, 'MG_SUBJECT_COVER_HARD', 0.5),
    renderIntegrityPolicy: (env.MG_RENDER_INTEGRITY_POLICY ?? 'degraded_allowed').trim().toLowerCase(),
    tasteContractLive: flag(env, 'MG_TASTE_CONTRACT_ENABLED'),
    watchlistShipEnabled: flag(env, 'MG_WATCHLIST_SHIP_ENABLED'),
    calibrationVersion: (env.MG_JUDGE_CALIBRATION_VERSION ?? '').trim(),
    pairwiseEnabled: flag(env, 'MG_PAIRWISE_PLAN_SELECTION_ENABLED'),
    tasteBankEnabled: flag(env, 'MG_HOUSE_TASTE_BANK_ENABLED'),
    preferenceMemoryEnabled: flag(env, 'MG_PREFERENCE_MEMORY_ENABLED'),
  };
}

export function validateMgConfig(env: NodeJS.ProcessEnv = process.env): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const s = mgRuntimeConfigSnapshot(env);
  if (s.watchlistShipEnabled && !s.calibrationVersion) {
    errors.push('MG_WATCHLIST_SHIP_ENABLED requires MG_JUDGE_CALIBRATION_VERSION — watchlist shipping fails closed (§13.4/§20)');
  }
  if (s.subjectHardVetoEnabled) {
    errors.push('MG_SUBJECT_HARD_VETO_ENABLED is UNCALIBRATED — no calibration record exists; do not enable in production (§10.2)');
  }
  if (s.renderIntegrityPolicy === 'strict' && !s.tasteContractLive && s.watchlistShipEnabled) {
    errors.push('strict render policy combined with watchlist shipping without a taste contract is an unvalidated mix (§20)');
  }
  return { ok: errors.length === 0, errors };
}
