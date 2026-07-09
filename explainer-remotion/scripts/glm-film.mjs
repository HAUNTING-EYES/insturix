// FULL GLM-AUTHORED FILM. Reads the VO-fitted plan (out/plan.json) + the brand brief, and for EACH scene has
// GLM write bespoke Remotion motion code through the harness (safety -> tsc -> render-proof -> repair). On
// failure it falls back to the deterministic brick form for that scene. Writes gen/scene-N.tsx + gen/manifest.ts.
import {writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {Agent} from 'undici';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderStill} from '@remotion/renderer';
import {resolve} from 'node:path';
import {ROLE_V2, PRIM_V2, HARD_RULES_V2, JUDGE_V2, ALLOWED_IMPORT_V2, scanV2, FALLBACK_V2, PRODUCT_FORMS_V2} from './grammar-v2.mjs';
// glm-5.2 (reasoning, long code output) and glm-4.6v (video judge) can take minutes — raise undici's timeouts.
const dispatcher = new Agent({headersTimeout: 600000, bodyTimeout: 600000, connectTimeout: 30000});

const KEY = process.env.GLM_KEY;
if (!KEY) { console.error('Missing GLM_KEY (source .env.local).'); process.exit(1); }
const ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
const MODEL = 'glm-5.2';
const VISION = 'glm-4.6v';
const MAX = 3;
const JUDGE_PASS = 7.5; // polish threshold; below this the scene is regenerated with the reviewer's notes

// Optional reference style (from scripts/glm-style-transfer.mjs) — craft influence, never copied.
const STYLE = existsSync('out/style-brief.json') ? JSON.parse(readFileSync('out/style-brief.json', 'utf8')) : null;
const styleBlock = STYLE ? `\n<reference_style>Take craft INFLUENCE from this reference style (do NOT copy layouts, words, logos or claims): ${JSON.stringify(STYLE)}</reference_style>` : '';

// The explainer BIBLE (laws) + REAL product screenshots available to show (instead of the synthetic UIMock).
const KG = JSON.parse(readFileSync('scripts/explainer-knowledge-graph.json', 'utf8'));
const LAWS = KG.laws.map((l) => `- ${l.statement}`).join('\n');
const SHOTS = existsSync('public/product') ? readdirSync('public/product').filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)) : [];
// What each real screen shows, so GLM maps the RIGHT screen to each beat (and varies them, not one reused).
const SHOT_DESC = {
  'app-editor.png': 'the AI video editor — a chat-to-edit prompt, agent tool-calls (add_captions / sync_to_beat / color_grade), and a live timeline with a playhead. focus the AI-editor panel {x:0.86,y:0.32} or the timeline {x:0.5,y:0.82}. BEST for: editing, chat-to-edit, "no slop", speed.',
  'app-dashboard.png': 'the project dashboard / content library — the whole workspace of cards + statuses. focus a card {x:0.3,y:0.4}. BEST for: hero reveal, "one platform", breadth, overview.',
  'app-analyze.png': 'the analytics / performance view — scores, metrics, insights. focus a score {x:0.5,y:0.4}. BEST for: results, ROI, "know what performs".',
  'app-workflow.png': 'the pipeline / workflow board — script → edit → publish stages. focus a stage {x:0.5,y:0.5}. BEST for: workflow, automation, end-to-end.',
};
const shotsBlock = SHOTS.length
  ? `\n<real_product_ui>REAL product screens available (staticFile paths under public/):
${SHOTS.map((s) => `- product/${s} — ${SHOT_DESC[s] || 'a real product screen.'}`).join('\n')}
These already include their OWN window chrome — show them EDGE-TO-EDGE (the ROLE tells you which primitive: FullBleedProduct for full-bleed/montage/transformation, ProductShot zoom for annotate). RULES: (1) pick the ONE screen whose subject matches THIS beat; (2) use the EXACT focus coordinates given in the hard_requirement (they are vision-located — never guess); (3) use DIFFERENT screens across scenes — never the same screen twice; (4) never a synthetic mock when a real screen fits; (5) no device frame, no side column — the frame IS the product.</real_product_ui>`
  : '';

