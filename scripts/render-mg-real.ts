/**
 * Untracked render-correctness harness. Drives the REAL resolution + style code
 * (resolveElements + buildShapeStyle/buildTextStyle from the production renderer) on real
 * recipes from .calibration-temp/real-recipes.json, at a neutral HOLD frame.
 *
 * (1) VISIBILITY ASSERTIONS — directly targets the past "invisible container/accent-line"
 *     bug (buildShapeStyle setting no size) and the "1/3"→empty-text degradation: asserts
 *     each resolved element actually paints (non-transparent fill / non-empty text / real size).
 * (2) Emits a faithful static HTML still per representative recipe (real CSS, real DOM
 *     structure incl. resolveLayout container + group children) to .calibration-temp/mg-render-real.html
 *     so the output can be eyeballed in a browser.
 *
 * resolveLayout + the neutral AnimationState are replicated VERBATIM from composition-renderer.tsx
 * (155-159, 694-727) rather than exported from production for a throwaway harness.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolveElements } from '../lib/editron/motion-graphics/engine/property-resolver';
import { buildShapeStyle, buildTextStyle, buildTransformStyle, type AnimationState } from '../lib/editron/motion-graphics/engine/primitive-renderers';
import type { ResolvedElement } from '../lib/editron/motion-graphics/engine/recipe-types';

const NEUTRAL: AnimationState = {
  opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0,
  clipProgress: 1, filterBlur: 0, filterBrightness: 1, filterContrast: 1, filterSaturate: 1,
  letterSpacing: 0, fontSize: 1, textShadowBlur: 0, strokeDashoffset: 0,
} as AnimationState;

const DEPTH: Record<string, number> = { background: 0, midground: 1, foreground: 2 };

// Verbatim from composition-renderer.tsx resolveLayout (694-727).
function resolveLayout(layout: any): Record<string, any> {
  const base: Record<string, any> = { position: 'absolute', display: 'flex', flexDirection: 'column', gap: '4px', isolation: 'isolate' };
  const bottomOffset = layout.captionZoneAware ? '22%' : '12%';
  switch (layout.position) {
    case 'bottom-left': return { ...base, bottom: bottomOffset, left: '4%', maxWidth: '45%' };
    case 'bottom-right': return { ...base, bottom: bottomOffset, right: '4%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'top-left': return { ...base, top: '8%', left: '4%', maxWidth: '45%' };
    case 'top-right': return { ...base, top: '8%', right: '4%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'center': return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', textAlign: 'center', maxWidth: '70%' };
    case 'full-width-bottom': return { ...base, bottom: '15%', left: '5%', right: '5%', alignItems: 'center' };
    case 'full-width-top': return { ...base, top: '8%', left: '5%', right: '5%', alignItems: 'center' };
    default: return { ...base, bottom: '12%', left: '4%', maxWidth: '45%' };
  }
}

const kebab = (k: string) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
function css(style: Record<string, any>): string {
  return Object.entries(style)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${kebab(k)}:${v}`).join(';');
}

function elText(el: ResolvedElement): string {
  const p = el.resolvedProps;
  const t = p.text != null ? String(p.text) : '';
  const prefix = p.prefix != null ? String(p.prefix) : '';
  const suffix = p.suffix != null ? String(p.suffix) : '';
  return `${prefix}${t}${suffix}`;
}

// Build the inner HTML for resolved elements (mirrors composition-renderer element dispatch).
function renderElements(els: ResolvedElement[]): { html: string; checks: string[] } {
  const checks: string[] = [];
  const sorted = [...els].sort((a, b) => (DEPTH[a.layer || 'foreground'] ?? 2) - (DEPTH[b.layer || 'foreground'] ?? 2));
  const html = sorted.map((el) => {
    if (el.primitive === 'group') {
      const gp = el.resolvedProps;
      const gStyle: Record<string, any> = { ...buildTransformStyle(NEUTRAL), position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: gp.justify ?? 'center' };
      for (const k of ['width', 'height', 'top', 'left', 'right', 'bottom', 'gap']) if (gp[k] != null) gStyle[k] = `${Number(gp[k])}px`;
      const children = (el.children || []).map((c) => {
        const cp = c.resolvedProps;
        const cStyle: Record<string, any> = c.primitive === 'text' ? { ...buildTextStyle(c, NEUTRAL) } : { ...buildShapeStyle(c, NEUTRAL) };
        for (const k of ['width', 'height'] as const) if (cp[k] != null) cStyle[k] = `${Number(cp[k])}px`;
        for (const k of ['top', 'left', 'right', 'bottom'] as const) if (cp[k] != null) { cStyle.position = 'absolute'; cStyle[k] = `${Number(cp[k])}px`; }
        return c.primitive === 'text' ? `<div style="${css(cStyle)}">${String(cp.text ?? '')}</div>` : `<div style="${css(cStyle)}"></div>`;
      }).join('');
      checks.push(`  group ${el.role}: ${(el.children || []).length} children ${(el.children || []).length ? 'OK' : '⚠️ EMPTY'}`);
      return `<div style="${css(gStyle)}">${children}</div>`;
    }
    if (el.primitive === 'text') {
      const style = buildTextStyle(el, NEUTRAL);
      const text = elText(el);
      const visible = text.trim() !== '' && style.color !== 'transparent';
      checks.push(`  text ${el.role}: "${text.slice(0, 30)}" size=${style.fontSize} color=${style.color} ${visible ? 'VISIBLE' : '⚠️ EMPTY/INVISIBLE'}`);
      // gradient text needs the fill to show via background-clip — keep as-is
      return `<div style="${css(style as any)}">${text || '&nbsp;'}</div>`;
    }
    if (el.primitive === 'data-viz') {
      checks.push(`  data-viz ${el.role}: (SVG component — placeholder box in still)`);
      return `<div style="width:300px;height:160px;border:2px dashed ${el.resolvedProps.color || '#888'};display:flex;align-items:center;justify-content:center;color:#aaa;font:14px sans-serif">data-viz: ${el.role}</div>`;
    }
    // shape / container / decoration / pattern / mask / particle
    const style = buildShapeStyle(el, NEUTRAL);
    const bg = (style as any).backgroundColor;
    const hasSize = (style as any).width || (style as any).height || (el.anchor && el.anchor.mode === 'block-fill');
    const visible = bg && bg !== 'transparent' && hasSize;
    checks.push(`  ${el.primitive} ${el.role}: anchor=${el.anchor?.mode || 'flow'} bg=${bg} size=${(style as any).width || ''}x${(style as any).height || (el.anchor?.mode === 'block-fill' ? 'inset' : '')} ${visible ? 'VISIBLE' : '⚠️ NOT-VISIBLE'}`);
    return `<div style="${css(style as any)}"></div>`;
  }).join('\n        ');
  return { html, checks };
}

const data: any[] = JSON.parse(readFileSync('.calibration-temp/real-recipes.json', 'utf8'));

// Representative selection: rich identity (backdrop+underline), mid emphasis (accent-line),
// degraded "1/3" free-text (the bug), a good numeric stat, a quotation.
function pick(pred: (d: any) => boolean): any | undefined { return data.find(pred); }
const samples = [
  { tag: 'identity (lower-third) — backdrop+underline', d: pick(d => d.recipe.id === 'composed-identity' && d.recipe.elements.some((e: any) => e.role === 'sm-underline')) },
  { tag: 'emphasis — accent-line (mid register)', d: pick(d => d.recipe.id === 'composed-emphasis' && d.recipe.elements.some((e: any) => e.role === 'sm-accent-line')) },
  { tag: 'numeric stat-counter (valid)', d: pick(d => d.recipe.id === 'composed-numeric') },
  { tag: 'quotation', d: pick(d => d.recipe.id === 'composed-quotation') },
  { tag: '⚠️ DEGRADED: stat-counter value="1/3" → free-text', d: pick(d => d.gtype === 'stat-counter' && d.recipe.id === 'composed-free-text') },
].filter(s => s.d);

console.log('=== RENDER-CORRECTNESS CHECK (real resolveElements + real buildStyle, neutral hold frame) ===\n');
const stages: string[] = [];
for (const { tag, d } of samples) {
  const resolved = resolveElements(d.recipe.elements, d.tokens, d.content);
  const { html, checks } = renderElements(resolved);
  console.log(`▶ ${tag}\n  ${d.pid} f=${d.frame} recipe=${d.recipe.id} layout=${d.recipe.layout.position} content=${JSON.stringify(d.content).slice(0, 90)}`);
  checks.forEach(c => console.log(c));
  console.log('');

  const layoutStyle = resolveLayout(d.recipe.layout);
  stages.push(`
    <figure style="margin:0">
      <figcaption style="color:#ddd;font:600 16px sans-serif;padding:8px 4px">${tag} — ${d.pid} @${d.frame} (${d.recipe.layout.position})</figcaption>
      <div style="position:relative;width:960px;height:540px;overflow:hidden;border-radius:8px;
        background:linear-gradient(135deg,#2a3a4a,#11161c 60%),radial-gradient(circle at 30% 40%, #44607a, transparent 50%);">
        <div style="${css(layoutStyle)}">
        ${html}
        </div>
      </div>
    </figure>`);
}

const page = `<!doctype html><html><head><meta charset="utf-8"><title>MG real-recipe render stills</title></head>
<body style="margin:0;padding:24px;background:#0b0d10;display:grid;grid-template-columns:1fr 1fr;gap:24px">
${stages.join('\n')}
</body></html>`;
writeFileSync('.calibration-temp/mg-render-real.html', page);
console.log(`Wrote ${samples.length} faithful render stills → .calibration-temp/mg-render-real.html (open in a browser to eyeball)`);
