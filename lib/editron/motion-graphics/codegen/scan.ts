/**
 * MG Codegen — the SCAN (E0 Phase B). Construction-level enforcement on the model's generated JSX,
 * BEFORE it compiles or renders. This is the immune system: a generated component that trips any check
 * is rejected → 1 repair attempt → else the Tier-A engine fallback (Law 2). Pure string checks; never throws.
 *
 * Ported + HARDENED from explainer-remotion/scripts/grammar-v2.mjs `scanV2`, with two Editron additions:
 *  - LAW 1: `<Stage backdrop={true}>` is rejected — codegen clips render OVER footage, transparent, never
 *    over a brand field. Default (backdrop absent) is false (the ported Stage flips it).
 *  - DETERMINISM + SAFETY: the code runs in a Lambda render bundle, so non-determinism (Math.random / Date /
 *    timers) breaks frame-accuracy, and eval/fetch/require/window/document/process are outright unsafe. The
 *    source only DISCOURAGED these in the prompt; here they are ENFORCED.
 *
 * Law 4 (brand by construction): raw hex/rgb/hsl/named colours and hand-typed fontSize are rejected — colour
 * comes only from brand.colors.* / withAlpha, size only from FitHeadline/TextBlock/Chip.
 */

export interface ScanResult {
  ok: boolean;
  /** Human-readable rejection reason (fed back to the model for the 1 repair attempt). Absent when ok. */
  reason?: string;
}

/** Imports the generated component may use: react, remotion, and the kit primitives only (any relative
 *  depth). NO product composers / external modules in E0. */
const ALLOWED_IMPORT = /^import\b[^'"]*['"](react|remotion|(?:\.{1,2}\/)*(?:kit\/)?(?:brand|stage|fit-text|choreo|marks|scene))['"]\s*;?\s*$/;

