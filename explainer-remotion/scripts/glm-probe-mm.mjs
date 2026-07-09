// Probe: is glm-5.2 multimodal (takes images)? does the API take video natively (video_url)? This decides
// whether GLM can watch the reference videos itself (frames or video) vs needing a vision→text handoff.
import {readFileSync} from 'node:fs';
const KEY = process.env.GLM_KEY;
const EP = 'https://api.z.ai/api/paas/v4/chat/completions';
const img = readFileSync('public/product/insturix-0.png').toString('base64');
const VIDEO_URL = process.argv[2] || 'https://litter.catbox.moe/0p47q3.mp4';

async function test(label, model, content) {
  try {
    const r = await fetch(EP, {method: 'POST', headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({model, messages: [{role: 'user', content}], max_tokens: 40})});
    const t = await r.text();
    let out = t.slice(0, 200);
    try { out = JSON.parse(t).choices?.[0]?.message?.content?.slice(0, 160) ?? t.slice(0, 200); } catch {}
    console.log(`${label} [${model}] ${r.status}: ${out}`);
  } catch (e) { console.log(`${label} [${model}] ERR: ${String(e).slice(0, 140)}`); }
}

const imgContent = [{type: 'text', text: 'One line: what does this image show?'}, {type: 'image_url', image_url: {url: `data:image/png;base64,${img}`}}];
await test('IMG', 'glm-5.2', imgContent);
await test('IMG', 'glm-4.6v', imgContent);
await test('VIDEO', 'glm-4.6v', [{type: 'text', text: 'One line: describe this video.'}, {type: 'video_url', video_url: {url: VIDEO_URL}}]);
await test('VIDEO', 'glm-5.2', [{type: 'text', text: 'One line: describe this video.'}, {type: 'video_url', video_url: {url: VIDEO_URL}}]);
