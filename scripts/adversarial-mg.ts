// Untracked G-1 adversarial generator (Rule 29: >=8 diverse content types). Clones a REAL keyword
// and stat overlay from proj_OzG2qgoYudFa, swaps in hard text + position + aspect ratio, and writes
// .calibration-temp/adversarial-mgs.json. Render with: npx tsx scripts/render-mg-stills.ts adversarial-mgs.json
// The real recipe stays; only content text/position/canvas change, so computeFittedSize / fitFontSize /
// SplitTextElement (the G-1 code) execute on each hard input. We're testing FIT + WORD-BREAK, not glyph
// coverage (CJK/emoji may render as fallback boxes if the font lacks them — judge overflow, not typeface).
// Stays UNTRACKED.
import * as fs from 'fs';
import * as path from 'path';

interface Case { id: string; tpl: 'kw' | 'stat'; text: string; pos: string; w: number; h: number; note: string }

const CASES: Case[] = [
  { id: 'longword-corner',     tpl: 'kw',   text: 'SUPERCALIFRAGILISTIC',        pos: 'bottom-left',       w: 1920, h: 1080, note: '20-char single word in a 45% corner box — worst case for a non-wrappable token' },
  { id: 'longword-fullwidth',  tpl: 'kw',   text: 'INTERNATIONALIZATION',        pos: 'full-width-bottom', w: 1920, h: 1080, note: 'long single word in the 90% full-width box' },
  { id: 'allcaps-phrase',      tpl: 'kw',   text: 'BREAKING NEWS ALERT NOW',     pos: 'full-width-top',    w: 1920, h: 1080, note: 'multi-word ALL CAPS — must wrap BETWEEN words, never mid-word' },
  { id: 'cjk-nospace',         tpl: 'kw',   text: '人工知能革命来了今天必見必読', pos: 'center',           w: 1920, h: 1080, note: 'CJK, zero whitespace — cannot wrap, MUST shrink to fit' },
  { id: 'hyphen-compound',     tpl: 'kw',   text: 'state-of-the-art-encryption', pos: 'bottom-right',      w: 1920, h: 1080, note: 'hyphenated compound — break only at sensible points' },
  { id: 'numeric-symbols',     tpl: 'stat', text: '$1,234,567',                  pos: 'bottom-left',       w: 1920, h: 1080, note: 'wide numeric + symbols as a stat value' },
  { id: 'emoji-text',          tpl: 'kw',   text: 'WINNER 🏆🎉🔥',                pos: 'top-right',         w: 1920, h: 1080, note: 'emoji glyph widths mixed with text' },
  { id: 'vertical-longword',   tpl: 'kw',   text: 'ENTREPRENEURSHIP',            pos: 'center',            w: 1080, h: 1920, note: '9:16 vertical — aspect-aware fit, much narrower frame' },
  { id: 'vertical-corner',     tpl: 'kw',   text: 'MAXIMALISM',                  pos: 'bottom-left',       w: 1080, h: 1920, note: '9:16 corner box (~486px) — narrowest target' },
  { id: 'widechars',           tpl: 'kw',   text: 'WWWWWWWWWWWW',                pos: 'bottom-left',       w: 1920, h: 1080, note: 'widest-glyph worst case for the width estimator' },
];

function main(): void {
  const src = path.resolve(process.cwd(), '.calibration-temp', 'proj_OzG2qgoYudFa-mgs.json');
  if (!fs.existsSync(src)) { console.error(`Missing ${src} — run dump-proj-mgs.ts first`); process.exit(1); }
  const mgs = (JSON.parse(fs.readFileSync(src, 'utf8')).mgs || []) as Array<Record<string, any>>;
  const kw = mgs.find((o) => o.metadata?.graphicType === 'keyword-highlight');
  const stat = mgs.find((o) => o.metadata?.graphicType === 'stat-counter');
  if (!kw || !stat) { console.error('Need both a keyword-highlight and a stat-counter template in the source.'); process.exit(1); }

  const out = CASES.map((c) => {
    const o = structuredClone(c.tpl === 'kw' ? kw : stat) as Record<string, any>;
    o.content = o.content || {};
    if (c.tpl === 'kw') { o.content.emphasisWord = c.text; o.content.text = c.text; o.content.title = c.text; }
    else { o.content.value = c.text; }
    if (o.recipe?.layout) o.recipe.layout.position = c.pos;
    o.durationInFrames = 60;
    o.canvasWidth = c.w; o.canvasHeight = c.h;
    o.metadata = { ...(o.metadata || {}), graphicType: `adv-${c.id}` };
    o._note = c.note;
    return o;
  });

  const dst = path.resolve(process.cwd(), '.calibration-temp', 'adversarial-mgs.json');
  fs.writeFileSync(dst, JSON.stringify({ width: 1920, height: 1080, count: out.length, mgs: out }, null, 2), 'utf8');
  console.log(`Wrote ${out.length} adversarial cases → ${dst}\n`);
  CASES.forEach((c, i) => console.log(`  [${String(i).padStart(2)}] ${c.id.padEnd(18)} ${c.w}x${c.h} pos=${c.pos.padEnd(17)} "${c.text}"`));
  console.log('\nRender: npx tsx scripts/render-mg-stills.ts adversarial-mgs.json');
}
main();
