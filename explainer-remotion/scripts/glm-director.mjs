// GLM director. Reads a brand + prompt, calls GLM (z.ai / glm-4.6), and emits a SceneGraph the deterministic
// brick engine renders. This is the "one function swap" from the hand-written plan: GLM now does the creative
// decisions (which forms, order, copy, pacing); the bricks guarantee it renders correctly + on-brand.
// Usage:  set -a; . ./.env.local; set +a; node scripts/glm-director.mjs "make a 30s explainer"
import {writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {Agent} from 'undici';
import {FORMS_V2, ALLOWED_FORMS_V2} from './grammar-v2.mjs';
const dispatcher = new Agent({headersTimeout: 600000, bodyTimeout: 600000, connectTimeout: 30000});

const KEY = process.env.GLM_KEY;
if (!KEY) { console.error('Missing GLM_KEY (source .env.local first).'); process.exit(1); }

// Brand Vault analog — feeds the director so copy/VO stay on-brand (voice, tone, proof points).
const B = JSON.parse(readFileSync('scripts/brand-brief.json', 'utf8'));
// The explainer BIBLE (laws) + REAL product facts (ThinkForge context) — make copy structured + specific.
const KG = JSON.parse(readFileSync('scripts/explainer-knowledge-graph.json', 'utf8'));
const LAWS = KG.laws.map((l) => `- ${l.statement}`).join('\n');
const PF = JSON.parse(readFileSync('scripts/product-facts.json', 'utf8'));
// Real product screenshots that actually exist + their vision-scanned regions (public/product/regions.json).
// The director maps beats to THESE screens and points focusRegion at a NAMED region — never invents filenames
// or raw coordinates (a text model can't see the image; that's what put the deixis mark on empty space).
const SHOTS = existsSync('public/product') ? readdirSync('public/product').filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)) : [];
const REGIONS = existsSync('public/product/regions.json') ? JSON.parse(readFileSync('public/product/regions.json', 'utf8')) : {};
const MOTION = existsSync('public/product/motion') ? readdirSync('public/product/motion').filter((f) => /\.(mp4|webm|mov)$/i.test(f)) : [];
const isLive = (s) => MOTION.some((m) => m.replace(/\.(mp4|webm|mov)$/i, '') === s.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
const regionNames = (s) => {
  const r = REGIONS[s];
  return r ? [r.primary?.name, ...(r.regions || []).map((x) => x.name)].filter(Boolean).join(', ') : 'primary';
};
const SCREENS_BLOCK = SHOTS.length
  ? `\n<available_screens>The ONLY real product screens that exist — use these EXACT paths for any "screen" prop; NEVER invent a filename. Each lists its REGIONS (from a vision scan). For any "focusRegion", pick a NAME from THAT screen's region list — never raw coordinates. Screens tagged (LIVE) are real RECORDINGS where the app MOVES (typing, clicks, counters) — STRONGLY prefer LIVE screens for full-bleed-product and annotate beats; a moving product beats a static one. Map screens to the beat each best proves; use different screens across scenes.\n${SHOTS.map((s) => `- product/${s}${isLive(s) ? ' (LIVE)' : ''} — regions: ${regionNames(s)}`).join('\n')}</available_screens>`
  : '';

const ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
const MODEL = 'glm-5.2';
const userBrief = process.argv[2] || 'A punchy ~25-second hero explainer for the homepage.';

const SYSTEM = `You are a senior SaaS explainer-video director. You output ONLY one JSON object (no markdown, no prose) describing an explainer's scenes, using ONLY the fixed vocabulary of forms provided. You make the creative decisions: which forms, in what order, the copy, and the pacing.`;

const USER = `<task>
Design a SaaS explainer video for the brand below and return a JSON SceneGraph.
Brief: ${userBrief}
</task>

<brand_vault>
name: ${B.productName}
one_liner: ${B.oneLiner}
what_it_is: ${B.whatItDoes}
audience: ${B.audience}
tone: ${B.tone}
proof_points: ${B.proofPoints.join(' · ')}
voice_do: ${B.voice.do.join(' · ')}
voice_dont: ${B.voice.dont.join(' · ')}
</brand_vault>
<voice_rules>Write ALL copy and VO in this brand voice. Follow voice_do; avoid voice_dont. Use the proof_points as the substance — do not invent metrics or claims beyond them.</voice_rules>
<explainer_bible>Obey these explainer laws when planning structure, hook, pacing and copy:
${LAWS}</explainer_bible>
<product_facts>These are the REAL product features + outcomes. Every headline/caption/VO line must be SPECIFIC — name a real feature or a concrete outcome, never a vague adjective ("unlimited on-brand content" is BANNED; "scan your site → a full brand kit in 30s" is the bar).
features: ${PF.features.join(' | ')}
outcomes: ${PF.outcomes.join(' | ')}</product_facts>
${SCREENS_BLOCK}

${FORMS_V2}

<output_format>
Return ONLY this JSON, no code fences:
{"message":"<one core message>","scenes":[{"form":"kinetic-statement","durationInFrames":120,"vo":"<narration line>","props":{ }}]}
</output_format>`;

const ALLOWED = ALLOWED_FORMS_V2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Resilient — retries transient network errors + 429/5xx with backoff. A single "fetch failed" here used to
// abort the director, and the pipeline would then run on a STALE plan.json (wrong screens, no LIVE preference).
const call = async () => {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        dispatcher,
        headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({model: MODEL, temperature: 0.5, messages: [{role: 'system', content: SYSTEM}, {role: 'user', content: USER}]}),
      });
      if (res.status === 429 || res.status >= 500) { lastErr = new Error(`GLM ${res.status}`); await sleep(3000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`GLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return (await res.json()).choices?.[0]?.message?.content ?? '';
    } catch (e) { lastErr = e; await sleep(3000 * (i + 1)); }
  }
  throw lastErr;
};

const parse = (raw) => {
  const m = raw.match(/\{[\s\S]*\}/); // grab the JSON object even if wrapped
  if (!m) throw new Error('No JSON object in GLM output:\n' + raw.slice(0, 400));
  return JSON.parse(m[0]);
};

const validate = (plan) => {
  let scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  scenes = scenes
    .filter((s) => s && ALLOWED.has(s.form))
    .slice(0, 6)
    .map((s) => ({form: s.form, durationInFrames: clamp(s.durationInFrames, 60, 180), vo: typeof s.vo === 'string' ? s.vo : '', props: s.props && typeof s.props === 'object' ? s.props : {}}));
  if (scenes.length < 2) throw new Error('GLM returned too few valid scenes.');
  if (scenes[scenes.length - 1].form !== 'logo') scenes.push({form: 'logo', durationInFrames: 96, vo: '', props: {}}); // enforce outro law
  return {message: String(plan.message || ''), scenes};
};

const main = async () => {
  console.log(`Directing with ${MODEL} — brief: "${userBrief}"`);
  const raw = await call();
  const {message, scenes} = validate(parse(raw));
  const ts =
    `// AUTO-GENERATED by scripts/glm-director.mjs — GLM's SceneGraph. Do not edit by hand.\n` +
    `import type {SceneSpec} from './scene-graph';\n` +
    `export const GENERATED_MESSAGE = ${JSON.stringify(message)};\n` +
    `export const GENERATED_SCENES: SceneSpec[] = ${JSON.stringify(scenes, null, 2)} as SceneSpec[];\n`;
  writeFileSync('src/bricks/generated-plan.ts', ts);
  writeFileSync('out/plan.json', JSON.stringify({fps: 60, transitionFrames: 22, message, scenes: scenes.map((s) => ({form: s.form, durationInFrames: s.durationInFrames, vo: s.vo || '', props: s.props || {}}))}, null, 2));
  console.log(`\nCore message: ${message}`);
  console.log(`Scenes (${scenes.length}):`);
  scenes.forEach((s, i) => console.log(`  ${i + 1}. ${s.form} (${s.durationInFrames}f)  ${JSON.stringify(s.props).slice(0, 120)}`));
  console.log('\nWrote src/bricks/generated-plan.ts');
};

main().catch((e) => { console.error(String(e)); process.exit(1); });
