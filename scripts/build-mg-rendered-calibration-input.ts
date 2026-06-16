// Builds a deterministic MG-only project input for scripts/render-editron-aesthetic.ts.
// This is calibration evidence, not a preset/menu path: every overlay is produced by
// the live planner, atomic plan builder, and atomic decision engine.
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { decideAtomicOverlay } from '../lib/editron/motion-graphics/engine/atomic-overlay-decision';
import { buildAtomicOverlayPlan } from '../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import {
  planComposition,
  type MgOverlayScores,
  type PlannerSignals,
} from '../lib/editron/motion-graphics/engine/composition-planner';

export interface MgRenderedCalibrationCase {
  id: string;
  content: Record<string, string | number | boolean>;
  signals: Partial<PlannerSignals>;
}

export interface MgRenderedCalibrationInput {
  projectId: string;
  tag: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  overlays: Array<Record<string, unknown>>;
  sampleFrames: number[];
}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 90;
const STRIDE = 120;

const BRAND = {
  accentColor: '#22c55e',
  primaryColor: '#f8fafc',
  backgroundColor: '#10151f',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  monoFont: 'JetBrains Mono',
};

const BASE_SIGNALS: PlannerSignals = {
  formality: 0.35,
  enthusiasm: 0.72,
  warmth: 0.48,
  emotional_arousal: 0.64,
  pacing_velocity: 0.68,
  humor: 0.1,
  visceral_impact: 0.56,
  visual_dependency: 0.28,
  caption_redundancy: 0.18,
  text_on_screen: 0.55,
  text_coverage: 0.12,
  visual_complexity: 0.22,
  speech_coverage: 0.74,
  bpm: 96,
};

export const MG_RENDERED_CALIBRATION_CASES: MgRenderedCalibrationCase[] = [
  {
    id: 'sparse-rate',
    content: {
      value: '0.02',
      label: 'human beings per day',
      quantityKind: 'rate',
      bounded: false,
      warranted: true,
      salience: 0.86,
    },
    signals: { visual_complexity: 0.18, enthusiasm: 0.62 },
  },
  {
    id: 'bounded-percent',
    content: {
      value: '90%',
      label: 'of viewers stayed',
      quantityKind: 'percent',
      bounded: true,
      boundedRange: true,
      denominator: 100,
      warranted: true,
      salience: 0.94,
    },
    signals: { enthusiasm: 0.82, emotional_arousal: 0.74 },
  },
  {
    id: 'big-magnitude',
    content: {
      value: '100M',
      label: 'monthly active users',
      quantityKind: 'count',
      bounded: false,
      warranted: true,
      salience: 0.9,
    },
    signals: { visceral_impact: 0.74, pacing_velocity: 0.72 },
  },
  {
    id: 'fraction',
    content: {
      value: '1/3',
      label: 'of teams adopted it',
      quantityKind: 'fraction',
      bounded: true,
      denominator: 3,
      warranted: true,
      salience: 0.88,
    },
    signals: { formality: 0.56, warmth: 0.54 },
  },
  {
    id: 'keyword-concept',
    content: {
      keyword: 'selection bias',
      emphasisWord: 'selection bias',
      text: 'selection bias',
      body: 'the sample changed the story',
      warranted: true,
      salience: 0.82,
    },
    signals: { formality: 0.62, enthusiasm: 0.5, visual_dependency: 0.18 },
  },
  {
    id: 'speaker-intro',
    content: {
      name: 'Hank Green',
      title: 'Host / science educator',
      contextPhrase: "I'm Hank.",
      warranted: true,
      salience: 0.78,
    },
    signals: { warmth: 0.76, formality: 0.48, enthusiasm: 0.58 },
  },
];

export function buildMgRenderedCalibrationInput(): MgRenderedCalibrationInput {
  const overlays = MG_RENDERED_CALIBRATION_CASES.map((testCase, index) => {
    const signals: PlannerSignals = { ...BASE_SIGNALS, ...testCase.signals };
    const tokens = resolveMotionTokens(signals, BRAND);
    const mgScores = mgScoresFor(signals);
    const recipe = planComposition(
      { content: testCase.content, triggerMoment: testCase.id },
      tokens,
      signals,
      mgScores,
    );
    const atomicOverlayPlan = buildAtomicOverlayPlan(recipe, tokens, testCase.content, signals, mgScores, {});
    const atomicOverlayDecision = decideAtomicOverlay(atomicOverlayPlan);
    const from = index * STRIDE;

    return {
      id: 7000 + index,
      type: 'motion-graphic',
      from,
      durationInFrames: DURATION,
      row: 4,
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      isDragging: false,
      rotation: 0,
      recipe,
      resolvedTokens: tokens,
      contentSignals: signals,
      content: testCase.content,
      styles: { opacity: 1, backgroundColor: 'transparent' },
      metadata: {
        sourceType: 'mg-rendered-calibration',
        calibrationCase: testCase.id,
        compositionEngine: true,
        atomicOverlayPlan,
        atomicOverlayDecision,
        atomicPlanObserveMode: true,
      },
    };
  });

  return {
    projectId: 'mg-rendered-calibration',
    tag: 'mg-rendered-calibration',
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationInFrames: (overlays.length - 1) * STRIDE + DURATION + 15,
    overlays,
    sampleFrames: overlays.map((overlay) => Number(overlay.from) + Math.floor(DURATION * 0.55)),
  };
}

function mgScoresFor(signals: PlannerSignals): MgOverlayScores {
  const definitions = getOverlayDefinitions().filter((definition) => definition.category === 'mg-property');
  const results = scoreAllOverlays(definitions, numericSignalSnapshot(signals), 'additive');
  const scores: MgOverlayScores = {};
  for (const result of results) {
    scores[result.overlayId] = {
      score: result.totalScore,
      values: result.outputValues,
    };
  }
  return scores;
}

function numericSignalSnapshot(signals: PlannerSignals): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const [key, value] of Object.entries(signals)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

export function writeMgRenderedCalibrationInput(
  outputFile = path.resolve(process.cwd(), '.calibration-temp', 'mg-rendered-calibration-input.json'),
): MgRenderedCalibrationInput {
  const input = buildMgRenderedCalibrationInput();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  return input;
}

function main(): void {
  const outputFile = path.resolve(process.cwd(), '.calibration-temp', 'mg-rendered-calibration-input.json');
  const input = writeMgRenderedCalibrationInput(outputFile);
  console.log(`Wrote ${input.overlays.length} MG rendered calibration overlays -> ${outputFile}`);
  console.log('Render gate: npx tsx scripts/render-editron-aesthetic.ts .calibration-temp/mg-rendered-calibration-input.json --tag=mg-rendered-calibration --overlay-only --max-samples=24');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
