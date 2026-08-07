/** Adversarial battle test (Rule 29) — RE-RUN after fixes. Confirms the corpses are dead. */
import { resolveVideoStyle, resolveMomentStyle } from '../../lib/editron/motion-graphics/codegen/style/style-resolver';
const V = (brandFont: string, intent?: string) => {
  const v = resolveVideoStyle({ brandFont, intent });
  return `   → name=${v.styleName} weight=${v.weight} motion=${v.motion} surface=${v.baseSurface} texture=${v.baseTexture}`;
};
const M = (video: ReturnType<typeof resolveVideoStyle>, m: Parameters<typeof resolveMomentStyle>[1]) => {
  const s = resolveMomentStyle(video, m);
  return `emphasis=${s.emphasis} motion=${s.motion} surface=${s.surface} texture=${s.texture} (char=${s.footageCharacter})`;
};
console.log('=== FIXES VERIFICATION ===');
console.log('R1/R6 Bebas header + explainer intent (weight must NOT be heavy):'); console.log(V('Bebas Neue', 'product explainer'));
console.log('R4 "documentary-style product demo" (must be documentary):'); console.log(V('Inter', 'documentary-style product demo'));
console.log('R8 tiktok intent:'); console.log(V('Inter', 'tiktok'));
const doc = resolveVideoStyle({ brandFont: 'Georgia', intent: 'documentary' });
console.log('\nR2 somber beat, CAMERA pan (motionType camera_moving) — must NOT be energetic:');
console.log('   ' + M(doc, { footage: { motionEnergy: 0.9, motionType: 'camera_moving' }, salience: 0.5 }));
console.log('R2 control: SUBJECT motion high — SHOULD be energetic:');
console.log('   ' + M(doc, { footage: { motionEnergy: 0.9, motionType: 'subject_moving' }, salience: 0.5 }));
console.log('R3 dark UI, NO face — must NOT be moody:');
console.log('   ' + M(doc, { footage: { brightness: 0.2 }, salience: 0.5 }));
console.log('R3 control: dark WITH a face — SHOULD be moody:');
console.log('   ' + M(doc, { footage: { brightness: 0.2, faceEmotion: 'sad' }, salience: 0.5 }));
console.log('R7 documentary + COMPARISON data fact — texture must be none (not grain):');
console.log('   ' + M(doc, { factKind: 'comparison', salience: 0.5 }));
console.log('R7 documentary + CONCEPT fact — grain ok:');
console.log('   ' + M(doc, { factKind: 'concept', salience: 0.5 }));
console.log('R5 every moment tier=hero but salience varies — emphasis must VARY:');
console.log('   salience 0.9: ' + M(doc, { tier: 'hero', salience: 0.9 }));
console.log('   salience 0.5: ' + M(doc, { tier: 'hero', salience: 0.5 }));
console.log('   salience 0.2: ' + M(doc, { tier: 'hero', salience: 0.2 }));
