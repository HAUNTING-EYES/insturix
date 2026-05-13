/**
 * Synthetic Eval Data Generator
 *
 * Takes a CLEAN transcript (word array with timestamps) and injects
 * disfluencies (retakes, false starts, meta-commentary) at random positions.
 * The original word positions become the ground truth keep-ranges.
 *
 * Usage:
 *   node scripts/prompt-optimization/generate-eval-data.mjs
 *     --input hank-green-test-data.json
 *     --levels light,medium,heavy
 *     --output eval-dataset.json
 *
 * Or generate from the cached test data:
 *   node scripts/prompt-optimization/generate-eval-data.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Injection Config ───────────────────────────────────────────

const INJECTION_LEVELS = {
  light:  { retakes: 5,  falseStarts: 3,  meta: 2,  preamble: false },
  medium: { retakes: 15, falseStarts: 8,  meta: 5,  preamble: true  },
  heavy:  { retakes: 30, falseStarts: 15, meta: 10, preamble: true  },
};

const META_PHRASES = [
  'Is my mic on? Let me check.',
  'Okay let me restart.',
  'Cut that.',
  "I don't like that sentence. That's not good.",
  "I'm gonna cut that. I'm just communicating with the editor.",
  'Wait, hold on.',
  "That wasn't right, let me try again.",
  "Note to editors, not for inclusion in the video.",
  "I'll edit this out later.",
  "Sorry, one more time.",
  "Okay where was I.",
  "Let me back up.",
  "Actually no, scratch that.",
  "Is the camera still rolling?",
  "I need to look at my notes real quick.",
];

const PREAMBLE_PHRASES = [
  'Um okay so uh alright.',
  'Okay. Um. So. Right.',
  'Alright alright alright let me think.',
  'So um yeah okay let me start.',
  'Uh hi okay so um.',
];

// ─── Seeded Random ──────────────────────────────────────────────

class SeededRandom {
  constructor(seed) { this.state = seed; }
  next() {
    this.state = (this.state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (this.state >>> 0) / 0xFFFFFFFF;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

// ─── Injection Functions ────────────────────────────────────────

function makeWord(text, startMs, endMs) {
  return { word: text, startMs, endMs, confidence: 0.90, speaker: 0 };
}

function injectRetakes(words, count, rng) {
  const injected = [...words];
  const positions = [];

  for (let attempt = 0; attempt < count * 3 && positions.length < count; attempt++) {
    const phraseLen = rng.int(2, 5);
    const pos = rng.int(10, injected.length - phraseLen - 10);
    if (positions.some(p => Math.abs(p - pos) < 15)) continue;

    const phrase = injected.slice(pos, pos + phraseLen);
    const repeats = rng.int(1, 2);
    const insertWords = [];

    for (let r = 0; r < repeats; r++) {
      const partial = rng.next() > 0.5;
      const takeLen = partial ? rng.int(1, phraseLen - 1) : phraseLen;
      for (let w = 0; w < takeLen; w++) {
        const orig = phrase[w];
        const gap = 80 + rng.int(0, 100);
        insertWords.push(makeWord(
          orig.word + (partial && w === takeLen - 1 ? '-' : ''),
          orig.startMs - (repeats - r) * 2000 + w * 300,
          orig.startMs - (repeats - r) * 2000 + w * 300 + 200,
        ));
      }
    }

    injected.splice(pos, 0, ...insertWords);
    positions.push(pos);
  }

  return injected;
}

function injectFalseStarts(words, count, rng) {
  const injected = [...words];
  const positions = [];

  for (let attempt = 0; attempt < count * 3 && positions.length < count; attempt++) {
    const pos = rng.int(10, injected.length - 10);
    if (positions.some(p => Math.abs(p - pos) < 10)) continue;

    const fragLen = rng.int(1, 3);
    const fragment = [];
    for (let w = 0; w < fragLen; w++) {
      const ref = injected[Math.min(pos + w, injected.length - 1)];
      fragment.push(makeWord(
        (w === fragLen - 1 ? ref.word.slice(0, rng.int(2, 4)) + '-' : ref.word),
        ref.startMs - 1500 + w * 300,
        ref.startMs - 1500 + w * 300 + 200,
      ));
    }

    injected.splice(pos, 0, ...fragment);
    positions.push(pos);
  }

  return injected;
}

function injectMeta(words, count, rng) {
  const injected = [...words];
  const positions = [];

  const sentenceEnds = [];
  for (let i = 0; i < injected.length; i++) {
    if (/[.!?]$/.test(injected[i].word)) sentenceEnds.push(i);
  }

  const shuffled = rng.shuffle(sentenceEnds);

  for (let k = 0; k < Math.min(count, shuffled.length); k++) {
    const insertPos = shuffled[k] + 1 + k * 5;
    if (insertPos >= injected.length) continue;

    const phrase = rng.pick(META_PHRASES);
    const ref = injected[Math.min(insertPos, injected.length - 1)];
    const metaWords = phrase.split(/\s+/).map((w, i) => makeWord(
      w,
      ref.startMs - 3000 + i * 350,
      ref.startMs - 3000 + i * 350 + 250,
    ));

    injected.splice(insertPos, 0, ...metaWords);
    positions.push(insertPos);
  }

  return injected;
}

function injectPreamble(words, rng) {
  const phrase = rng.pick(PREAMBLE_PHRASES);
  const preambleWords = phrase.split(/\s+/).map((w, i) => makeWord(
    w,
    i * 400,
    i * 400 + 300,
  ));
  return [...preambleWords, ...words];
}

// ─── Build Ground Truth ─────────────────────────────────────────

function buildGroundTruth(_originalWords, injectedWords) {
  const keepIndices = [];
  for (let i = 0; i < injectedWords.length; i++) {
    if (injectedWords[i]._isOriginal) keepIndices.push(i);
  }

  const ranges = [];
  let start = null;
  for (let i = 0; i < keepIndices.length; i++) {
    if (start === null) start = keepIndices[i];
    if (i === keepIndices.length - 1 || keepIndices[i + 1] !== keepIndices[i] + 1) {
      ranges.push({ s: start, e: keepIndices[i] });
      start = null;
    }
  }

  return ranges;
}

// ─── Reassign Timestamps ────────────────────────────────────────

function fixTimestamps(words) {
  const fixed = [...words];
  for (let i = 1; i < fixed.length; i++) {
    if (fixed[i].startMs <= fixed[i - 1].endMs) {
      fixed[i] = { ...fixed[i], startMs: fixed[i - 1].endMs + 50, endMs: fixed[i - 1].endMs + 250 };
    }
  }
  return fixed;
}

// ─── Main ───────────────────────────────────────────────────────

function generateEvalCase(originalWords, level, caseSeed) {
  const config = INJECTION_LEVELS[level];
  const rng = new SeededRandom(caseSeed);

  let injected = originalWords.map(w => ({ ...w, _isOriginal: true }));

  if (config.preamble) {
    injected = injectPreamble(injected, rng);
  }
  injected = injectRetakes(injected, config.retakes, rng);
  injected = injectFalseStarts(injected, config.falseStarts, rng);
  injected = injectMeta(injected, config.meta, rng);

  injected = fixTimestamps(injected);

  const groundTruthKeepRanges = buildGroundTruth(originalWords, injected);

  const keptWords = groundTruthKeepRanges.reduce((s, r) => s + (r.e - r.s + 1), 0);

  return {
    level,
    seed: caseSeed,
    originalWordCount: originalWords.length,
    injectedWordCount: injected.length,
    injectedWords: injected,
    groundTruthKeepRanges,
    keptWordCount: keptWords,
    keptRatio: keptWords / injected.length,
    injections: {
      retakes: config.retakes,
      falseStarts: config.falseStarts,
      meta: config.meta,
      preamble: config.preamble,
    },
  };
}

// ─── YouTube JSON3 Parser ───────────────────────────────────────

function parseYouTubeJson3(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const events = data.events || [];
  const words = [];

  for (const event of events) {
    if (!event.segs) continue;
    const baseMs = event.tStartMs || 0;

    for (const seg of event.segs) {
      const text = (seg.utf8 || '').trim();
      if (!text || text === '\n') continue;

      const startMs = baseMs + (seg.tOffsetMs || 0);
      const wordDurMs = Math.max(100, text.length * 60);

      words.push({
        word: text,
        startMs,
        endMs: startMs + wordDurMs,
        confidence: 0.95,
        speaker: 0,
      });
    }
  }

  // Fix overlapping timestamps
  for (let i = 1; i < words.length; i++) {
    if (words[i].startMs <= words[i - 1].endMs) {
      words[i - 1].endMs = words[i].startMs - 10;
    }
  }

  return words;
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const useYouTube = process.argv.includes('--youtube');
  const levelsArg = process.argv.find(a => a.startsWith('--levels='));
  const levels = levelsArg ? levelsArg.split('=')[1].split(',') : ['light', 'medium', 'heavy'];

  const outputArg = process.argv.find(a => a.startsWith('--output='));
  const outputPath = outputArg
    ? path.resolve(outputArg.split('=')[1])
    : path.join(__dirname, 'eval-dataset.json');

  const dataset = [];
  let caseId = 0;

  if (useYouTube) {
    // Use clean YouTube transcripts as source
    const ytDir = path.join(__dirname, 'yt-transcripts');
    const files = fs.readdirSync(ytDir).filter(f => f.endsWith('.json3'));
    console.log(`Found ${files.length} YouTube transcripts\n`);

    for (const file of files) {
      const name = file.replace('.en.json3', '');
      const words = parseYouTubeJson3(path.join(ytDir, file));
      console.log(`${name}: ${words.length} words`);

      if (words.length < 100) { console.log('  SKIPPED (too short)\n'); continue; }

      // Cap at 3000 words to keep Gemini call reasonable
      const capped = words.slice(0, 3000);

      for (const level of levels) {
        const caseSeed = caseId * 7919 + 31337;
        const evalCase = generateEvalCase(capped, level, caseSeed);
        dataset.push({ id: `${name}-${level}`, ...evalCase });

        console.log(
          `  [${level}] ${evalCase.originalWordCount} → ${evalCase.injectedWordCount} (+${evalCase.injectedWordCount - evalCase.originalWordCount}), ` +
          `${evalCase.groundTruthKeepRanges.length} ranges, kept=${(evalCase.keptRatio * 100).toFixed(1)}%`
        );
        caseId++;
      }
      console.log('');
    }
  } else {
    // Use Hank Green test data (original behavior)
    const inputPath = path.join(__dirname, 'hank-green-test-data.json');
    console.log(`Input: ${inputPath}`);
    const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const originalWords = inputData.words;
    console.log(`Original: ${originalWords.length} words\n`);

    for (const level of levels) {
      for (let variant = 0; variant < 3; variant++) {
        const caseSeed = caseId * 7919 + 31337;
        const evalCase = generateEvalCase(originalWords, level, caseSeed);
        dataset.push({ id: `hank-green-${level}-v${variant}`, ...evalCase });
        console.log(
          `[${level}] v${variant}: ${evalCase.originalWordCount} → ${evalCase.injectedWordCount} (+${evalCase.injectedWordCount - evalCase.originalWordCount}), ` +
          `${evalCase.groundTruthKeepRanges.length} ranges, kept=${(evalCase.keptRatio * 100).toFixed(1)}%`
        );
        caseId++;
      }
    }
  }

  // Save metadata
  const metaDataset = dataset.map(d => ({
    id: d.id, level: d.level, seed: d.seed,
    originalWordCount: d.originalWordCount,
    injectedWordCount: d.injectedWordCount,
    groundTruthKeepRanges: d.groundTruthKeepRanges,
    keptWordCount: d.keptWordCount,
    keptRatio: d.keptRatio,
    injections: d.injections,
  }));
  fs.writeFileSync(outputPath, JSON.stringify(metaDataset, null, 2));

  // Save full word arrays (needed by eval harness)
  const fullPath = outputPath.replace('.json', '-full.json');
  fs.writeFileSync(fullPath, JSON.stringify(dataset));

  console.log(`\nSaved ${dataset.length} eval cases to ${outputPath}`);
  console.log(`Saved full dataset to ${fullPath}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Total cases: ${dataset.length}`);
  for (const level of levels) {
    const cases = dataset.filter(d => d.level === level);
    if (cases.length === 0) continue;
    const avgInjected = cases.reduce((s, d) => s + (d.injectedWordCount - d.originalWordCount), 0) / cases.length;
    const avgKept = cases.reduce((s, d) => s + d.keptRatio, 0) / cases.length;
    console.log(`  ${level}: ${cases.length} cases, +${avgInjected.toFixed(0)} words avg, kept=${(avgKept*100).toFixed(1)}%`);
  }
}

main();
