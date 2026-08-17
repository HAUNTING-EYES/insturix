/**
 * One-shot headless export driver for a completed auto-edit project on PREVIEW.
 * Loads the project from the preview Mongo, prints a QC summary, assembles
 * render input via the PRODUCTION builder (rights gate included), fires the
 * cloudrun render route with founder-minted auth, polls progress, downloads MP4.
 * Secrets are read from env files and never printed.
 *
 * Usage: npx tsx scripts/client-reel-export.ts <projectId> <outPath>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';

const BASE = 'https://front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app';
const AUTH_FILE = '.calibration-temp/chat-edit-battle/live-auth.json';
const ENV_FILE = '.calibration-temp/vercel-preview.env';

function envVal(key: string): string {
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find(l => l.replace(/^﻿/, '').startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from env file`);
  return line.slice(key.length + 1).replace(/^"|"\r?$/g, '').trim();
}

async function main() {
  const [projectId, outPath] = process.argv.slice(2);
  if (!projectId || !outPath) throw new Error('args: <projectId> <outPath>');
  const auth = JSON.parse(readFileSync(AUTH_FILE, 'utf8')) as { authorization: string };

  const client = new MongoClient(envVal('MONGODB_URI'));
  await client.connect();
  const db = client.db('editron_prev');
  const project = await db.collection('projects').findOne({ projectId });
  await client.close();
  if (!project) throw new Error(`project ${projectId} not found in editron_prev`);

  const overlays = (project.overlays ?? []) as Array<Record<string, unknown>>;
  const byType: Record<string, number> = {};
  for (const o of overlays) byType[String(o.type)] = (byType[String(o.type)] ?? 0) + 1;
  console.log('QC overlays-by-type:', JSON.stringify(byType));
  console.log('QC duration:', project.durationInFrames, 'frames @', project.fps, 'fps =', Math.round(Number(project.durationInFrames) / Number(project.fps)), 's');
  console.log('QC dims:', JSON.stringify(project.playerDimensions), 'aspect:', project.aspectRatio, 'status:', project.autoEditStatus);

  // Lambda has no window: editor-relative `/proxy?src=<abs>` media URLs resolve
  // to localhost:3000 there (proven: render pxccevxbml starved all chunks).
  // Unwrap to the inner absolute asset-proxy URL, which Lambda fetches directly.
  const deproxy = (v: unknown): unknown => {
    if (typeof v === 'string' && v.includes('/proxy?src=')) {
      const m = v.match(/[?&]src=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    if (Array.isArray(v)) return v.map(deproxy);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, deproxy(x)]));
    }
    return v;
  };
  const cleanOverlays = deproxy(overlays) as typeof overlays;

  const inputProps = buildLambdaRenderInputProps({
    overlays: cleanOverlays as never,
    durationInFrames: Number(project.durationInFrames),
    fps: Number(project.fps),
    width: Number(project.playerDimensions?.width ?? 1080),
    height: Number(project.playerDimensions?.height ?? 1920),
    // The editor passes the deployment origin so overlay/media URLs resolve on
    // Lambda; '' (the audio-only canary's value) makes every asset fetch fail.
    baseUrl: BASE,
    isRendering: true,
  } as never);

  const res = await fetch(`${BASE}/api/services/editron/cloudrun/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: auth.authorization },
    body: JSON.stringify({ projectId, inputProps }),
  });
  const started = await res.json().catch(() => ({}));
  console.log('render POST:', res.status, JSON.stringify(started).slice(0, 400));
  if (!res.ok) throw new Error(`render start failed HTTP ${res.status}`);

  // The cloudrun/progress route currently 500s (serialization bug), so poll the
  // Lambda S3 prefix directly: the newest job doc carries providerRenderId, and
  // Remotion writes renders/<id>/out.mp4 world-readable when complete.
  const client2 = new MongoClient(envVal('MONGODB_URI'));
  await client2.connect();
  const jobs = client2.db('editron_prev').collection('editron_render_jobs');
  const job = await jobs.find({ projectId }).sort({ _id: -1 }).limit(1).next();
  const rid = job?.providerRenderId;
  const bucket = job?.bucketName;
  console.log('providerRenderId:', rid, 'bucket:', bucket);
  await client2.close();
  if (!rid || !bucket) throw new Error('render job doc missing providerRenderId/bucketName');
  const artifact = `https://s3.us-east-1.amazonaws.com/${bucket}/renders/${rid}/out.mp4`;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 15_000));
    const head = await fetch(artifact, { method: 'HEAD' });
    console.log(`poll ${i}: out.mp4 HTTP ${head.status}`);
    if (head.ok) {
      const dl = await fetch(artifact);
      if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
      writeFileSync(outPath, Buffer.from(await dl.arrayBuffer()));
      console.log('SAVED:', outPath);
      return;
    }
  }
  throw new Error('render did not complete within 30 min — check Lambda/CloudWatch for ' + rid);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
