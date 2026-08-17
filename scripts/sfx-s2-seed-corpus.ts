/**
 * S2 corpus seed generator (dev probe, SFX-owned).
 *
 * Emits tests/fixtures/sfx-eval/ isolated-opportunities.json (>=64) and
 * sequence-canaries.json (>=8). Labels are UNLABELLED by default (human review
 * fills acceptable/unacceptable/absurd/silence + judge fields). Contexts cover
 * the full S2 matrix: transitions, impacts, MG landings, UI ticks, ambience/
 * foley, motion-speed, directional/neutral, weak/absent evidence, silence,
 * absurd, dialogue-heavy, density, rights, provider, semantic outage.
 *
 * Run: npx tsx scripts/sfx-s2-seed-corpus.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT_DIR = path.resolve(process.cwd(), 'tests', 'fixtures', 'sfx-eval');

interface SeedSpec {
  id: string;
  surface: 'transition' | 'motion-graphic' | 'ui' | 'scene' | 'logo' | 'caption' | 'chapter';
  role: 'whoosh' | 'impact' | 'tick' | 'pop' | 'riser' | 'logo-sting' | 'ambience' | 'foley' | 'shimmer';
  direction?: 'left' | 'right' | 'up' | 'down' | 'neutral';
  motionSpeed?: 'still' | 'slow' | 'medium' | 'fast';
  material?: string;
  query: string;
  maxDurationSec: number;
  note: string;
  silenceSuggested?: boolean;
  category: string; // drives coverage reporting
}

function ctx(spec: SeedSpec) {
  return {
    opportunityId: spec.id,
    surface: { state: 'label' as const, value: spec.surface },
    role: { state: 'label' as const, value: spec.role },
    ...(spec.direction !== undefined
      ? { direction: { state: 'label' as const, value: spec.direction } }
      : {}),
    ...(spec.motionSpeed !== undefined
      ? { motionSpeed: { state: 'label' as const, value: spec.motionSpeed } }
      : {}),
    ...(spec.material !== undefined
      ? { material: { state: 'label' as const, value: spec.material } }
      : {}),
    contextualNote: spec.note,
  };
}

function iso(spec: SeedSpec, label: unknown = null) {
  return { context: ctx(spec), label };
}

const TRANSITION_WHOOSH = [
  { surface: 'transition', role: 'whoosh', direction: 'left', motionSpeed: 'medium', query: 'soft left whoosh sweep', maxDurationSec: 3, note: 'wipe-left on a scene change, gentle' },
  { surface: 'transition', role: 'whoosh', direction: 'right', motionSpeed: 'medium', query: 'soft right whoosh sweep', maxDurationSec: 3, note: 'wipe-right, matter-of-fact' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'fast', query: 'fast whip whoosh quick', maxDurationSec: 3, note: 'hard whip-pan cut, high speed' },
  { surface: 'transition', role: 'whoosh', direction: 'neutral', motionSpeed: 'slow', query: 'slow air whoosh', maxDurationSec: 3, note: 'slow crossfade, minimal' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'fast', query: 'fast air whoosh sweep', maxDurationSec: 3, note: 'snappy motion cut, quick' },
  { surface: 'transition', role: 'whoosh', direction: 'neutral', query: 'soft whoosh transition', maxDurationSec: 3, note: 'dissolve, no perceptible direction' },
  { surface: 'transition', role: 'whoosh', direction: 'neutral', motionSpeed: 'medium', query: 'neutral whoosh transition', maxDurationSec: 3, note: 'generic transition whoosh' },
  { surface: 'transition', role: 'whoosh', direction: 'left', query: 'left whoosh', maxDurationSec: 3, note: 'acknowledge direction cue present but weak evidence' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'slow', query: 'slow whoosh transition', maxDurationSec: 3, note: 'slow calm transition' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'fast', query: 'fast tech whoosh', maxDurationSec: 3, note: 'fast tech-y whoosh (AI) ' },
  { surface: 'transition', role: 'whoosh', direction: 'right', motionSpeed: 'fast', query: 'fast right whoosh', maxDurationSec: 3, note: 'fast rightward wipe' },
  { surface: 'transition', role: 'whoosh', direction: 'up', query: 'upward whoosh', maxDurationSec: 3, note: 'upward slide transition' },
  { surface: 'transition', role: 'whoosh', direction: 'down', query: 'downward whoosh', maxDurationSec: 3, note: 'downward slide transition' },
  { surface: 'transition', role: 'whoosh', direction: 'neutral', motionSpeed: 'medium', query: 'swoosh transition', maxDurationSec: 3, note: 'neutral swoosh' },
].map((s) => ({ ...s, category: 'transition-whoosh' }));

// Each entry here is a spec; category appended below.
const IMPACT = [
  { surface: 'transition', role: 'impact', motionSpeed: 'fast', query: 'impact hit punch', maxDurationSec: 3, note: 'hard cut impact, restrained' },
  { surface: 'transition', role: 'impact', motionSpeed: 'fast', query: 'bass impact thud', maxDurationSec: 3, note: 'bass impact for a drop' },
  { surface: 'transition', role: 'impact', query: 'soft impact hit', maxDurationSec: 3, note: 'soft impact, low energy' },
  { surface: 'transition', role: 'impact', motionSpeed: 'fast', query: 'sharp impact hit', maxDurationSec: 3, note: 'sharp impact' },
  { surface: 'motion-graphic', role: 'impact', motionSpeed: 'fast', query: 'mg impact landing', maxDurationSec: 3, note: 'MG landing impact' },
  { surface: 'motion-graphic', role: 'impact', query: 'impact punch', maxDurationSec: 3, note: 'MG reveal impact' },
  { surface: 'transition', role: 'impact', query: 'cinematic impact', maxDurationSec: 3, note: 'cinematic impact' },
  { surface: 'transition', role: 'impact', query: 'thud impact', maxDurationSec: 3, note: 'heavy thud' },
  { surface: 'transition', role: 'impact', query: 'impact hit', maxDurationSec: 3, note: 'generic impact' },
  { surface: 'transition', role: 'impact', motionSpeed: 'medium', query: 'medium impact hit', maxDurationSec: 3, note: 'medium-energy impact' },
].map((s) => ({ ...s, category: 'impact' }));

const MG_LANDING = [
  { surface: 'motion-graphic', role: 'whoosh', direction: 'left', motionSpeed: 'fast', query: 'mg directional swipe whoosh', maxDurationSec: 3, note: 'lower-third slide in, left' },
  { surface: 'motion-graphic', role: 'whoosh', direction: 'right', motionSpeed: 'fast', query: 'mg swipe right whoosh', maxDurationSec: 3, note: 'stat counter slide, right' },
  { surface: 'motion-graphic', role: 'tick', motionSpeed: 'fast', query: 'stat settle tick', maxDurationSec: 3, note: 'count-up settle tick (MG)' },
  { surface: 'motion-graphic', role: 'tick', motionSpeed: 'medium', query: 'mg tick ui', maxDurationSec: 3, note: 'MG tick' },
  { surface: 'motion-graphic', role: 'pop', motionSpeed: 'medium', query: 'mg pop', maxDurationSec: 3, note: 'MG pop' },
  { surface: 'motion-graphic', role: 'shimmer', query: 'mg shimmer', maxDurationSec: 3, note: 'MG shimmer' },
  { surface: 'motion-graphic', role: 'whoosh', direction: 'neutral', motionSpeed: 'medium', query: 'mg neutral whoosh', maxDurationSec: 3, note: 'MG neutral whoosh' },
  { surface: 'motion-graphic', role: 'tick', motionSpeed: 'fast', query: 'mg fast tick', maxDurationSec: 3, note: 'MG fast tick' },
  { surface: 'motion-graphic', role: 'whoosh', direction: 'up', motionSpeed: 'medium', query: 'mg rise whoosh', maxDurationSec: 3, note: 'MG rise' },
  { surface: 'motion-graphic', role: 'impact', motionSpeed: 'fast', query: 'mg landing impact', maxDurationSec: 3, note: 'MG landing impact' },
  { surface: 'motion-graphic', role: 'pop', motionSpeed: 'fast', query: 'mg quick pop', maxDurationSec: 3, note: 'MG quick pop' },
].map((s) => ({ ...s, category: 'mg-landing' }));

const UI_TICK = [
  { surface: 'ui', role: 'tick', motionSpeed: 'fast', query: 'digital glitch tick', maxDurationSec: 2, note: 'UI tick' },
  { surface: 'ui', role: 'tick', motionSpeed: 'medium', query: 'clean ui tick', maxDurationSec: 2, note: 'clean UI tick' },
  { surface: 'ui', role: 'tick', motionSpeed: 'fast', query: 'ui click tick', maxDurationSec: 2, note: 'UI click' },
  { surface: 'ui', role: 'tick', query: 'subtle ui tick', maxDurationSec: 2, note: 'subtle UI tick' },
  { surface: 'caption', role: 'tick', motionSpeed: 'fast', query: 'caption tick', maxDurationSec: 2, note: 'caption tick' },
  { surface: 'ui', role: 'pop', query: 'ui pop', maxDurationSec: 2, note: 'UI pop' },
  { surface: 'caption', role: 'pop', motionSpeed: 'medium', query: 'caption pop', maxDurationSec: 2, note: 'caption pop' },
].map((s) => ({ ...s, category: 'ui-tick' }));

const AMBIENCE_FOLEY = [
  { surface: 'scene', role: 'ambience', motionSpeed: 'still', material: 'environmental', query: 'ambience ocean waves calm', maxDurationSec: 8, note: 'scene ambience bed' },
  { surface: 'scene', role: 'ambience', motionSpeed: 'still', material: 'environmental', query: 'forest ambience', maxDurationSec: 8, note: 'nature ambience' },
  { surface: 'scene', role: 'foley', material: 'paper', query: 'paper rustle foley', maxDurationSec: 3, note: 'paper handling foley' },
  { surface: 'scene', role: 'foley', material: 'physical', query: 'wood knock foley', maxDurationSec: 3, note: 'wood knock' },
  { surface: 'scene', role: 'foley', material: 'cloth', query: 'cloth rustle foley', maxDurationSec: 3, note: 'cloth foley' },
  { surface: 'scene', role: 'ambience', motionSpeed: 'still', material: 'environmental', query: 'city ambience', maxDurationSec: 8, note: 'city ambience' },
  { surface: 'scene', role: 'foley', query: 'foley footsteps', maxDurationSec: 3, note: 'footsteps foley' },
  { surface: 'chapter', role: 'ambience', motionSpeed: 'still', material: 'environmental', query: 'chapter ambience', maxDurationSec: 6, note: 'chapter ambience' },
].map((s) => ({ ...s, category: 'ambience-foley' }));

const SPECIAL = [
  // Motion-speed differences requiring judgement against same role
  { surface: 'transition', role: 'whoosh', motionSpeed: 'fast', query: 'fast whoosh', maxDurationSec: 3, note: 'compare against slow whoosh', category: 'speed-diff' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'slow', query: 'slow whoosh', maxDurationSec: 3, note: 'compare against fast whoosh', category: 'speed-diff' },
  { surface: 'transition', role: 'whoosh', motionSpeed: 'medium', query: 'medium whoosh', maxDurationSec: 3, note: 'mid-speed whoosh', category: 'speed-diff' },
  // Weak/absent evidence
  { surface: 'transition', role: 'whoosh', query: 'whoosh', maxDurationSec: 3, note: 'weak evidence, no direction/speed', category: 'weak-evidence' },
  { surface: 'motion-graphic', role: 'tick', query: 'tick', maxDurationSec: 2, note: 'weak evidence, generic tick', category: 'weak-evidence' },
  // Deliberate silence
  { surface: 'transition', role: 'whoosh', query: 'dip to silence cut', maxDurationSec: 3, note: 'silence preferred after a hard dip', category: 'silence' },
  // Absurd selection
  { surface: 'transition', role: 'whoosh', query: 'whoosh transitions', maxDurationSec: 3, note: 'must not pick a jingle/music-bed (absurd)', category: 'absurd' },
  { surface: 'motion-graphic', role: 'impact', query: 'impact landing', maxDurationSec: 3, note: 'must not pick a voice/speech clip (absurd)', category: 'absurd' },
  // Dialogue-heavy (dynamic context - labeler decides)
  { surface: 'scene', role: 'ambience', motionSpeed: 'still', material: 'environmental', query: 'ambience under dialogue', maxDurationSec: 8, note: 'low bed under dialogue, must not mask', category: 'dialogue' },
  { surface: 'scene', role: 'foley', query: 'foley soft under speech', maxDurationSec: 4, note: 'soft foley, must not mask speech', category: 'dialogue' },
  // Density / overuse
  { surface: 'motion-graphic', role: 'tick', query: 'repeated tick', maxDurationSec: 2, note: 'series of ticks - judge overuse/repetition', category: 'density' },
  // Rights / provider / semantic outages are runtime cases, represented by scenarios below
].map((s) => ({ ...s }));

// -- reserved scenario slots: rights/provider/outage are run-level cases that the
// baseline runner counts via category tag but needs no per-id content.
const RUNTIME_SCENARIOS = [
  { id: 'run-rights-failure', surface: 'transition', role: 'impact', query: 'impact hit', maxDurationSec: 3, note: 'rights-denied asset must degrade to silence not fail edit', category: 'runtime' },
  { id: 'run-provider-failure', surface: 'transition', role: 'whoosh', query: 'whoosh', maxDurationSec: 3, note: 'provider outage -> deterministic/offline path or silence', category: 'runtime' },
  { id: 'run-semantic-outage', surface: 'motion-graphic', role: 'tick', query: 'tick', maxDurationSec: 2, note: 'configured semantic outage must NOT alter edit completion', category: 'runtime' },
].map((s) => ({ ...s }));

function buildSpecs(): SeedSpec[] {
  const all = [
    ...TRANSITION_WHOOSH,
    ...IMPACT,
    ...MG_LANDING,
    ...UI_TICK,
    ...AMBIENCE_FOLEY,
    ...SPECIAL,
    ...RUNTIME_SCENARIOS,
  ] as Array<Record<string, unknown>>;

  const fixed = all.map((s, i) => ({
    id: `s2-${String(i + 1).padStart(3, '0')}-${String(s.category).replace(/[^a-z0-9]/gi, '-')}`,
    surface: s.surface as SeedSpec['surface'],
    role: s.role as SeedSpec['role'],
    direction: s.direction as SeedSpec['direction'] | undefined,
    motionSpeed: s.motionSpeed as SeedSpec['motionSpeed'] | undefined,
    material: s.material as string | undefined,
    query: String(s.query),
    maxDurationSec: Number(s.maxDurationSec),
    note: String(s.note),
    category: String(s.category),
  }));

  return fixed;
}

async function main() {
  const specs = buildSpecs();
  if (specs.length < 64) {
    throw new Error(`corpus under seed: ${specs.length} < 64`);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const isolated = specs.map((s) => iso(s));
  const corpus = {
    version: 'editron-sfx-evaluation-corpus-v1',
    isolated,
    sequences: [],
    frozenAt: undefined,
  };

  const canaries = [
    { canaryId: 'seq-01', scenario: 'talking-head interview with 3 hard cuts + lower-third MG', renderedArtifactRefs: [].slice(0), expectations: ['cut ticks audible under speech', 'MG landing impact not masking dialogue', 'no repetition across 3 cuts'], judgement: null },
    { canaryId: 'seq-02', scenario: 'product explainer: count-up stats with 4 MG landings', renderedArtifactRefs: [].slice(0), expectations: ['settle ticks audible', 'no density fatigue', 'dialogue intelligible'], judgement: null },
    { canaryId: 'seq-03', scenario: 'event recap: music-driven montage, 8 whooshes + impacts', renderedArtifactRefs: [].slice(0), expectations: ['transition whooshes fit', 'impacts on beats', 'no mask'], judgement: null },
    { canaryId: 'seq-04', scenario: 'testimonial: 2 speakers, dialogue-heavy, 2 foley moments', renderedArtifactRefs: [].slice(0), expectations: ['foley under dialogue must be quiet', 'silence in pauses', 'no speech masking'], judgement: null },
    { canaryId: 'seq-05', scenario: 'commercial short: 12 hard cuts, whip-pan transitions', renderedArtifactRefs: [].slice(0), expectations: ['fast whooshes on whips', 'right/left direction respected', 'no overlap'], judgement: null },
    { canaryId: 'seq-06', scenario: 'logo reveal with sting + MG shimmer', renderedArtifactRefs: [].slice(0), expectations: ['logo sting lands', 'shimmer subtle', 'no clipping'], judgement: null },
    { canaryId: 'seq-07', scenario: 'silence-required passage: pause before reveal stays silent', renderedArtifactRefs: [].slice(0), expectations: ['no SFX injected into charged silence', 'reveal impact on cue'], judgement: null },
    { canaryId: 'seq-08', scenario: 'dense-montage overuse test: 20 rapid cuts each with SFX', renderedArtifactRefs: [].slice(0), expectations: ['density acceptable', 'repetition low', 'taste preserved'], judgement: null },
  ];

  await writeFile(path.join(OUT_DIR, 'isolated-opportunities.json'), JSON.stringify({ version: corpus.version, isolated, sequences: canaries }, null, 2), 'utf8');
  await writeFile(path.join(OUT_DIR, 'sequence-canaries.json'), JSON.stringify({ version: corpus.version, sequences: canaries }, null, 2), 'utf8');
  const categories = [...new Set(specs.map((s) => s.category))];
  console.log(`isolated=${specs.length} (>=64)  categories=${categories.length}: ${categories.join(', ')}`);
  console.log(`canaries=8`);
  console.log(`wrote ${OUT_DIR}`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}