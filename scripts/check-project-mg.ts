import { MongoClient } from 'mongodb';
import { requireMongoUri } from './utils/mongo-uri';

const uri = requireMongoUri('scripts/check-project-mg.ts');
const PROJECT_ID = 'proj_K_0-dSCJ76z4';

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('editron_prev');

    const project = await db.collection('projects').findOne({ projectId: PROJECT_ID });
    if (!project) { console.log('NOT FOUND'); return; }

    console.log('=== PROJECT STATUS ===');
    console.log('status:', project.status);
    console.log('stage:', project.stage);
    console.log('totalFrames:', project.durationInFrames);
    console.log('fps:', project.fps);

    console.log('\n=== OVERLAYS ===');
    const types: Record<string, number> = {};
    (project.overlays || []).forEach((o: any) => { types[o.type] = (types[o.type] || 0) + 1; });
    console.log('overlay counts:', JSON.stringify(types));

    // Motion graphic overlays
    const mgOverlays = (project.overlays || []).filter((o: any) => o.type === 'motion-graphic');
    console.log('\n=== MOTION GRAPHIC OVERLAYS ===');
    mgOverlays.forEach((o: any, i: number) => {
      console.log(`MG[${i}]: frame=${o.from}, dur=${o.durationInFrames}`);
      console.log(`  content: ${JSON.stringify(o.content || {}).slice(0, 200)}`);
      console.log(`  has recipe: ${!!o.recipe}, has structureType: ${!!o.structureType}`);
      if (o.recipe) console.log(`  recipe.id=${o.recipe.id}, elements=${o.recipe.elements?.length}, layout=${o.recipe.layout?.position}, exit=${o.recipe.exitStyle}`);
      if (o.metadata) console.log(`  metadata: ${JSON.stringify(o.metadata).slice(0, 200)}`);
    });

    // HTML-scene overlays (old MG path)
    const htmlOverlays = (project.overlays || []).filter((o: any) => o.type === 'html-scene');
    console.log('\n=== HTML-SCENE OVERLAYS (old MG) ===');
    htmlOverlays.forEach((o: any, i: number) => {
      const contentPreview = String(o.content || '').replace(/<[^>]*>/g, '').trim().slice(0, 80);
      console.log(`HTML[${i}]: frame=${o.from}, dur=${o.durationInFrames}, text="${contentPreview}"`);
      if (o.metadata) console.log(`  metadata: ${JSON.stringify(o.metadata).slice(0, 150)}`);
    });

    // Raw footage transcript
    const rfa = await db.collection('raw_footage_analyses').findOne({ projectId: PROJECT_ID });
    if (rfa?.transcript) {
      const segments = rfa.transcript.segments || [];
      const fullText = segments.map((s: any) => s.text).join(' ');
      console.log(`\n=== TRANSCRIPT (${segments.length} segments, ${fullText.split(/\s+/).length} words) ===`);
      console.log(fullText.slice(0, 800));
      console.log('...');
      console.log(fullText.slice(-400));
    }

    // Video clips - check cuts at end
    const videoOverlays = (project.overlays || []).filter((o: any) => o.type === 'video');
    console.log(`\n=== VIDEO CLIPS (${videoOverlays.length} total, last 8) ===`);
    videoOverlays.slice(-8).forEach((o: any, i: number) => {
      const idx = videoOverlays.length - 8 + i;
      console.log(`Clip[${idx}]: from=${o.from}, dur=${o.durationInFrames}, end=${o.from + o.durationInFrames}, asset=${(o.assetId || '').slice(0, 25)}`);
    });

    // Caption overlays
    const captionOverlays = (project.overlays || []).filter((o: any) => o.type === 'caption');
    console.log(`\nCaption overlays: ${captionOverlays.length}`);

    // Render quality check
    console.log('\n=== RENDER CONFIG ===');
    console.log('width:', project.width);
    console.log('height:', project.height);
    console.log('aspectRatio:', project.aspectRatio);

  } finally { await client.close(); }
}

main().catch(e => console.error('ERROR:', e.message));
