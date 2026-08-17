/**
 * Local (no-Lambda) render of a completed preview project.
 * Why: the deployed Remotion serve-url bundle bakes NEXT_PUBLIC_BASE_URL as
 * localhost:3000 (url-helper.ts:13), so every Lambda video render starves.
 * Here we bundle locally with NEXT_PUBLIC_BASE_URL pointed at a tiny local
 * media proxy this script hosts itself — no auth, no product dependencies.
 *
 * Usage: npx tsx scripts/client-reel-local-render.ts <projectId> <outPath>
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const PROXY_PORT = 8799;
process.env.NEXT_PUBLIC_BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

function envVal(key: string): string {
  const line = readFileSync('.calibration-temp/vercel-preview.env', 'utf8').split('\n')
    .find(l => l.replace(/^﻿/, '').startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing`);
  return line.slice(key.length + 1).replace(/^"|"\r?$/g, '').trim();
}

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

async function main() {
  const [projectId, outPath] = process.argv.slice(2);
  if (!projectId || !outPath) throw new Error('args: <projectId> <outPath>');

  // Local media proxy: /proxy?src=<abs>&... -> stream the absolute URL.
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', `http://127.0.0.1:${PROXY_PORT}`);
      const src = u.searchParams.get('src');
      if (!src || !/^https:\/\//.test(src)) { res.writeHead(400).end('bad src'); return; }
      const upstream = await fetch(src, { headers: req.headers.range ? { range: String(req.headers.range) } : {} });
      const headers: Record<string, string> = {};
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const val = upstream.headers.get(h); if (val) headers[h] = val;
      }
      res.writeHead(upstream.status, headers);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (e) { res.writeHead(502).end(String(e)); }
  });
  await new Promise<void>(r => server.listen(PROXY_PORT, '127.0.0.1', r));
  console.log('local media proxy on', PROXY_PORT);

  const client = new MongoClient(envVal('MONGODB_URI'));
  await client.connect();
  const project = await client.db('editron_prev').collection('projects').findOne({ projectId });
  await client.close();
  if (!project) throw new Error(`project ${projectId} not found`);
  const overlays = deproxy(project.overlays ?? []) as Array<Record<string, unknown>>;
  console.log('project:', project.durationInFrames, 'frames', JSON.stringify(project.playerDimensions));

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const { COMP_NAME } = await import('../components/editron/editor/version-7.0.0/constants');
  const { buildLambdaRenderInputProps } = await import('../lib/editron/shared/render-request-payload');

  const serveUrl = await bundle(
    path.resolve(process.cwd(), 'components', 'editron', 'editor', 'version-7.0.0', 'remotion', 'index.ts'),
    undefined,
    {
      webpackOverride: config => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );
  console.log('bundled');

  const inputProps = buildLambdaRenderInputProps({
    overlays: overlays as never,
    durationInFrames: Number(project.durationInFrames),
    fps: Number(project.fps),
    width: Number(project.playerDimensions?.width ?? 1080),
    height: Number(project.playerDimensions?.height ?? 1920),
    baseUrl: `http://127.0.0.1:${PROXY_PORT}`,
    isRendering: true,
  } as never) as unknown as Record<string, unknown>;

  const composition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps });
  const browserErrors: string[] = [];
  await renderMedia({
    composition: { ...composition, durationInFrames: Number(project.durationInFrames), width: Number(project.playerDimensions?.width ?? 1080), height: Number(project.playerDimensions?.height ?? 1920), fps: Number(project.fps) },
    serveUrl,
    codec: 'h264',
    outputLocation: outPath,
    inputProps,
    chromiumOptions: { headless: true },
    concurrency: 2,
    overwrite: true,
    timeoutInMilliseconds: 240_000,
    onBrowserLog: e => { if (e.type === 'error') browserErrors.push(e.text.slice(0, 200)); },
    onProgress: p => { if (Math.round(p.progress * 100) % 10 === 0) console.log('render', Math.round(p.progress * 100) + '%'); },
  });
  server.close();
  if (browserErrors.length) console.log('browser errors (first 3):', browserErrors.slice(0, 3));
  console.log('SAVED:', outPath);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
