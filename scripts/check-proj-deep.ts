// Untracked investigation helper — deep-inspect proj_XbI_NCq181A2 for the user's 4 asks:
// (1) transcript integrity, (2) timeline gaps between cuts, (3) word-highlight reality
// (caption word-by-word vs MG keyword-highlight), (4) caption style/configurability. Read-only.
import { MongoClient } from 'mongodb';
import { requireMongoUri } from './utils/mongo-uri';

const uri = requireMongoUri('scripts/check-proj-deep.ts');
const PID = process.argv[2] || 'proj_XbI_NCq181A2';
const FPS = 30;
const f2s = (f: number) => (f / FPS).toFixed(2);

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('editron_prev');
  const p = await db.collection('projects').findOne({ projectId: PID });
  if (!p) { console.log('NOT FOUND'); await client.close(); return; }
  const ovs = p.overlays || [];

  // ── (2) TIMELINE GAPS between video clips ──
  const vids = ovs.filter((o: any) => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
  console.log(`=== (2) TIMELINE GAPS — ${vids.length} video clips, total frames ${p.durationInFrames} (${f2s(p.durationInFrames)}s) ===`);
  let gaps = 0, overlaps = 0;
  for (let i = 0; i < vids.length - 1; i++) {
    const end = vids[i].from + vids[i].durationInFrames;
    const nextStart = vids[i + 1].from;
    const delta = nextStart - end;
    if (delta > 1) { gaps++; console.log(`  GAP ${delta}f (${f2s(delta)}s) between clip[${i}] end=${end} and clip[${i + 1}] start=${nextStart}  [BLACK FRAME]`); }
    else if (delta < -1) { overlaps++; /* overlaps are usually transitions */ }
  }
  const firstStart = vids[0]?.from ?? 0;
  if (firstStart > 1) console.log(`  GAP at START: first clip begins at frame ${firstStart} (${f2s(firstStart)}s) — black frames at head`);
  const lastEnd = vids.length ? vids[vids.length - 1].from + vids[vids.length - 1].durationInFrames : 0;
  const tailGap = p.durationInFrames - lastEnd;
  if (tailGap > 1) console.log(`  GAP at END: last clip ends at ${lastEnd}, composition is ${p.durationInFrames} → ${tailGap}f (${f2s(tailGap)}s) black tail`);
  console.log(`  Summary: ${gaps} mid-timeline gaps, ${overlaps} overlaps (overlaps usually = transitions), firstStart=${firstStart}, tailGap=${tailGap}`);
  // sample clip source ranges (to spot all-clips-from-frame-0 desync bug)
  console.log('  First 6 clips [from→end | src start]:');
  vids.slice(0, 6).forEach((o: any, i: number) => console.log(`    clip[${i}] tl=${o.from}→${o.from + o.durationInFrames} dur=${o.durationInFrames} srcStart=${o.videoStartTime ?? o.sourceStartFrame ?? '?'} asset=${(o.assetId || '').slice(0, 22)}`));

  // ── (1) TRANSCRIPT INTEGRITY + (3) WORD HIGHLIGHT + (4) CAPTION STYLE ──
  const caps = ovs.filter((o: any) => o.type === 'caption').sort((a: any, b: any) => a.from - b.from);
  console.log(`\n=== (1)(3)(4) CAPTIONS — ${caps.length} caption overlays ===`);
  // full transcript text reconstructed from captions
  const allText = caps.map((c: any) => c.text || (c.captions || []).map((x: any) => x.text).join(' ') || (c.words || []).map((w: any) => w.word).join(' ')).join(' | ');
  console.log('Reconstructed caption text (first 1200 chars):');
  console.log('  ' + allText.slice(0, 1200));

  // structure of one caption: word-level? style?
  const c0 = caps[0] || {};
  console.log('\nSample caption[0] top-level keys:', Object.keys(c0).join(', '));
  console.log('  from=', c0.from, 'dur=', c0.durationInFrames);
  console.log('  has words[]?:', Array.isArray(c0.words), 'len=', c0.words?.length, '| has captions[]?:', Array.isArray(c0.captions), 'len=', c0.captions?.length);
  if (Array.isArray(c0.words) && c0.words.length) console.log('  words[0..3]:', JSON.stringify(c0.words.slice(0, 4)));
  console.log('  style/styling:', JSON.stringify(c0.styles || c0.style || c0.captionStyle || c0.template || 'NONE').slice(0, 400));
  // highlight indicators
  const hlKeys = Object.keys(c0).filter(k => /highlight|active|emphasis|karaoke|wordByWord|word_by_word/i.test(k));
  console.log('  highlight-related keys on caption:', hlKeys.length ? hlKeys.join(', ') : 'none at top level');
  // styles object detail (caption UI look)
  if (c0.styles) console.log('  styles detail:', JSON.stringify(c0.styles).slice(0, 500));

  // distinct caption styles across all (configurability evidence)
  const styleSet = new Set(caps.map((c: any) => JSON.stringify(c.styles?.fontFamily || c.captionStyle || c.template || c.styles?.preset || '?')));
  console.log('  distinct caption style signatures:', [...styleSet].slice(0, 6).join(' | '));

  await client.close();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
