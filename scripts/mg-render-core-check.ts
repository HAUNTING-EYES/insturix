/**
 * Phase-D render-core verification (throwaway, uncommitted). Feeds a real compile-ready component through
 * renderMomentToWebpFrames and proves the output is a TRANSPARENT WebP frame sequence:
 *   - frame count == durationInFrames
 *   - a mid frame carries an alpha channel
 *   - the corner is fully transparent (no backdrop) AND the frame has real drawn content
 *   npx tsx scripts/mg-render-core-check.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { renderMomentToWebpFrames, cleanupWorkspace } from '../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { applyImportPreamble } from '../lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX } from '../lib/editron/motion-graphics/codegen/kit/brand';

// A realistic parametric body (reads data.value/suffix/label) — the SERVICE would add imports; do it here.
const BODY = `
type MgData = { value?: number; suffix?: string; label?: string };
export const MgScene: React.FC<{brand: Brand; data: MgData}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const n = countUp(frame, ph.intro, 30, data.value ?? 0);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.30} w={0.84} h={0.4} align="center" justify="center">
        <FitHeadline brand={brand} text={\`\${Math.round(n)}\${data.suffix ?? ''}\`} size="display" kinetic="rise" startAt={ph.intro} align="center" />
      </Region>
      <Region brand={brand} x={0.08} y={0.62} w={0.84} h={0.12} align="center" justify="center">
        <TextBlock brand={brand} text={data.label ?? ''} tone="muted" size="m" startAt={ph.build} align="center" />
      </Region>
    </Stage>
  );
};`;

async function alphaStats(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  let opaque = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 10) opaque++;
  return { corner: at(2, 2), opaquePct: ((opaque / (info.width * info.height)) * 100).toFixed(1), w: info.width, h: info.height };
}

async function main() {
  const componentSource = applyImportPreamble(BODY);
  const durationInFrames = 45;
  console.log('rendering 45 frames @ 1280x720…');
  const r = await renderMomentToWebpFrames({
    componentSource, brand: INSTURIX,
    data: { value: 43, suffix: '%', label: 'preferred it in a blind test' },
    width: 1280, height: 720, fps: 30, durationInFrames,
  });

  const sizes = await Promise.all(r.files.map((f) => fs.stat(path.join(r.webpDir, f)).then((s) => s.size)));
  const total = sizes.reduce((a, b) => a + b, 0);
  const midFile = r.files[Math.floor(r.files.length / 2)];
  const a = await alphaStats(path.join(r.webpDir, midFile));

  console.log(`\n============ RENDER-CORE RESULT ============`);
  console.log(`frames        : ${r.count} (expected ${durationInFrames})  ${r.count === durationInFrames ? 'OK' : 'MISMATCH'}`);
  console.log(`dims          : ${a.w}x${a.h}  (expected 1280x720)`);
  console.log(`render time   : ${r.renderMs}ms (${(r.renderMs / r.count).toFixed(1)}ms/frame)`);
  console.log(`webp size     : ${(total / 1024).toFixed(1)}KB total, ${(total / r.count / 1024).toFixed(2)}KB/frame avg`);
  console.log(`mid frame     : corner-alpha=${a.corner} (0=transparent ✓)  content=${a.opaquePct}% opaque pixels`);
  const pass = r.count === durationInFrames && a.corner === 0 && Number(a.opaquePct) > 0.1 && a.w === 1280;
  console.log(`\nVERDICT: ${pass ? 'PASS — transparent, correct dims, real content' : 'FAIL'}`);
  await cleanupWorkspace(r.workspaceDir);
  console.log('(workspace cleaned)');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
