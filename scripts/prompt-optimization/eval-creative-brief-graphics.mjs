/**
 * Eval harness for creative-brief graphic decisions.
 *
 * Tests whether the creative-brief prompt produces structurally valid
 * graphic decisions: correct types for content, params matching transcript,
 * no anti-patterns (filler keywords, invented names), reasonable distribution.
 *
 * Usage:
 *   node scripts/prompt-optimization/eval-creative-brief-graphics.mjs
 *   node scripts/prompt-optimization/eval-creative-brief-graphics.mjs --seed=5
 *   node scripts/prompt-optimization/eval-creative-brief-graphics.mjs --multi-seed
 *
 * Env: GEMINI_API_KEY (or GOOGLE_API_KEY) in .env.local
 *       EVAL_MODEL to override model (default: gemini-2.5-flash-preview-05-20)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY. Set in .env.local or pass via env.');
  process.exit(1);
}

const MODEL = process.env.EVAL_MODEL || 'gemini-2.5-flash';

const seedArg = process.argv.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1]) : undefined;
const multiSeed = process.argv.includes('--multi-seed');

// ─── Load test data ─────────────────────────────────────────────

const dataPath = path.join(__dirname, 'hank-green-test-data.json');
const testData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const words = testData.words;
const wordCount = testData.wordCount;
const totalDurationSec = Math.ceil(words[words.length - 1].endMs / 1000);

console.log(`Loaded: ${wordCount} words, ${totalDurationSec}s duration, content="${testData.contentType}", model=${MODEL}\n`);

// ─── Filler words (banned for keyword-highlight) ────────────────
// Sourced from edl-executor.ts RC-8 fix (commit 87418599)

const FILLER_WORDS = new Set([
  'good', 'bad', 'stuff', 'thing', 'things', 'like', 'just', 'very',
  'really', 'actually', 'basically', 'literally', 'totally', 'absolutely',
  'honestly', 'obviously', 'clearly', 'definitely', 'certainly', 'exactly',
  'right', 'well', 'okay', 'ok', 'so', 'yeah', 'yes', 'no', 'not',
  'also', 'even', 'much', 'many', 'some', 'any', 'all', 'every',
  'kind', 'sort', 'type', 'way', 'lot', 'bit', 'part',
  'the', 'a', 'an', 'this', 'that', 'it', 'i', 'we', 'you', 'they',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'might', 'can',
  'get', 'got', 'make', 'made', 'go', 'going', 'went',
  'know', 'think', 'see', 'want', 'need', 'feel',
  'here', 'there', 'now', 'then', 'when', 'where', 'what', 'how',
  'more', 'most', 'other', 'same', 'different', 'new', 'old',
  'big', 'small', 'great', 'little', 'long', 'first', 'last',
]);

// ─── Number word detection ──────────────────────────────────────

const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'trillion',
  'percent', 'percentage', 'half', 'quarter', 'third', 'double', 'triple',
]);

function hasNumberNearby(wordIdx, windowSize = 10) {
  const start = Math.max(0, wordIdx - windowSize);
  const end = Math.min(wordCount - 1, wordIdx + windowSize);
  for (let i = start; i <= end; i++) {
    const w = words[i].word.toLowerCase();
    if (/\d/.test(w)) return true;
    if (NUMBER_WORDS.has(w)) return true;
  }
  return false;
}

function hasNameNearby(wordIdx, windowSize = 10) {
  const start = Math.max(0, wordIdx - windowSize);
  const end = Math.min(wordCount - 1, wordIdx + windowSize);
  for (let i = start; i <= end; i++) {
    const w = words[i].word;
    if (w.length <= 1) continue;
    if (w[0] !== w[0].toUpperCase() || w[0] === w[0].toLowerCase()) continue;
    // Skip sentence-start caps
    if (i > 0) {
      const prev = words[i - 1].word;
      if (/[.?!]$/.test(prev)) continue;
    } else {
      continue; // first word of transcript — always capitalized
    }
    return true;
  }
  return false;
}

function quoteAppearsInTranscript(quoteText) {
  if (!quoteText || quoteText.length < 5) return false;
  const fullText = words.map(w => w.word).join(' ').toLowerCase();
  const quoteWords = quoteText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (quoteWords.length < 3) return fullText.includes(quoteText.toLowerCase());
  // Check if at least 3 consecutive words from quote appear in transcript
  for (let i = 0; i <= quoteWords.length - 3; i++) {
    const chunk = quoteWords.slice(i, i + 3).join(' ');
    if (fullText.includes(chunk)) return true;
  }
  return false;
}

// ─── Build prompt (mirrors creative-brief.ts buildPrompt) ──────
// Simplified: no context cache, no genre params, no audio features.
// Tests the GRAPHIC RULES section of the prompt in isolation.

function buildPrompt() {
  const transcriptBlock = words
    .map((w, i) => `[${i}] ${w.word} (${w.startMs}-${w.endMs}ms)`)
    .join('\n');

  // Signal detection (mirrors creative-brief.ts detectSignalsFromContext)
  const lowerWords = words.map(w => w.word.toLowerCase());
  const hasNumbers = lowerWords.some(w => /\d/.test(w));
  const originalWords = words.map(w => w.word);
  const hasNames = originalWords.some(w =>
    w.length > 1 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()
  );

  const signalLines = [];
  signalLines.push('SIGNAL: opening_hook');
  signalLines.push('  → graphic_logo_reveal (text: "") — Brand/logo reveal at the start.');
  signalLines.push('SIGNAL: emphasis_word');
  signalLines.push('  → graphic_callout (title: "", body: "") — Key concept with explanation.');
  signalLines.push('  → graphic_keyword_highlight (text: "") — Single conceptual term worth remembering.');
  signalLines.push('  → graphic_quote_card (quote: "", author: "") — Direct quote or standout assertion.');
  if (hasNumbers) {
    signalLines.push('SIGNAL: number_mentioned');
    signalLines.push('  → graphic_stat_counter (value: "", label: "") — Specific impactful number.');
  }
  if (hasNames) {
    signalLines.push('SIGNAL: name_mentioned');
    signalLines.push('  → graphic_lower_third (name: "", title: "") — First mention of named person/entity.');
  }

  const decisionsPerChunk = Math.max(1, Math.floor(52 / Math.max(wordCount / 500, 1)));

  return `<role>
You are a professional video editor watching THIS specific video and making creative decisions based on what you see and hear. You have craft knowledge in your context. Do not apply templates or category-based rules — respond to THIS content.
</role>

<your_scope>
The transcript below has ALREADY been cleaned by a separate system. Silence, retakes, filler words, and false starts are removed. The word indices point to CLEAN content only.

You handle CREATIVE ENHANCEMENT:
- WHERE to zoom for emotional emphasis (what moment deserves visual weight?)
- WHERE transitions mark narrative shifts (topic change, energy shift, new chapter)
- WHAT SFX punctuate genuine beats (not every cut — only moments that EARN sound)
- WHAT graphics surface key information (a number worth visualizing, a name worth displaying)
- WHERE caption emphasis draws focus to power words
- WHERE pacing adjustments serve the story (hold moments, compress dead spots)

You do NOT handle: silence removal, filler cuts, retake selection, segment ordering, jump cuts. These are already done. Do NOT output cut or jump_cut decisions.
</your_scope>

<signal_decision_map>
These signals were DETECTED in this video. Use these as your primary editing toolkit:

${signalLines.join('\n')}
</signal_decision_map>

<valid_types>
Use ONLY these exact type strings. Any other type will be silently dropped.
  zoom_push (requires: intensity, durationFrames)
  zoom_punch (requires: intensity, durationFrames)
  zoom_pull_back (requires: intensity, durationFrames)
  zoom_drift (requires: intensity, durationFrames, direction)
  transition_dissolve (requires: durationFrames)
  transition_hard_cut (no params required)
  transition_whip_pan (requires: direction)
  transition_fade_to_black (requires: durationFrames)
  transition_flash (no params required)
  transition_j_cut (requires: offsetFrames)
  transition_l_cut (requires: offsetFrames)
  transition_soft_cut (requires: durationFrames)
  transition_wipe (requires: direction)
  caption_emphasis (requires: wordIdx, style)
  sfx_whoosh (requires: variant)
  sfx_impact (requires: variant)
  sfx_shimmer (no params required)
  sfx_ambient (requires: soundType)
  speed_slow_motion (requires: factor, durationFrames)
  speed_ramp (requires: fromFactor, toFactor, durationFrames)
  graphic_stat_counter (requires: value, label)
  graphic_lower_third (requires: name)
  graphic_callout (requires: title, body)
  graphic_keyword_highlight (requires: text)
  graphic_quote_card (requires: quote)
  graphic_logo_reveal (requires: text)
  camera_shake (requires: intensity, durationFrames)
  audio_duck (requires: level, durationMs)
  audio_bed_select (requires: genre, energy)
  hold_longer (requires: durationFrames)
  cut_shorter (requires: trimFrames)
</valid_types>

<valid_reasons>
Use ONLY these exact reason strings: vocal_peak, vocal_build, vocal_wind_down, topic_shift, emphasis_word, rhetorical_pause, number_mentioned, name_mentioned, cta, energy_peak, energy_build, energy_drop, scene_boundary, visual_monotony, music_beat, music_drop, music_section_change, emotional_shift, narrative_resolve, opening_hook, closing_zone
</valid_reasons>

<anti_patterns>
- NEVER produce cut, jump_cut, or hard_cut type decisions — the transcript editor handles all cuts.
- NEVER assign the same confidence to every decision. Vary 0.55-0.95 based on certainty. Your BEST decisions get 0.90-0.95. Decent ones 0.70-0.85. Uncertain ones 0.55-0.65.
- NEVER place SFX on every transition. SFX marks MOMENTS, not cuts.
- NEVER cluster decisions in one section. Each third of the video should have roughly equal decision count.
- NEVER use more than 3 consecutive decisions of the same type category.
- NEVER exceed the budget maximums above. Fewer confident decisions beat many uncertain ones.
- NEVER use caption_emphasis as the dominant type. Zooms, transitions, and SFX should collectively outnumber caption_emphasis decisions. Captions are SUPPORTING, not the main edit.
- NEVER use "cta" reason unless the speaker is literally asking the viewer to DO something (subscribe, click, buy, visit). "cta" is NOT a synonym for "important word".
- NEVER place all your decisions in the first half. EVERY narrative_arc section MUST have at least one decision. If your last decision is before word ${Math.floor(wordCount * 0.7)}, you are truncating the video.
- GENERATE DECISIONS FOR THE FULL VIDEO. Spread them evenly: ~${decisionsPerChunk} decisions per 500 words. Cover words 0 through ${wordCount - 1}.
</anti_patterns>

<graphic_rules>
Graphics are NOT decoration — they surface KEY INFORMATION. Use the MOST SPECIFIC type for each moment:

graphic_stat_counter — ONLY when a specific, impactful number is spoken. params: { value: "73%", label: "user satisfaction" }. Use the EXACT number from the transcript. Never invent numbers. "seventy-three percent" → value="73%". Skip vague quantities ("a few", "some", "2 or 3").

graphic_lower_third — FIRST mention of a named person, company, or product. params: { name: "Hank Green", title: "YouTuber" }. Title is optional but preferred. Do NOT repeat for the same entity. One lower-third per entity per video. The name MUST appear in the transcript — NEVER invent names. If you cannot find the person's actual name in the transcript, do NOT create a lower-third.

graphic_callout — Key CONCEPTS that benefit from visual explanation. params: { title: "Selection Bias", body: "When your sample isn't random" }. Heavier than keyword-highlight. Use for ideas that deserve 2+ words of context, not single words.

graphic_quote_card — Direct QUOTES or standout assertions worth displaying verbatim. params: { quote: "The data doesn't lie", author: "Speaker Name" }. Use the speaker's EXACT words from transcript. Max 2-3 per video. Author is optional.

graphic_keyword_highlight — Quick pop for a single CONCEPTUAL term worth remembering. params: { text: "anonymity" }. The LIGHTEST graphic. Prefer multi-word concepts ("selection bias") over single generic words. NEVER use filler ("good", "like"), slang, profanity, or vague words ("thing", "stuff"). Choose words a viewer would screenshot.

graphic_logo_reveal — Brand/logo moment at opening or closing only. Max 2 per video.

PRIORITY ORDER when multiple graphics could apply to one moment: stat-counter > lower-third > quote-card > callout > keyword-highlight.
Do NOT default to keyword-highlight for everything. If a number is spoken, use stat-counter. If a name is introduced, use lower-third. If an assertion is powerful, use quote-card.
</graphic_rules>

<rules>
- Word indices MUST be between 0 and ${wordCount - 1}. There are exactly ${wordCount} words.
- Confidence score 0.0-1.0 per decision. Below 0.5 = executor skips it.
- narrative_arc sections must cover the ENTIRE transcription (no gaps).
- Distribute decisions across the FULL video length, not clustered at start or end.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": number, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_word_idx": number, "end_word_idx": number, "label": "setup"|"build"|"peak"|"resolve"|"transition"|"hook"|"closing", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": "<valid_type>", "target_word_idx": number, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { ...required_params_for_type } }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "standard_speech"|"music_dominant"|"balanced" },
  "caption_style": "word_by_word"|"sentence"|"key_phrases"|"none",
  "overall_pacing": "calm"|"measured"|"balanced"|"energetic"|"fast"
}
</output_format>

<user_preferences>
  (none specified — use your best creative judgment within the guardrails above)
</user_preferences>

<video_features>
Duration: ${totalDurationSec}s
Segments: 1
No additional features available.
</video_features>

<transcription>
${transcriptBlock}
</transcription>`;
}

// ─── Score graphic decisions ────────────────────────────────────
// Five automated metrics, no manual ground truth needed.
//
// 1. Type fidelity: Is the graphic type justified by nearby content?
// 2. Param fidelity: Do params match actual transcript content?
// 3. Anti-pattern score: Filler keywords, invented names, duplicates
// 4. Distribution: Graphics spread across all quartiles
// 5. Density: Reasonable count for video length

function scoreGraphics(decisions) {
  const graphics = decisions.filter(d => d.type?.startsWith('graphic_'));

  if (graphics.length === 0) {
    return {
      count: 0,
      typeFidelity: 1.0,
      paramFidelity: 1.0,
      antiPatternViolations: 0,
      antiPatternScore: 1.0,
      distributionScore: 0,
      densityScore: 0,
      quartiles: [0, 0, 0, 0],
      graphicsPerMin: 0,
      compositeScore: 0.2,
      details: ['No graphic decisions produced — under-generating'],
      byType: {},
    };
  }

  const details = [];
  let typePasses = 0;
  let paramPasses = 0;
  let antiPatternFails = 0;
  const seenNames = new Set();

  for (const g of graphics) {
    const idx = g.target_word_idx ?? 0;
    const params = g.params || {};

    switch (g.type) {
      case 'graphic_stat_counter': {
        if (hasNumberNearby(idx)) {
          typePasses++;
        } else {
          details.push(`FAIL type: stat_counter @${idx} — no number within ±10 words`);
        }
        if (params.value && /\d/.test(String(params.value))) {
          paramPasses++;
        } else {
          details.push(`FAIL param: stat_counter @${idx} — value="${params.value}" has no digit`);
          antiPatternFails++;
        }
        break;
      }

      case 'graphic_lower_third': {
        if (hasNameNearby(idx)) {
          typePasses++;
        } else {
          details.push(`FAIL type: lower_third @${idx} — no capitalized name within ±10 words`);
        }
        const name = params.name || '';
        if (name.length > 1) {
          const firstName = name.split(/\s+/)[0].toLowerCase();
          const nameInTranscript = words.some(w =>
            w.word.toLowerCase().replace(/[.,!?;:'"]/g, '') === firstName
          );
          if (nameInTranscript) {
            paramPasses++;
          } else {
            details.push(`FAIL param: lower_third name="${name}" not found in transcript — INVENTED`);
            antiPatternFails++;
          }
          if (seenNames.has(name.toLowerCase())) {
            details.push(`FAIL anti-pattern: duplicate lower_third for "${name}"`);
            antiPatternFails++;
          }
          seenNames.add(name.toLowerCase());
        } else {
          details.push(`FAIL param: lower_third @${idx} — empty name`);
          antiPatternFails++;
        }
        break;
      }

      case 'graphic_keyword_highlight': {
        typePasses++;
        const kwText = (params.text || '').toLowerCase().trim();
        const kwTokens = kwText.split(/\s+/);
        if (kwText.length < 3) {
          details.push(`FAIL param: keyword "${kwText}" too short (<3 chars)`);
          antiPatternFails++;
        } else if (kwTokens.every(t => FILLER_WORDS.has(t))) {
          details.push(`FAIL anti-pattern: keyword "${kwText}" is all filler words`);
          antiPatternFails++;
        } else {
          paramPasses++;
        }
        break;
      }

      case 'graphic_quote_card': {
        const quote = params.quote || '';
        if (quote.length >= 5 && quoteAppearsInTranscript(quote)) {
          typePasses++;
          paramPasses++;
        } else if (quote.length < 5) {
          details.push(`FAIL param: quote_card @${idx} — quote too short (${quote.length} chars)`);
          antiPatternFails++;
        } else {
          details.push(`FAIL param: quote_card @${idx} — quote not found in transcript`);
          antiPatternFails++;
        }
        break;
      }

      case 'graphic_callout': {
        typePasses++;
        if (params.title && String(params.title).length > 1 && params.body && String(params.body).length > 1) {
          paramPasses++;
        } else {
          details.push(`FAIL param: callout @${idx} — missing title or body`);
        }
        break;
      }

      case 'graphic_logo_reveal': {
        if (idx < wordCount * 0.15 || idx > wordCount * 0.85) {
          typePasses++;
        } else {
          details.push(`FAIL type: logo_reveal @${idx} (${Math.round(idx / wordCount * 100)}%) — not at opening/closing`);
        }
        paramPasses++;
        break;
      }

      default:
        details.push(`UNKNOWN graphic type: ${g.type}`);
    }
  }

  // Distribution: quartile analysis
  const quartiles = [0, 0, 0, 0];
  for (const g of graphics) {
    const idx = g.target_word_idx ?? 0;
    const q = Math.min(3, Math.floor((idx / wordCount) * 4));
    quartiles[q]++;
  }
  const nonEmptyQuartiles = quartiles.filter(q => q > 0).length;
  const distributionScore = nonEmptyQuartiles / 4;

  // Density: graphics per minute (reasonable range 0.3-6/min)
  // CRG: graphic hold durations 1.5-5s, minGapSec 10-30s → max ~4-6/min, min ~0.3/min
  const durationMin = totalDurationSec / 60;
  const graphicsPerMin = graphics.length / Math.max(0.5, durationMin);
  let densityScore;
  if (graphicsPerMin >= 0.3 && graphicsPerMin <= 6) {
    densityScore = 1.0;
  } else if (graphicsPerMin < 0.3) {
    densityScore = graphicsPerMin / 0.3;
  } else {
    densityScore = Math.max(0, 1 - (graphicsPerMin - 6) / 6);
  }

  // Type dominance: keyword-highlight should NOT be >60% of all graphics
  const kwCount = graphics.filter(g => g.type === 'graphic_keyword_highlight').length;
  if (kwCount > graphics.length * 0.6 && graphics.length > 3) {
    details.push(`WARN: keyword_highlight dominates (${kwCount}/${graphics.length} = ${Math.round(kwCount / graphics.length * 100)}%)`);
    antiPatternFails++;
  }

  // Word index bounds check
  for (const g of graphics) {
    const idx = g.target_word_idx ?? 0;
    if (idx < 0 || idx >= wordCount) {
      details.push(`FAIL: graphic @${idx} — out of bounds [0, ${wordCount - 1}]`);
      antiPatternFails++;
    }
  }

  const typeFidelity = typePasses / graphics.length;
  const paramFidelity = paramPasses / graphics.length;
  const antiPatternScore = Math.max(0, 1 - antiPatternFails / Math.max(1, graphics.length));

  // Composite: param fidelity weighted highest — invented content is the worst failure mode
  const compositeScore = (
    typeFidelity * 0.25 +
    paramFidelity * 0.30 +
    antiPatternScore * 0.25 +
    distributionScore * 0.10 +
    densityScore * 0.10
  );

  const byType = {};
  for (const g of graphics) {
    const shortType = g.type.replace('graphic_', '');
    byType[shortType] = (byType[shortType] || 0) + 1;
  }

  return {
    count: graphics.length,
    typeFidelity,
    paramFidelity,
    antiPatternViolations: antiPatternFails,
    antiPatternScore,
    distributionScore,
    densityScore,
    quartiles,
    graphicsPerMin,
    compositeScore,
    details,
    byType,
  };
}

// ─── Run Gemini ─────────────────────────────────────────────────

async function runOnce(seedVal) {
  const genai = new GoogleGenerativeAI(API_KEY);
  const model = genai.getGenerativeModel({ model: MODEL });

  const prompt = buildPrompt();

  const config = {
    responseMimeType: 'application/json',
    temperature: 0.3,
    maxOutputTokens: 65536,
  };
  if (seedVal !== undefined) config.seed = seedVal;

  const start = Date.now();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: config,
  });
  const elapsed = Date.now() - start;

  const text = result.response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`JSON parse failed: ${text.substring(0, 200)}...`);
  }

  if (!parsed || !parsed.decisions) {
    throw new Error('No decisions in response');
  }

  const allDecisions = parsed.decisions;
  const scores = scoreGraphics(allDecisions);

  return { seed: seedVal, parsed, scores, elapsed, totalDecisions: allDecisions.length };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (multiSeed) {
    console.log('Running seeds 1-10...\n');
    console.log('Seed | Comp  | Type  | Param | Anti  | Dist | Dens | Gfx | Per/Min | Total | Time');
    console.log('-----|-------|-------|-------|-------|------|------|-----|---------|-------|------');

    const results = [];
    for (let s = 1; s <= 10; s++) {
      try {
        const r = await runOnce(s);
        const sc = r.scores;
        console.log(
          `  ${String(s).padStart(2)} ` +
          `| ${sc.compositeScore.toFixed(3)} ` +
          `| ${sc.typeFidelity.toFixed(3)} ` +
          `| ${sc.paramFidelity.toFixed(3)} ` +
          `| ${sc.antiPatternScore.toFixed(3)} ` +
          `| ${sc.distributionScore.toFixed(2)} ` +
          `| ${sc.densityScore.toFixed(2)} ` +
          `| ${String(sc.count).padStart(3)} ` +
          `| ${sc.graphicsPerMin.toFixed(1).padStart(7)} ` +
          `| ${String(r.totalDecisions).padStart(5)} ` +
          `| ${(r.elapsed / 1000).toFixed(0)}s`
        );
        results.push(r);
      } catch (err) {
        console.log(`  ${String(s).padStart(2)} | ERROR: ${err.message.substring(0, 60)}`);
      }
    }

    if (results.length > 0) {
      const composites = results.map(r => r.scores.compositeScore);
      console.log(`\n--- Summary ---`);
      console.log(`Min composite: ${Math.min(...composites).toFixed(3)}`);
      console.log(`Max composite: ${Math.max(...composites).toFixed(3)}`);
      console.log(`Avg composite: ${(composites.reduce((a, b) => a + b, 0) / composites.length).toFixed(3)}`);

      const avgGfx = results.reduce((s, r) => s + r.scores.count, 0) / results.length;
      console.log(`Avg graphics:  ${avgGfx.toFixed(1)}`);

      if (Math.min(...composites) >= 0.85) console.log('\n✅ PASS — min(composite) >= 0.85');
      else if (Math.min(...composites) >= 0.70) console.log('\n🟡 MARGINAL — min(composite) >= 0.70');
      else console.log('\n❌ FAIL — min(composite) < 0.70');

      // Show details from worst run
      const worst = results.reduce((a, b) =>
        a.scores.compositeScore < b.scores.compositeScore ? a : b
      );
      if (worst.scores.details.length > 0) {
        console.log(`\nWorst run (seed ${worst.seed}, composite=${worst.scores.compositeScore.toFixed(3)}) details:`);
        worst.scores.details.slice(0, 15).forEach(d => console.log(`  ${d}`));
        if (worst.scores.details.length > 15) {
          console.log(`  ... and ${worst.scores.details.length - 15} more`);
        }
      }

      // Type distribution across all runs
      const allByType = {};
      for (const r of results) {
        for (const [t, c] of Object.entries(r.scores.byType)) {
          allByType[t] = (allByType[t] || 0) + c;
        }
      }
      console.log(`\nType distribution (total across ${results.length} runs):`, allByType);
    }
  } else {
    const seedVal = seed ?? 42;
    console.log(`Running with seed=${seedVal}...\n`);

    const r = await runOnce(seedVal);
    const sc = r.scores;

    console.log('=== GRAPHIC DECISION EVAL RESULTS ===');
    console.log(`Seed:              ${r.seed}`);
    console.log(`Total decisions:   ${r.totalDecisions}`);
    console.log(`Graphic decisions: ${sc.count}`);
    console.log(`Graphics/min:      ${sc.graphicsPerMin.toFixed(1)}`);
    console.log('');
    console.log(`Composite score:   ${sc.compositeScore.toFixed(4)}`);
    console.log(`  Type fidelity:   ${sc.typeFidelity.toFixed(4)} (is graphic type justified by content?)`);
    console.log(`  Param fidelity:  ${sc.paramFidelity.toFixed(4)} (do params match transcript?)`);
    console.log(`  Anti-pattern:    ${sc.antiPatternScore.toFixed(4)} (${sc.antiPatternViolations} violations)`);
    console.log(`  Distribution:    ${sc.distributionScore.toFixed(4)} (quartiles: [${sc.quartiles.join(', ')}])`);
    console.log(`  Density:         ${sc.densityScore.toFixed(4)}`);
    console.log('');
    console.log('By type:', JSON.stringify(sc.byType));
    console.log(`Time: ${(r.elapsed / 1000).toFixed(1)}s`);

    if (sc.details.length > 0) {
      console.log('\nDetails:');
      sc.details.forEach(d => console.log(`  ${d}`));
    }

    if (sc.compositeScore >= 0.85) console.log('\n✅ PASS — composite >= 0.85');
    else if (sc.compositeScore >= 0.70) console.log('\n🟡 MARGINAL — composite >= 0.70');
    else console.log('\n❌ FAIL — composite < 0.70');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
