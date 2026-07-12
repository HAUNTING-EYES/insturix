/**
 * SaaS Explainer — render worker (Phase 2, the piece that makes the backend actually run).
 *
 * A long-running Node process on a heavy box (Chromium + ANTHROPIC_API_KEY + AWS + Mongo). Loops:
 *   claim a queued explainer job  →  write its plan + product-model + brand screenshots into the explainer
 *   Remotion project  →  run craft-and-render (craft bespoke scenes → per-video Lambda render → MP4)  →
 *   report progress / complete / fail on the job.
 *
 * Single-worker by design (one job at a time; the explainer-remotion out/ + gen/ + public/product/ dirs are
 * shared per-run state). For parallelism, run N workers each with their own EXPLAINER_REMOTION_DIR checkout.
 * NOT a serverless route — the craft loop's local renderStill needs Chromium + minutes.
 *
 * RUN (on the box):  set -a; . .env.local; set +a; npx tsx scripts/explainer-worker.ts
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  claimNextQueuedExplainerJob,
  updateExplainerJobProgress,
  completeExplainerJob,
  failExplainerJob,
  type ExplainerJob,
} from '@/lib/editron/saas-explainer/explainer-job-service';

const DIR = process.env.EXPLAINER_REMOTION_DIR ?? path.join(process.cwd(), 'explainer-remotion');
const POLL_MS = Number(process.env.EXPLAINER_WORKER_POLL_MS ?? 5000);

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function processJob(job: ExplainerJob): Promise<void> {
  const outDir = path.join(DIR, 'out');
  const productDir = path.join(DIR, 'public', 'product');
  const referenceDir = path.join(DIR, 'public', 'reference');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(productDir, { recursive: true });
  mkdirSync(referenceDir, { recursive: true });

  // Fresh per-job images — clear any prior job's downloads so brands/references don't bleed across videos.
  for (const f of existsSync(productDir) ? readdirSync(productDir) : []) {
    if (/^scan-\d+\.(png|jpe?g|webp)$/i.test(f)) rmSync(path.join(productDir, f));
  }
  for (const f of existsSync(referenceDir) ? readdirSync(referenceDir) : []) {
    if (/^ref-\d+\.(png|jpe?g|webp)$/i.test(f)) rmSync(path.join(referenceDir, f));
  }
  writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(job.plan));
  writeFileSync(path.join(outDir, 'product-model.json'), JSON.stringify(job.productModel));

  let n = 0;
  for (const url of job.productImageUrls ?? []) {
    try {
      await download(url, path.join(productDir, `scan-${n}.png`));
      n += 1;
    } catch (e) {
      console.warn(`[explainer-worker] skipping unreachable image: ${String(e)}`);
    }
  }

  // Style-reference images (video frames / link screenshot) → the craft agent designs each scene to match them.
  let r = 0;
  for (const url of job.referenceImageUrls ?? []) {
    try {
      await download(url, path.join(referenceDir, `ref-${r}.png`));
      r += 1;
    } catch (e) {
      console.warn(`[explainer-worker] skipping unreachable reference image: ${String(e)}`);
    }
  }

  await updateExplainerJobProgress(job._id, 0.05);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/craft-and-render.mjs', job.videoId], {
      cwd: DIR,
      env: { ...process.env, EXPLAINER_VOICE: job.voice }, // prep-audio → glm-voice-fit reads this
    });
    let captured = '';
    let inRenderPhase = false;
    child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString();
      captured += s;
      process.stdout.write(s);
      if (!inRenderPhase && /RENDER on Lambda/.test(s)) {
        inRenderPhase = true;
        void updateExplainerJobProgress(job._id, 0.5);
      }
      const pct = s.match(/\[lambda\]\s+(\d+)%/);
      if (pct) void updateExplainerJobProgress(job._id, 0.5 + 0.5 * (Number(pct[1]) / 100));
    });
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`craft-and-render exited ${code}`));
        return;
      }
      const url = captured.match(/EXPLAINER_MP4=(\S+)/);
      if (!url) {
        reject(new Error('craft-and-render finished without EXPLAINER_MP4'));
        return;
      }
      const cost = captured.match(/cost ≈ \$([0-9.]+)/);
      completeExplainerJob(job._id, url[1], cost ? Number(cost[1]) : null).then(resolve, reject);
    });
  });
}

// Two run modes:
//   daemon (default): poll forever — for an always-on box (Railway) or local dev.
//   batch  (EXPLAINER_WORKER_ONCE=1 or --once): drain the queue, then EXIT — for a Cloud Run Job
//     triggered by Cloud Scheduler (run-to-completion, scales to zero, no client-disconnect gotchas).
const RUN_ONCE = process.env.EXPLAINER_WORKER_ONCE === '1' || process.argv.includes('--once');

// Cloud Run sends SIGTERM ~10s before SIGKILL (e.g. when a run hits the task-timeout mid-craft). If a job is
// in flight, mark it errored on the way out so it isn't left orphaned in 'rendering' forever (an eternal studio
// spinner that no later run can re-claim). The render itself is unrecoverable — fail loud, don't hang.
let inFlightJobId: string | null = null;
let shuttingDown = false;
async function onTerminate(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[explainer-worker] ${signal} received${inFlightJobId ? ` — failing in-flight job ${inFlightJobId}` : ''}`);
  if (inFlightJobId) {
    await failExplainerJob(
      inFlightJobId,
      `worker terminated (${signal}) mid-render — likely the Cloud Run task timeout; increase task-timeout or reduce scene count.`,
    ).catch(() => {});
  }
  process.exit(signal === 'SIGTERM' ? 0 : 1);
}
process.on('SIGTERM', () => { void onTerminate('SIGTERM'); });
process.on('SIGINT', () => { void onTerminate('SIGINT'); });

async function main(): Promise<void> {
  console.log(`[explainer-worker] ${RUN_ONCE ? 'batch (drain + exit)' : `daemon (poll ${POLL_MS}ms)`} · dir=${DIR}`);
  for (;;) {
    let job: ExplainerJob | null = null;
    try {
      job = await claimNextQueuedExplainerJob();
    } catch (e) {
      console.error('[explainer-worker] claim error:', e);
      if (RUN_ONCE) return; // a scheduled run retries on the next tick; don't spin on a broken DB.
    }
    if (!job) {
      if (RUN_ONCE) {
        console.log('[explainer-worker] queue empty — exiting');
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    console.log(`[explainer-worker] claimed ${job._id} (${job.plan.scenes.length} scenes)`);
    inFlightJobId = job._id;
    try {
      await processJob(job);
      console.log(`[explainer-worker] done ${job._id}`);
    } catch (e) {
      console.error(`[explainer-worker] failed ${job._id}:`, e);
      await failExplainerJob(job._id, String(e)).catch(() => {});
    } finally {
      inFlightJobId = null;
    }
  }
}

main().then(
  () => { if (RUN_ONCE) process.exit(0); },
  (e) => { console.error('[explainer-worker] fatal:', e); process.exit(1); },
);
