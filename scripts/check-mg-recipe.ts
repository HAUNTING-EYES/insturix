// Untracked investigation helper (/investigate) — dump MG recipe binds + computed text-fit
// for a project, to confirm the "oversize/overflow/mid-word" + "all-look-same" root causes
// against persisted DB state. READ-ONLY. Default proj_OzG2qgoYudFa. Stays UNTRACKED (holds URI).
import { MongoClient } from 'mongodb';
// The REAL fit function from the production renderer (file 1) — verifies the actual G-1 sizing.
import { fitFontSize } from '../lib/editron/motion-graphics/engine/primitive-renderers';

const FOCAL_FRAC: Record<string, number> = { primary: 0.09, counter: 0.09, secondary: 0.055, label: 0.055 };
// Mirror of composition-renderer.computeFittedSize (G-1), calling the REAL fitFontSize.
function computeFitted(role: string, txt: string, desiredRaw: number, boxW: number, H: number, caps: boolean): number {
  const desired = Math.min(desiredRaw, H * (FOCAL_FRAC[role] ?? 0.07));
  const minReadable = Math.min(desired, 36 * (H / 1080));
  return Math.round(fitFontSize(txt, boxW, desired, minReadable, { uppercase: caps }));
}

const uri = process.env.MONGODB_URI || 'mongodb+srv://admin:iWPwpRrZ5Pp9rWEW@main-cluster.glgebdc.mongodb.net/?retryWrites=true&w=majority&appName=main-cluster';
const PID = process.argv[2] || 'proj_OzG2qgoYudFa';

