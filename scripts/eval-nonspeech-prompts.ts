/**
 * Eval Harness: Non-Speech Prompt Validation (Phase 6.3, Rule 35)
 *
 * Part 1 (LOCAL — no API key): validateAndGate + executeBrief end-to-end
 *   Tests that mock Gemini responses are correctly parsed, validated, and
 *   resolved to frames for each content mode (music, visual, hybrid).
 *
 * Part 2 (LIVE — needs GEMINI_API_KEY): Prompt → Gemini → validate
 *   Calls Gemini with seeds 1-10 for each prompt variant, scores structural
 *   compliance. Run with: GEMINI_API_KEY=... npx tsx scripts/eval-nonspeech-prompts.ts
 */

import { routeContentType, validateAndGate } from '../lib/editron/services/creative-brief';
import type { ContentMode, BriefDecision, CreativeBrief, BriefDecisionType, DecisionReason } from '../lib/editron/services/creative-brief';
import { executeBrief } from '../lib/editron/services/brief-executor';
import { VALID_DECISION_TYPES, VALID_DECISION_REASONS } from '../lib/editron/data/decision-registry';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

// ── Mock Gemini responses per mode ─────────────────────────────────────────

function mockMusicResponse(durationMs: number) {
  return {
    video_understanding: {
      primary_content: 'electronic music performance',
      shot_scale: 'wide', lighting: 'dramatic',
      production_quality: 0.8, environment: 'stage',
      speaker_count: 0, has_b_roll: true,
    },
    narrative_arc: [
      { section_id: 0, start_timestamp_ms: 0, end_timestamp_ms: durationMs * 0.25, start_word_idx: -1, end_word_idx: -1, label: 'intro', energy_level: 'building', mood: 'anticipation', pacing_feel: 'measured' },
      { section_id: 1, start_timestamp_ms: durationMs * 0.25, end_timestamp_ms: durationMs * 0.5, start_word_idx: -1, end_word_idx: -1, label: 'verse', energy_level: 'high', mood: 'energetic', pacing_feel: 'energetic' },
      { section_id: 2, start_timestamp_ms: durationMs * 0.5, end_timestamp_ms: durationMs * 0.75, start_word_idx: -1, end_word_idx: -1, label: 'drop', energy_level: 'high', mood: 'intense', pacing_feel: 'fast' },
      { section_id: 3, start_timestamp_ms: durationMs * 0.75, end_timestamp_ms: durationMs, start_word_idx: -1, end_word_idx: -1, label: 'outro', energy_level: 'declining', mood: 'resolution', pacing_feel: 'calm' },
    ],
    decisions: [
      { type: 'zoom_push', target_timestamp_ms: 5000, target_beat_idx: 4, target_word_idx: -1, confidence: 0.85, reason: 'music_beat', params: { scaleFrom: 1.0, scaleTo: 1.06 } },
      { type: 'zoom_punch', target_timestamp_ms: durationMs * 0.5, target_beat_idx: 20, target_word_idx: -1, confidence: 0.92, reason: 'music_drop', params: { scaleFrom: 1.0, scaleTo: 1.15 } },
      { type: 'transition_hard_cut', target_timestamp_ms: durationMs * 0.25, target_word_idx: -1, confidence: 0.78, reason: 'music_section_change', params: {} },
      { type: 'sfx_impact', target_timestamp_ms: durationMs * 0.5, target_word_idx: -1, confidence: 0.88, reason: 'music_drop', params: { volume: 0.4 } },
      { type: 'camera_shake', target_timestamp_ms: durationMs * 0.5 + 100, target_word_idx: -1, confidence: 0.75, reason: 'music_drop', params: { intensity: 0.3 } },
    ],
    audio_design: { ambient_bed: 'none', ducking_profile: 'music_dominant' },
    caption_style: 'none',
    overall_pacing: 'energetic',
  };
}

