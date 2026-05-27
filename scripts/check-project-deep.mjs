import 'dotenv/config';
import { MongoClient } from 'mongodb';

const projectId = process.argv[2] || 'proj_HMKQa07M3Mnh';
const c = new MongoClient(process.env.MONGODB_URI);
await c.connect();
const db = c.db('editron_prev');
const p = await db.collection('projects').findOne({ projectId });
if (!p) { console.log('NOT FOUND'); process.exit(0); }

const o = p.overlays || [];
console.log(`PROJECT: ${projectId}`);
console.log(`TOTAL OVERLAYS: ${o.length}`);
console.log(`CREATED: ${p.createdAt}`);
console.log(`UPDATED: ${p.updatedAt}`);
console.log(`FPS: ${p.fps || 30}`);
console.log(`autoEditStatus: ${p.autoEditStatus}`);
console.log('');

// Sort all overlays by from
const sorted = [...o].sort((a, b) => a.from - b.from);

console.log('=== EVERY OVERLAY (sorted by timeline position) ===');
console.log('');

sorted.forEach((ov, i) => {
  const fromSec = (ov.from / 30).toFixed(2);
  const durSec = (ov.durationInFrames / 30).toFixed(2);
  const endFrame = ov.from + ov.durationInFrames;
  const endSec = (endFrame / 30).toFixed(2);

  let detail = '';

  switch (ov.type) {
    case 'video': {
      const vst = ov.videoStartTime || 0;
      const vstSec = (vst / 30).toFixed(2);
      const speed = ov.speed || 1;
      const hasNative = ov.hasNativeAudio || false;
      const filter = ov.styles?.filter || 'none';
      detail = `sourceOffset=${vst}f (${vstSec}s) speed=${speed} nativeAudio=${hasNative} asset=${ov.assetId || '?'} filter=${filter}`;
      break;
    }
    case 'caption': {
      const caps = ov.captions || [];
      const words = caps.reduce((sum, c) => sum + (c.words?.length || 0), 0);
      const firstText = caps[0]?.text?.substring(0, 60) || 'EMPTY';
      const lastText = caps[caps.length - 1]?.text?.substring(0, 60) || '';
      detail = `groups=${caps.length} words=${words} first="${firstText}" last="${lastText}"`;
      break;
    }
    case 'html-scene': {
      const gt = ov.metadata?.graphicType || '?';
      const src = ov.metadata?.sourceType || '?';
      const contentLen = (ov.content || '').length;
      const hasTemplate = ov.content?.includes('cubic-bezier') || ov.content?.includes('@keyframes');
      detail = `graphicType=${gt} source=${src} htmlLen=${contentLen} hasAnimation=${hasTemplate}`;
      break;
    }
    case 'motion-graphic': {
      const st = ov.structureType || '?';
      const content = JSON.stringify(ov.content || {});
      const hasTokens = !!ov.resolvedTokens;
      const tokenKeys = hasTokens ? Object.keys(ov.resolvedTokens).join(',') : 'NONE';
      detail = `structure=${st} content=${content} hasTokens=${hasTokens} tokenKeys=[${tokenKeys}]`;
      break;
    }
    case 'sound': {
      detail = `asset=${ov.assetId || '?'} row=${ov.row} volume=${ov.styles?.volume ?? 'default'}`;
      break;
    }
    case 'transition': {
      const style = ov.transitionStyle || ov.style || '?';
      detail = `style=${style} clipA=${ov.clipAId || '?'} clipB=${ov.clipBId || '?'}`;
      break;
    }
    default:
      detail = `content=${String(ov.content || '').substring(0, 80)}`;
  }

  console.log(`[${String(i).padStart(3)}] ${ov.type.padEnd(16)} from=${String(ov.from).padStart(6)} (${fromSec.padStart(7)}s) dur=${String(ov.durationInFrames).padStart(5)} (${durSec.padStart(6)}s) end=${endSec.padStart(7)}s row=${ov.row} | ${detail}`);
});

console.log('');
console.log('=== TIMELINE GAPS (between video clips) ===');
const videos = sorted.filter(x => x.type === 'video').sort((a, b) => a.from - b.from);
for (let i = 1; i < videos.length; i++) {
  const prevEnd = videos[i-1].from + videos[i-1].durationInFrames;
  const gap = videos[i].from - prevEnd;
  if (gap !== 0) {
    console.log(`GAP between clip ${i-1} and ${i}: ${gap} frames (${(gap/30).toFixed(2)}s) at timeline ${prevEnd}-${videos[i].from}`);
  }
}
if (videos.length > 0) {
  console.log(`\nFirst clip: from=${videos[0].from}, Last clip ends: ${videos[videos.length-1].from + videos[videos.length-1].durationInFrames} = ${((videos[videos.length-1].from + videos[videos.length-1].durationInFrames)/30).toFixed(1)}s`);
}

console.log('');
console.log('=== MOTION GRAPHIC RESOLVED TOKENS ===');
const mg = sorted.filter(x => x.type === 'motion-graphic');
mg.forEach(m => {
  console.log(JSON.stringify(m.resolvedTokens, null, 2));
});

await c.close();
