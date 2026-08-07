/** Calibrate MIN_MG_MOTION_BUILD on REAL renders (Rule 35: measure, never guess a threshold). Renders a
 *  truly-frozen control, an intended build-then-hold control, and the actual matrix FAIL specimens, and prints
 *  {mean, peak} for each so the build threshold lands between frozen-peak and built-peak. MG_SPEC_DIR=<dir>.
 *  Uncommitted (scripts/ rule). */
import path from 'path';
import fs from 'fs';

import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { measureMgMotionProfile } from '../../lib/editron/motion-graphics/codegen/mg-placement-gate';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const W = 1280, H = 720, FPS = 30, DUR = 75;
const SPEC_DIR = process.env.MG_SPEC_DIR!;

const FROZEN = `
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Brand} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
export const MgScene: React.FC<{brand: Brand; data: any}> = ({brand}) => {
  useCurrentFrame();
  return <Stage brand={brand}><Region brand={brand} x={0.4} y={0.45} w={0.55} h={0.4} align="center" justify="center">
    <FitHeadline brand={brand} text="STATIC" size="l" kinetic="none" />
  </Region></Stage>;
};`;

const GOOD = `
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
import {phases, enter, ambient} from './kit/choreo';
export const MgScene: React.FC<{brand: Brand; data: any}> = ({brand}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return <Stage brand={brand}><Region brand={brand} x={0.4} y={0.45} w={0.55} h={0.4} align="center" justify="center">
    <div style={ambient(frame, ph.intro, 'float', 1)}>
      <div style={enter(brand, frame, ph.intro, fps, 'rise')}>
        <FitHeadline brand={brand} text="BUILT THEN HELD" size="l" kinetic="none" />
      </div>
    </div>
  </Region></Stage>;
};`;

async function measure(name: string, source: string, data: Record<string, unknown>): Promise<void> {
  try {
    const r = await renderMomentToWebpFrames({ componentSource: source, brand: INSTURIX, data, width: W, height: H, fps: FPS, durationInFrames: DUR }, { renderBudgetMs: 120_000 });
    const frames = r.files.map((f) => fs.readFileSync(path.join(r.webpDir, f)));
    const p = await measureMgMotionProfile(frames);
    console.log(`${name.padEnd(40)} mean=${p.mean.toFixed(4)}  peak=${p.peak.toFixed(4)}`);
    await cleanupWorkspace(r.workspaceDir).catch(() => undefined);
  } catch (e) { console.log(`${name.padEnd(40)} RENDER ERR: ${String((e as Error).message).slice(0, 60)}`); }
}

async function main() {
  await measure('CONTROL frozen (no anim)', FROZEN, {});
  await measure('CONTROL build-then-hold', GOOD, {});
  const DATA: Record<string, Record<string, unknown>> = {
    'comparison-data': { from: 480, to: 20, fromLabel: 'Before', toLabel: 'After', unit: 's', label: 'to edit one video' },
    'magnitude-quiet': { value: 1_000_000, unit: '+', label: 'videos made' },
    'concept-hero': { keyword: 'ten times faster', body: 'onboarding' },
    'series-held': { values: [12, 34, 58, 91], unit: 'k', label: 'monthly signups' },
    'proportion-held': { value: 73, unit: '%', label: 'finish the course' },
    'quote-held': { text: 'we shipped it in a weekend', speaker: 'the founder' },
    'refutation-held': { falseClaim: 'AI video looks fake', truth: 'indistinguishable now' },
    'list-set': { items: ['Script', 'Record', 'Publish'], label: 'three steps' },
  };
  const specs = fs.existsSync(SPEC_DIR) ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('FAIL-floor_motion.tsx')).slice(0, 5) : [];
  for (const f of specs) {
    const caseId = f.replace(/-s\d+.*$/, '');
    await measure(`SPEC ${f.slice(0, 30)}`, fs.readFileSync(path.join(SPEC_DIR, f), 'utf8'), DATA[caseId] ?? {});
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
