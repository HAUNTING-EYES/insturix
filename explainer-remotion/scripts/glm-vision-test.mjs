// Probe: does GLM see images? Send a rendered frame and ask it to critique the "slop" + name specific
// elements. If it works, GLM can power (a) screenshot-to-edit and (b) an automatic quality judge.
import {readFileSync} from 'node:fs';

const KEY = process.env.GLM_KEY;
const ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
const IMG = process.argv[2] || 'out/final-90.png';
const MODELS = ['glm-4.5v', 'glm-4v', 'glm-4.6v']; // try vision models in order

const b64 = readFileSync(IMG).toString('base64');
const prompt = `You are a senior motion/brand designer reviewing ONE frame of a SaaS explainer video for "Insturix" (warm-dark + gold brand). Be blunt. List up to 4 SPECIFIC, fixable quality problems ("slop") you can actually see — name the exact element and the fix (e.g. "the stat card's number is X, should be Y"). If the frame is clean, say so. Then give a 1-10 polish score.`;

const call = async (model) => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model,
      messages: [{role: 'user', content: [{type: 'text', text: prompt}, {type: 'image_url', image_url: {url: `data:image/png;base64,${b64}`}}]}],
    }),
  });
  return {status: res.status, body: await res.text()};
};

for (const m of MODELS) {
  const r = await call(m);
  if (r.status === 200) {
    const content = JSON.parse(r.body).choices?.[0]?.message?.content ?? '';
    console.log(`\n=== ${m} SEES THE IMAGE — critique: ===\n${content}`);
    process.exit(0);
  }
  console.log(`  ${m}: HTTP ${r.status} ${r.body.slice(0, 120)}`);
}
console.log('\nNo vision model accepted the request with this key.');
