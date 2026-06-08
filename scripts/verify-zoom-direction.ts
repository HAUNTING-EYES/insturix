// UNTRACKED (never `git add scripts/`). Verifies the Phase-3.1 zoom diagnosis EMPIRICALLY: scores the
// REAL zoom-category dials against synthetic energy moments and reports the winning zoom + its scaleTo +
// the resulting direction (per edl-executor.ts:854: scaleTo < scaleFrom(1.0) ? pull-back/out : push/in).
// No Mongo, no secrets — pure dial logic. Run: npx tsx scripts/verify-zoom-direction.ts
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { SignalSnapshot, ScoringMethod } from '../lib/editron/engine/utility-types';

const zoomDefs = getOverlayDefinitions().filter((d) => d.category === 'zoom');
console.log(`Zoom dials (${zoomDefs.length}):`);
for (const d of zoomDefs) {
  const sp = d.outputParams.find((p) => p.name === 'scaleTo');
  console.log(`  ${d.id.padEnd(64)} scaleTo=[${sp?.minValue ?? '?'}..${sp?.maxValue ?? '?'}] reads ${d.considerations.map((c) => c.signalId).join(', ')}`);
}

const SCALE_FROM = 1.0; // edl-executor default
const dir = (scaleTo: number | undefined): string => {
  if (typeof scaleTo !== 'number') return 'NONE';
  if (scaleTo < SCALE_FROM) return `OUT (${scaleTo.toFixed(3)})`;
  if (scaleTo > SCALE_FROM) return `IN  (${scaleTo.toFixed(3)})`;
  return `STATIC (${scaleTo.toFixed(3)})`;
};

const moments: Array<[string, SignalSnapshot]> = [
  ['building energy  ', { 'speech.energy_delta': 0.30, 'speech.energy': 0.60, 'speech.energy_surprise': 0.20 } as never],
  ['energy PEAK       ', { 'speech.energy_delta': 0.10, 'speech.energy': 0.92, 'speech.energy_surprise': 0.50 } as never],
  ['winding DOWN      ', { 'speech.energy_delta': -0.30, 'speech.energy': 0.40, 'speech.energy_surprise': -0.10 } as never],
  ['calm / flat       ', { 'speech.energy_delta': 0.00, 'speech.energy': 0.25, 'speech.energy_surprise': 0.00 } as never],
];

for (const method of ['multiplicative', 'additive'] as ScoringMethod[]) {
  console.log(`\n=== ZOOM WINNER per moment (method=${method}) ===`);
  const winners = new Set<string>();
  const dirs = new Set<string>();
  for (const [label, sig] of moments) {
    const results = scoreAllOverlays(zoomDefs, sig, method); // sorted desc, filtered by minScore (0.3)
    const top = results[0];
    if (top) {
      const short = top.overlayId.split('.').pop()!.replace(/_speech.*|_entity.*|_visual.*|_audio.*|_composite.*|_multi.*|_sound.*|_cross.*/, '');
      const d = dir(top.outputValues?.scaleTo as number | undefined);
      winners.add(short); dirs.add(d.split(' ')[0]);
      console.log(`  ${label} -> ${top.overlayId.split('.').slice(0, 2).join('.').padEnd(40)} scaleTo=${(top.outputValues?.scaleTo as number)?.toFixed(3) ?? '?'}  => ${d}`);
    } else {
      console.log(`  ${label} -> (no zoom fired — all below minScore 0.3)`);
    }
  }
  console.log(`  distinct winners=${winners.size} [${[...winners].join(', ')}] · distinct directions=${[...dirs].join('/')}`);
}