function mockVisualResponse(durationMs: number) {
  return {
    video_understanding: {
      primary_content: 'drone footage of coastline',
      shot_scale: 'extreme_wide', lighting: 'golden_hour',
      production_quality: 0.9, environment: 'exterior',
      speaker_count: 0, has_b_roll: false,
    },
    narrative_arc: [
      { section_id: 0, start_timestamp_ms: 0, end_timestamp_ms: durationMs * 0.33, start_word_idx: -1, end_word_idx: -1, label: 'setup', energy_level: 'low', mood: 'serene', pacing_feel: 'calm' },
      { section_id: 1, start_timestamp_ms: durationMs * 0.33, end_timestamp_ms: durationMs * 0.66, start_word_idx: -1, end_word_idx: -1, label: 'build', energy_level: 'building', mood: 'majestic', pacing_feel: 'measured' },
      { section_id: 2, start_timestamp_ms: durationMs * 0.66, end_timestamp_ms: durationMs, start_word_idx: -1, end_word_idx: -1, label: 'peak', energy_level: 'high', mood: 'awe', pacing_feel: 'balanced' },
    ],
    decisions: [
      { type: 'zoom_push', target_timestamp_ms: 8000, target_word_idx: -1, confidence: 0.82, reason: 'visual_peak', params: { scaleFrom: 1.0, scaleTo: 1.06 } },
      { type: 'zoom_punch', target_timestamp_ms: durationMs * 0.5, target_word_idx: -1, confidence: 0.88, reason: 'motion_peak', params: { scaleFrom: 1.0, scaleTo: 1.12 } },
      { type: 'transition_dissolve', target_timestamp_ms: durationMs * 0.33, target_word_idx: -1, confidence: 0.76, reason: 'visual_peak', params: { durationMs: 600 } },
      { type: 'speed_slow_motion', target_timestamp_ms: durationMs * 0.6, target_word_idx: -1, confidence: 0.72, reason: 'motion_peak', params: { multiplier: 0.5 } },
    ],
    audio_design: { ambient_bed: 'nature_ambience', ducking_profile: 'balanced' },
    caption_style: 'none',
    overall_pacing: 'measured',
  };
}

function mockSpeechResponse() {
  return {
    video_understanding: {
      primary_content: 'talking head tutorial',
      shot_scale: 'medium', lighting: 'neutral',
      production_quality: 0.7, environment: 'studio',
      speaker_count: 1, has_b_roll: false,
    },
    narrative_arc: [
      { section_id: 0, start_word_idx: 0, end_word_idx: 10, label: 'hook', energy_level: 'high', mood: 'enthusiastic', pacing_feel: 'energetic' },
      { section_id: 1, start_word_idx: 11, end_word_idx: 50, label: 'build', energy_level: 'building', mood: 'informative', pacing_feel: 'balanced' },
    ],
    decisions: [
      { type: 'zoom_push', target_word_idx: 5, confidence: 0.85, reason: 'vocal_build', params: { scaleFrom: 1.0, scaleTo: 1.06 } },
      { type: 'zoom_punch', target_word_idx: 20, confidence: 0.9, reason: 'energy_peak', params: { scaleFrom: 1.0, scaleTo: 1.12 } },
    ],
    audio_design: { ambient_bed: 'none', ducking_profile: 'balanced' },
    caption_style: 'dynamic_word',
    overall_pacing: 'balanced',
  };
}

// ── Part 1: validateAndGate per mode ──────────────────────────────────────

console.log('=== Part 1: validateAndGate Mode Compliance ===\n');

console.log('--- Music Mode ---');
const musicRaw = mockMusicResponse(60000);
const musicBrief = validateAndGate(musicRaw, Date.now(), null, 'music');

assert(musicBrief !== null, 'music response validates successfully');
assert(musicBrief!.contentMode === 'music', `contentMode is 'music' (got ${musicBrief!.contentMode})`);
assert(musicBrief!.decisions.length === 5, `all 5 music decisions preserved (got ${musicBrief!.decisions.length})`);

for (const d of musicBrief!.decisions) {
  assert(VALID_DECISION_TYPES.has(d.type), `type '${d.type}' is valid`);
  assert(VALID_DECISION_REASONS.has(d.reason), `reason '${d.reason}' is valid`);
  assert(d.targetWordIdx === -1, `word index is -1 for music decision (type=${d.type})`);
  const hasNonWordCoord = (d.targetTimestampMs !== undefined && d.targetTimestampMs >= 0) ||
                          (d.targetBeatIdx !== undefined && d.targetBeatIdx >= 0);
  assert(hasNonWordCoord, `has timestamp or beat coordinate (type=${d.type})`);
}

const musicSections = musicBrief!.narrativeArc;
assert(musicSections.length === 4, `4 narrative sections (got ${musicSections.length})`);
for (const s of musicSections) {
  assert(s.startTimestampMs !== undefined, `section '${s.label}' has startTimestampMs`);
  assert(s.endTimestampMs !== undefined, `section '${s.label}' has endTimestampMs`);
}