const COLOR_BANNED: { re: RegExp; why: string }[] = [
  { re: /(['"`\s:(,])#[0-9a-fA-F]{3,8}\b/, why: 'raw hex colour — use brand.colors.* / withAlpha only' },
  { re: /\brgba?\s*\(/, why: 'rgb()/rgba() literal — use brand.colors.* / withAlpha only' },
  { re: /\bhsla?\s*\(/, why: 'hsl()/hsla() literal — use brand.colors.* / withAlpha only' },
  { re: /(color|background|backgroundColor|borderColor|stroke|fill)\s*:\s*['"](?!transparent['"])/, why: 'named CSS colour literal — only brand tokens or "transparent"' },
];

/** Non-deterministic or unsafe calls — forbidden in a deterministic render bundle. */
const UNSAFE: { re: RegExp; why: string }[] = [
  { re: /\bMath\.random\b/, why: 'Math.random — non-deterministic; animate from useCurrentFrame() only' },
  { re: /\bDate\.now\b|\bnew\s+Date\b/, why: 'Date — non-deterministic; use the frame clock' },
  { re: /\bset(Timeout|Interval)\s*\(/, why: 'timers — non-deterministic in a render' },
  { re: /\beval\s*\(/, why: 'eval — forbidden' },
  { re: /\bfetch\s*\(|\bXMLHttpRequest\b/, why: 'network access — forbidden' },
  { re: /\brequire\s*\(|\bimport\s*\(/, why: 'dynamic require/import — forbidden' },
  { re: /\bwindow\.|\bdocument\.|\bprocess\.|\b(local|session)Storage\b/, why: 'direct window/document/process/storage access — forbidden' },
];

/**
 * Scan a generated component's source. Returns { ok: true } when it passes every construction rule,
 * or { ok: false, reason } naming the first violation. Pure; never throws.
 */
export function scanCode(code: string): ScanResult {
  if (typeof code !== 'string' || code.trim().length === 0) return fail('empty output');

  // 1. Scene root must be <Stage>, and it must NOT force the brand backdrop (Law 1 — transparent over footage).
  if (!/<Stage\b/.test(code)) return fail('Scene root must be <Stage brand={brand}> (imported from the kit).');
  if (/<Stage\b[^>]*\bbackdrop\s*=\s*\{?\s*true\b/.test(code)) {
    return fail('Stage backdrop must be false — MG renders OVER the footage, not over a brand field (Law 1). Omit backdrop or set backdrop={false}.');
  }

  // 2. Imports: every import line must be react/remotion/the kit — nothing else.
  for (const line of code.split('\n')) {
    const t = line.trim();
    if (t.startsWith('import ') && !ALLOWED_IMPORT.test(t)) {
      return fail(`Disallowed import: "${t.slice(0, 72)}" — import only from react, remotion, or the kit (brand/stage/fit-text/choreo/marks/scene).`);
    }
  }

  // 3. Colour: brand tokens only (Law 4).
  for (const c of COLOR_BANNED) if (c.re.test(code)) return fail(`Off-brand colour rejected: ${c.why}.`);

  // 4. No hand-typed fontSize > 30 — words render via the fit-text primitives (compute size, cannot clip).
  const fs = code.match(/fontSize\s*:\s*(\d+)/);
  if (fs && Number(fs[1]) > 30) {
    return fail(`Hand-typed fontSize ${fs[1]} rejected — words must render via FitHeadline/TextBlock/Chip (they compute size and cannot clip).`);
  }

  // 5. No hand-typed frame windows — choreography is COMPUTED from phases() (Rule 11).
  const win = code.match(/interpolate\s*\(\s*frame\s*,\s*\[\s*(\d+)\s*,\s*(\d+)/);
  if (win && Number(win[1]) > 4 && !/phases\s*\(/.test(code)) {
    return fail('Hand-typed frame window without phases() — derive anchors from ph = phases(durF, brand).');
  }

  // 6. Determinism + safety (Lambda render bundle).
  for (const u of UNSAFE) if (u.re.test(code)) return fail(`Forbidden non-deterministic/unsafe call: ${u.why}.`);

  // 7. Motion intensity is RESOLVED, never hardcoded (founder law 2026-07-19: liveness = brand×video×user).
  //    An ambient() hold whose strength argument is a bare numeric literal ignores the resolved intensity —
  //    the timid-0.5 class that read near-dead on real footage (8/19 matrix renders ignored the binding when
  //    it was prompt-only). Nested-paren args make the naive capture skip — that fails OPEN (the judge still
  //    sees the result), never falsely rejects.
  {
    const ambientCall = /\bambient\s*\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = ambientCall.exec(code)) !== null) {
      const args = m[1].split(',');
      const strength = args[3]?.trim();
      if (strength && /^[\d.]+$/.test(strength)) {
        return fail(`ambient(..., ${strength}) hardcodes the hold strength — bind the resolved liveness instead: ambient(frame, at, kind, data.motionIntensity).`);
      }
    }
  }

  // 8. Brand by construction, structurally: every brand-requiring kit element must pass brand= in its
  //    open tag. A brandless tag compiles (esbuild strips types) and then crashes mid-render on the kit's
  //    internal dv(brand) → "Cannot read properties of undefined (reading 'density')" — live class caught
  //    2026-07-18: generated `<Region x y w h>` without brand. Reveal/Bleed/SceneLayer/SceneReveal take no
  //    brand and are exempt.
  for (const name of BRAND_REQUIRED) {
    const tag = new RegExp(`<${name}\\b([^>]*)>`, 'g');
    let m: RegExpExecArray | null;
    while ((m = tag.exec(code)) !== null) {
      if (!/\bbrand\s*=/.test(m[1])) {
        return fail(`<${name}> without brand= — every brand-requiring kit element takes brand={brand}; a brandless <${name}> crashes at render.`);
      }
    }
  }

  return { ok: true };
}

/** Kit components whose props REQUIRE brand (verified against kit signatures 2026-07-18). */
const BRAND_REQUIRED = [
  'Stage', 'Region', 'Corner', 'FitHeadline', 'TextBlock', 'Chip',
  'Bar', 'Ring', 'Plot', 'Rule', 'Plate', 'Dot', 'Particles', 'Texture', 'Motif',
  'Scene', 'SceneGrade',
] as const;

function fail(reason: string): ScanResult {
  return { ok: false, reason };
}