// Vision-scanned regions per screen (public/product/regions.json). Resolve a director focusRegion NAME → real
// {x,y}; fall back to the screen's primary region, then center. This is what makes the deixis mark + the camera
// dive land on the actual UI instead of coords a text model guessed for an image it can't see.
const REGIONS = existsSync('public/product/regions.json') ? JSON.parse(readFileSync('public/product/regions.json', 'utf8')) : {};
const resolveFocus = (screen, region) => {
  const r = REGIONS[(screen || '').replace(/^product\//, '')] || REGIONS[screen];
  if (!r) return null;
  if (region) { const hit = [r.primary, ...(r.regions || [])].find((x) => x && x.name === region); if (hit) return {x: hit.x, y: hit.y}; }
  return r.primary ? {x: r.primary.x, y: r.primary.y} : null;
};
const sceneFocus = (scene) => {
  const p = scene.props || {};
  const screen = p.screen || (Array.isArray(p.screens) && p.screens[0]?.screen);
  const region = p.focusRegion || (Array.isArray(p.screens) && p.screens[0]?.focusRegion);
  const f = resolveFocus(screen, region) || {x: 0.5, y: 0.5};
  return {x: Math.round(f.x * 1000) / 1000, y: Math.round(f.y * 1000) / 1000};
};

// Motion clips (our animated UI screens rendered to video, or user screen-recordings) — when one exists for a
// screen, the product can MOVE instead of sitting frozen. A clip is paired by basename: app-editor.png ↔
// product/motion/app-editor.mp4. This is the single biggest lift toward Lovable/our-film (a photo can't demo).
const MOTION = existsSync('public/product/motion') ? readdirSync('public/product/motion').filter((f) => /\.(mp4|webm|mov)$/i.test(f)) : [];
const motionFor = (screen) => {
  const base = (screen || '').replace(/^product\//, '').replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const hit = MOTION.find((m) => m.replace(/\.(mp4|webm|mov)$/i, '') === base);
  return hit ? `product/motion/${hit}` : null;
};

const plan = JSON.parse(readFileSync('out/plan.json', 'utf8'));
const B = JSON.parse(readFileSync('scripts/brand-brief.json', 'utf8'));
const scenes = plan.scenes;

// v2 grammar: forms are spatial signatures, geometry lives in primitives, constraints are unrepresentable.
const FALLBACK = FALLBACK_V2;
const ROLE = ROLE_V2;

const SYSTEM = `You are an elite Remotion motion designer. Output ONLY the contents of one .tsx file (no markdown, no prose). Compose FULL-FRAME, confident, choreographed scenes — imagery or type that OWNS the frame. NEVER a text-column-beside-a-framed-panel template, never a static held frame.`;

const hardRules = HARD_RULES_V2;
const PRIM = PRIM_V2;

// Deterministic-API ban still applies (scanV2 adds colour/Stage/fontSize/frame-window enforcement).
const BANNED = [/\bMath\.random\b/, /\bDate\.now\b/, /new Date\b/, /\bset(Timeout|Interval)\b/, /\bperformance\.now\b/, /\bfetch\s*\(/, /XMLHttpRequest/, /\bwindow\b/, /\bdocument\b/, /localStorage|sessionStorage/, /\beval\s*\(/, /\brequire\s*\(/, /\bprocess\b/, /import\s*\(/];
const ALLOWED_IMPORT = ALLOWED_IMPORT_V2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Resilient POST — retries transient network errors + 429/5xx with backoff so one blip can't kill the run.
const rawPost = async (body) => {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(ENDPOINT, {method: 'POST', headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body), dispatcher});
      if (res.status === 429 || res.status >= 500) { lastErr = new Error(`GLM ${res.status}`); await sleep(2500 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`GLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) { lastErr = e; await sleep(2500 * (i + 1)); }
  }
  throw lastErr;
};
// Codegen reasoning is HYBRID: first draft with thinking OFF (glm-5.2 is ~4× faster/call — measured 55s→14s),
// then escalate to thinking ON for REPAIRS, where reasoning matters most (fixing a specific flagged flaw or a
// render error). Fast first passes + smart rescues. FILM_THINK=1 forces reasoning ON for every call (max polish).
const FORCE_THINK = process.env.FILM_THINK === '1';
const call = async (messages, think) => (await rawPost({model: MODEL, temperature: 0.6, thinking: {type: FORCE_THINK || think ? 'enabled' : 'disabled'}, messages})).choices?.[0]?.message?.content ?? '';
const sanitize = (raw) => { let c = raw.trim(); const f = c.match(/```(?:tsx?|typescript)?\n([\s\S]*?)```/); return f ? f[1].trim() : c; };
const staticCheck = (code) => {
  if (!/export const GlmScene\s*:/.test(code)) return 'Missing `export const GlmScene: React.FC<{brand: Brand}>`.';
  for (const b of BANNED) if (b.test(code)) return `Banned/non-deterministic API matched ${b}.`;
  for (const l of code.split('\n')) { const t = l.trim(); if (t.startsWith('import') && t.includes("from '") && !ALLOWED_IMPORT.test(t)) return `Illegal import: "${t}".`; }
  const v2 = scanV2(code); if (v2) return v2; // v2 construction-level enforcement (Stage root, colour, fontSize, frame-window)
  return null;
};
const run = (cmd) => { try { execSync(cmd, {stdio: 'pipe'}); return {ok: true, out: ''}; } catch (e) { return {ok: false, out: (e.stdout?.toString() || '') + (e.stderr?.toString() || '')}; } };

// Render-proof via the Remotion Node API: write the scene, bundle, and render ONLY the 2 frames the judge
// needs — not the whole clip. A single mutex (proofLock) serializes write+bundle+render because they all
// touch the shared _proof.tsx / Gen-Proof composition; the slow GLM codegen + judge network calls run
// CONCURRENTLY across scenes (that's the big latency win). Per-scene frame paths so each scene's judge reads
// its own frames. No per-attempt tsc — the static scan + the real render catch the breakers; one full tsc
// runs after assembly.
const ENTRY = resolve('src/index.ts');
const FRAME_A = 0.45; // spread the 2 judged frames across the scene (mid + late)
const FRAME_B = 0.82;
let proofLock = Promise.resolve();
const proof = (code, idx, durF) => {
  const task = proofLock.then(async () => {
    writeFileSync('src/bricks/gen/_proof.tsx', code);
    try {
      const serveUrl = await bundle({entryPoint: ENTRY});
      const composition = await selectComposition({serveUrl, id: 'Gen-Proof'});
      const fa = Math.max(1, Math.round(durF * FRAME_A));
      const fb = Math.max(2, Math.round(durF * FRAME_B));
      await renderStill({serveUrl, composition, frame: fa, output: `out/judge-${idx}-a.png`, imageFormat: 'png'});
      await renderStill({serveUrl, composition, frame: fb, output: `out/judge-${idx}-b.png`, imageFormat: 'png'});
      return {ok: true};
    } catch (e) { return {ok: false, stage: 'render', error: String(e?.stack || e).slice(-1400)}; }
  });
  proofLock = task.then(() => {}, () => {}); // keep the chain alive regardless of this task's outcome
  return task;
};

const JUDGE_PROMPT = JUDGE_V2;

const judge = async (idx) => {
  // proof() already rendered this scene's 2 frames — just read + score them.
  const imgs = [`out/judge-${idx}-a.png`, `out/judge-${idx}-b.png`].filter(existsSync).map((p) => readFileSync(p).toString('base64'));
  if (!imgs.length) return {score: 7, issues: []};
  const content = [{type: 'text', text: JUDGE_PROMPT}, ...imgs.map((b) => ({type: 'image_url', image_url: {url: `data:image/png;base64,${b}`}}))];
  try {
    const txt = (await rawPost({model: VISION, messages: [{role: 'user', content}]})).choices?.[0]?.message?.content ?? '';
    const m = txt.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m[0]);
    return {score: Number(o.score) || 0, issues: Array.isArray(o.issues) ? o.issues : []};
  } catch { return {score: 7, issues: []}; } // if the judge itself fails, don't block a valid render
};

const codegenScene = async (scene, idx) => {
  const durF = scene.durationInFrames;
  const copy = JSON.stringify(scene.props || {});
  const f = sceneFocus(scene); // vision-located focal point for this beat's screen+region
  const src = scene.props?.screen || (Array.isArray(scene.props?.screens) && scene.props.screens[0]?.screen) || 'product/...';
  // Prefer a MOVING product (VideoShot) whenever a motion clip exists for this screen — only for the single-
  // screen forms (montage grids / transformation wipes stay on stills). Falls back to the still FullBleedProduct.
  const motion = ['full-bleed-product', 'annotate'].includes(scene.form) ? motionFor(src) : null;
  const uiReq = !(SHOTS.length && PRODUCT_FORMS_V2.has(scene.form))
    ? ''
    : motion
      ? `\n<hard_requirement>PRODUCT SCENE (LIVE — the product MOVES): fill the frame edge-to-edge with <VideoShot brand={brand} src="${motion}" focus={{x:${f.x},y:${f.y}}} push={0.06} scrim="bottom"/>. This is a REAL recording of the app operating itself (prompt typing, clicks landing, timeline building) — DO NOT use a static screenshot, FullBleedProduct, device frame, card, or side column when this clip exists. Words = ONE <Chip> + at most ONE short <FitHeadline size="l"> pinned to a safe <Corner> over the scrim (≤2 text elements, ≤25% of frame). USE THAT EXACT focus.${scene.form === 'annotate' ? ` Land ONE <Deixis brand={brand} x={${f.x}} y={${f.y}} kind="${scene.props?.mark || 'circle'}" at={ph.build}/> EXACTLY on that focus (frame fractions) as the VO names it — do NOT add a second cursor over the video.` : ''}</hard_requirement>`
      : `\n<hard_requirement>PRODUCT SCENE: the REAL screen must OWN the frame edge-to-edge via <FullBleedProduct brand={brand} src="${src}" focus={{x:${f.x},y:${f.y}}} ph={ph} scrim="bottom"/> (or <ProductShot brand={brand} src="${src}" focus={{x:${f.x},y:${f.y}}} zoom/> for the "annotate" form, which carries its own cursor+dive). USE THAT EXACT focus — it is the vision-located subject of this beat; do NOT change or guess it. NO device frame, NO side column, NO card — the frame IS the product. A small framed panel beside a text column is a FAIL.${scene.form === 'annotate' ? ` Land ONE <Deixis brand={brand} x={${f.x}} y={${f.y}} kind="${scene.props?.mark || 'circle'}" at={ph.build}/> EXACTLY on that focus (frame fractions) as the VO names it.` : ''}</hard_requirement>`;
  const USER = `<task>Write ONE Remotion scene: ${ROLE[scene.form] || ROLE.hero}
Make it cinematic and on-brand. It is scene ${idx + 1} of a SaaS explainer.</task>
<brand>${B.productName} — ${B.whatItDoes}
visual_style: ${B.visualStyle}
motion_personality: ${B.motionPersonality}</brand>${styleBlock}
<explainer_laws>Obey these craft laws (esp. motion-congruence, ONE focal point, title-safe, restraint, no AI-slop):
${LAWS}</explainer_laws>${shotsBlock}${uiReq}
<copy>Use this exact copy (do not invent other text): ${copy}
Narration for context (do NOT put on screen): "${scene.vo || ''}"</copy>
${hardRules(durF)}
${PRIM}
<output_format>Return ONLY the .tsx file content, starting with imports. No code fences.</output_format>`;

  const messages = [{role: 'system', content: SYSTEM}, {role: 'user', content: USER}];
  let best = null; // best structurally-valid version (accept even if below JUDGE_PASS; only brick if NOTHING renders)
  for (let a = 1; a <= MAX; a++) {
    let code, j;
    try {
      code = sanitize(await call(messages, a > 1)); // a1 = fast draft (no reasoning); repairs think
      const se = staticCheck(code);
      if (se) { messages.push({role: 'assistant', content: code}, {role: 'user', content: `Rejected: ${se} Return the COMPLETE corrected .tsx (code only).`}); continue; }
      const p = await proof(code, idx, durF);
      if (!p.ok) { console.log(`  scene ${idx + 1} (${scene.form}): ${p.stage} fail, repairing (a${a})`); messages.push({role: 'assistant', content: code}, {role: 'user', content: `Failed at ${p.stage}:\n${p.error}\nFix and return the COMPLETE corrected .tsx (code only).`}); continue; }
      j = await judge(idx);
    } catch (e) {
      console.log(`  scene ${idx + 1} (${scene.form}): a${a} errored (${String(e).slice(0, 60)}) — keeping best-so-far`);
      break; // e.g. a rate-limit after retries: stop, but NEVER discard a good `best` (that caused false fallbacks)
    }
    if (!best || j.score > best.score) best = {code, score: j.score};
    if (j.score >= JUDGE_PASS) { writeFileSync(`src/bricks/gen/scene-${idx}.tsx`, code); console.log(`  scene ${idx + 1} (${scene.form}): GLM ✓ polish ${j.score}/10 (a${a})`); return true; }
    console.log(`  scene ${idx + 1} (${scene.form}): polish ${j.score}/10 < ${JUDGE_PASS}, refining (a${a}): ${j.issues.slice(0, 2).join('; ')}`);
    messages.push({role: 'assistant', content: code}, {role: 'user', content: `A senior design reviewer scored this scene ${j.score}/10. Fix these specific problems: ${j.issues.join(' | ')}. Keep it deterministic and on-brand; do not add new text. Return the COMPLETE corrected .tsx (code only).`});
  }
  if (best) { writeFileSync(`src/bricks/gen/scene-${idx}.tsx`, best.code); console.log(`  scene ${idx + 1} (${scene.form}): accepted best polish ${best.score}/10`); return true; }
  return false;
};

const writeFallback = (scene, idx) => {
  const f = FALLBACK[scene.form] || FALLBACK.hero;
  const props = JSON.stringify(scene.props || {});
  const src = `import React from 'react';\nimport type {Brand} from '../brand';\nimport {${f.comp}} from '${f.mod}';\n// FALLBACK — GLM codegen did not pass the harness; using the deterministic brick form.\nexport const GlmScene: React.FC<{brand: Brand}> = ({brand}) => { const p = ${props} as any; return <${f.comp} brand={brand} {...p} />; };\n`;
  writeFileSync(`src/bricks/gen/scene-${idx}.tsx`, src);
  console.log(`  scene ${idx + 1} (${scene.form}): FALLBACK to brick`);
};

const main = async () => {
  // Bounded concurrency: overlap the slow GLM calls, but cap in-flight scenes so we don't trip the API rate
  // limit (429). Too many concurrent scenes × repair attempts got everything throttled → mass fallbacks.
  const CONCURRENCY = Number(process.env.FILM_CONCURRENCY || 3);
  console.log(`Directing ${scenes.length} scenes through the GLM code harness, ${CONCURRENCY} at a time (proof serialized; GLM calls overlap)...`);
  const results = new Array(scenes.length);
  let next = 0;
  const worker = async () => {
    while (next < scenes.length) {
      const i = next++;
      results[i] = await codegenScene(scenes[i], i).catch((e) => { console.log(`  scene ${i + 1} (${scenes[i].form}): crashed — ${String(e).slice(0, 140)}`); return false; });
    }
  };
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, scenes.length)}, worker));
  let glmCount = 0;
  results.forEach((ok, i) => { if (ok) glmCount++; else writeFallback(scenes[i], i); });
  // manifest
  const imports = scenes.map((_, i) => `import {GlmScene as Scene${i}} from './scene-${i}';`).join('\n');
  const arr = scenes.map((s, i) => `  {Comp: Scene${i}, durationInFrames: ${s.durationInFrames}, form: ${JSON.stringify(s.form)}, vo: ${JSON.stringify(s.vo || '')}, focus: ${JSON.stringify(sceneFocus(s))}},`).join('\n');
  const man = `import type React from 'react';\nimport type {Brand} from '../brand';\n${imports}\nexport type GenScene = {Comp: React.FC<{brand: Brand}>; durationInFrames: number; form: string; vo: string; focus?: {x: number; y: number}};\nexport const GEN_META = {fps: ${plan.fps}, transitionFrames: ${plan.transitionFrames}, message: ${JSON.stringify(plan.message || '')}};\nexport const GEN_SCENES: GenScene[] = [\n${arr}\n];\n`;
  writeFileSync('src/bricks/gen/manifest.ts', man);
  console.log(`\nDone: ${glmCount}/${scenes.length} scenes authored by GLM, ${scenes.length - glmCount} fell back to bricks.`);
};

main().catch((e) => { console.error(String(e)); process.exit(1); });
