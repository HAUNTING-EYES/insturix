// Untracked motion harness (Phase E review finding #2: motion is the product, invisible in stills).
// Renders the REAL MotionGraphicLayerContent over the FULL overlay duration to an animated GIF, so
// entrance/hold/exit choreography, audio-reactive modulation, and intensity are actually visible.
// Reuses the same MgStill bundle as render-mg-stills.ts. Stays UNTRACKED (no Mongo URI, but scripts/
// is the untracked zone — never git add it).
//   npx tsx scripts/render-mg-motion.ts [proj_OzG2qgoYudFa] [limit]
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import * as path from 'path';
import * as fs from 'fs';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

function slugify(s: string): string {
  return String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24).toLowerCase();
}

async function main(): Promise<void> {
  const arg = process.argv[2] || 'proj_OzG2qgoYudFa';
  const limit = Number(process.argv[3]) || 0; // 0 = all
  const dataFile = arg.endsWith('.json')
    ? (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), '.calibration-temp', path.basename(arg)))
    : path.resolve(process.cwd(), '.calibration-temp', `${arg}-mgs.json`);
  if (!fs.existsSync(dataFile)) {
    console.error(`Missing ${dataFile} — run dump-proj-mgs.ts or adversarial-mg.ts first`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as {
    width: number; height: number; mgs: Array<Record<string, any>>;
  };
  const { width, height } = data;
  let mgs = data.mgs;
  if (limit > 0) mgs = mgs.slice(0, limit);
  const tag = path.basename(dataFile).replace(/\.json$/, '').replace(/-mgs$/, '');
  const outDir = path.resolve(process.cwd(), '.calibration-temp', 'mg-motion', tag);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Bundling harness (scripts/mg-still/index.ts)…`);
  const serveUrl = await bundle(
    path.resolve(process.cwd(), 'scripts', 'mg-still', 'index.ts'),
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
  console.log(`Bundled OK. Rendering ${mgs.length} GIFs (half-scale, full duration)…\n`);

  const issues: string[] = [];
  for (let i = 0; i < mgs.length; i++) {
    const overlay = mgs[i];
    const c = (overlay.content || {}) as Record<string, unknown>;
    const focal = String(c.emphasisWord ?? c.text ?? c.value ?? c.title ?? `mg${i}`);
    const gtype = String(overlay.metadata?.graphicType ?? 'unknown');
    const dur = Number(overlay.durationInFrames) || 60;
    const cw = Number(overlay.canvasWidth) || width;
    const ch = Number(overlay.canvasHeight) || height;
    // guide:false → clean watchable artifact (the gate owns title-safe now, not a visual overlay)
    const inputProps = { overlay, bg: '#12151b', width: cw, height: ch, guide: false };

    const composition = await selectComposition({ serveUrl, id: 'MgStill', inputProps });
    const file = path.join(outDir, `mg${String(i).padStart(2, '0')}-${gtype}-${slugify(focal) || 'x'}.gif`);
    await renderMedia({
      composition, serveUrl, codec: 'gif', outputLocation: file, inputProps,
      scale: 0.5,            // 1920x1080 → 960x540, keeps the GIF shareable
      everyNthFrame: 2,      // ~15fps — smooth enough to read motion, half the frames
      chromiumOptions: { headless: true },
      overwrite: true,
      onBrowserLog: (l) => {
        if (l.type === 'error' || /MG-Render|MG-Fit|cannot fit/i.test(l.text)) {
          issues.push(`  MG[${i}] "${focal}" (${l.type}): ${l.text}`);
        }
      },
    });
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`  ✓ MG[${String(i).padStart(2, '0')}] "${focal}" ${gtype} ${dur}f → ${path.basename(file)} (${kb}KB)`);
  }

  console.log('\n=== BROWSER LOGS (errors / MG-Render / MG-Fit) ===');
  if (issues.length) issues.forEach((l) => console.log(l));
  else console.log('  (none — no render errors)');
  console.log(`\nGIFs → ${outDir}`);
}

main().catch((e) => { console.error('RENDER ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
