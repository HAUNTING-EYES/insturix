/**
 * Local eval harness for the ThinkForge ScriptAuthorAgent prompt.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-thinkforge-author.mjs
 *   GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-thinkforge-author.mjs --seed=42
 *   GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-thinkforge-author.mjs --multi-seed
 *   GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-thinkforge-author.mjs --test-case=1
 *
 * Builds the EXACT prompt that buildPrompt() would produce, sends to Gemini,
 * scores the output against structural and quality criteria.
 *
 * ~30s per run vs 5+ min deploy cycle. Rule 35 methodology.
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
  console.error('No GEMINI_API_KEY. Set in .env.local or pass via: GEMINI_API_KEY=xxx node ...');
  process.exit(1);
}

const seedArg = process.argv.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1]) : 42;
const multiSeed = process.argv.includes('--multi-seed');
const testCaseArg = process.argv.find(a => a.startsWith('--test-case='));
const testCaseFilter = testCaseArg ? parseInt(testCaseArg.split('=')[1]) : null;


// ─── Test Cases ─────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: 1,
    name: 'TikTok product ad (30s)',
    type: 'video_script',
    projectSummary: 'Insturix - AI-powered video editing platform that turns raw footage into polished content in minutes.',
    userPrompt: 'Create a 30-second TikTok product ad showing how Insturix saves time for freelance video editors.',
    expectedFormat: 'video',
    criteria: {
      hasMusicDirection: true,
      hasTimingBrackets: true,
      minScenes: 3,
      maxScenes: 6,
      elementsPerScene: ['VO', 'Visual', 'Audio', 'Text', 'Mood', 'Transition'],
      visualsAreActions: true,
      noAiFiller: true,
      hasSpecificDetails: true,
    },
  },
  {
    id: 2,
    name: 'LinkedIn post',
    type: 'post',
    projectSummary: 'Insturix - AI-powered video editing platform for creators and agencies.',
    userPrompt: 'Write a LinkedIn post about how AI is changing video production workflows for small agencies.',
    expectedFormat: 'post',
    criteria: {
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      hasHashtags: true,
      charRange: [800, 2500],
      noAiFiller: true,
      hasSpecificDetails: true,
      hookBeforeFold: true,
    },
  },
  {
    id: 3,
    name: 'Brand film (2 min)',
    type: 'video_script',
    projectSummary: 'Oakridge Coffee Co. — craft roaster, farm-to-cup, Huila region Colombia.',
    userPrompt: 'Write a 2-minute brand film script for Oakridge Coffee. Warm, unhurried, Terrence Malick meets food photography.',
    expectedFormat: 'video',
    criteria: {
      hasMusicDirection: true,
      hasTimingBrackets: true,
      minScenes: 5,
      maxScenes: 10,
      elementsPerScene: ['VO', 'Visual', 'Audio', 'Mood', 'Transition'],
      visualsAreActions: true,
      noAiFiller: true,
      hasSpecificDetails: true,
      hasMoodReferences: true,
    },
  },
  {
    id: 4,
    name: 'Talking head video',
    type: 'video_script',
    projectSummary: 'Personal brand - solo content creator making YouTube videos about productivity.',
    userPrompt: 'Write a talking head video script about the 3 biggest time-wasters in remote work. Direct to camera, conversational.',
    expectedFormat: 'video',
    criteria: {
      hasTimingBrackets: true,
      minScenes: 3,
      maxScenes: 8,
      hasOnCameraLabel: true,
      noAiFiller: true,
      hasSpecificDetails: true,
    },
  },
];


// ─── Build Prompt (mirrors script-author-agent.ts buildPrompt) ──

function loadWritingKnowledge() {
  const jsonPath = path.join(__dirname, '../../lib/thinkforge/data/writing-knowledge.json');
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    console.warn('Could not load writing-knowledge.json — running without technique injection');
    return null;
  }
}

function selectTechniques(data, signals, category, max = 2) {
  if (!data) return [];
  const candidates = data.techniques.filter(t => t.category === category);
  const scored = [];
  for (const tech of candidates) {
    let score = 0, inhibited = false;
    for (const inh of tech.inhibitors || []) {
      const v = signals[inh.signal];
      if (typeof v === 'number' && v > inh.threshold) { inhibited = true; break; }
    }
    if (inhibited) continue;
    for (const cond of tech.activation || []) {
      const v = signals[cond.signal];
      if (cond.value !== undefined) score += v === cond.value ? cond.weight : 0;
      else if (cond.min !== undefined && typeof v === 'number') {
        if (v >= cond.min && v <= cond.max) score += cond.weight * v;
        else score -= cond.weight * 0.5;
      }
    }
    if (score > 0) scored.push({ ...tech, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

function buildWritingKnowledgeBlock(data, signals) {
  if (!data) return '';
  const categories = ['hook', 'structure', 'cta', 'narration_mode', 'transition', 'informational_surprise'];
  const lines = ['<writing_knowledge>'];
  for (const cat of categories) {
    const techs = selectTechniques(data, signals, cat, 2);
    const top = techs[0];
    if (!top) continue;
    lines.push(`${cat.toUpperCase()}: ${top.id}`);
    if (top.primary) lines.push(`  DO: ${top.primary}`);
    if (top.example) lines.push(`  EXAMPLE: ${top.example}`);
    if (top.why) lines.push(`  WHY: ${top.why}`);
    if (top.antiPatterns?.length) lines.push(`  NEVER: ${top.antiPatterns.join(' | ')}`);
  }
  lines.push('');
  lines.push('QUALITY: Be SPECIFIC (not "saves time" but "cuts 3-hour edits to 12 min"). Vary sentence rhythm. No AI filler.');
  lines.push('</writing_knowledge>');
  return lines.join('\n');
}

const VIDEO_SIGNALS = {
  logos_load: 0.3, pathos_load: 0.6, ethos_load: 0.5, kairos_pressure: 0.6,
  elaboration_demand: 0.4, novelty: 0.5,
  visceral_impact: 0.5, behavioral_utility: 0.5, narrative_transportation: 0.5,
  emotional_valence: 0.4, emotional_arousal: 0.6, assumed_expertise: 0.3,
  pacing_velocity: 0.7, tension_arc: 0.5,
  formality: -0.2, humor: 0.2, enthusiasm: 0.6, warmth: 0.4, certainty: 0.6,
  visual_dependency: 0.7, show_tell_ratio: 0.6, specificity_grain: 0.6,
  rhythmic_variation: 0.5, negative_space: 0.3,
};

const POST_SIGNALS = {
  visual_dependency: 0.0, show_tell_ratio: 0.0, formality: 0.2,
  pacing_velocity: 0.6, kairos_pressure: 0.5, humor: 0.3,
  enthusiasm: 0.6, specificity_grain: 0.6, behavioral_utility: 0.6,
};

function buildPrompt(tc) {
  const signals = tc.expectedFormat === 'video' ? VIDEO_SIGNALS : POST_SIGNALS;
  const data = loadWritingKnowledge();
  const writingBlock = buildWritingKnowledgeBlock(data, signals);

  const isVideo = tc.expectedFormat === 'video';
  const isPost = tc.expectedFormat === 'post';

  const sectionGuidance = isVideo
    ? `- This is a VIDEO SCRIPT. Follow the <output_format> block EXACTLY for per-scene structure.
- Think like a director: for every line of narration, ask "what do I SHOW while these words are spoken?"
- Each scene = one distinct visual moment. Two visuals = two scenes.
- The VO text IS the product. Visual direction SERVES the narration.
- Be SPECIFIC. Not "a person looks worried" but "freelancer stares at phone, jaw tight, laptop light on face."`
    : `- Write the FINAL copy. Not a script. Not production notes.
- No scene headings. No Visual/Narration labels. This is TEXT content.`;

  const outputFormat = isVideo
    ? `<output_format>
Return Markdown only. No JSON. No block IDs.

STEP 1 — Estimate total duration from the brief. Divide into 3-6 scenes with timing.
STEP 2 — Write the Music Direction section.
STEP 3 — For EACH scene, write ALL 7 labeled elements. Check: do I have spoken words, visual, audio, text, mood, transition? If any is missing, add it before moving to the next scene.

MUSIC DIRECTION — Write this FIRST, before any scenes:
  ## Music Direction
  **Style:** genre + mood + 1-2 reference tracks (real songs/artists)
  **Tempo:** BPM range or feel
  **Arc:** where it builds, where it drops, where it is ABSENT (silence is a choice)

SCENE HEADING FORMAT (mandatory — no exceptions):
  ## [0:00-0:08] Scene 1: The Hook
  The [start-end] timing bracket is REQUIRED on every scene heading.

PER-SCENE ELEMENTS (all 7 required on every scene, each on its own bold-labeled line):

  1. SPOKEN WORDS — choose the right label PER SCENE:
     **VO (delivery note):** voiceover over footage. e.g., "VO (dry, measured):"
     **On-Camera (delivery note):** someone speaking to camera. e.g., "On-Camera (casual, direct):"
     **Text Overlay:** no spoken words — visuals + text carry the message.
     A single video can MIX these across scenes.
  2. **Visual:** camera ACTION + shot type. NOT feelings — ACTIONS. "stares at phone, jaw tight" not "looks worried."
  3. **Audio:** sound design — room tone, SFX, silence, OR music modulation. Silence is valid.
  4. **Text:** on-screen text OR "[none — the image carries it]"
  5. **Mood:** one film/scene reference. "Think Whiplash opening." Removes ambiguity adjectives cannot.
  6. **Transition:** hard cut | dissolve | hold on black 0.5s | match cut to [what]. VARY these.

BANNED PHRASES (never use, zero tolerance):
  "let's dive in", "game-changer", "cutting-edge", "seamless", "robust", "innovative",
  "leverage", "unlock", "empower", "in today's fast-paced world", "at the end of the day",
  "it's important to note", "work its magic", "circle back", "take it to the next level"

SPECIFICITY: Not "a workspace" but "MacBook with 14 Chrome tabs, cold coffee, 2am."

VERIFY BEFORE OUTPUT: Does every scene have ## [time] heading + all 7 labeled elements? If not, fix it now.
</output_format>`
    : `<output_format>
Write the ACTUAL publishable text. Not a brief. Not production notes. Not an outline ABOUT the content. The FINAL COPY.

PLATFORM FORMAT:
  - Target: 1,300-1,900 characters (LinkedIn optimal). Max 3,000.
  - First line must hook BEFORE the fold (~210 chars visible).
  - Short paragraphs. One-liners for punch. Line breaks for rhythm.
  - End with: engagement CTA (question or repost prompt) + 3-5 hashtags.
  - NO section headings (##). This is a post, not a document.
  - NO production notes, visual direction, or "Scene" labels.

RULES:
  - Sound like a specific human with a point of view, not a brand voice generator.
  - Every paragraph must earn its place. If you can delete it and nothing is lost, delete it.
  - Be SPECIFIC. Not "many companies struggle" but "your onboarding takes 3 weeks and costs $4,200 per hire."
</output_format>`;

  return `${writingBlock}

<role>
You are a Senior Creative Director and ${isVideo ? 'Video Scriptwriter' : 'Copywriter'}.
You create documents that tell another professional exactly what to do or make.
Your job is not to write essays. Your job is to translate ideas into clear, executable direction.
</role>

<task>
Project: ${tc.projectSummary}
User request: ${tc.userPrompt}
</task>

<rules>
- Do NOT start with an H1 title heading — the system renders the title separately. Begin directly with the content.
${sectionGuidance}
</rules>

${outputFormat}`;
}


// ─── Scoring ────────────────────────────────────────────────────

const AI_FILLER = [
  /in today'?s fast[- ]paced/i, /it'?s important to note/i, /let'?s dive in/i,
  /at the end of the day/i, /game[- ]?changer/i, /\bleverage\b/i, /\bunlock\b/i,
  /\bempower\b/i, /cutting[- ]?edge/i, /\bseamless\b/i, /\brobust\b/i,
  /\binnovative\b/i, /\bsynergy\b/i, /circle back/i, /work its magic/i,
  /\bdelve\b/i, /\bcomprehensive\b/i, /\bnuanced\b/i, /\bpivotal\b/i,
  /\blandscape\b/i, /\btapestry\b/i, /\bfoster\b/i, /\bshowcase\b/i,
  /\bfundamental\b/i, /\binterplay\b/i, /furthermore/i, /moreover/i,
];

function scoreOutput(output, tc) {
  const checks = {};
  let passed = 0;
  let total = 0;

  function check(name, condition) {
    total++;
    checks[name] = condition;
    if (condition) passed++;
  }

  const c = tc.criteria;
  const lines = output.split('\n');
  const text = output.toLowerCase();

  // ─── Video-specific checks ──────────────────────────────────
  if (tc.expectedFormat === 'video') {
    if (c.hasMusicDirection) {
      check('music_direction', /##\s*music\s*direction/i.test(output));
    }
    if (c.hasTimingBrackets) {
      const timingMatches = output.match(/##\s*\[\d+:\d+/g);
      check('timing_brackets', timingMatches && timingMatches.length >= (c.minScenes || 3));
    }

    const sceneHeaders = output.match(/##\s*\[?\d/g) || output.match(/##\s*scene\s*\d/gi) || [];
    if (c.minScenes) check('min_scenes', sceneHeaders.length >= c.minScenes);
    if (c.maxScenes) check('max_scenes', sceneHeaders.length <= c.maxScenes);

    if (c.elementsPerScene) {
      for (const el of c.elementsPerScene) {
        const re = new RegExp(`\\*\\*${el}[^*]*\\*\\*`, 'gi');
        const matches = output.match(re) || [];
        check(`element_${el.toLowerCase()}`, matches.length >= 1);
      }
    }

    if (c.visualsAreActions) {
      const visualLines = lines.filter(l => /\*\*Visual/i.test(l));
      const feelingWords = /\b(feels?|looks?|seems?|appears?)\s+(worried|happy|sad|anxious|overwhelmed|excited)\b/i;
      const hasFeeling = visualLines.some(l => feelingWords.test(l));
      check('visuals_are_actions', !hasFeeling);
    }

    if (c.hasMoodReferences) {
      const moodLines = lines.filter(l => /\*\*Mood/i.test(l));
      check('mood_references', moodLines.length >= 2);
    }

    if (c.hasOnCameraLabel) {
      check('has_on_camera', /\*\*On-Camera/i.test(output));
    }
  }

  // ─── Post-specific checks ───────────────────────────────────
  if (tc.expectedFormat === 'post') {
    if (c.noSceneHeadings) {
      check('no_scene_headings', !/##\s*scene\s*\d/i.test(output));
    }
    if (c.noVisualLabels) {
      check('no_visual_labels', !/\*\*Visual/i.test(output));
    }
    if (c.noVOLabels) {
      check('no_vo_labels', !/\*\*VO\b/i.test(output) && !/\*\*Narration/i.test(output));
    }
    if (c.hasHashtags) {
      check('has_hashtags', /#\w+/i.test(output));
    }
    if (c.charRange) {
      const len = output.length;
      check('char_range', len >= c.charRange[0] && len <= c.charRange[1]);
    }
    if (c.hookBeforeFold) {
      const firstLine = output.split('\n').find(l => l.trim().length > 0) || '';
      check('hook_before_fold', firstLine.length > 10 && firstLine.length < 250);
    }
  }

  // ─── Universal checks ──────────────────────────────────────
  if (c.noAiFiller) {
    const fillerFound = AI_FILLER.filter(p => p.test(output));
    check('no_ai_filler', fillerFound.length === 0);
    if (fillerFound.length > 0) {
      checks.filler_details = fillerFound.map(p => p.source).join(', ');
    }
  }

  if (c.hasSpecificDetails) {
    const hasNumbers = /\d+\s*(second|minute|hour|day|week|%|dollar|\$|x\b)/i.test(output);
    const hasNames = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(output) || /\b(MacBook|Chrome|Slack|iPhone)\b/.test(output);
    check('has_specific_details', hasNumbers || hasNames);
  }

  check('no_h1_title', !output.startsWith('# '));

  return { passed, total, ratio: passed / total, checks };
}


// ─── Run Gemini ─────────────────────────────────────────────────

async function runOnce(tc, seedVal) {
  const genai = new GoogleGenerativeAI(API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = buildPrompt(tc);

  const config = {
    temperature: 0.7,
    maxOutputTokens: 4096,
  };
  if (seedVal !== undefined) config.seed = seedVal;

  const start = Date.now();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: config,
  });
  const elapsed = Date.now() - start;

  const output = result.response.text();
  const scores = scoreOutput(output, tc);

  return { seed: seedVal, output, scores, elapsed };
}


// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const cases = testCaseFilter
    ? TEST_CASES.filter(tc => tc.id === testCaseFilter)
    : TEST_CASES;

  if (cases.length === 0) {
    console.error(`No test case with id=${testCaseFilter}`);
    process.exit(1);
  }

  const seeds = multiSeed ? [1, 2, 3, 5, 8, 13, 21, 34, 42, 55] : [seed];

  for (const tc of cases) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TEST ${tc.id}: ${tc.name} (${tc.type})`);
    console.log(`${'═'.repeat(70)}`);

    const results = [];

    for (const s of seeds) {
      process.stdout.write(`  seed=${s}... `);
      try {
        const r = await runOnce(tc, s);
        results.push(r);

        const pct = (r.scores.ratio * 100).toFixed(0);
        const failedChecks = Object.entries(r.scores.checks)
          .filter(([_, v]) => v === false)
          .map(([k]) => k);

        console.log(`${pct}% (${r.scores.passed}/${r.scores.total}) ${r.elapsed}ms${failedChecks.length > 0 ? ' FAILED: ' + failedChecks.join(', ') : ' ✓'}`);

        if (!multiSeed) {
          console.log(`\n--- OUTPUT (first 1500 chars) ---\n${r.output.substring(0, 1500)}\n--- END ---`);
          if (r.scores.checks.filler_details) {
            console.log(`  AI FILLER FOUND: ${r.scores.checks.filler_details}`);
          }
        }
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        results.push({ seed: s, error: e.message });
      }
    }

    if (multiSeed && results.length > 1) {
      const validResults = results.filter(r => !r.error);
      if (validResults.length > 0) {
        const scores = validResults.map(r => r.scores.ratio);
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

        console.log(`\n  MULTI-SEED SUMMARY:`);
        console.log(`    Min: ${(min * 100).toFixed(0)}%  Max: ${(max * 100).toFixed(0)}%  Avg: ${(avg * 100).toFixed(0)}%`);
        console.log(`    Variance: ${((max - min) * 100).toFixed(0)}pp`);

        if (min < 0.70) console.log(`    ⚠️  Min score below 70% — prompt needs work`);
        else if (min < 0.85) console.log(`    ⚠️  Min score below 85% — prompt is fragile`);
        else console.log(`    ✅ Min score above 85% — prompt is robust`);

        const failFreq = {};
        for (const r of validResults) {
          for (const [k, v] of Object.entries(r.scores.checks)) {
            if (v === false) failFreq[k] = (failFreq[k] || 0) + 1;
          }
        }
        if (Object.keys(failFreq).length > 0) {
          console.log(`    Most common failures:`);
          for (const [k, count] of Object.entries(failFreq).sort((a, b) => b[1] - a[1])) {
            console.log(`      ${k}: failed ${count}/${validResults.length} runs`);
          }
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