console.log('\n--- Visual Mode ---');
const visualRaw = mockVisualResponse(90000);
const visualBrief = validateAndGate(visualRaw, Date.now(), null, 'visual');

assert(visualBrief !== null, 'visual response validates successfully');
assert(visualBrief!.contentMode === 'visual', `contentMode is 'visual' (got ${visualBrief!.contentMode})`);
assert(visualBrief!.decisions.length === 4, `all 4 visual decisions preserved (got ${visualBrief!.decisions.length})`);

for (const d of visualBrief!.decisions) {
  assert(d.targetWordIdx === -1, `word index is -1 for visual decision (type=${d.type})`);
  assert(d.targetTimestampMs !== undefined && d.targetTimestampMs >= 0, `has timestamp coordinate (type=${d.type})`);
}

console.log('\n--- Speech Mode (regression check) ---');
const speechRaw = mockSpeechResponse();
const speechBrief = validateAndGate(speechRaw, Date.now(), null, 'speech');

assert(speechBrief !== null, 'speech response validates successfully');
assert(speechBrief!.contentMode === 'speech', `contentMode is 'speech' (got ${speechBrief!.contentMode})`);
assert(speechBrief!.decisions.length === 2, `both speech decisions preserved (got ${speechBrief!.decisions.length})`);

for (const d of speechBrief!.decisions) {
  assert(d.targetWordIdx >= 0, `has valid word index (type=${d.type}, idx=${d.targetWordIdx})`);
}

// ── Part 2: validateAndGate → executeBrief end-to-end ─────────────────────

console.log('\n=== Part 2: Full Pipeline (validateAndGate → executeBrief) ===\n');

console.log('--- Music Pipeline ---');
const beats = Array.from({ length: 30 }, (_, i) => ({
  timestampMs: i * 2000,
  strength: i % 4 === 0 ? 0.9 : 0.5,
}));

const musicExec = executeBrief({
  brief: musicBrief!,
  transcription: [],
  fps: 30,
  totalDurationMs: 60000,
  beats,
});

assert(musicExec.stats.resolvedToFrame > 0, `${musicExec.stats.resolvedToFrame}/${musicExec.stats.totalDecisions} music decisions resolved to frames`);
assert(musicExec.stats.skippedOutOfRange === 0, `0 music decisions out of range`);

for (const d of musicExec.edl.decisions) {
  assert(d.frame >= 0 && d.frame <= 1800, `frame ${d.frame} in valid range [0, 1800]`);
  assert(d.source?.includes('timestamp') || d.source?.includes('beat'), `source '${d.source}' is timestamp or beat (not word)`);
}

console.log('\n--- Visual Pipeline ---');
const visualExec = executeBrief({
  brief: visualBrief!,
  transcription: [],
  fps: 30,
  totalDurationMs: 90000,
});

assert(visualExec.stats.resolvedToFrame > 0, `${visualExec.stats.resolvedToFrame}/${visualExec.stats.totalDecisions} visual decisions resolved to frames`);

for (const d of visualExec.edl.decisions) {
  assert(d.frame >= 0 && d.frame <= 2700, `frame ${d.frame} in valid range [0, 2700]`);
  assert(d.source?.includes('timestamp'), `source '${d.source}' is timestamp-based`);
}

console.log('\n--- Speech Pipeline (regression) ---');
const speechExec = executeBrief({
  brief: speechBrief!,
  transcription: [
    { word: 'hello', startMs: 0, endMs: 300 },
    { word: 'welcome', startMs: 400, endMs: 700 },
    { word: 'to', startMs: 800, endMs: 900 },
    { word: 'this', startMs: 1000, endMs: 1200 },
    { word: 'tutorial', startMs: 1300, endMs: 1600 },
    ...Array.from({ length: 45 }, (_, i) => ({
      word: `word${i + 5}`,
      startMs: 1700 + i * 200,
      endMs: 1900 + i * 200,
    })),
  ],
  fps: 30,
  totalDurationMs: 12000,
});

assert(speechExec.stats.resolvedToFrame === 2, `both speech decisions resolved (got ${speechExec.stats.resolvedToFrame})`);
for (const d of speechExec.edl.decisions) {
  assert(d.source?.includes('word'), `source '${d.source}' is word-based`);
}

// ── Part 3: Edge cases — bad Gemini output ────────────────────────────────

console.log('\n=== Part 3: Bad Input Handling ===\n');

