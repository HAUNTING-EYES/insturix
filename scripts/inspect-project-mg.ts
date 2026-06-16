import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config({ path: '.env.local' });

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: npx tsx scripts/inspect-project-mg.ts <projectId>');
  process.exit(1);
}

const uri = process.env.MONGODB_URI ?? '';
if (!uri) {
  console.error('MONGODB_URI missing. Put it in .env.local or the process environment.');
  process.exit(1);
}

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const compactJson = (value: unknown, maxLength = 1000) => {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const summarizeElement = (element: any) => ({
  id: element.id,
  role: element.role,
  type: element.type,
  kind: element.kind,
  text: element.text,
  value: element.value,
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  color: element.color,
  style: element.style,
});

async function main() {
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db('editron_prev');
    const project = await db.collection('projects').findOne({ projectId });

    if (!project) {
      console.log('NOT_FOUND');
      return;
    }

    const overlays = project.overlays ?? [];
    const overlayCounts = overlays.reduce((counts: Record<string, number>, overlay: any) => {
      counts[overlay.type] = (counts[overlay.type] ?? 0) + 1;
      return counts;
    }, {});

    console.log('PROJECT');
    console.log(compactJson({
      projectId: project.projectId,
      status: project.status,
      stage: project.stage,
      fps: project.fps,
      durationInFrames: project.durationInFrames,
      durationSeconds: round((project.durationInFrames ?? 0) / (project.fps ?? 30)),
      width: project.width,
      height: project.height,
      aspectRatio: project.aspectRatio,
      overlayCounts,
    }));

    const diagnosticKeys = Object.keys(project)
      .filter((key) => /decision|brief|edl|director|intent|genre|profile|graphic|bundle/i.test(key))
      .sort();
    console.log('\nPROJECT_DIAGNOSTIC_KEYS');
    console.log(compactJson(diagnosticKeys, 1600));

    for (const key of diagnosticKeys) {
      const value = project[key];
      if (Array.isArray(value)) {
        console.log(`${key}: array(${value.length})`);
        console.log(compactJson(value.slice(0, 8), 1400));
      } else if (value && typeof value === 'object') {
        const nestedKeys = Object.keys(value).slice(0, 30);
        console.log(`${key}: object keys=${nestedKeys.join(', ')}`);
        console.log(compactJson(value, 1400));
      } else {
        console.log(`${key}: ${String(value)}`);
      }
    }

    const captions = overlays.filter((overlay: any) => overlay.type === 'caption');
    console.log('\nCAPTIONS');
    console.log(compactJson(captions.map((caption: any) => ({
      id: caption.id,
      from: caption.from,
      durationInFrames: caption.durationInFrames,
      seconds: round((caption.from ?? 0) / (project.fps ?? 30)),
      top: caption.top,
      height: caption.height,
      width: caption.width,
      template: caption.template,
      mode: caption.displayConfig?.mode,
      source: caption.metadata?.source,
      captionCount: caption.captions?.length,
      wordCount: caption.words?.length,
    })), 1400));

    const motionGraphics = overlays
      .filter((overlay: any) => overlay.type === 'motion-graphic')
      .sort((a: any, b: any) => (a.from ?? 0) - (b.from ?? 0));

    console.log(`\nMOTION_GRAPHICS count=${motionGraphics.length}`);
    motionGraphics.forEach((overlay: any, index: number) => {
      console.log(`\nMG[${index}]`);
      console.log(compactJson({
        id: overlay.id,
        from: overlay.from,
        seconds: round((overlay.from ?? 0) / (project.fps ?? 30)),
        durationInFrames: overlay.durationInFrames,
        durationSeconds: round((overlay.durationInFrames ?? 0) / (project.fps ?? 30)),
        left: overlay.left,
        top: overlay.top,
        width: overlay.width,
        height: overlay.height,
        position: overlay.position,
        structureType: overlay.structureType,
        template: overlay.template,
        graphicType: overlay.metadata?.graphicType,
        edlReason: overlay.metadata?.edlReason,
        source: overlay.metadata?.source,
      }));

      console.log('content');
      console.log(compactJson(overlay.content, 900));
      console.log('contentSignals');
      console.log(compactJson(overlay.contentSignals, 1200));
      console.log('recipe');
      console.log(compactJson({
        id: overlay.recipe?.id,
        layout: overlay.recipe?.layout,
        elements: overlay.recipe?.elements?.map(summarizeElement),
      }, 1800));
      console.log('metadata');
      console.log(compactJson(overlay.metadata, 1400));
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
