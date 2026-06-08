// Untracked helper — sharpens two findings from verify-mg-real.ts using the dumped recipes:
//  (1) signal-key coverage + per-moment variation within each project (is within-video constancy
//      a signal-granularity reality, or just these 4 signals being global?)
//  (2) which stat-counter values degraded to free-text (numeric-detection gap on real data)
import { readFileSync } from 'fs';

const data: any[] = JSON.parse(readFileSync('.calibration-temp/real-recipes.json', 'utf8'));

// Per-moment signals (should vary moment-to-moment) vs global personality signals.
const PER_MOMENT = ['cinematic_moment', 'visceral_impact', 'motion_intensity', 'shot_scale', 'face_emotion',
  'face_present', 'visual_significance', 'visual_complexity', 'speech_energy', 'energy_delta',
  'position_in_video', 'time_since_last_cut', 'active_overlay_count', 'montage_mode', 'text_on_screen'];

const byProject: Record<string, any[]> = {};
for (const d of data) (byProject[d.pid] ||= []).push(d);

console.log('=== SIGNAL COVERAGE + PER-MOMENT VARIATION (per project) ===\n');
for (const [pid, mgs] of Object.entries(byProject)) {
  const allKeys = new Set<string>();
  mgs.forEach(m => Object.keys(m.signals || {}).forEach(k => allKeys.add(k)));
  const nonZeroKeys = [...allKeys].filter(k => mgs.some(m => Number(m.signals?.[k]) !== 0 && m.signals?.[k] != null && m.signals?.[k] !== ''));

  // Which per-moment signals are present at all, and do they VARY across this project's MGs?
  const perMomentPresent = PER_MOMENT.filter(k => allKeys.has(k));
  const perMomentVarying = perMomentPresent.filter(k => {
    const vals = new Set(mgs.map(m => String(m.signals?.[k] ?? '')));
    return vals.size > 1;
  });

  console.log(`${pid}  (${mgs.length} MGs)`);
  console.log(`  total signal keys: ${allKeys.size} | non-zero keys: ${nonZeroKeys.length}`);
  console.log(`  per-moment signals present: ${perMomentPresent.length}/${PER_MOMENT.length} [${perMomentPresent.join(',') || 'none'}]`);
  console.log(`  per-moment signals that VARY within video: ${perMomentVarying.length} [${perMomentVarying.join(',') || 'NONE — all constant'}]`);
  // show the importance drivers specifically (these set the budget)
  const driverSample = mgs[0].signals || {};
  console.log(`  importance drivers @MG0: cinematic_moment=${driverSample.cinematic_moment ?? 'absent'} visceral_impact=${driverSample.visceral_impact ?? 'absent'} formality=${driverSample.formality ?? 'absent'} emotional_arousal=${driverSample.emotional_arousal ?? 'absent'}`);
  console.log('');
}

// (2) Degraded stat-counters: stat-counter graphicType but content.value failed numeric detection.
console.log('=== STAT-COUNTERS THAT FAILED NUMERIC DETECTION (degraded to free-text) ===');
const numericRe = /^[\d,.$%+\-]+$/; // hasNumericValue charset (content-shape-analyzer.ts:107)
let degraded = 0;
for (const d of data) {
  if (d.gtype !== 'stat-counter') continue;
  const v = d.content?.value;
  const ok = v != null && numericRe.test(String(v).replace(/\s/g, ''));
  if (!ok) {
    degraded++;
    console.log(`  ${d.pid} f=${d.frame}  value=${JSON.stringify(v)}  label=${JSON.stringify(d.content?.label)}  text=${JSON.stringify(String(d.content?.text || '').slice(0, 40))}`);
  }
}
console.log(`Total stat-counters degraded: ${degraded}`);

// Also: what does a numeric stat-counter's content look like (for contrast)?
const good = data.find(d => d.gtype === 'stat-counter' && d.content?.value && numericRe.test(String(d.content.value).replace(/\s/g, '')));
if (good) console.log(`\nContrast — a GOOD numeric stat-counter: ${good.pid} f=${good.frame} value=${JSON.stringify(good.content.value)} label=${JSON.stringify(good.content.label)}`);
