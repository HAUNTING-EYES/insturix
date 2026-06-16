// Level-2 behavior self-test for eval/composite.ts (plan §11 E8). Pure, no Mongo, no render.
// Proves the reward spine's shadow paths: invalid render → null (not 0), null-layer renormalize,
// all-null → null, legibility floor, and determinism. STAYS UNTRACKED.
// Run from worktree root: npx tsx scripts/eval-composite-selftest.ts
import {
  combineLayers,
  DEFAULT_LAYER_WEIGHTS,
  LEGIBILITY_FLOOR,
  type LayerResult,
  type RenderStatus,
} from '../lib/editron/motion-graphics/engine/eval/composite';

const OK: RenderStatus = { ok: true };
const BAD: RenderStatus = { ok: false, reason: 'blank', detail: 'render produced empty frame' };
const EPS = 1e-9;

function L(layer: LayerResult['layer'], score: number | null, status: LayerResult['status']): LayerResult {
  return { layer, score, status };
}

const fails: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${cond ? '' : `  — ${detail}`}`);
  if (!cond) fails.push(name);
};

// A — all four layers scored, default weights sum to 1 → plain weighted average.
{
  const r = combineLayers(
    [L('legibility', 0.8, 'scored'), L('correctness', 0.9, 'scored'), L('communication', 0.5, 'scored'), L('aesthetic', 0.6, 'scored')],
    OK,
  );
  const want = 0.3 * 0.8 + 0.4 * 0.9 + 0.15 * 0.5 + 0.15 * 0.6; // 0.765
  check('A all-scored composite', r.composite != null && Math.abs(r.composite - want) < EPS, `got ${r.composite} want ${want}`);
  check('A status scored', r.status === 'scored', r.status);
  check('A floor not tripped', r.failsLegibilityFloor === false);
}

// B — L3 (communication) skipped → renormalize over L1/L2/L4, status degraded (E2).
{
  const r = combineLayers(
    [L('legibility', 0.8, 'scored'), L('correctness', 0.9, 'scored'), L('communication', null, 'skipped'), L('aesthetic', 0.6, 'scored')],
    OK,
  );
  const want = (0.3 * 0.8 + 0.4 * 0.9 + 0.15 * 0.6) / (0.3 + 0.4 + 0.15); // 0.81176…
  check('B renormalized composite', r.composite != null && Math.abs(r.composite - want) < 1e-9, `got ${r.composite} want ${want}`);
  check('B status degraded', r.status === 'degraded', r.status);
  check('B comm weight absent', r.weightsUsed.communication === undefined);
}

// C — invalid render → composite null, status invalid, NOT 0 (E1, the anti-poison guarantee).
{
  const r = combineLayers([L('legibility', 0.8, 'scored'), L('correctness', 0.9, 'scored')], BAD);
  check('C invalid render → null', r.composite === null, `got ${r.composite}`);
  check('C invalid render NOT 0', (r.composite as unknown) !== 0);
  check('C status invalid', r.status === 'invalid', r.status);
}

// D — every layer null/skipped → composite null (R18N: not 0).
{
  const r = combineLayers([L('legibility', null, 'skipped'), L('correctness', null, 'degraded')], OK);
  check('D all-null → null', r.composite === null, `got ${r.composite}`);
  check('D status invalid', r.status === 'invalid', r.status);
}

// E — legibility below floor → failsLegibilityFloor true (still produces a composite for ranking).
{
  const below = LEGIBILITY_FLOOR - 0.1;
  const r = combineLayers([L('legibility', below, 'scored'), L('correctness', 0.9, 'scored')], OK);
  check('E below-floor flagged', r.failsLegibilityFloor === true, `legibility=${below} floor=${LEGIBILITY_FLOOR}`);
  check('E still has composite', r.composite != null);
}

// F — determinism: identical inputs → identical output (catches any hidden nondeterminism).
{
  const layers = [L('legibility', 0.71, 'scored'), L('correctness', 0.83, 'scored'), L('aesthetic', 0.42, 'scored')];
  const a = combineLayers(layers, OK);
  const b = combineLayers(layers, OK);
  check('F deterministic', a.composite === b.composite && a.status === b.status, `${a.composite} vs ${b.composite}`);
}

// G — weights default present (sanity: spine is wired to the documented weights).
check('G default weights sum≈1', Math.abs(Object.values(DEFAULT_LAYER_WEIGHTS).reduce((s, w) => s + w, 0) - 1) < EPS);

console.log(`\ncomposite self-test: ${7 * 0 + (['A','B','C','D','E','F','G'].length)} groups, ${fails.length} assertion(s) failed`);
if (fails.length) { console.error('FAILED: ' + fails.join(', ')); process.exit(1); }
console.log('ALL PASS ✓');
