// Untracked — per-MG signal variation check. Are the per-moment signals DISTINCT per graphic,
// or the same video-level value on all of them? (Answers: did the monotony actually improve?)
import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI ?? '';
if (!uri) {
  throw new Error('MONGODB_URI is required to run scripts/check-mg-signals.ts');
}
const PID = process.argv[2] || 'proj_-BouQMiMnZf3';

async function main() {
  const client = new MongoClient(uri); await client.connect();
  const db = client.db('editron_prev');
  const p = await db.collection('projects').findOne({ projectId: PID });
  if (!p) { console.log('NOT FOUND'); await client.close(); return; }
  const mgs = (p.overlays || []).filter((o: any) => o.type === 'motion-graphic')
    .filter((o: any) => o.contentSignals && Object.keys(o.contentSignals).length);
  console.log(`${mgs.length} MGs with signals\n`);

  // union of all signal keys
  const keys = new Set<string>();
  mgs.forEach((m: any) => Object.keys(m.contentSignals).forEach(k => keys.add(k)));

  // for each key: how many DISTINCT values across MGs?
  console.log('SIGNAL KEY            | distinct values across MGs | sample');
  console.log('-'.repeat(80));
  const PER_MOMENT = new Set(['visual_change_rate', 'cinematic_moment', 'visceral_impact', 'motion_intensity',
    'visual_significance', 'face_emotion', 'face_present', 'emotional_arousal', 'speech_energy', 'energy_delta',
    'shot_scale', 'scene_type', 'visual_complexity', 'time_since_last_cut', 'stress_detected']);
  for (const k of [...keys].sort()) {
    const vals = mgs.map((m: any) => m.contentSignals[k]);
    const distinct = new Set(vals.map((v: any) => String(v)));
    const flag = PER_MOMENT.has(k) ? (distinct.size > 1 ? ' ⬅ VARIES (good)' : ' ⬅ PER-MOMENT but CONSTANT (monotony!)') : '';
    console.log(`${k.padEnd(22)}| ${String(distinct.size).padStart(3)} distinct${' '.repeat(15)}| ${String(vals[0]).slice(0, 18)}${flag}`);
  }

  console.log(`\nVERDICT: of the per-moment signals present, how many actually vary across the ${mgs.length} graphics?`);
  const present = [...keys].filter(k => PER_MOMENT.has(k));
  const varying = present.filter(k => new Set(mgs.map((m: any) => String(m.contentSignals[k]))).size > 1);
  console.log(`  per-moment signals present: ${present.length} [${present.join(', ')}]`);
  console.log(`  of those, VARYING per-MG: ${varying.length} [${varying.join(', ') || 'NONE — every graphic gets identical signals'}]`);

  await client.close();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
