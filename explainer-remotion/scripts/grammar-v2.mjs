// GRAMMAR V2 — the composition language for the GLM director + film harness.
// Import from glm-director.mjs and glm-film.mjs (see GRAMMAR-V2.md for the 6-line wiring).
// Design: forms are SPATIAL SIGNATURES, not layouts; geometry lives in the primitives; colour and
// clipping are unrepresentable through the primitive API and additionally rejected by the scan.

// ─── Director: forms + laws ──────────────────────────────────────────────────
export const FORMS_V2 = `<available_forms>
Each form is a distinct SPATIAL SIGNATURE. Pick for meaning, then vary hard across the film.
- "full-bleed-product": the FRAME IS THE PRODUCT — one real screen edge-to-edge, slow push toward the subject; words live as 1–2 chips/short lines pinned to safe corners over a scrim. NO side column, NO device frame. props: { headline (≤6 words), accentWord, kicker, screen ("product/app-*.png"), focusRegion (a region NAME from THAT screen's region list) }
- "annotate": full-frame real screen + the camera/cursor dive (ProductShot zoom) OR gold deixis marks (circle/underline/arrow) landing on the focus as the VO names it; one short caption chip. props: { caption, captionAccent, screen, focusRegion (a region NAME from THAT screen's region list — the mark lands HERE), mark ("circle"|"underline"|"arrow"|"box") }
- "kinetic-statement": TYPOGRAPHY IS THE SCENE — 1–2 lines fill the frame, per-word or per-char reveal, huge scale contrast between lines, exactly one gold word; zero panels, zero screenshots. props: { line1 (2–5 words), line2 (optional, 2–6 words), accentWord }
- "data-beat": ONE metric owns the void — giant count-up + a small context line, deliberate negative space; optional sweep arc ONLY for a true percent. props: { value (number), suffix (""|"%"|"×"|"+"), label (≤8 words), kicker }
- "transformation": before/after as ONE full-frame surface with a gold boundary wiping across — NEVER two side-by-side cards. props: { headline, accentWord, beforeLabel, afterLabel, beforeScreen (optional), afterScreen (optional) }
- "montage": 3–6 product crops in a breathing grid, cells pop on the stagger, ONE cell promotes to full-bleed at the end. props: { headline (≤5 words), accentWord, screens: [{screen, focusRegion}] (3–6), promote (index) }
- "process-rail": the steps as a journey — a full-frame horizontal rail of 3–5 step cards the camera travels along, active step lit. props: { kicker, steps: ["...", 3–5 items, each ≤5 words] }
- "title-card": section/brand title energy — oversized per-char type, gold underline sweep, breathing field; no product. props: { title (1–4 words), accentWord, kicker }
- "logo": logo outro + one CTA. props: { headline, cta }
</available_forms>

<laws>
- ONE core message; every scene serves it. Open on the felt problem or the outcome — never a self-intro.
- 5 to 7 scenes. LAST scene MUST be "logo". durationInFrames 90–150 (60fps).
- VARIETY IS A HARD LAW: never the same form twice in a row; never more than one "transformation"; at least ONE "kinetic-statement" AND at least ONE of "full-bleed-product"/"annotate"/"montage" per film; do not use both "full-bleed-product" and "annotate" on the SAME screen image.
- accentWord must literally appear in that scene's headline/line/title.
- Across product scenes use DIFFERENT screens; map each screen to the beat it best proves.
- Each scene: "vo" (6–14 words) that COMPLEMENTS the on-screen copy — VO carries the story, screen words are punctuation. Also give "energy": 0..1 (how hard this beat hits).
</laws>`;

export const ALLOWED_FORMS_V2 = new Set([
  'full-bleed-product',
  'annotate',
  'kinetic-statement',
  'data-beat',
  'transformation',
  'montage',
  'process-rail',
  'title-card',
  'logo',
]);