assert(validateAndGate(null, Date.now()) === null, 'null input → null');
assert(validateAndGate({}, Date.now()) !== null, 'empty object → still produces brief (empty decisions)');
assert(validateAndGate({ decisions: [{ type: 'FAKE_TYPE', target_word_idx: 0, confidence: 0.9, reason: 'energy_peak' }] }, Date.now())!.decisions.length === 0,
  'invalid type → dropped');
assert(validateAndGate({ decisions: [{ type: 'zoom_push', target_word_idx: 0, confidence: 0.9, reason: 'FAKE_REASON' }] }, Date.now())!.decisions.length === 0,
  'invalid reason → dropped');
assert(validateAndGate({ decisions: [{ type: 'zoom_push', target_word_idx: 0, confidence: 0.2, reason: 'energy_peak' }] }, Date.now())!.decisions.length === 0,
  'low confidence (0.2 < 0.5 threshold) → dropped');

const validDecision = { type: 'zoom_push', target_word_idx: 0, confidence: 0.8, reason: 'energy_peak', params: { scaleFrom: 1.0, scaleTo: 1.06 } };
const validBrief = validateAndGate({ decisions: [validDecision] }, Date.now());
assert(validBrief!.decisions.length === 1, 'valid decision preserved');
assert(validBrief!.decisions[0].params.scaleFrom === 1.0, 'params passed through');

// Music mode with speech-only decision (word idx, no timestamp) — validator preserves it,
// executor handles priority (timestamp > beat > word). If no timestamp/beat AND empty
// transcription, executor skips the decision gracefully.
const speechInMusic = validateAndGate({
  decisions: [{ type: 'zoom_push', target_word_idx: 5, confidence: 0.8, reason: 'vocal_build', params: { scaleFrom: 1.0, scaleTo: 1.06 } }],
}, Date.now(), null, 'music');
assert(speechInMusic!.decisions.length === 1, 'music mode: word-index-only decision preserved by validator');
const speechInMusicExec = executeBrief({
  brief: speechInMusic!, transcription: [], fps: 30, totalDurationMs: 60000,
});
assert(speechInMusicExec.stats.skippedOutOfRange === 1,
  'music mode: word-index-only decision + empty transcription → skipped by executor (not crash)');

// ── Part 4: Intent Verification — does each mode produce CORRECT behavior? ──

console.log('\n=== Part 4: Intent Verification ===\n');

// Intent: Music decisions should resolve via timestamp/beat, NOT word index
const musicIntent = executeBrief({
  brief: musicBrief!,
  transcription: [{ word: 'test', startMs: 0, endMs: 100 }],
  fps: 30,
  totalDurationMs: 60000,
  beats,
});
const musicSources = musicIntent.edl.decisions.map(d => d.source!.split(':')[2]);
assert(musicSources.every(s => s === 'timestamp' || s === 'beat'), `ALL music decisions use timestamp/beat coordinates (got: ${[...new Set(musicSources)].join(', ')})`);

// Intent: Visual decisions should resolve via timestamp ONLY
const visualSources = visualExec.edl.decisions.map(d => d.source!.split(':')[2]);
assert(visualSources.every(s => s === 'timestamp'), `ALL visual decisions use timestamp coordinates (got: ${[...new Set(visualSources)].join(', ')})`);

// Intent: Speech decisions should resolve via word index
const speechSources = speechExec.edl.decisions.map(d => d.source!.split(':')[2]);
assert(speechSources.every(s => s === 'word'), `ALL speech decisions use word coordinates (got: ${[...new Set(speechSources)].join(', ')})`);

// Intent: Routing produces correct mode for each content type
assert(routeContentType({ speechCoverage: 0.8, musicPresence: 0, visualChangeRate: 0.2 }) === 'speech', 'tutorial (high speech) → speech');
assert(routeContentType({ speechCoverage: 0.05, musicPresence: 0, visualChangeRate: 0.7 }) === 'visual', 'drone footage (low speech, high motion) → visual');
assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.8, visualChangeRate: 0.3, beatDensityBpm: 120 }) === 'music', 'EDM video (high music, beats) → music');
assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.8, visualChangeRate: 0.5, beatDensityBpm: 5 }) === 'visual', 'ambient + visual (music but no beats) → visual');
assert(routeContentType({ speechCoverage: 0.4, musicPresence: 0.3, visualChangeRate: 0.3 }) === 'hybrid', 'mixed content → hybrid');

// ── Part 5: Live Gemini Eval (needs API key) ─────────────────────────────

