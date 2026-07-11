/**
 * MG Codegen — the frame renderer (E0 Phase D, render core). Turns ONE validated, compile-ready component
 * (the model's body + the injected kit imports) into a TRANSPARENT WebP frame sequence on disk — the asset
 * the timeline plays in BOTH the browser preview and the final render (Law 1: baked alpha, never live code).
 *
 * This is a PURE render step. It does not decide anything creative (the scan + judge already did) and it does
 * not fall back (that is the codegen SERVICE's job). It either produces alpha frames or throws — never a silent
 * opaque graphic (R18N).
 *
 * WHY png→webp and not webp-direct (verified, tmp/mg-alpha-probe/bench-webp.mjs, Remotion 4.0.398):
 *   Remotion's OWN webp encoder FLATTENS alpha — renderFrames({imageFormat:'webp'}) and renderStill(webp) both
 *   emit opaque frames (hasAlpha=false). The ONLY alpha-preserving path is renderFrames({imageFormat:'png'})
 *   (Remotion PNG keeps alpha) → transcode png→webp with SHARP (sharp's webp encoder DOES write alpha). WebP is
 *   the stored/served format (~3.8× smaller than png); png is a throwaway intermediate inside this function.
 *
 * SERVER-ONLY. Imports the Remotion bundler/renderer + sharp; runs in a render worker (needs a filesystem +
 * Chromium), never in a serverless/client bundle. It is intentionally isolated from codegen-service.ts (which
 * the router imports) so those heavy deps never leak into the request path.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderFrames, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';

import { COMPOSITION_ID, buildRootSource, ENTRY_SOURCE, workspaceId, type MgRenderInput } from './scaffold';

export type { MgRenderInput } from './scaffold';

/** The 4 kit modules a generated component imports as `./kit/*`. Copied into the isolated render workspace so
 *  the component's `import … from './kit/brand'` resolves without touching the real lib tree. */
const KIT_FILES = ['brand.ts', 'stage.tsx', 'fit-text.tsx', 'choreo.ts'] as const;
/** Kit source lives here relative to the repo root (the render worker runs with the repo checked out). Not
 *  derived from __dirname so it works under both the CJS build and a tsx/ESM run; overridable via opts.kitDir. */
const KIT_SUBPATH = ['lib', 'editron', 'motion-graphics', 'codegen', 'kit'];

const WEBP_QUALITY = 90; // ← bench: flat brand colour, visually lossless, 3.8× < png
const WEBP_ALPHA_QUALITY = 100; // ← alpha is a mask; lossless edges over footage
const TRANSCODE_CONCURRENCY = 8; // ← I/O-bound; tune

export interface MgRenderResult {
  /** Directory holding the transparent WebP frames. */
  webpDir: string;
  /** WebP frame files, ordered by frame index (files[i] is frame i). */
  files: string[];
  /** The whole scratch workspace (bundle + png + webp). Caller deletes it after ingest via cleanupWorkspace. */
  workspaceDir: string;
  width: number;
  height: number;
  fps: number;
  count: number;
  renderMs: number;
}

/** Run an async map with a bounded worker pool (avoids spawning one sharp op per frame at once). */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Render one validated component to a transparent WebP frame sequence. Never falls back — throws on any
 * failure (the SERVICE decides whether a throw means "use the Tier-A engine"). Returns the frame files +
 * the scratch workspace for the caller to ingest then delete (cleanupWorkspace).
 */
export async function renderMomentToWebpFrames(
  input: MgRenderInput,
  opts: { repoRoot?: string; workspaceRoot?: string; kitDir?: string } = {},
): Promise<MgRenderResult> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const kitDir = opts.kitDir ?? path.join(repoRoot, ...KIT_SUBPATH);
  const root = opts.workspaceRoot ?? path.join(repoRoot, '.mg-render-tmp');
  const workspaceDir = path.join(root, workspaceId(input));
  const kitOut = path.join(workspaceDir, 'kit');
  const pngDir = path.join(workspaceDir, 'png');
  const webpDir = path.join(workspaceDir, 'webp');
  const started = Date.now();

  // 1. Scaffold an isolated Remotion project INSIDE the tree (so node_modules resolves by walking up).
  await fs.rm(workspaceDir, { recursive: true, force: true });
  await fs.mkdir(kitOut, { recursive: true });
  await fs.mkdir(pngDir, { recursive: true });
  await fs.mkdir(webpDir, { recursive: true });
  await Promise.all(KIT_FILES.map((f) => fs.copyFile(path.join(kitDir, f), path.join(kitOut, f))));
  await fs.writeFile(path.join(workspaceDir, 'MgScene.tsx'), input.componentSource, 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'Root.tsx'), buildRootSource(input), 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'index.ts'), ENTRY_SOURCE, 'utf8');

  // 2. Bundle + render frames as ALPHA PNG (the only alpha-preserving Remotion output).
  const serveUrl = await bundle({ entryPoint: path.join(workspaceDir, 'index.ts') });
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID });
  await renderFrames({
    composition,
    serveUrl,
    imageFormat: 'png',
    outputDir: pngDir,
    inputProps: {}, // brand + data are baked into the Root's defaultProps (buildRootSource)
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
  });

  // 3. Transcode png → transparent WebP with sharp (Remotion's webp drops alpha; sharp's keeps it).
  const pngs = (await fs.readdir(pngDir))
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({ f, n: parseInt((f.match(/(\d+)/) ?? [])[1] ?? '0', 10) }))
    .sort((a, b) => a.n - b.n);
  if (pngs.length !== Math.round(input.durationInFrames)) {
    throw new Error(`MG render: expected ${Math.round(input.durationInFrames)} frames, got ${pngs.length}`);
  }
  const files = await mapPool(pngs, TRANSCODE_CONCURRENCY, async ({ f }, i) => {
    const name = `${String(i).padStart(5, '0')}.webp`;
    await sharp(path.join(pngDir, f)).webp({ quality: WEBP_QUALITY, alphaQuality: WEBP_ALPHA_QUALITY }).toFile(path.join(webpDir, name));
    return name;
  });

  // 4. Fail loud if the frames are NOT transparent (R18N): a mid frame must carry an alpha channel. If this
  //    ever throws, Remotion/sharp changed under us — do NOT ship opaque graphics over the footage.
  const mid = files[Math.floor(files.length / 2)];
  const meta = await sharp(path.join(webpDir, mid)).metadata();
  if (!meta.hasAlpha) {
    throw new Error('MG render: transcoded WebP frames have NO alpha channel — refusing to ship opaque motion graphics.');
  }

  return {
    webpDir,
    files,
    workspaceDir,
    width: input.width,
    height: input.height,
    fps: input.fps,
    count: files.length,
    renderMs: Date.now() - started,
  };
}

/** Delete a render workspace once its frames are ingested. Best-effort: Windows can briefly hold a lock on a
 *  just-read file (EBUSY/EPERM), so retry a few times; a leftover gitignored scratch dir is harmless. */
export async function cleanupWorkspace(workspaceDir: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY')) return;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
