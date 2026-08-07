/** Print the EXACT codegen prompt sent to the models for the bake-off comparison moment. */
import { buildCodegenPrompt } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '../../lib/editron/motion-graphics/codegen/types';
import type { SemanticMgCandidate } from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';

const candidate: SemanticMgCandidate = {
  id: 'smg_comparison', factKind: 'comparison',
  sourceSpan: { text: 'from 8 minutes to 20 seconds', startMs: 0, endMs: 1200, source: 'voiceover-transcript' },
  content: { from: 480, to: 20, fromLabel: 'Before', toLabel: 'After', unit: 's', label: 'to edit one video' },
  evidenceKeys: ['part:v:primary-value'], licenses: ['source-span'], salience: 0.7, rhetoricalRole: 'claim',
  hardGate: { passed: true, reasons: ['ok'], blockedBy: [] },
  scoreInputs: { structuralStrength: 0.7, salience: 0.7, evidenceStrength: 0.6, renderRisk: 0.2 },
};
const MOMENT: MgMomentInput = {
  momentId: 'bakeoff', brand: INSTURIX, window: { startFrame: 0, endFrame: 60, fps: 30 },
  anchors: { wordFrames: [12, 40], landingFrame: 40 }, candidate,
  expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
  placement: { region: 'full-frame', avoid: [ { x: 0.12, y: 0.42, width: 0.3, height: 0.56, reason: 'main-subject' }, { x: 0.55, y: 0.09, width: 0.42, height: 0.37, reason: 'dashboard-graphic' }, { x: 0.04, y: 0.82, width: 0.92, height: 0.16, reason: 'caption' } ], prefer: [{ x: 0.42, y: 0.46, width: 0.5, height: 0.3, reason: 'negative-space' }] },
  screen: { subject: { x: 0.12, y: 0.42, width: 0.3, height: 0.56 } },
};
console.log(buildCodegenPrompt(MOMENT));
