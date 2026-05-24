import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { OverlayDefinition } from '../lib/editron/engine/utility-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defs: OverlayDefinition[] = JSON.parse(readFileSync(join(__dirname, '../lib/editron/engine/overlay-definitions.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

function getWinner(signals: Record<string, number>, category: string) {
  const results = scoreAllOverlays(defs, signals);
  return results.filter(r => r.category === category)[0] ?? null;
}

console.log('=== FILTER SELECTION (replaces profile.filterPresetId) ===\n');

console.log('Corporate presentation (formal=0.8, warm=0.2, enthusiasm=0.3):');
const corpFilter = getWinner({ formality: 0.8, warmth: 0.2, enthusiasm: 0.3, 'visual.engagement': 0.5 }, 'filter');
console.log('  Selected: ' + (corpFilter?.outputValues['filterPresetId'] ?? 'none'));
assert(corpFilter?.outputValues['filterPresetId'] === 'clean-corporate', 'corporate content → clean-corporate filter');

console.log('TikTok creator (formal=0.2, warm=0.5, enthusiasm=0.8):');
const tikFilter = getWinner({ formality: 0.2, warmth: 0.5, enthusiasm: 0.8, 'visual.engagement': 0.7 }, 'filter');
console.log('  Selected: ' + (tikFilter?.outputValues['filterPresetId'] ?? 'none'));
assert(tikFilter?.outputValues['filterPresetId'] === 'vivid', 'TikTok content → vivid filter');

console.log('Wedding film (formal=0.5, warm=0.8, enthusiasm=0.5):');
const wedFilter = getWinner({ formality: 0.5, warmth: 0.8, enthusiasm: 0.5, 'visual.engagement': 0.8 }, 'filter');
console.log('  Selected: ' + (wedFilter?.outputValues['filterPresetId'] ?? 'none'));
const wedPreset = wedFilter?.outputValues['filterPresetId'];
assert(wedPreset === 'warm-neutral' || wedPreset === 'cinematic', 'warm+visual content → warm-neutral or cinematic (got ' + wedPreset + ')');

console.log('Funeral tribute (formal=0.7, warm=0.7, enthusiasm=0.2):');
const funFilter = getWinner({ formality: 0.7, warmth: 0.7, enthusiasm: 0.2, 'visual.engagement': 0.4 }, 'filter');
console.log('  Selected: ' + (funFilter?.outputValues['filterPresetId'] ?? 'none'));
assert(funFilter?.outputValues['filterPresetId'] !== 'vivid', 'funeral does NOT get vivid filter');

console.log('\n=== CAPTION SELECTION (replaces profile.captionStyle) ===\n');

console.log('Corporate with speech (formal=0.8, speech=0.8):');
const corpCap = getWinner({ formality: 0.8, enthusiasm: 0.3, 'speech.coverage': 0.8 }, 'caption');
console.log('  Selected: ' + (corpCap?.outputValues['captionStyle'] ?? 'none'));
assert(corpCap?.outputValues['captionStyle'] === 'subtitle', 'formal speech content → subtitle');

console.log('TikTok with speech (formal=0.2, enthusiasm=0.8, speech=0.7):');
const tikCap = getWinner({ formality: 0.2, enthusiasm: 0.8, 'speech.coverage': 0.7 }, 'caption');
console.log('  Selected: ' + (tikCap?.outputValues['captionStyle'] ?? 'none'));
assert(tikCap?.outputValues['captionStyle'] === 'word-by-word', 'casual energetic → word-by-word');

console.log('Music video no speech (speech=0.05):');
const musCap = getWinner({ formality: 0.3, enthusiasm: 0.6, 'speech.coverage': 0.05 }, 'caption');
console.log('  Selected: ' + (musCap?.outputValues['captionStyle'] ?? 'none'));
assert(musCap?.outputValues['captionStyle'] === 'none' || musCap === null, 'no speech → no captions');

console.log('\n' + '='.repeat(50));
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { console.error('SOME TESTS FAILED'); process.exit(1); }
else console.log('PROFILE REPLACEMENT TESTS PASSED ✓');