// ─── Film: role per form (spatial signature, in composition language) ───────
export const ROLE_V2 = {
  'full-bleed-product': `a FULL-BLEED PRODUCT MOMENT. The screenshot IS the frame: <FullBleedProduct> edge-to-edge with a slow push toward the focus, a <Scrim> for legibility, and the words as ONE <Chip kicker> + ONE short <FitHeadline size="l"> pinned via <Corner>/a low-left <Region> — text occupies ≤25% of the frame. FORBIDDEN: device frames, side columns, stat cards, more than 2 text elements.`,
  annotate: `a GUIDED LOOK AT THE REAL SCREEN. Either <ProductShot zoom> carrying its own cursor+dive, OR <FullBleedProduct> + a <Deixis> mark that draws onto the focus exactly when the VO names it, with one caption <Chip> in a safe corner. One focal point. FORBIDDEN: a second marked point, headlines over the UI, side columns.`,
  'kinetic-statement': `PURE KINETIC TYPOGRAPHY. The words are the only subject: a centered (or boldly off-center) <Region> ~80% wide; line1 as <FitHeadline size="display" kinetic="chars">, line2 (if any) as size="l" entering a beat later; huge scale contrast; ONE gold word; background field only. FORBIDDEN: screenshots, panels, cards, more than 8 words on screen.`,
  'data-beat': `a DATA BEAT. <MetricHero> owns the frame from a wide centered/left Region — the number counts up on its anchor, the label sits small beneath, and at least 50% of the frame is deliberate negative space. Optional kicker chip. FORBIDDEN: panels, screenshots, a second number.`,
  transformation: `a TRANSFORMATION ON ONE SURFACE. <TransformSurface> full-frame: the muted 'before' is wiped away by a gold boundary revealing the 'after'; beforeLabel as a ghost <Chip> (top-left) that yields to the accent afterLabel chip as the wipe passes 65%; the short headline sits low over the scrim. FORBIDDEN: two side-by-side panes/cards of any kind.`,
  montage: `a MONTAGE. <MontageGrid> of 3–6 real crops breathing in on the stagger; on the resolve phase the 'promote' cell takes over the frame; the headline appears ONLY after promotion, low over a scrim. FORBIDDEN: text during the grid phase beyond one kicker chip.`,
  'process-rail': `a PROCESS JOURNEY. <RailSteps> — the camera travels a full-frame rail of numbered step cards, each lighting as it centers; one kicker chip top-left. FORBIDDEN: vertical lists, side columns, screenshots.`,
  'title-card': `a TITLE SEQUENCE BEAT. One oversized <FitHeadline size="display" kinetic="chars" align="center"> in a centered Region, an <UnderlineSweep> beneath timed to the last char, a kicker chip above. Confident, sparse, alive background. FORBIDDEN: product imagery, paragraphs.`,
  logo: `a LOGO OUTRO: wordmark-scale <FitHeadline>, one-line tagline <TextBlock>, a single accent <Chip> as the CTA pill; spring settle, soft glow, full stop.`,
};

// ─── Film: primitive API ─────────────────────────────────────────────────────
export const PRIM_V2 = `<primitive_api>
type Brand = { colors:{bg,surface,surfaceAlt,text,muted,border,accent,accentText}, fontSans, type:{headingWeight,tracking,lineHeight,eyebrowCase}, shape:{radius,border}, density, decor:{grid,glow}, motion:{energy,overshoot} }
withAlpha(color, 0..1) — the ONLY way to make translucent brand colour.

LAYOUT (all positions are FRACTIONS of the title-safe region — px positioning is forbidden):
<Stage brand>...</Stage>                       // REQUIRED scene root. Draws the brand field.
<Region brand x y w h? align? justify? >...    // rect in SAFE-area fractions. x,y = TOP-LEFT corner, NOT centre. width clamps to (1-x). To centre/fill horizontally use a WIDE region from the left (e.g. x=0.08 w=0.84) — NEVER x=0.5 expecting centre (that puts the LEFT edge at mid-screen and shoves content into the right half). align/justify centre children WITHIN the region.
<Corner brand at="tl|tr|bl|br">...             // chip anchor for full-bleed scenes
<Bleed>...</Bleed>                             // full-frame layer for IMAGERY ONLY (text is rejected inside)

TEXT (the only way words render — size & colour are computed, not passed):
<FitHeadline brand text accentWords={["word"]} size="display|xl|l|m" kinetic="rise|chars|none" startAt align/>
<TextBlock brand text tone="text|muted" size="m|s" startAt align/>
<Chip brand text tone="ghost|accent" startAt/>

CHOREOGRAPHY (numbers are DERIVED — anchor to phases, never hand-type frame windows):
const ph = phases(durationInFrames, brand)      // {intro, build, resolve, durF}
enter(brand, frame, at, fps, "rise|scale|fade|blurIn|sweepL|sweepR", unit?) → style
exitOut(frame, ph, "fade|rise") → style (put on the root Region in the last beats)
stagger(brand, i)   pulseAt(frame, at, strength)   countUp(frame, at, dur, to)
progress(frame, from, to)   travel(frame, ph, distancePx)   EASE

COMPOSERS (scene-scale; they own their geometry):
<FullBleedProduct brand src="product/NAME.png" focus={{x,y}} push={0.04..0.12} ph scrim="bottom|left|right|none"/>
<Deixis brand x y kind="circle|box|underline|arrow" at size?/>          // frame fractions; gold; draws on
<MetricHero brand value suffix label at regionWPx={useRegionSize().wPx}/>
<TransformSurface brand beforeSrc? afterSrc? ph/>
<MontageGrid brand cells={[{src,focus}]} promote ph/>
<RailSteps brand steps={["..."]} ph/>
<UnderlineSweep brand at widthPx/>
<ProductShot brand src focus zoom cursor/>      // live demo: own cursor+dive+click — never draw over it
<VideoShot brand src="product/motion/NAME.mp4" focus={{x,y}} push={0.04..0.1} scrim="bottom|left|none"/>   // a REAL screen RECORDING full-bleed — the product MOVES (types/clicks/builds). Prefer this over FullBleedProduct whenever a motion clip is offered for the screen.
useRegionSize() → {wPx,hPx}   useStage() → {W,H,...}
</primitive_api>`;

