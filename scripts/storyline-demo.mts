/**
 * storyline-demo - runnable end-to-end demo of the intent spine + storyline composer.
 *
 * Shows the metadata model (NO template menu): one podcast upload -> we INFER a spec
 * (platform + duration + aspect), show it as an editable card, and the cut falls out.
 * Switch the platform and the SAME footage becomes a different cut. Deterministic.
 *
 * Run:  npx tsx scripts/storyline-demo.mts
 */

import {
  type IntakeSignals,
  resolveProductionBrief,
  topFieldToConfirm,
} from '../lib/editron/production-brief/intake-resolver';
import type { ProductionBrief } from '../lib/editron/production-brief/production-brief';
import { composeStoryline } from '../lib/editron/storyline/compose';
import { makeScene, type Scene } from '../lib/editron/storyline/scene';
import { type Storyline, validateStoryline } from '../lib/editron/storyline/storyline';

const SRC = 'podcast-ep12.mp4';
const T0 = 1_700_000_000_000; // fixed createdAt keeps the demo deterministic

const scenes: Scene[] = [
  makeScene({ source: SRC, startTime: 0, endTime: 15, createdAt: T0, shotType: 'medium', objects: [], faces: ['host'], detectedText: [], transcription: 'welcome back to the show today we dig into growth and scaling your startup' }),
  makeScene({ source: SRC, startTime: 15, endTime: 27, createdAt: T0, shotType: 'close-up', objects: [], faces: ['host'], detectedText: [], transcription: 'the single biggest mistake founders make is ignoring retention' }),
  makeScene({ source: SRC, startTime: 27, endTime: 50, createdAt: T0, shotType: 'medium', objects: [], faces: ['host', 'guest'], detectedText: [], transcription: 'so we ran experiments across five different channels over three months' }),
  makeScene({ source: SRC, startTime: 50, endTime: 59, createdAt: T0, shotType: 'close-up', objects: [], faces: ['guest'], detectedText: [], transcription: 'and our growth exploded revenue tripled in one quarter' }),
  makeScene({ source: SRC, startTime: 59, endTime: 63, createdAt: T0, shotType: 'long', objects: ['chart'], faces: [], detectedText: ['+312% MRR'], transcription: '' }),
  makeScene({ source: SRC, startTime: 63, endTime: 82, createdAt: T0, shotType: 'medium', objects: [], faces: ['host'], detectedText: [], transcription: 'that shift completely changed how we think about the business' }),
  makeScene({ source: SRC, startTime: 82, endTime: 94, createdAt: T0, shotType: 'close-up', objects: [], faces: ['guest'], detectedText: [], transcription: 'my one piece of advice for anyone chasing growth is start with the customer' }),
  makeScene({ source: SRC, startTime: 94, endTime: 110, createdAt: T0, shotType: 'long', objects: [], faces: ['host'], detectedText: [], transcription: 'thanks so much for listening we will see you next week' }),
];

function pad(n: number): string {
  return n.toFixed(1).padStart(5);
}

function printSpecAndStoryline(title: string, brief: ProductionBrief, s: Storyline): void {
  const o = brief.output;
  const glance = topFieldToConfirm(brief);
  const rt = s.renderTarget;
  const v = validateStoryline(s);
  console.log(`\n=== ${title} ===`);
  console.log(
    `  spec card:  platform=${o.platform}  duration=${o.targetDurationSec ?? 'full'}  aspect=${o.aspectRatio}  count=${o.count}` +
      (glance ? `   -> glance at: ${glance}` : '   (confident, just run)'),
  );
  console.log(`  render:     ${rt.width}x${rt.height} @${rt.fps}fps   total=${s.totalDurationSec.toFixed(1)}s   clips=${s.clips.length}   valid=${v.valid}`);
  for (const c of s.clips) {
    console.log(`   [${c.order}] ${c.role.padEnd(7)} ${pad(c.in)}-${pad(c.out)}s (${c.durationSec.toFixed(1)}s)`);
  }
}

const signals: IntakeSignals = {
  entryPoint: 'upload', assetCount: 1, totalDurationSec: 110,
  contentType: 'podcast', speechCoverage: 0.85, hasBrand: false,
};

console.log('# Intake: a short podcast upload (8 scenes, ~110s), no platform signal yet');

// 1. We INFER a spec - no "reel vs full edit" menu. A podcast defaults to a faithful
//    long-form edit; the card just flags "platform" as a guess worth a glance.
const inferred = resolveProductionBrief(signals);
printSpecAndStoryline('Inferred default (editable - change if wrong)', inferred, composeStoryline(scenes, inferred));

// 2. User sets the destination to TikTok in the card. Platform cascades to 9:16 + a
//    short duration, and the SAME footage becomes a hook-first vertical cut. No template.
const tiktok = resolveProductionBrief({ ...signals, requested: { platform: 'tiktok' } });
printSpecAndStoryline('User switches platform -> TikTok', tiktok, composeStoryline(scenes, tiktok));

console.log('\nSame 8 scenes. The cut falls out of the metadata (platform/duration/aspect), not a type menu.\n');
