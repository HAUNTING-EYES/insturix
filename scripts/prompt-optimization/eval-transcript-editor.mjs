/**
 * Local eval harness for the transcript editor prompt.
 *
 * Usage: node scripts/prompt-optimization/eval-transcript-editor.mjs [--seed N]
 *
 * Reads cached transcript from hank-green-test-data.json,
 * runs the transcript editor prompt via Gemini API directly,
 * scores against the stable run's keep-ranges.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.npm_config_gemini_key;
if (!API_KEY) { console.error('No GEMINI_API_KEY. Set in .env.local or pass via: GEMINI_API_KEY=xxx node ...'); process.exit(1); }

const seedArg = process.argv.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1]) : undefined;
const multiSeed = process.argv.includes('--multi-seed');

// ─── Load test data ─────────────────────────────────────────────

const dataPath = path.join(__dirname, 'hank-green-test-data.json');
const testData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const { words, stableKeepRanges, wordCount } = testData;

console.log(`Loaded: ${wordCount} words, ${stableKeepRanges.length} stable keep-ranges (${testData.stableKeptWords} words kept)\n`);

// ─── Build prompt (mirrors transcript-editor.ts buildPrompt) ────

function formatWords(words) {
  return words.map((w, i) => `${i}\t${w.word}\t${w.startMs}\t${w.endMs}`).join('\n');
}

function buildPrompt(wordList, wordCount, context) {
  const contextLine = context.contentType ? `Content type: ${context.contentType}` : '';

  return `<role>You are a professional video editor making a rough cut of raw footage. Be CONSERVATIVE — when unsure, KEEP the content.</role>
${contextLine ? `\n<context>${contextLine}</context>\n` : ''}
<task>
Read the full word-level transcript below. Identify ranges of word indices to KEEP in the final edit. Everything NOT covered by a keep-range will be cut.

First, scan the transcript for retake patterns — places where the speaker repeats the same words in immediate succession. Then produce keep-ranges that exclude only those retakes and the other patterns listed below.
</task>

<rules>
ONLY CUT these specific patterns:

1. IMMEDIATE RETAKES: the speaker says the SAME WORDS 2-3 times in a row trying to get the line right. Cut all prior attempts. Keep only the final complete attempt.
2. FALSE STARTS: speaker begins a sentence, abandons it within 1-4 words, and restarts with different words. Cut only the abandoned fragment.
3. PRODUCTION META: speaker talks directly about the recording process — mic checks, "let me restart", "cut that", "I'll edit this out". NOT topic meta-commentary or opinions about the subject matter.
4. DEAD AIR PREAMBLE: filler at the very start of the recording before actual content begins.

DO NOT CUT any of these:
- Different phrasings of the same idea — that is rhetoric/emphasis, NOT a retake
- The speaker returning to a topic after a digression — that is structure
- Imperfect but complete deliveries — a stumble mid-sentence is fine if the sentence finishes
- Asides, jokes, personality moments, reactions
- Transitions between topics
- Any content where you are not certain it is a retake

A RETAKE is ONLY when the same words appear multiple times in IMMEDIATE SUCCESSION. Two sentences about the same TOPIC using different words are NOT retakes — they are elaboration.
</rules>

<output_format>
JSON array of keep-ranges using word indices (inclusive on both sides):
[{"s": startIndex, "e": endIndex}, ...]
Ranges must be non-overlapping, sorted by "s". Every index from 0 to ${wordCount - 1} must be either inside a keep-range or intentionally excluded.
</output_format>

<transcript words="${wordCount}" format="index\\tword\\tstartMs\\tendMs">
${wordList}
</transcript>`;
}

// ─── Score against ground truth ─────────────────────────────────

function score(aiRanges, groundTruth, totalWords) {
  const aiSet = new Set();
  for (const r of aiRanges) for (let i = r.s; i <= r.e; i++) aiSet.add(i);

  const gtSet = new Set();
  for (const r of groundTruth) for (let i = r.s; i <= r.e; i++) gtSet.add(i);

  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < totalWords; i++) {
    const inAI = aiSet.has(i);
    const inGT = gtSet.has(i);
    if (inAI && inGT) tp++;
    else if (inAI && !inGT) fp++;
    else if (!inAI && inGT) fn++;
  }

  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = 2 * precision * recall / (precision + recall) || 0;
  const keptRatio = aiSet.size / totalWords;
  const gtRatio = gtSet.size / totalWords;

  return { precision, recall, f1, keptRatio, gtRatio, tp, fp, fn, aiKept: aiSet.size, gtKept: gtSet.size };
}

function checkMeta(aiRanges, words) {
  const metaPatterns = [
    /\bcut that\b/i, /\bmy mic\b/i, /\bnote to editor/i, /\bI'll edit/i,
    /\bwanna cut/i, /\bI'll put this at the beginning/i, /\bwas me editing/i,
    /\bediting challenge\b/i, /\btalking to you on a camera\b/i,
    /\byou're gonna edit it\b/i, /\bwhole process of me making\b/i,
    /\bthis is the middle\b/i, /\bdecided to edit this\b/i,
  ];

  let metaKept = 0;
  for (const r of aiRanges) {
    const text = words.slice(r.s, r.e + 1).map(w => w.word).join(' ');
    for (const pat of metaPatterns) {
      if (pat.test(text)) { metaKept++; break; }
    }
  }
  return metaKept;
}

// ─── Run Gemini ─────────────────────────────────────────────────

async function runOnce(seedVal) {
  const genai = new GoogleGenerativeAI(API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });

  const wordList = formatWords(words);
  const prompt = buildPrompt(wordList, wordCount, { contentType: testData.contentType });

  const config = {
    responseMimeType: 'application/json',
    temperature: 0.0,
  };
  if (seedVal !== undefined) config.seed = seedVal;

  const start = Date.now();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: config,
  });
  const elapsed = Date.now() - start;

  const text = result.response.text();
  const ranges = JSON.parse(text);

  if (!Array.isArray(ranges)) throw new Error('Not an array');

  const sorted = ranges.sort((a, b) => a.s - b.s);
  const scores = score(sorted, stableKeepRanges, wordCount);
  const metaKept = checkMeta(sorted, words);

  return { seed: seedVal, ranges: sorted, scores, metaKept, elapsed };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (multiSeed) {
    console.log('Running seeds 1-10...\n');
    console.log('Seed | F1    | Prec  | Recall | Kept% | Meta | Ranges | Time');
    console.log('-----|-------|-------|--------|-------|------|--------|------');

    for (let s = 1; s <= 10; s++) {
      try {
        const r = await runOnce(s);
        console.log(
          `  ${String(s).padStart(2)} | ${r.scores.f1.toFixed(3)} | ${r.scores.precision.toFixed(3)} | ${r.scores.recall.toFixed(3)}  | ${(r.scores.keptRatio*100).toFixed(1)}% | ${String(r.metaKept).padStart(4)} | ${String(r.ranges.length).padStart(6)} | ${(r.elapsed/1000).toFixed(0)}s`
        );
      } catch (err) {
        console.log(`  ${String(s).padStart(2)} | ERROR: ${err.message}`);
      }
    }
  } else {
    const seedVal = seed ?? 42;
    console.log(`Running with seed=${seedVal}...\n`);

    const r = await runOnce(seedVal);

    console.log('=== RESULTS ===');
    console.log(`Seed:      ${r.seed}`);
    console.log(`Ranges:    ${r.ranges.length} keep-ranges`);
    console.log(`Kept:      ${r.scores.aiKept}/${wordCount} words (${(r.scores.keptRatio*100).toFixed(1)}%)`);
    console.log(`Stable:    ${r.scores.gtKept}/${wordCount} words (${(r.scores.gtRatio*100).toFixed(1)}%)`);
    console.log(`F1:        ${r.scores.f1.toFixed(4)}`);
    console.log(`Precision: ${r.scores.precision.toFixed(4)} (AI-kept words that match stable)`);
    console.log(`Recall:    ${r.scores.recall.toFixed(4)} (stable words that AI kept)`);
    console.log(`Meta kept: ${r.metaKept} ranges contain production meta`);
    console.log(`Time:      ${(r.elapsed/1000).toFixed(1)}s`);
    console.log(`\nTP=${r.scores.tp} FP=${r.scores.fp} FN=${r.scores.fn}`);

    if (r.scores.f1 >= 0.90) console.log('\n✅ EXCELLENT — F1 >= 0.90');
    else if (r.scores.f1 >= 0.80) console.log('\n🟡 GOOD — F1 >= 0.80');
    else console.log('\n🔴 NEEDS WORK — F1 < 0.80');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
