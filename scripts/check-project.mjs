import 'dotenv/config';
import { MongoClient } from 'mongodb';

const c = new MongoClient(process.env.MONGODB_URI);
await c.connect();
const db = c.db('editron_prev');
const projectId = process.argv[2] || 'proj_HMKQa07M3Mnh';
const p = await db.collection('projects').findOne({ projectId });
if (!p) { console.log('NOT FOUND'); process.exit(0); }

const o = p.overlays || [];
console.log('Total overlays:', o.length);

const t = {};
o.forEach(x => t[x.type] = (t[x.type] || 0) + 1);
console.log('By type:', JSON.stringify(t, null, 2));

const v = o.filter(x => x.type === 'video');
const last = v.reduce((a, b) => (a.from + a.durationInFrames) > (b.from + b.durationInFrames) ? a : b);
console.log('\nVideo clips:', v.length);
console.log('Last clip ends at frame:', last.from + last.durationInFrames, '=', ((last.from + last.durationInFrames) / 30).toFixed(1), 'seconds');

const mg = o.filter(x => x.type === 'motion-graphic');
console.log('\nMotion graphics:', mg.length);
mg.forEach(m => console.log('  ', m.structureType, 'from:', m.from, 'dur:', m.durationInFrames, 'content:', JSON.stringify(m.content)));

const hs = o.filter(x => x.type === 'html-scene');
console.log('\nHTML scenes:', hs.length);
hs.forEach(h => console.log('  ', (h.metadata?.graphicType || '?'), 'from:', h.from, 'dur:', h.durationInFrames));

const sounds = o.filter(x => x.type === 'sound');
console.log('\nSounds:', sounds.length);
sounds.forEach(s => console.log('  row:', s.row, 'from:', s.from, 'dur:', s.durationInFrames, 'asset:', s.assetId || '?'));

const captions = o.filter(x => x.type === 'caption');
console.log('\nCaptions:', captions.length);

const transitions = o.filter(x => x.type === 'transition');
console.log('Transitions:', transitions.length);

console.log('\n--- Project metadata ---');
console.log('Created:', p.createdAt);
console.log('Updated:', p.updatedAt);
console.log('Duration field:', p.duration);
console.log('FPS:', p.fps);

await c.close();