// ─── Film: hard rules ────────────────────────────────────────────────────────
export const HARD_RULES_V2 = (durF) => `<hard_rules>
- Export EXACTLY: export const GlmScene: React.FC<{brand: Brand}> = ({brand}) => { ... }
- IMPORTS: there is NO index/barrel (no './primitives'). Import each symbol from its EXACT module below — copy these lines verbatim, keeping only the ones you use:
    import React from 'react';
    import {useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence} from 'remotion';
    import {Brand, withAlpha} from '../brand';
    import {Stage, Region, Corner, Bleed, useStage, useRegionSize} from '../stage';
    import {FitHeadline, TextBlock, Chip} from '../fit-text';
    import {phases, enter, exitOut, stagger, pulseAt, countUp, progress, travel, EASE} from '../choreo';
    import {Scrim, FullBleedProduct, Deixis, MetricHero, TransformSurface, MontageGrid, RailSteps, UnderlineSweep} from '../composers';
    import {ProductShot} from '../ProductShot';
    import {VideoShot} from '../VideoShot';
  Do NOT invent any other import. Do NOT write your own "type Brand = any" — Brand comes from '../brand'.
- The scene root MUST be <Stage brand={brand}>. All words via FitHeadline/TextBlock/Chip inside a <Region>/<Corner> — NEVER a raw text node in a styled div, NEVER a fontSize you typed yourself. Imagery may fill the frame via <Bleed>/composers; text may not.
- COLOUR: only brand.colors.* / withAlpha(brand.colors.*, a) / 'transparent'. Any hex literal, rgb()/hsl(), or named CSS colour is an automatic rejection.
- DETERMINISTIC: animate ONLY from useCurrentFrame()/useVideoConfig(). NEVER Math.random, Date.now, new Date, timers, fetch, window, document, eval, require, dynamic import, process. Math.sin/cos of the frame is encouraged.
- CHOREOGRAPHY IS COMPUTED: derive ph = phases(${durF}, brand); anchor every entrance/exit/beat to ph.* (+ stagger/offsets). Do not hand-type frame windows like [14, 38].
- Exactly ${durF} frames @60fps; motion on EVERY frame (drift/push/settle) — no dead holds; end settled via exitOut.
- Every interpolate(): {extrapolateLeft:'clamp', extrapolateRight:'clamp'}. spring() takes fps from useVideoConfig().
- ONE focal point at any moment. Restraint is premium: fewer, larger, better-placed elements.
- FILL THE CANVAS. Restraint means FEWER elements, NOT SMALL ones. The composition must command the whole 16:9 frame — NO dead quadrant, never a large (>~35%) region sitting empty while the content hides in one corner. Sit the visual mass on the optical centre, OR use deliberate asymmetry with a counterweight (a low chip, an underline, the second line, a corner mark) so the empty side is intentional negative space, not a hole. On type-only scenes the headline Region spans ~80% width and size="display" type is sized to DOMINATE — big enough that the words are the frame. Test yourself against the two rendered frames: if a whole side or the top/bottom half reads as empty/dead, the layout is WRONG — ENLARGE the type and MOVE/RESIZE the Region to fill it; do not make timid adjustments. A type scene that fills the frame looks like: <Region x={0.08} y={0.14} w={0.84} h={0.72} align="center" justify="center"> — near-full-frame, anchored from the TOP-LEFT (x=0.5 would ruin it). Stack line2 in the SAME wide region (or a second region a bit lower) so lines never collide.
</hard_rules>`;

