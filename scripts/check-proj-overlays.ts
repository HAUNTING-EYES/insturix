// Untracked helper — dump ALL overlays for a project (default proj_XbI_NCq181A2) to confirm
// the log finding (graphics failing) against persisted DB state. Read-only.
import { MongoClient } from 'mongodb';
import { requireMongoUri } from './utils/mongo-uri';

const uri = requireMongoUri('scripts/check-proj-overlays.ts');
const PID = process.argv[2] || 'proj_XbI_NCq181A2';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  // try both DBs (preview is editron_prev)
  for (const dbName of ['editron_prev', 'editron_prod']) {
    const db = client.db(dbName);
    const p = await db.collection('projects').findOne({ projectId: PID });
    if (!p) { console.log(`[${dbName}] NOT FOUND`); continue; }
    console.log(`\n================= ${PID} in ${dbName} =================`);
    console.log('status:', p.status, '| stage:', p.stage, '| frames:', p.durationInFrames, '| fps:', p.fps, '| ar:', p.aspectRatio, '| updated:', p.updatedAt);

    const ovs = p.overlays || [];
    const counts: Record<string, number> = {};
    ovs.forEach((o: any) => { counts[o.type] = (counts[o.type] || 0) + 1; });
    console.log('overlay type counts:', JSON.stringify(counts));

    const mgs = ovs.filter((o: any) => o.type === 'motion-graphic');
    console.log(`\n=== MOTION-GRAPHIC overlays: ${mgs.length} ===`);
    mgs.slice(0, 30).forEach((o: any, i: number) => {
      console.log(`MG[${i}] f=${o.from} dur=${o.durationInFrames} recipe=${o.recipe?.id || 'NONE'} elements=${o.recipe?.elements?.length ?? '-'} ` +
        `content=${JSON.stringify(o.content || {}).slice(0, 120)} sig=${o.contentSignals ? Object.keys(o.contentSignals).length : 0}keys ` +
        `metaGType=${o.metadata?.graphicType}`);
      // is the backdrop binding fixed (color.surfaceOpacity) or stale (surface.surfaceOpacity)?
      const bd = (o.recipe?.elements || []).find((e: any) => e.role === 'sm-backdrop');
      if (bd) console.log(`     backdrop opacity binding = ${JSON.stringify(bd.bind?.opacity)}`);
    });

    const html = ovs.filter((o: any) => o.type === 'html-scene');
    console.log(`\n=== HTML-SCENE (old graphic path): ${html.length} ===`);
    html.slice(0, 10).forEach((o: any, i: number) => {
      const txt = String(o.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
      console.log(`HTML[${i}] f=${o.from} text="${txt}"`);
    });

    const caps = ovs.filter((o: any) => o.type === 'caption');
    const vids = ovs.filter((o: any) => o.type === 'video');
    const trans = ovs.filter((o: any) => o.type === 'transition');
    console.log(`\ncaptions=${caps.length} video=${vids.length} transitions=${trans.length}`);
    // filters applied?
    const filtered = vids.filter((o: any) => o.styles?.filter && o.styles.filter !== 'none').length;
    console.log(`video clips with a filter applied: ${filtered}/${vids.length}`);

    // signals available on the project (raw footage analysis)?
    const rfa = await db.collection('raw_footage_analyses').findOne({ projectId: PID });
    if (rfa) {
      const segs = rfa.transcript?.segments?.length ?? 0;
      console.log(`\nraw_footage_analysis: present, transcript segments=${segs}`);
    } else {
      console.log('\nraw_footage_analysis: NONE');
    }
  }
  await client.close();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
