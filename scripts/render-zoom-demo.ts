// UNTRACKED render (never git add scripts/). Renders before/after GIFs of the zoom pull-back:
// FIXED uses the REAL fixed buildZoomKeyframes; OLD reproduces the pre-fix swapped track.
// Run from editron-worktree:  npx tsx scripts/render-zoom-demo.ts
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import * as path from 'path';
import * as fs from 'fs';
import { buildZoomKeyframes } from '../lib/editron/services/zoom-keyframes';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

async function main(): Promise<void> {
  const outDir = path.resolve(process.cwd(), '.calibration-temp', 'zoom-demo');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Bundling scripts/zoom-demo/index.tsx …');
  const serveUrl = await bundle(
    path.resolve(process.cwd(), 'scripts', 'zoom-demo', 'index.tsx'),
    undefined,
    {
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );
  console.log('Bundled OK.\n');

  // FIXED track = the REAL fixed code for a registry wind-down pull-back (scaleFrom 1.06 -> scaleTo 1.0).
  const fixedKf = buildZoomKeyframes('pull-back', 1.06, 1.0, 0, 60, 60).map((k) => ({ frame: k.frame, value: k.value }));
  // OLD track = the pre-fix swapped behaviour (scaleTo -> scaleFrom = 1.0 -> 1.06 = zoom-IN).
  const oldKf = [{ frame: 0, value: 1.0 }, { frame: 60, value: 1.06 }];

  const cases = [
    { id: 'pullback-FIXED', track: fixedKf, label: 'zoom_pull_back — NOW (fixed)', accent: '#36d399' },
    { id: 'pullback-OLD-bug', track: oldKf, label: 'zoom_pull_back — BEFORE (bug)', accent: '#f87272' },
  ];

  for (const c of cases) {
    const inputProps = { track: c.track, label: c.label, accent: c.accent };
    const composition = await selectComposition({ serveUrl, id: 'ZoomDemo', inputProps });
    const file = path.join(outDir, `${c.id}.gif`);
    await renderMedia({
      composition, serveUrl, codec: 'gif', outputLocation: file, inputProps,
      scale: 0.6, everyNthFrame: 2, chromiumOptions: { headless: true }, overwrite: true,
    });
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`  ✓ ${c.id}: track [${c.track.map((k) => k.value).join(' → ')}] → ${path.basename(file)} (${kb}KB)`);
  }
  console.log(`\nGIFs → ${outDir}`);
}
main().catch((e) => { console.error('RENDER ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
