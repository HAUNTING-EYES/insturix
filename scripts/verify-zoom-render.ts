// UNTRACKED render-instruction confirmation (NEVER `git add scripts/`). Deterministic, no Gemini/DB.
// Runs the ACTUAL DECISION_REGISTRY zoom params through applyZoom's REAL zoomType inference and the
// REAL (fixed) buildZoomKeyframes, printing the scale keyframe track Remotion interpolates. Also
// reproduces the OLD (buggy) pull-back branch to show the before/after.
// Run from editron-worktree:  npx tsx scripts/verify-zoom-render.ts
import { buildZoomKeyframes } from '../lib/editron/services/zoom-keyframes';

// Real DECISION_REGISTRY zoom defaultParams (lib/editron/data/decision-registry.ts).
// Convention: scaleFrom = START scale, scaleTo = END scale.
const CASES = [
  { tech: 'zoom_push  (vocal_build)',   scaleFrom: 1.0,  scaleTo: 1.06, line: 52 },
  { tech: 'zoom_push  (energy_build)',  scaleFrom: 1.0,  scaleTo: 1.08, line: 64 },
  { tech: 'zoom_punch (vocal_peak)',    scaleFrom: 1.0,  scaleTo: 1.15, line: 76 },
  { tech: 'zoom_pull_back (resolve)',   scaleFrom: 1.08, scaleTo: 1.0,  line: 112 },
  { tech: 'zoom_pull_back (wind_down)', scaleFrom: 1.06, scaleTo: 1.0,  line: 124 },
];
const LOCAL = 30, DURATION = 45, SCENE_END = 300;

// applyZoom's REAL zoomType inference (edl-executor.ts:897-898), verbatim.
function inferZoomType(scaleFrom: number, scaleTo: number, duration: number, sceneEnd: number): string {
  return scaleTo < scaleFrom ? 'pull-back' : (duration >= sceneEnd * 0.5 ? 'slow-push' : 'punch-in');
}
// The OLD (buggy) pull-back branch — keyframe values swapped: [scaleTo, scaleFrom] = start low, end high.
function oldBuggyPullBackTrack(scaleFrom: number, scaleTo: number): number[] {
  return [scaleTo, scaleFrom];
}
function dir(first: number, last: number): string {
  if (last < first - 1e-6) return 'OUT  (zoom out — pulls back ✅)';
  if (last > first + 1e-6) return 'IN   (zoom in)';
  return 'STATIC';
}

console.log('=== Zoom render-instruction confirmation (real fixed buildZoomKeyframes + real inference) ===');
let pullBacksOut = 0, pullBacks = 0;
for (const c of CASES) {
  const zt = inferZoomType(c.scaleFrom, c.scaleTo, DURATION, SCENE_END);
  const kf = buildZoomKeyframes(zt, c.scaleFrom, c.scaleTo, LOCAL, DURATION, SCENE_END);
  const vals = kf.map(k => k.value);
  const first = vals[0], last = vals[vals.length - 1];
  console.log(`\n${c.tech}  (registry :${c.line})`);
  console.log(`  scaleFrom=${c.scaleFrom} scaleTo=${c.scaleTo} → zoomType='${zt}'`);
  console.log(`  NOW (fixed):  [${vals.join(' → ')}]  ⇒ ${dir(first, last)}`);
  if (zt === 'pull-back') {
    pullBacks++;
    if (last < first - 1e-6) pullBacksOut++;
    const old = oldBuggyPullBackTrack(c.scaleFrom, c.scaleTo);
    console.log(`  BEFORE (bug): [${old.join(' → ')}]  ⇒ ${dir(old[0], old[old.length - 1])}`);
  }
}
console.log(`\nRESULT: ${pullBacksOut}/${pullBacks} pull-backs now render as a real zoom-OUT (were 0/${pullBacks} before the fix).`);
console.log('NOTE: this confirms the render INSTRUCTION (the scale keyframe track Remotion interpolates).');
console.log('Actual video pixels need the source clip (proj geminiFileUri expired) + the Remotion render pipeline.');
