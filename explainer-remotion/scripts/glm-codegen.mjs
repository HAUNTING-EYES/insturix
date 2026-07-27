// GLM CODE-GEN HARNESS (the real test). GLM writes bespoke Remotion motion code for ONE scene, importing the
// trusted primitives. Every attempt runs through: safety scan -> tsc -> full render-proof. On failure the
// error is fed back and GLM repairs. If it can't pass in N tries, we restore the stub (fallback to bricks).
import {writeFileSync, readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';

const KEY = process.env.GLM_KEY;
if (!KEY) { console.error('Missing GLM_KEY (source .env.local).'); process.exit(1); }
const ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
const MODEL = 'glm-4.6';
const TARGET = 'src/bricks/glm-scene.tsx';
const MAX_ATTEMPTS = 4;

const STUB = readFileSync(TARGET, 'utf8'); // current placeholder = the fallback

const SYSTEM = `You are an elite Remotion motion designer. You output ONLY the contents of one .tsx file — no markdown fences, no prose. The scene must feel like a premium product launch film (Apple / Linear / Lovable): continuous, choreographed motion, never a static held frame.`;

const USER = `<task>
Write ONE cinematic Remotion HERO scene component for Insturix (an AI content platform). Make it feel expensive:
CONTINUOUS camera motion, staggered + overlapping reveals, parallax, easing with personality, a product
dashboard that feels alive. NO dead holds — something is always moving, subtly, on every frame.
</task>

<hard_rules>
- Export EXACTLY: export const GlmScene: React.FC<{brand: Brand}> = ({brand}) => { ... }
- Import ONLY from: 'react', 'remotion', './brand', './DeviceFrame', './UIMock', './KineticHeadline', './StatCard'. No other imports.
- DETERMINISTIC. Animate ONLY from useCurrentFrame() / useVideoConfig(). NEVER use Math.random, Date.now, new Date, setTimeout, setInterval, performance.now, fetch, XMLHttpRequest, window, document, localStorage, eval, require(), dynamic import(), or process. (These break Remotion renders.)
- 1920x1080 @ 60fps, scene length 150 frames. Every interpolate() MUST use {extrapolateLeft:'clamp', extrapolateRight:'clamp'}. Use spring({frame, fps, config}) for organic motion (get fps from useVideoConfig()).
- Colour/type ONLY from brand tokens (brand.colors.*, brand.fontSans, brand.shape.radius, brand.type.*, brand.motion.*). Never hardcode a brand colour. Use withAlpha(color, 0..1) for translucency.
- Title-safe: keep text within the middle ~90%, never break a word, never overflow the frame.
</hard_rules>

<primitive_api>
type Brand = { colors:{bg,surface,surfaceAlt,text,muted,border,accent,accentText}, fontSans:string, type:{headingWeight:number,tracking:string,lineHeight:number,eyebrowCase:'none'|'upper'}, shape:{radius:number,border:number}, density:number, decor:{grid:boolean,glow:boolean}, motion:{energy:number,overshoot:number} }
withAlpha(hexColor:string, alpha:number)=>string            // from './brand'
<DeviceFrame brand={brand} label?="..." style?={{...}}>{children}</DeviceFrame>   // browser window chrome; children fill it
<UIMock brand={brand} activeNav?={0..4} />                  // synthetic product dashboard; position:absolute, fills its parent
<KineticHeadline brand={brand} text="..." accentWord?="word" startAt?={n} fontSize?={n} maxWidth?={n} />  // per-word reveal
<Eyebrow brand={brand} startAt?={n}>text</Eyebrow>          // from './KineticHeadline'
<StatCard brand={brand} value={number|string} suffix?="..." label="..." startAt?={n} />
</primitive_api>

<content>
Eyebrow: "Insturix". Hero headline: "Your brand, everywhere." (accent the word "everywhere."). One stat: value 10, suffix "x", label "faster". Feature a product dashboard (DeviceFrame + UIMock) with a live camera move on it.
</content>

<output_format>Return ONLY the .tsx file content, starting with the import lines. No code fences.</output_format>`;

const BANNED = [/\bMath\.random\b/, /\bDate\.now\b/, /new Date\b/, /\bset(Timeout|Interval)\b/, /\bperformance\.now\b/, /\bfetch\s*\(/, /XMLHttpRequest/, /\bwindow\b/, /\bdocument\b/, /localStorage|sessionStorage/, /\beval\s*\(/, /\brequire\s*\(/, /\bprocess\b/, /import\s*\(/];
const ALLOWED_IMPORT = /^import[^']*'(react|remotion|\.\/brand|\.\/DeviceFrame|\.\/UIMock|\.\/KineticHeadline|\.\/StatCard)'/;

const call = async (messages) => {
  const res = await fetch(ENDPOINT, {method: 'POST', headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({model: MODEL, temperature: 0.6, messages})});
  if (!res.ok) throw new Error(`GLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).choices?.[0]?.message?.content ?? '';
};

const sanitize = (raw) => {
  let c = raw.trim();
  const fence = c.match(/```(?:tsx?|typescript)?\n([\s\S]*?)```/);
  if (fence) c = fence[1].trim();
  return c;
};

const staticChecks = (code) => {
  if (!/export const GlmScene\s*:/.test(code)) return 'Missing `export const GlmScene: React.FC<{brand: Brand}>`.';
  for (const b of BANNED) if (b.test(code)) return `Uses a banned/non-deterministic API: ${b}. Remove it.`;
  for (const line of code.split('\n')) {
    const t = line.trim();
    if (t.startsWith('import') && t.includes("from '") && !ALLOWED_IMPORT.test(t)) return `Illegal import: "${t}". Only react/remotion/./brand/./DeviceFrame/./UIMock/./KineticHeadline/./StatCard allowed.`;
  }
  return null;
};

const run = (cmd) => { try { execSync(cmd, {stdio: 'pipe'}); return {ok: true, out: ''}; } catch (e) { return {ok: false, out: (e.stdout?.toString() || '') + (e.stderr?.toString() || '')}; } };

const proof = () => {
  const tsc = run('npx tsc --noEmit');
  if (!tsc.ok) {
    const mine = tsc.out.split('\n').filter((l) => l.includes('glm-scene')).join('\n');
    if (mine) return {ok: false, stage: 'typecheck', error: mine};
  }
  const r = run('npx remotion render GLM-Scene out/glm-proof.mp4 --frames=0-149 --log=error');
  if (!r.ok) return {ok: false, stage: 'render', error: r.out.slice(-1500)};
  return {ok: true};
};

const main = async () => {
  const messages = [{role: 'system', content: SYSTEM}, {role: 'user', content: USER}];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n--- attempt ${attempt}/${MAX_ATTEMPTS}: GLM writing scene code ---`);
    const code = sanitize(await call(messages));
    const staticErr = staticChecks(code);
    if (staticErr) {
      console.log(`  ✗ safety scan: ${staticErr}`);
      messages.push({role: 'assistant', content: code}, {role: 'user', content: `Rejected before compiling: ${staticErr}\nReturn the COMPLETE corrected .tsx (code only).`});
      continue;
    }
    writeFileSync(TARGET, code);
    console.log(`  wrote ${code.split('\n').length} lines; running tsc + render-proof...`);
    const p = proof();
    if (p.ok) { console.log(`  ✓ PASSED (safety + tsc + full render). GLM scene is live.`); return; }
    console.log(`  ✗ ${p.stage} failed. Feeding error back to GLM.`);
    messages.push({role: 'assistant', content: code}, {role: 'user', content: `Your code failed at ${p.stage} with:\n${p.error}\nFix it. Return the COMPLETE corrected .tsx (code only).`});
  }
  writeFileSync(TARGET, STUB); // fallback
  console.log(`\n✗ GLM could not pass in ${MAX_ATTEMPTS} attempts — restored the stub (this is the fallback-to-brick path working).`);
  process.exit(2);
};

main().catch((e) => { writeFileSync(TARGET, STUB); console.error(String(e)); process.exit(1); });