// layout position -> container maxWidth fraction (from composition-renderer.tsx resolveLayout)
const MAXW: Record<string, number> = {
  'bottom-left': 0.45, 'bottom-right': 0.45, 'top-left': 0.45, 'top-right': 0.45,
  'center': 0.70, 'full-width-bottom': 0.90, 'full-width-top': 0.90,
};

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('editron_prev');
  const p = await db.collection('projects').findOne({ projectId: PID });
  if (!p) { console.log('NOT FOUND', PID); await client.close(); return; }
  const W = p.width || p.compositionWidth || 1920;
  const H = p.height || p.compositionHeight || 1080;
  console.log(`=== ${PID} | canvas ${W}x${H} ar=${p.aspectRatio} fps=${p.fps} ===`);
  const mgs = (p.overlays || []).filter((o: any) => o.type === 'motion-graphic');
  console.log(`MOTION-GRAPHICS: ${mgs.length}  (boxW = canvas.W * layoutMaxWidth fraction)\n`);

  const treatmentTally: Record<string, number> = {};   // roles-per-MG signature -> count (sameness)
  const colorTally: Record<string, number> = {};        // focal text color binding -> count
  const entranceTally: Record<string, number> = {};     // focal entranceOverride -> count
  const splitTally: Record<string, number> = {};        // focal textSplit -> count
  let overflowCount = 0;

  for (let i = 0; i < mgs.length; i++) {
    const o = mgs[i];
    const c = o.content || {};
    const tok = o.resolvedTokens || {};
    const sizeScale = tok.typography?.sizeScale;
    const ss = typeof sizeScale === 'number' ? sizeScale : 1;
    const accent = tok.color?.accent ?? '?';
    const els = o.recipe?.elements || [];
    const pos = o.recipe?.layout?.position || '?';
    const boxW = Math.round(W * (MAXW[pos] ?? 0.45));

    const roleSig = els.map((e: any) => e.role).sort().join('+');
    treatmentTally[roleSig] = (treatmentTally[roleSig] || 0) + 1;

    const headWord = c.emphasisWord ?? c.text ?? c.value ?? c.title ?? '?';
    console.log(`MG[${i}] "${headWord}" type=${o.metadata?.graphicType} pos=${pos} boxW≈${boxW}px sizeScale=${ss} accent=${accent}`);

    for (const e of els) {
      if (e.primitive !== 'text') continue;
      const minSize = e.bind?.minSize;
      const transform = e.bind?.transform;
      const color = e.bind?.color;
      const split = e.textSplit || '-';
      const ent = e.entranceOverride || '-';
      // renderer's actual sizing: max(minSize, 64*sizeScale)
      const fontPx = typeof minSize === 'number' ? Math.max(minSize, 64 * ss) : null;
      // the actual string this element renders (focal word / counter value)
      const txt = e.role === 'counter'
        ? String(c.value ?? '')
        : (e.role === 'primary' ? String(c.emphasisWord ?? c.text ?? c.title ?? '') : '');
      const isCaps = typeof transform === 'string' && /upper/i.test(transform);
      const ratio = isCaps ? 0.66 : 0.58; // est glyph advance / fontSize (caps wider). ROUGH.
      const estW = (fontPx && txt) ? Math.round(txt.length * fontPx * ratio) : null;
      const over = (estW != null && estW > boxW);
      if (over && (e.role === 'primary' || e.role === 'counter')) overflowCount++;
      const flag = over ? `  ⚠ OVERFLOW est ${estW}px > box ${boxW}px (text="${txt}")` : (estW != null ? `  est ${estW}px / box ${boxW}px` : '');
      console.log(`   ${e.role.padEnd(9)} minSize=${String(minSize).padEnd(5)} font≈${fontPx}px split=${split} ent=${ent} transform=${JSON.stringify(transform)} color=${JSON.stringify(color)}${flag}`);

      if (e.role === 'primary' || e.role === 'counter') {
        colorTally[String(color)] = (colorTally[String(color)] || 0) + 1;
        entranceTally[String(ent)] = (entranceTally[String(ent)] || 0) + 1;
        splitTally[String(split)] = (splitTally[String(split)] || 0) + 1;
      }
    }
    console.log('');
  }

  console.log('=== SAMENESS / ROOT-CAUSE TALLIES ===');
  console.log('treatment signatures (sorted roles per MG):');
  for (const [k, v] of Object.entries(treatmentTally)) console.log(`   ${v}x  ${k}`);
  console.log('focal text color binding:', JSON.stringify(colorTally));
  console.log('focal entranceOverride :', JSON.stringify(entranceTally));
  console.log('focal textSplit        :', JSON.stringify(splitTally));
  console.log(`focal OVERFLOW (est > box, OLD sizing): ${overflowCount}/${mgs.length}`);

  // ── G-1 VERIFICATION: apply the REAL fitFontSize to each focal MG, show OLD -> NEW ──
  console.log('\n=== G-1 SIZE FIX — real fitFontSize on real data (OLD floor -> NEW fitted) ===');
  let stillOver = 0;
  for (const o of mgs) {
    const c = o.content || {}; const tok = o.resolvedTokens || {};
    const ss = typeof tok.typography?.sizeScale === 'number' ? tok.typography.sizeScale : 1;
    const pos = o.recipe?.layout?.position || 'bottom-left';
    const boxW = Math.round(W * (MAXW[pos] ?? 0.45));
    for (const e of (o.recipe?.elements || [])) {
      if (e.primitive !== 'text' || (e.role !== 'primary' && e.role !== 'counter')) continue;
      const minSize = e.bind?.minSize; if (typeof minSize !== 'number') continue;
      const txt = e.role === 'counter' ? String(c.value ?? '') : String(c.emphasisWord ?? c.text ?? c.title ?? '');
      if (!txt) continue;
      const oldFont = Math.round(Math.max(minSize, 64 * ss));
      const caps = /upper/i.test(String(e.bind?.transform || ''));
      const newFont = computeFitted(e.role, txt, oldFont, boxW, H, caps);
      const newEstW = Math.round(txt.length * newFont * (caps ? 0.66 : 0.58));
      const fits = newEstW <= boxW * 0.92;
      if (!fits) stillOver++;
      const pct = ((newFont / H) * 100).toFixed(1);
      console.log(`  "${txt}" ${oldFont}px -> ${newFont}px (${pct}% of frame, box ${boxW}px) ${fits ? 'FITS' : 'OVERFLOWS'}`);
    }
  }
  console.log(`focal STILL-OVERFLOWS after G-1 fit: ${stillOver} (was ~all oversized at 145px / 13% of frame before)`);

  await client.close();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
