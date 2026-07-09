// STYLE TRANSFER via NATIVE VIDEO. glm-4.6v WATCHES the reference video(s) directly (video_url) — real
// motion/timing/transitions, not keyframe guesses — and writes a detailed director's playbook that glm-5.2
// implements. Pass one or more references (ours + Lovable); local files are uploaded to a temp host first.
// Usage: node scripts/glm-style-transfer.mjs <video|url> [more videos...]
import {writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {Agent} from 'undici';

const KEY = process.env.GLM_KEY;
if (!KEY) { console.error('Missing GLM_KEY.'); process.exit(1); }
const EP = 'https://api.z.ai/api/paas/v4/chat/completions';
const VISION = 'glm-4.6v';
// glm-4.6v needs minutes to watch a video — raise undici's header/body timeouts well past the default.
const dispatcher = new Agent({headersTimeout: 600000, bodyTimeout: 600000, connectTimeout: 30000});

const inputs = process.argv.slice(2);
if (!inputs.length) { console.error('usage: node scripts/glm-style-transfer.mjs <video|url> [more...]'); process.exit(1); }

const toUrl = (v) => {
  if (/^https?:\/\//.test(v)) return v;
  // Downscale to a small 480p/12fps/no-audio proxy (<~2MB) so glm-4.6v can fetch + watch it fast.
  const proxy = `out/ref-proxy-${v.split(/[\\/]/).pop().replace(/[^\w]+/g, '_')}.mp4`;
  console.log(`making small proxy of ${v} ...`);
  execSync(`ffmpeg -y -loglevel error -i "${v}" -t 90 -vf "scale=854:-2" -r 12 -an -crf 34 -preset veryfast "${proxy}"`);
  console.log(`uploading ${proxy} ...`);
  const url = execSync(`curl -sS --max-time 240 -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@${proxy}" https://litterbox.catbox.moe/resources/internals/api.php`).toString().trim();
  console.log(`  -> ${url}`);
  return url;
};
const urls = inputs.map(toUrl);

const prompt = `You are an elite motion-design director. WATCH ${urls.length > 1 ? `these ${urls.length} reference SaaS explainer videos` : 'this reference SaaS explainer video'} and write a DETAILED, concrete teardown so another director can hit the SAME craft level for a DIFFERENT company. Since you can see the actual motion, describe the real timing/pacing/transitions — not guesses. Never copy the reference's words, logos, exact layouts or claims. Return ONLY JSON:
{
  "overall": "2-3 sentences: the craft signature — energy, pacing, how it uses the real product, motion character, restraint",
  "beats": ["the ordered beats/scenes you see: for each, what's on screen + how it's composed + the MOTION (what moves, how fast, easing feel) + the technique"],
  "productUsage": "how it shows the real product UI (framing, crop-zoom, device treatment, cursor-driven demos) — the thing that makes it feel real not generic",
  "transitions": "how shots hand off (match cut / push / dissolve / continuity) and the rhythm",
  "typography": "type treatment + hierarchy",
  "colorAndLight": "palette, glow, contrast handling",
  "transferPlaybook": ["6-10 concrete, imperative directions to reach this level for a different brand"],
  "doNotCopy": ["reference-specific things that must NOT be reused"]
}`;

const content = [{type: 'text', text: prompt}, ...urls.map((u) => ({type: 'video_url', video_url: {url: u}}))];
console.log(`decoding with ${VISION} (native video)...`);
const res = await fetch(EP, {method: 'POST', headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({model: VISION, messages: [{role: 'user', content}]}), dispatcher});
if (!res.ok) { console.error(`GLM ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const txt = (await res.json()).choices?.[0]?.message?.content ?? '';
const m = txt.match(/\{[\s\S]*\}/);
if (!m) { console.error('No JSON in vision output:\n' + txt.slice(0, 500)); process.exit(1); }
const brief = JSON.parse(m[0]);
brief._sources = inputs;
writeFileSync('out/style-brief.json', JSON.stringify(brief, null, 2));
console.log(`\nDecoded ${urls.length} reference(s) -> out/style-brief.json\n`);
console.log(JSON.stringify(brief, null, 2).slice(0, 1600));
