// REGION MAP. For each product screenshot, glm-4.6v (a model that can SEE) locates the meaningful UI regions
// as named, normalized points — so the director can say "point at the chat-panel" and the film resolves REAL
// coordinates, instead of a text model guessing coords for an image it has never seen (which is why the deixis
// circle landed on empty space, and why product dives never framed anything). Output: public/product/regions.json.
// Run ONCE whenever the screenshot set changes. Usage: set -a; . ./.env.local; set +a; node scripts/glm-region-map.mjs
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {Agent} from 'undici';

const KEY = process.env.GLM_KEY;
if (!KEY) { console.error('Missing GLM_KEY (source .env.local).'); process.exit(1); }
const EP = 'https://api.z.ai/api/paas/v4/chat/completions';
const VISION = 'glm-4.6v';
const dispatcher = new Agent({headersTimeout: 600000, bodyTimeout: 600000, connectTimeout: 30000});

const DIR = 'public/product';
const SHOTS = existsSync(DIR) ? readdirSync(DIR).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)) : [];
if (!SHOTS.length) { console.error('No screenshots in public/product.'); process.exit(1); }

const PROMPT = `You are a UI analyst. Look at THIS product screenshot and locate the meaningful, nameable UI regions a product demo would point a cursor at or zoom into. For each, give its CENTER as normalized coordinates (x,y in 0..1, origin top-left) — where the thing ACTUALLY sits in this image.
Return ONLY JSON:
{"primary": {"name": "<kebab-name>", "x": <0..1>, "y": <0..1>}, "regions": [{"name": "<kebab-name>", "x": <0..1>, "y": <0..1>, "what": "<3-5 words>"}]}
Rules: 3 to 6 regions. Short kebab-case names (chat-panel, timeline, primary-cta, score, active-card, nav, tool-calls). "primary" = the ONE region that best represents what the product DOES (the demo's money shot). Coordinates must match THIS image, not a generic guess.`;

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)));
const norm = (p) => (p && typeof p === 'object' ? {...p, x: clamp01(p.x), y: clamp01(p.y)} : p);

const mapOne = async (file) => {
  const b64 = readFileSync(`${DIR}/${file}`).toString('base64');
  const content = [{type: 'text', text: PROMPT}, {type: 'image_url', image_url: {url: `data:image/png;base64,${b64}`}}];
  const res = await fetch(EP, {method: 'POST', headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({model: VISION, messages: [{role: 'user', content}]}), dispatcher});
  if (!res.ok) throw new Error(`GLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const txt = (await res.json()).choices?.[0]?.message?.content ?? '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON: ${txt.slice(0, 150)}`);
  const o = JSON.parse(m[0]);
  return {primary: norm(o.primary), regions: Array.isArray(o.regions) ? o.regions.map(norm) : []};
};

const out = {};
for (const f of SHOTS) {
  try {
    const r = await mapOne(f);
    out[f] = r;
    const names = (r.regions || []).map((x) => x.name).join(', ');
    console.log(`${f}: primary=${r.primary?.name} (${r.primary?.x?.toFixed(2)},${r.primary?.y?.toFixed(2)})  [${names}]`);
  } catch (e) { console.log(`${f}: FAILED — ${String(e).slice(0, 120)}`); }
}
writeFileSync(`${DIR}/regions.json`, JSON.stringify(out, null, 2));
console.log(`\nWrote ${DIR}/regions.json (${Object.keys(out).length}/${SHOTS.length} screens)`);
