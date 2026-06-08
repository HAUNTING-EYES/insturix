// Untracked G-1 verification driver. Bundles scripts/mg-still (the REAL MotionGraphicLayerContent)
// and renders one still per persisted MG overlay from .calibration-temp/<pid>-mgs.json to PNG, at a
// mid-hold frame (entrance settled). Captures browser logs so a blank render (SafeCompositionRenderer
// error boundary -> "[MG-Render] ... render failed") or an overflow ("[MG-Fit] ...") is visible, not silent.
// Stays UNTRACKED. Run from the worktree root: npx tsx scripts/render-mg-stills.ts [proj_OzG2qgoYudFa]
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

import {
  classifyRenderValidity,
  type RenderImageStats,
  type RenderLogEntry,
} from '../lib/editron/motion-graphics/engine/eval/render-validity';

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

async function imageStats(file: string): Promise<RenderImageStats> {
  const stats = await sharp(file).stats();
  const channels = stats.channels;
  const lumaStdDev = channels.length >= 3
    ? 0.2126 * channels[0].stdev + 0.7152 * channels[1].stdev + 0.0722 * channels[2].stdev
    : channels[0]?.stdev;
  const alpha = channels[3]?.mean;

  return {
    lumaStdDev,
    alphaMean: alpha === undefined ? undefined : alpha / 255,
  };
}

async function main(): Promise<void> {
  // arg is either a project id (-> <pid>-mgs.json) or a .json filename in .calibration-temp.
  const arg = process.argv[2] || 'proj_OzG2qgoYudFa';
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
  const { width, height, mgs } = data;
  const tag = path.basename(dataFile).replace(/\.json$/, '').replace(/-mgs$/, '');
  const outDir = path.resolve(process.cwd(), '.calibration-temp', 'mg-stills', tag);
  fs.rmSync(outDir, { recursive: true, force: true }); // clean stale stills so montage/triage never mixes runs
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
          // Remotion's bundler does NOT read tsconfig "@/*" paths — map "@" to the worktree root
          // so the real component tree (@/components, @/lib) resolves exactly as in the app.
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );
  console.log(`Bundled OK. Rendering ${mgs.length} stills at ${width}x${height}…\n`);

  const issues: string[] = [];
  const reports: Array<Record<string, unknown>> = [];
  for (let i = 0; i < mgs.length; i++) {
    const overlay = mgs[i];
    const c = (overlay.content || {}) as Record<string, unknown>;
    const focal = String(c.emphasisWord ?? c.text ?? c.value ?? c.title ?? `mg${i}`);
    const gtype = String(overlay.metadata?.graphicType ?? 'unknown');
    const dur = Number(overlay.durationInFrames) || 60;
    const frame = Math.min(dur - 1, Math.max(0, Math.floor(dur * 0.6))); // mid-hold: entrance settled
    const cw = Number(overlay.canvasWidth) || width;   // adversarial cases carry per-case canvas (e.g. 9:16)
    const ch = Number(overlay.canvasHeight) || height;
    const inputProps = { overlay, bg: '#12151b', width: cw, height: ch, guide: true };

    const file = path.join(outDir, `mg${String(i).padStart(2, '0')}-${gtype}-${slugify(focal) || 'x'}.png`);
    const overlayLogs: RenderLogEntry[] = [];
    let renderError: unknown;
    try {
      const composition = await selectComposition({ serveUrl, id: 'MgStill', inputProps });
      await renderStill({
        composition, serveUrl, output: file, frame, inputProps,
        imageFormat: 'png',
        chromiumOptions: { headless: true },
        overwrite: true,
        onBrowserLog: (l) => {
          overlayLogs.push({ type: l.type, text: l.text });

          if (l.type === 'error' || /MG-Render|MG-Fit|cannot fit/i.test(l.text)) {
            issues.push(`  MG[${i}] "${focal}" (${l.type}): ${l.text}`);
          }
        },
      });
    } catch (error) {
      renderError = error;
    }

    const stats = !renderError && fs.existsSync(file) ? await imageStats(file) : undefined;
    const validity = classifyRenderValidity({ logs: overlayLogs, image: stats, renderError });
    reports.push({
      index: i,
      focal,
      graphicType: gtype,
      frame,
      durationInFrames: dur,
      file: fs.existsSync(file) ? file : null,
      status: validity.status,
      matchedLogs: validity.matchedLogs,
      imageStats: stats,
    });

    if (!validity.status.ok) {
      issues.push(`  MG[${i}] "${focal}" validity=${validity.status.reason}: ${validity.status.detail}`);
      console.log(`  INVALID:${validity.status.reason} MG[${String(i).padStart(2, '0')}] "${focal}" ${gtype} @f${frame}/${dur} -> ${fs.existsSync(file) ? path.basename(file) : '(no file)'}`);
      continue;
    }

    console.log(`  ✓ MG[${String(i).padStart(2, '0')}] "${focal}" ${gtype} @f${frame}/${dur} → ${path.basename(file)}`);
  }

  const reportFile = path.join(outDir, 'render-validity.json');
  const invalidCount = reports.filter((report) => {
    const status = report.status as { ok: boolean };
    return !status.ok;
  }).length;
  fs.writeFileSync(reportFile, JSON.stringify({
    tag,
    dataFile,
    total: reports.length,
    invalidCount,
    reports,
  }, null, 2));
  console.log(`\nRender validity report -> ${reportFile}`);
  if (invalidCount > 0) {
    process.exitCode = 1;
  }

  console.log('\n=== BROWSER LOGS (errors / MG-Render / MG-Fit / cannot-fit) ===');
  if (issues.length) issues.forEach((l) => console.log(l));
  else console.log('  (none — no render errors, no fit warnings)');
  console.log(`\nStills → ${outDir}`);
}

main().catch((e) => { console.error('RENDER ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