// ─── Film: judge ─────────────────────────────────────────────────────────────
export const JUDGE_V2 = `You are a ruthless senior motion/brand designer reviewing 2 frames of ONE scene from a premium SaaS explainer for Insturix (warm editorial DARK, near-black bg, GOLD accent, off-white text, Plus Jakarta Sans; premium, restrained, product-forward).
FIRST separate TWO layers — this is critical:
1) PRODUCT layer = a real app screenshot or screen-recording filling the frame. Its OWN UI (cards, kanban columns, timelines, sidebars, coloured status tags, GREEN CHECKS, buttons, its own accent colours) is CORRECT and GOOD — that is the real product, NOT a template you built and NOT off-brand. A full-bleed real product screen (or a moving recording of it) that OWNS the frame is exactly what we want. NEVER penalize the product's own panels/cards/columns/colours.
2) GRAPHICS layer = what the explainer ADDS on top of/around the product: headline/eyebrow/caption text, chips, the deixis mark, and the layout of that type. Judge THIS layer for brand + polish.
AUTOMATIC ≤4 (GRAPHICS layer ONLY): a COMPOSED text-column-beside-a-separately-built-card layout that is NOT one full-bleed product; OR an ADDED chip/headline/mark rendered in red/green/blue/neon (gold is the only accent for ADDED graphics); OR clipped/overflowing/broken ADDED text.
PENALIZE: added text fighting the product (more than ~2 text elements, or type blanketing the whole screen); a product shown SMALL in a device frame or as a card instead of edge-to-edge; muddy gradients / AI-slop in the added graphics; a genuinely dead frame (nothing moving at all).
REWARD: the real product OWNING the frame (full-bleed, and especially MOVING in a recording); type that owns the frame on type-only scenes; deliberate asymmetry + generous negative space; exactly ONE gold accent in the added graphics; a deixis mark landing ON a real UI element; legible title-safe added text.
Return ONLY JSON: {"score": <1-10>, "issues": ["specific fixable problem, naming the element AND which layer (product/graphics)", ...]}. 8+ = genuinely premium. Judge the ADDED craft; the real product's own UI is a given, never a defect.`;

// ─── Scan additions (construction-level enforcement on GLM's own JSX) ────────
export const ALLOWED_IMPORT_V2 =
  /^import[^']*'(react|remotion|\.\.\/brand|\.\.\/stage|\.\.\/fit-text|\.\.\/choreo|\.\.\/composers|\.\.\/ProductShot|\.\.\/VideoShot)'/;

const COLOR_BANNED = [
  {re: /(['"`\s:(,])#[0-9a-fA-F]{3,8}\b/, why: 'raw hex colour — use brand.colors.* / withAlpha only'},
  {re: /\brgba?\s*\(/, why: 'rgb()/rgba() literal — use brand.colors.* / withAlpha only'},
  {re: /\bhsla?\s*\(/, why: 'hsl()/hsla() literal — use brand.colors.* / withAlpha only'},
  {re: /(color|background|backgroundColor|borderColor|stroke|fill)\s*:\s*['"](?!transparent['"])/, why: 'named CSS colour literal — only brand tokens or "transparent"'},
];

export const scanV2 = (code) => {
  if (!/<Stage\b/.test(code)) return 'Scene root must be <Stage brand={brand}> (import from ../stage).';
  for (const c of COLOR_BANNED) if (c.re.test(code)) return `Off-brand colour rejected: ${c.why}.`;
  const fs = code.match(/fontSize\s*:\s*(\d+)/);
  if (fs && Number(fs[1]) > 30)
    return `Hand-typed fontSize ${fs[1]} rejected — words must render via FitHeadline/TextBlock/Chip (they compute size and cannot clip).`;
  const win = code.match(/interpolate\s*\(\s*frame\s*,\s*\[\s*(\d+)\s*,\s*(\d+)/);
  if (win && Number(win[1]) > 4 && !/phases\s*\(/.test(code))
    return 'Hand-typed frame window without phases() — derive anchors from ph = phases(durF, brand).';
  return null;
};

// ─── Fallbacks for new forms (deterministic bricks if codegen fails) ─────────
export const FALLBACK_V2 = {
  'full-bleed-product': {mod: '../CursorWalkthrough', comp: 'CursorWalkthrough'},
  annotate: {mod: '../CursorWalkthrough', comp: 'CursorWalkthrough'},
  'kinetic-statement': {mod: '../BrandRevealScene', comp: 'BrandRevealScene'},
  'data-beat': {mod: '../BrandRevealScene', comp: 'BrandRevealScene'},
  transformation: {mod: '../SplitCompare', comp: 'SplitCompare'},
  montage: {mod: '../BrandRevealScene', comp: 'BrandRevealScene'},
  'process-rail': {mod: '../CursorWalkthrough', comp: 'CursorWalkthrough'},
  'title-card': {mod: '../BrandRevealScene', comp: 'BrandRevealScene'},
  logo: {mod: '../LogoOutro', comp: 'LogoOutro'},
};

// Product-bearing forms (for the uiReq hard requirement in glm-film.mjs):
export const PRODUCT_FORMS_V2 = new Set(['full-bleed-product', 'annotate', 'montage', 'transformation']);
