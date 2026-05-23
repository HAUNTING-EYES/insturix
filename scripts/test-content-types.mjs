/**
 * CONTENT TYPE BATCH TEST — runs the creative brief + MG engine against
 * 5 different content types to see how the system adapts.
 *
 * Types: talking-head, tutorial, product-review, corporate, entertainment-vlog
 *
 * Usage: node scripts/test-content-types.mjs
 *
 * Generates: scripts/content-type-comparison.html (visual dashboard)
 * Time: ~3-4 minutes (5 Gemini calls)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('No GEMINI_API_KEY'); process.exit(1); }

// ─── Test transcripts ───────────────────────────────────────────

function wordsToTimed(text, wpm = 180) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const msPerWord = 60000 / wpm;
  return words.map((word, i) => ({
    word,
    startMs: Math.round(i * msPerWord),
    endMs: Math.round((i + 1) * msPerWord),
  }));
}

const TRANSCRIPTS = [
  {
    name: 'Talking Head (Hank Green)',
    type: 'talking-head',
    source: 'file',
  },
  {
    name: 'Tutorial (PostgreSQL Setup)',
    type: 'tutorial',
    words: wordsToTimed(`Welcome back to DevOps Daily. I'm Sarah Chen. Today we're setting up PostgreSQL 16 on Ubuntu. First, run sudo apt update. Then install with sudo apt install postgresql postgresql-contrib. After installation, switch to the postgres user. Now create your first database. I'll call it myapp_production. The default port is 5432. Important security step: edit pg_hba.conf to restrict connections. Never use trust authentication in production. Change it to scram-sha-256. The performance difference is massive. In our benchmarks, PostgreSQL 16 handles 47000 transactions per second. That's a 23% improvement over version 15. For connection pooling, I recommend PgBouncer. Set max_connections to 200 and shared_buffers to 25% of your RAM. If you have 32 gigabytes of RAM, that's 8 gigabytes for shared buffers. One more thing. Always enable WAL archiving for point-in-time recovery. Your future self will thank you. Drop a comment if you want me to cover replication next. Subscribe for more DevOps tutorials every Tuesday and Friday.`),
  },
  {
    name: 'Product Review (iPhone)',
    type: 'product-review',
    words: wordsToTimed(`The iPhone 17 Pro starts at $1299 for the 256 gigabyte model. Apple claims 22 hours of battery life. In our testing it lasted 19 hours and 42 minutes. Not bad, but Samsung's Galaxy S26 Ultra hit 24 hours flat. The new 48 megapixel telephoto camera is genuinely impressive. 5x optical zoom with optical image stabilization. Night mode photos scored 94 out of 100 on DxOMark. The A19 Bionic chip benchmarks at 2.8 million on Antutu. Compare that to the Snapdragon 8 Elite at 2.6 million. Real world difference? About 3 seconds faster on heavy video editing. The titanium frame feels premium. Weight is 187 grams, down from 199 last year. Apple finally added USB-C 3.2 with 40 gigabits per second transfer. The display is a 6.3 inch LTPO OLED running at 120Hz with 2800 nits peak brightness. Bottom line: if you're upgrading from iPhone 15 or older, it's worth it. From iPhone 16 Pro? Save your money.`),
  },
  {
    name: 'Corporate Presentation',
    type: 'corporate',
    words: wordsToTimed(`Good morning everyone. I'm David Park, Chief Financial Officer of Meridian Technologies. Let me walk you through our Q3 2025 results. Revenue grew 23% year over year to $4.2 billion. Operating margin expanded 340 basis points to 28.7%. Free cash flow reached $890 million, up from $620 million last year. Our enterprise segment drove the growth. Enterprise ARR crossed $2 billion for the first time. Net retention rate was 127%. We added 340 new enterprise customers this quarter, including 12 Fortune 500 companies. The consumer segment grew 8% to $1.1 billion. Monthly active users reached 180 million globally. Average revenue per user increased to $6.40 from $5.80. Looking ahead, we're raising full year guidance. We now expect revenue of $17 billion, up from our previous estimate of $16.2 billion. We're investing heavily in AI capabilities. R&D spending increased 31% to $780 million. We opened a new AI research lab in Toronto. Headcount grew to 14200 employees worldwide. Thank you for your continued support. Let me open it up for questions.`),
  },
  {
    name: 'Entertainment Vlog (High Energy)',
    type: 'entertainment',
    words: wordsToTimed(`Oh my god you guys! I just got backstage at the Taylor Swift concert! She literally walked right past me! I'm shaking right now. Okay okay let me calm down. So here's what happened. My friend Jessica got us VIP passes through her cousin who works at Live Nation. We showed up at Madison Square Garden at like 3pm. The line was already insane. Like thousands of people. Security was super tight. But once we got inside, the production was absolutely mind-blowing. The stage had this 360 degree LED screen that was like 50 feet tall. Travis Kelce was there sitting in a private box. Everyone was losing their minds. The Eras Tour setlist had 44 songs. She performed for three and a half hours straight. My favorite moment was during Cruel Summer when she did this surprise mashup with Billie Eilish. Nobody expected that! The merch line was two hours long. I got the exclusive tour hoodie for $85. Worth every penny honestly. I'll put the link in my bio. Make sure you follow me on TikTok and Instagram at JessicaLovesMusic for more concert content!`),
  },
];

// ─── Build prompt ───────────────────────────────────────────────

function buildPrompt(words, wordCount, totalDurationSec) {
  const transcriptBlock = words
    .map((w, i) => `[${i}] ${w.word} (${w.startMs}-${w.endMs}ms)`)
    .join('\n');

  return `<role>You are a professional video editor making creative decisions for THIS specific video.</role>

<your_scope>Cleaned transcript. Handle: zooms, transitions, SFX, graphics, caption emphasis, pacing.</your_scope>

<valid_types>
zoom_push, zoom_punch, zoom_pull_back, zoom_drift, transition_dissolve, transition_fade_to_black,
transition_whip_pan, transition_flash, sfx_whoosh, sfx_impact, sfx_shimmer, sfx_ambient,
caption_emphasis, speed_slow_motion, speed_ramp, graphic_stat_counter, graphic_lower_third,
graphic_callout, graphic_keyword_highlight, graphic_quote_card, graphic_logo_reveal,
camera_shake, audio_duck, hold_longer, cut_shorter
</valid_types>

<valid_reasons>
vocal_peak, vocal_build, vocal_wind_down, topic_shift, emphasis_word, rhetorical_pause,
number_mentioned, name_mentioned, cta, energy_peak, energy_build, energy_drop, scene_boundary,
visual_monotony, music_beat, emotional_shift, narrative_resolve, opening_hook, closing_zone
</valid_reasons>

<graphic_rules>
graphic_stat_counter — specific numbers. params: { value, label }. Use EXACT number from transcript.
graphic_lower_third — FIRST mention of named person/company. params: { name, title }. One per entity.
graphic_callout — key concepts. params: { title, body }.
graphic_quote_card — standout assertions. params: { quote, author }. Max 3.
graphic_keyword_highlight — conceptual terms. params: { text }. Never filler words.
PRIORITY: stat-counter > lower-third > quote-card > callout > keyword-highlight.
</graphic_rules>

<rules>
- Word indices 0-${wordCount - 1}. Confidence 0.55-0.95. Vary confidence.
- Cover the FULL video. Each third should have decisions.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "production_quality": 0-1, "speaker_count": number },
  "narrative_arc": [{ "section_id": number, "start_word_idx": number, "end_word_idx": number, "label": string, "energy_level": string }],
  "decisions": [{ "type": string, "target_word_idx": number, "confidence": number, "reason": string, "params": {} }],
  "overall_pacing": string
}
</output_format>

<transcription words="${wordCount}" duration="${totalDurationSec}s">
${transcriptBlock}
</transcription>`;
}

// ─── Call Gemini ─────────────────────────────────────────────────

async function callGemini(words, wordCount, totalDurationSec) {
  const genai = new GoogleGenerativeAI(API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Retry with different seeds on JSON parse failure (production robustness)
  for (const seed of [42, 7, 99]) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(words, wordCount, totalDurationSec) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          seed,
          maxOutputTokens: 16384,
        },
      });
      const text = result.response.text();
      const parsed = JSON.parse(text);
      if (parsed.decisions) return parsed;
      console.log(`    Seed ${seed}: no decisions field, retrying...`);
    } catch (err) {
      console.log(`    Seed ${seed}: ${err.message.substring(0, 60)}, retrying...`);
    }
  }
  throw new Error('All 3 seeds failed to produce valid JSON');
}

// ─── Analyze ────────────────────────────────────────────────────

function analyze(brief, wordCount) {
  const decisions = brief.decisions || [];
  const categories = {};
  const types = {};
  for (const d of decisions) {
    const cat = d.type.split('_')[0];
    categories[cat] = (categories[cat] || 0) + 1;
    types[d.type] = (types[d.type] || 0) + 1;
  }
  const quartiles = [0, 0, 0, 0];
  for (const d of decisions) {
    const q = Math.min(3, Math.floor((d.target_word_idx / wordCount) * 4));
    quartiles[q]++;
  }
  const confs = decisions.map(d => d.confidence);
  const avgConf = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  const graphics = decisions.filter(d => d.type.startsWith('graphic_'));
  return { total: decisions.length, categories, types, quartiles, avgConf, graphics, decisions };
}

// ─── Generate comparison HTML ───────────────────────────────────

function generateComparison(results) {
  const COLORS = {
    zoom: '#3B82F6', transition: '#8B5CF6', sfx: '#F59E0B', graphic: '#10B981',
    caption: '#EC4899', speed: '#EF4444', camera: '#6366F1', audio: '#14B8A6',
    hold: '#78716C', cut: '#78716C',
  };

  const rows = results.map(r => {
    const cats = Object.entries(r.analysis.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<span style="color:${COLORS[k] || '#999'}">${k}:${v}</span>`)
      .join(' ');
    const graphicTypes = r.analysis.graphics.map(g => g.type.replace('graphic_', '')).join(', ') || 'none';
    const timeline = r.analysis.decisions.map(d => {
      const pct = ((d.target_word_idx / r.wordCount) * 100).toFixed(1);
      const cat = d.type.split('_')[0];
      const color = COLORS[cat] || '#666';
      return `<div style="position:absolute;left:${pct}%;top:0;width:2px;height:100%;background:${color};opacity:0.7" title="${d.type}"></div>`;
    }).join('');

    return `<tr>
      <td><strong>${r.name}</strong><br><span style="color:#94A3B8;font-size:11px">${r.type} · ${r.wordCount} words · ${r.durationSec}s</span></td>
      <td>${r.analysis.total}</td>
      <td>${cats}</td>
      <td>${r.analysis.graphics.length}</td>
      <td style="font-size:11px">${graphicTypes}</td>
      <td>[${r.analysis.quartiles.join(',')}]</td>
      <td>${r.analysis.avgConf.toFixed(2)}</td>
      <td>${r.brief.overall_pacing || '?'}</td>
      <td><div style="position:relative;height:20px;background:#334155;border-radius:3px;overflow:hidden">${timeline}</div></td>
      <td style="font-size:11px">${r.brief.video_understanding?.primary_content?.substring(0, 60) || '?'}...</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Content Type Comparison</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',system-ui,sans-serif; background:#0F172A; color:#E2E8F0; padding:24px; }
  h1 { font-size:22px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; padding:8px 12px; background:#1E293B; color:#94A3B8; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
  td { padding:8px 12px; border-bottom:1px solid #1E293B; vertical-align:top; }
  tr:hover { background:#1E293B; }
  .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:16px 0; }
  .card { background:#1E293B; border-radius:8px; padding:16px; text-align:center; }
  .card .v { font-size:28px; font-weight:700; }
  .card .l { font-size:11px; color:#94A3B8; margin-top:4px; }
</style></head><body>
<h1>Content Type Comparison — Full System Test</h1>
<p style="color:#94A3B8;margin-bottom:20px">5 content types tested against Gemini creative brief + analysis. Each row = one video type.</p>

<div class="summary">
  <div class="card"><div class="v">${results.length}</div><div class="l">Content Types</div></div>
  <div class="card"><div class="v">${results.reduce((s, r) => s + r.analysis.total, 0)}</div><div class="l">Total Decisions</div></div>
  <div class="card"><div class="v">${results.reduce((s, r) => s + r.analysis.graphics.length, 0)}</div><div class="l">Total Graphics</div></div>
  <div class="card"><div class="v">${(results.reduce((s, r) => s + r.elapsed, 0)).toFixed(0)}s</div><div class="l">Total Processing Time</div></div>
</div>

<table>
<thead><tr><th>Content Type</th><th>Decisions</th><th>Categories</th><th>Graphics</th><th>Graphic Types</th><th>Q1-Q4</th><th>Avg Conf</th><th>Pacing</th><th>Timeline</th><th>Understanding</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('CONTENT TYPE BATCH TEST — 5 types × Gemini creative brief');
  console.log('═'.repeat(70));

  const results = [];

  for (const t of TRANSCRIPTS) {
    let words, wordCount, durationSec;

    if (t.source === 'file') {
      const dataPath = path.join(__dirname, 'prompt-optimization/hank-green-test-data.json');
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      words = data.words;
      wordCount = data.wordCount;
      durationSec = Math.ceil(words[words.length - 1].endMs / 1000);
    } else {
      words = t.words;
      wordCount = words.length;
      durationSec = Math.ceil(words[words.length - 1].endMs / 1000);
    }

    console.log(`\n── ${t.name} (${wordCount} words, ${durationSec}s) ──`);
    console.log('Calling Gemini...');

    const start = Date.now();
    try {
      const brief = await callGemini(words, wordCount, durationSec);
      const elapsed = (Date.now() - start) / 1000;
      const analysis = analyze(brief, wordCount);

      console.log(`  ${elapsed.toFixed(1)}s — ${analysis.total} decisions (${analysis.graphics.length} graphics)`);
      console.log(`  Categories:`, analysis.categories);
      console.log(`  Pacing: ${brief.overall_pacing}, Q: [${analysis.quartiles.join(',')}]`);

      if (analysis.graphics.length > 0) {
        console.log(`  Graphics: ${analysis.graphics.map(g => g.type.replace('graphic_', '')).join(', ')}`);
      }

      results.push({ ...t, words, wordCount, durationSec, brief, analysis, elapsed });
    } catch (err) {
      console.log(`  ERROR: ${err.message.substring(0, 80)}`);
      results.push({ ...t, words, wordCount, durationSec, brief: {}, analysis: { total: 0, categories: {}, types: {}, quartiles: [0,0,0,0], avgConf: 0, graphics: [], decisions: [] }, elapsed: (Date.now() - start) / 1000 });
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total: ${results.reduce((s, r) => s + r.analysis.total, 0)} decisions across ${results.length} content types`);
  console.log(`Graphics: ${results.reduce((s, r) => s + r.analysis.graphics.length, 0)} total`);
  console.log(`Time: ${results.reduce((s, r) => s + r.elapsed, 0).toFixed(0)}s total`);

  for (const r of results) {
    console.log(`  ${r.name.padEnd(35)} ${String(r.analysis.total).padStart(3)} decisions, ${String(r.analysis.graphics.length).padStart(2)} graphics, ${r.brief.overall_pacing || '?'} pacing`);
  }

  // Generate HTML
  const html = generateComparison(results);
  const outPath = path.join(__dirname, 'content-type-comparison.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n✅ Dashboard: ${outPath}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