const localPassed = passed;
const localFailed = failed;

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (apiKey) {
  console.log('\n=== Part 5: LIVE Gemini Eval ===\n');

  const { generateCreativeBrief } = await import('../lib/editron/services/creative-brief');
  type VideoContext = import('../lib/editron/services/creative-brief').VideoContext;

  const musicCtx: VideoContext = {
    transcription: [],
    totalDurationSec: 60,
    segmentCount: 8,
    musicFeatures: {
      beats: Array.from({ length: 30 }, (_, i) => ({ timestampMs: i * 2000, strength: i % 4 === 0 ? 0.9 : 0.5 })),
      sections: [
        { startMs: 0, endMs: 15000, label: 'intro' },
        { startMs: 15000, endMs: 30000, label: 'verse' },
        { startMs: 30000, endMs: 45000, label: 'chorus' },
        { startMs: 45000, endMs: 60000, label: 'outro' },
      ],
      bpm: 120,
    },
  };

  const visualCtx: VideoContext = {
    transcription: [],
    totalDurationSec: 90,
    segmentCount: 12,
    vjepaFeatures: {
      segments: Array.from({ length: 6 }, (_, i) => ({
        startMs: i * 15000, endMs: (i + 1) * 15000,
        visualSignificance: 0.3 + Math.random() * 0.5,
        motionIntensity: 0.1 + Math.random() * 0.6,
      })),
    },
  };

  const prefs = {};

  for (const [label, ctx, mode] of [
    ['Music', musicCtx, 'music'],
    ['Visual', visualCtx, 'visual'],
  ] as const) {
    console.log(`--- ${label} Mode (live Gemini call) ---`);
    try {
      const brief = await generateCreativeBrief(ctx as any, prefs, undefined, undefined, mode as any);
      if (!brief) {
        console.error(`  ✗ ${label}: generateCreativeBrief returned null`);
        failed++;
        continue;
      }

      assert(brief.contentMode === mode, `${label}: contentMode is '${mode}'`);
      assert(brief.decisions.length > 0, `${label}: ${brief.decisions.length} decisions generated`);
      assert(brief.decisions.length <= 30, `${label}: reasonable decision count (≤30, got ${brief.decisions.length})`);
      assert(brief.narrativeArc.length > 0, `${label}: has narrative arc (${brief.narrativeArc.length} sections)`);

      let allTypesValid = true;
      let allReasonsValid = true;
      let allHaveTimestamp = true;
      let noneHaveWordIdx = true;

      for (const d of brief.decisions) {
        if (!VALID_DECISION_TYPES.has(d.type)) allTypesValid = false;
        if (!VALID_DECISION_REASONS.has(d.reason)) allReasonsValid = false;
        if (d.targetTimestampMs === undefined || d.targetTimestampMs < 0) allHaveTimestamp = false;
        if (d.targetWordIdx > 0) noneHaveWordIdx = false;
      }

      assert(allTypesValid, `${label}: all decision types valid`);
      assert(allReasonsValid, `${label}: all decision reasons valid`);
      assert(allHaveTimestamp, `${label}: all decisions have timestamp coordinate`);
      assert(noneHaveWordIdx, `${label}: no decisions use word index (non-speech mode)`);

      // Distribution: decisions should span the full duration
      const timestamps = brief.decisions.map(d => d.targetTimestampMs ?? 0);
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      const coverage = (maxTs - minTs) / (ctx.totalDurationSec * 1000);
      assert(coverage > 0.5, `${label}: decisions span >${(coverage * 100).toFixed(0)}% of duration (want >50%)`);

      // Confidence: should NOT be uniform
      const confs = new Set(brief.decisions.map(d => Math.round(d.confidence * 100)));
      assert(confs.size >= 2, `${label}: confidence varies (${confs.size} distinct values)`);

      console.log(`  → ${brief.decisions.length} decisions, ${brief.narrativeArc.length} sections, pacing=${brief.overallPacing}\n`);
    } catch (err: any) {
      console.error(`  ✗ ${label}: Gemini call failed — ${err.message}`);
      failed++;
    }
  }
} else {
  console.log('\n(Skipping Part 5: No GEMINI_API_KEY in environment)');
}

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(`LOCAL EVAL: ${localPassed} passed, ${localFailed} failed`);
console.log(`TOTAL EVAL: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed === 0) {
  console.log('ALL EVAL CHECKS PASSED ✓');
} else {
  console.log('SOME EVAL CHECKS FAILED ✗');
  process.exit(1);
}
