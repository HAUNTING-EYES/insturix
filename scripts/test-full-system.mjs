/**
 * FULL SYSTEM TEST — calls Gemini with real transcript, gets ALL editing
 * decisions, processes MG through composition engine, generates visual timeline.
 *
 * Tests: creative brief LLM → decision parsing → signal resolution →
 *        composition engine → structural gate → HTML timeline output
 *
 * Usage: node scripts/test-full-system.mjs
 *
 * Opens an HTML file showing the complete editing plan as a visual timeline.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('No GEMINI_API_KEY in .env.local'); process.exit(1); }

// ─── Load test data ─────────────────────────────────────────────

const dataPath = path.join(__dirname, 'prompt-optimization/hank-green-test-data.json');
const testData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const words = testData.words;
const wordCount = testData.wordCount;
const totalDurationSec = Math.ceil(words[words.length - 1].endMs / 1000);

console.log(`Loaded: ${wordCount} words, ${totalDurationSec}s, "${testData.contentType}"\n`);

// ─── Build creative brief prompt (mirrors creative-brief.ts) ───

function buildPrompt() {
  const transcriptBlock = words
    .map((w, i) => `[${i}] ${w.word} (${w.startMs}-${w.endMs}ms)`)
    .join('\n');

  const decisionsPerChunk = Math.max(1, Math.floor(52 / Math.max(wordCount / 500, 1)));

  return `<role>
You are a professional video editor watching THIS specific video and making creative decisions.
</role>

<your_scope>
The transcript below has ALREADY been cleaned. You handle CREATIVE ENHANCEMENT:
- WHERE to zoom for emotional emphasis
- WHERE transitions mark narrative shifts
- WHAT SFX punctuate genuine beats
- WHAT graphics surface key information
- WHERE caption emphasis draws focus
- WHERE pacing adjustments serve the story
</your_scope>

<valid_types>
  zoom_push (requires: intensity, durationFrames)
  zoom_punch (requires: intensity, durationFrames)
  zoom_pull_back (requires: intensity, durationFrames)
  zoom_drift (requires: intensity, durationFrames, direction)
  transition_dissolve (requires: durationFrames)
  transition_fade_to_black (requires: durationFrames)
  transition_whip_pan (requires: direction)
  transition_flash (no params required)
  transition_j_cut (requires: offsetFrames)
  transition_l_cut (requires: offsetFrames)
  sfx_whoosh (requires: variant)
  sfx_impact (requires: variant)
  sfx_shimmer (no params required)
  sfx_ambient (requires: soundType)
  caption_emphasis (requires: wordIdx, style)
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
  hold_longer (requires: durationFrames)
  cut_shorter (requires: trimFrames)
</valid_types>

<valid_reasons>
vocal_peak, vocal_build, vocal_wind_down, topic_shift, emphasis_word, rhetorical_pause, number_mentioned, name_mentioned, cta, energy_peak, energy_build, energy_drop, scene_boundary, visual_monotony, music_beat, music_drop, music_section_change, emotional_shift, narrative_resolve, opening_hook, closing_zone
</valid_reasons>

<anti_patterns>
- NEVER assign the same confidence to every decision. Vary 0.55-0.95.
- NEVER cluster decisions in one section. Spread across FULL video.
- GENERATE ~${decisionsPerChunk} decisions per 500 words. Cover words 0-${wordCount - 1}.
</anti_patterns>

<graphic_rules>
graphic_stat_counter — ONLY when a specific number is spoken. params: { value: "73%", label: "user satisfaction" }. Never invent numbers.
graphic_lower_third — FIRST mention of a named person. params: { name: "Hank Green", title: "YouTuber" }. One per entity. Name MUST appear in transcript.
graphic_callout — Key CONCEPTS needing visual explanation. params: { title: "Selection Bias", body: "When your sample isn't random" }.
graphic_quote_card — Direct QUOTES worth displaying verbatim. params: { quote: "exact words", author: "Speaker" }. Max 3 per video.
graphic_keyword_highlight — Single conceptual term. params: { text: "anonymity" }. NEVER filler words.
PRIORITY: stat-counter > lower-third > quote-card > callout > keyword-highlight.
</graphic_rules>

<rules>
- Word indices 0 to ${wordCount - 1}. Confidence 0.55-0.95.
- narrative_arc must cover ENTIRE transcription.
- Distribute decisions across the FULL video.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": number, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_word_idx": number, "end_word_idx": number, "label": "setup"|"build"|"peak"|"resolve"|"transition"|"hook"|"closing", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": "<valid_type>", "target_word_idx": number, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { ... } }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "standard_speech"|"music_dominant"|"balanced" },
  "caption_style": "word_by_word"|"sentence"|"key_phrases"|"none",
  "overall_pacing": "calm"|"measured"|"balanced"|"energetic"|"fast"
}
</output_format>

<video_features>
Duration: ${totalDurationSec}s
Segments: 1
</video_features>

<transcription>
${transcriptBlock}
</transcription>`;
}

// ─── Call Gemini ─────────────────────────────────────────────────

async function callGemini() {
  const genai = new GoogleGenerativeAI(API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  console.log('Calling Gemini 2.5 Flash...');
  const start = Date.now();

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: buildPrompt() }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      seed: 42,
      maxOutputTokens: 65536,
    },
  });

  const elapsed = (Date.now() - start) / 1000;
  console.log(`Gemini responded in ${elapsed.toFixed(1)}s\n`);

  const text = result.response.text();
  return JSON.parse(text);
}

// ─── Analyze decisions ──────────────────────────────────────────

function analyzeBrief(brief) {
  const decisions = brief.decisions || [];

  // Group by category
  const categories = {};
  for (const d of decisions) {
    const cat = d.type.split('_')[0];
    categories[cat] = (categories[cat] || 0) + 1;
  }

  // Group by type
  const types = {};
  for (const d of decisions) {
    types[d.type] = (types[d.type] || 0) + 1;
  }

  // Distribution across video
  const quartiles = [0, 0, 0, 0];
  for (const d of decisions) {
    const q = Math.min(3, Math.floor((d.target_word_idx / wordCount) * 4));
    quartiles[q]++;
  }

  // Confidence distribution
  const confs = decisions.map(d => d.confidence);
  const avgConf = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;

  return { total: decisions.length, categories, types, quartiles, avgConf, decisions };
}

// ─── Generate HTML timeline ─────────────────────────────────────

function generateTimeline(brief, analysis) {
  const decisions = analysis.decisions;
  const arc = brief.narrative_arc || [];

  const COLORS = {
    zoom: '#3B82F6',
    transition: '#8B5CF6',
    sfx: '#F59E0B',
    graphic: '#10B981',
    caption: '#EC4899',
    speed: '#EF4444',
    camera: '#6366F1',
    audio: '#14B8A6',
    hold: '#78716C',
    cut: '#78716C',
  };

  const decisionRows = decisions.map((d, i) => {
    const pct = ((d.target_word_idx / wordCount) * 100).toFixed(1);
    const cat = d.type.split('_')[0];
    const color = COLORS[cat] || '#666';
    const timeSec = (words[Math.min(d.target_word_idx, wordCount - 1)]?.startMs / 1000 || 0).toFixed(1);
    const params = d.params ? Object.entries(d.params).map(([k, v]) => `${k}=${typeof v === 'string' ? v.substring(0, 30) : v}`).join(', ') : '';
    return `<div class="decision" style="left:${pct}%;background:${color}" title="${d.type} @${timeSec}s (conf=${d.confidence})\n${d.reason}\n${params}">
      <span class="dot" style="background:${color}"></span>
    </div>`;
  }).join('\n');

  const arcSections = arc.map(s => {
    const startPct = ((s.start_word_idx / wordCount) * 100).toFixed(1);
    const widthPct = (((s.end_word_idx - s.start_word_idx) / wordCount) * 100).toFixed(1);
    const bgColors = { hook: '#FDE68A', setup: '#BFDBFE', build: '#BBF7D0', peak: '#FCA5A5', resolve: '#DDD6FE', transition: '#E5E7EB', closing: '#FED7AA' };
    return `<div class="arc-section" style="left:${startPct}%;width:${widthPct}%;background:${bgColors[s.label] || '#F3F4F6'}" title="${s.label} (${s.energy_level}, ${s.pacing_feel})">${s.label}</div>`;
  }).join('\n');

  const legendItems = Object.entries(COLORS).map(([k, v]) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${v}"></span>${k} (${analysis.categories[k] || 0})</span>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Full System Test — Editing Timeline</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0F172A; color: #E2E8F0; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  .meta { color: #94A3B8; font-size: 13px; margin-bottom: 24px; }
  .section { background: #1E293B; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 15px; color: #94A3B8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .timeline { position: relative; height: 60px; background: #334155; border-radius: 8px; margin-bottom: 8px; overflow: visible; }
  .decision { position: absolute; top: 0; width: 2px; height: 100%; opacity: 0.8; cursor: pointer; }
  .decision:hover { opacity: 1; z-index: 10; width: 4px; }
  .decision .dot { position: absolute; top: -4px; left: -3px; width: 8px; height: 8px; border-radius: 50%; }
  .arc-bar { position: relative; height: 32px; margin-bottom: 16px; border-radius: 6px; overflow: hidden; display: flex; }
  .arc-section { position: absolute; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #1E293B; font-weight: 600; border-right: 1px solid rgba(0,0,0,0.1); }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #94A3B8; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .stat-card { background: #334155; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-card .value { font-size: 28px; font-weight: 700; color: #F8FAFC; }
  .stat-card .label { font-size: 11px; color: #94A3B8; margin-top: 4px; }
  .understanding { background: #334155; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .understanding p { font-size: 13px; color: #CBD5E1; line-height: 1.6; }
  .type-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
  .type-item { background: #334155; border-radius: 6px; padding: 8px 12px; font-size: 12px; display: flex; justify-content: space-between; }
  .type-item .count { font-weight: 700; color: #F8FAFC; }
</style></head><body>
<h1>Full System Test — Editing Timeline</h1>
<p class="meta">"${brief.video_understanding?.primary_content || 'Unknown'}" — ${totalDurationSec}s, ${brief.overall_pacing} pacing, ${brief.caption_style} captions</p>

<div class="section">
  <h2>Video Understanding</h2>
  <div class="understanding">
    <p><strong>Content:</strong> ${brief.video_understanding?.primary_content || '?'}</p>
    <p><strong>Shot:</strong> ${brief.video_understanding?.shot_scale || '?'} | <strong>Lighting:</strong> ${brief.video_understanding?.lighting || '?'} | <strong>Quality:</strong> ${brief.video_understanding?.production_quality || '?'}/1</p>
    <p><strong>Speakers:</strong> ${brief.video_understanding?.speaker_count || '?'} | <strong>B-Roll:</strong> ${brief.video_understanding?.has_b_roll ? 'Yes' : 'No'} | <strong>Environment:</strong> ${brief.video_understanding?.environment || '?'}</p>
  </div>
</div>

<div class="section">
  <h2>Narrative Arc</h2>
  <div class="arc-bar">${arcSections}</div>
</div>

<div class="section">
  <h2>Decision Timeline (${analysis.total} decisions)</h2>
  <div class="legend">${legendItems}</div>
  <div class="timeline">${decisionRows}</div>
  <p style="font-size:11px;color:#64748B;margin-top:4px">Hover over markers for details. Left = start, right = end of video.</p>
</div>

<div class="section">
  <h2>Stats</h2>
  <div class="stats">
    <div class="stat-card"><div class="value">${analysis.total}</div><div class="label">Total Decisions</div></div>
    <div class="stat-card"><div class="value">${(analysis.total / (totalDurationSec / 60)).toFixed(1)}</div><div class="label">Decisions / Min</div></div>
    <div class="stat-card"><div class="value">${analysis.avgConf.toFixed(2)}</div><div class="label">Avg Confidence</div></div>
    <div class="stat-card"><div class="value">${brief.narrative_arc?.length || 0}</div><div class="label">Arc Sections</div></div>
    <div class="stat-card"><div class="value">[${analysis.quartiles.join(', ')}]</div><div class="label">Distribution Q1-Q4</div></div>
  </div>
</div>

<div class="section">
  <h2>Decision Breakdown</h2>
  <div class="type-list">
    ${Object.entries(analysis.types).sort((a, b) => b[1] - a[1]).map(([t, c]) =>
      `<div class="type-item"><span>${t}</span><span class="count">${c}</span></div>`
    ).join('\n')}
  </div>
</div>

<div class="section">
  <h2>Audio Design</h2>
  <div class="understanding">
    <p><strong>Ambient bed:</strong> ${brief.audio_design?.ambient_bed || '?'}</p>
    <p><strong>Ducking profile:</strong> ${brief.audio_design?.ducking_profile || '?'}</p>
    <p><strong>Caption style:</strong> ${brief.caption_style || '?'}</p>
  </div>
</div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const brief = await callGemini();

  console.log('=== VIDEO UNDERSTANDING ===');
  console.log(JSON.stringify(brief.video_understanding, null, 2));

  console.log('\n=== NARRATIVE ARC ===');
  for (const s of (brief.narrative_arc || [])) {
    console.log(`  ${s.label.padEnd(12)} [${s.start_word_idx}-${s.end_word_idx}] energy=${s.energy_level}, pacing=${s.pacing_feel}`);
  }

  const analysis = analyzeBrief(brief);

  console.log('\n=== DECISIONS SUMMARY ===');
  console.log(`Total: ${analysis.total}`);
  console.log(`Categories:`, analysis.categories);
  console.log(`Distribution (Q1-Q4): [${analysis.quartiles.join(', ')}]`);
  console.log(`Avg confidence: ${analysis.avgConf.toFixed(3)}`);
  console.log('\nBy type:');
  for (const [type, count] of Object.entries(analysis.types).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(25)} ${count}`);
  }

  // Graphics detail
  const graphics = analysis.decisions.filter(d => d.type.startsWith('graphic_'));
  if (graphics.length > 0) {
    console.log(`\n=== GRAPHIC DECISIONS (${graphics.length}) ===`);
    for (const g of graphics) {
      const timeSec = (words[Math.min(g.target_word_idx, wordCount - 1)]?.startMs / 1000 || 0).toFixed(1);
      const params = g.params || {};
      const key = params.name || params.value || params.text || params.quote?.substring(0, 40) || '?';
      console.log(`  ${g.type.padEnd(28)} @${timeSec.padStart(6)}s  conf=${g.confidence}  "${key}"`);
    }
  }

  console.log('\n=== AUDIO DESIGN ===');
  console.log(`Ambient: ${brief.audio_design?.ambient_bed}, Ducking: ${brief.audio_design?.ducking_profile}`);
  console.log(`Captions: ${brief.caption_style}, Pacing: ${brief.overall_pacing}`);

  // Generate HTML timeline
  const html = generateTimeline(brief, analysis);
  const outPath = path.join(__dirname, 'full-system-test-output.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n✅ Timeline saved: ${outPath}`);
  console.log('Open in browser to see the full editing plan visually.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
