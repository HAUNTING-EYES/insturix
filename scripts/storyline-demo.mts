/**
 * storyline-demo - runnable end-to-end demo of the intent spine + storyline composer.
 *
 * Shows the founder's motivating case: ONE podcast upload, and how "full edit" vs "reel"
 * produce two different storylines from the SAME footage, driven purely by the resolved
 * ProductionBrief. Deterministic (fixed createdAt, no Date/random).
 *
 * Run:  npx tsx scripts/storyline-demo.mts
 */

import { formatChoicesFor } from '../lib/editron/production-brief/confirm-choices';
import {
  type IntakeSignals,
  nextConfirmField,
  resolveProductionBrief,
} from '../lib/editron/production-brief/intake-resolver';
import { applyUserOutput, type ProductionBrief } from '../lib/editron/production-brief/production-brief';
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

function printStoryline(title: string, brief: ProductionBrief, s: Storyline): void {
  const rt = s.renderTarget;
  const v = validateStoryline(s);
  console.log(`\n=== ${title} ===`);
  console.log(`  brief:  format=${brief.output.format}  target=${brief.output.targetDurationSec ?? 'follow content'}  aspect=${brief.output.aspectRatio}`);
  console.log(`  render: ${rt.width}x${rt.height} @${rt.fps}fps ${rt.container}   total=${s.totalDurationSec.toFixed(1)}s   clips=${s.clips.length}   valid=${v.valid}`);
  for (const c of s.clips) {
    console.log(`   [${c.order}] ${c.role.padEnd(7)} ${c.source} ${pad(c.in)}-${pad(c.out)}s (${c.durationSec.toFixed(1)}s) fit=${c.fit}`);
  }
}

// --- 1. resolve intent from a podcast upload ---
const signals: IntakeSignals = {
  entryPoint: 'upload', assetCount: 1, totalDurationSec: 360,
  contentType: 'podcast', speechCoverage: 0.85, hasBrand: false,
};
const brief0 = resolveProductionBrief(signals);
console.log('# Intake: a ~6-minute podcast upload, understood as 8 scenes');
console.log(`  resolved format: "${brief0.output.format}" (confidence ${brief0.resolution.fieldConfidence.format})`);
console.log(`  ask the basics -> confirm "${nextConfirmField(brief0)}"; offer [${formatChoicesFor(brief0).join(', ')}]`);
console.log('  (the founder\'s case: a podcast is ambiguous, so we ASK instead of guessing)');

// --- 2a. user picks the faithful full edit ---
const fullBrief = applyUserOutput(brief0, { format: 'auto-edit' });
printStoryline('User picks: FULL EDIT (auto-edit)', fullBrief, composeStoryline(scenes, fullBrief));

// --- 2b. user picks a 30s vertical reel ---
const reelBrief = applyUserOutput(brief0, {
  format: 'reel', targetDurationSec: 30, aspectRatio: '9:16', intent: 'punchy growth highlights',
});
printStoryline('User picks: REEL (30s, 9:16, "punchy growth highlights")', reelBrief, composeStoryline(scenes, reelBrief));

console.log('\nSame 8 scenes in. Two different storylines out, driven purely by the resolved brief.\n');
