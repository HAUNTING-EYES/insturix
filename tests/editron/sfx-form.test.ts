import { describe, expect, it } from 'vitest';
import { buildAtomicMomentBundle } from '@/lib/editron/services/moment-bundle';
import { evaluateAtomicSfxAssetCandidate, resolveAtomicSfxForm } from '@/lib/editron/services/sfx-form';

describe('resolveAtomicSfxForm', () => {
  it('generates an impact accent from primitive rhythm and speech atoms without selecting an asset', () => {
    const form = resolveAtomicSfxForm({
      frame: 120,
      sceneRemainingFrames: 180,
      signals: {
        speech_energy: 0.88,
        word_importance: 0.92,
        beat_strength: 0.78,
        cinematic_moment: 0.74,
        visual_significance: 0.68,
      },
    });

    expect(form.version).toBe('atomic-sfx-form-v1');
    expect(form.shouldPlace).toBe(true);
    expect(form.intent).toBe('impact-accent');
    expect(form.compatibilityToken).toBe('impact');
    expect(form.timing.anchor).toBe('keyword');
    expect(form.timing.syncFrame).toBe(120);
    expect(form.timing.startFrame).toBeLessThanOrEqual(120);
    expect(form.timing.durationFrames).toBeGreaterThanOrEqual(10);
    expect(form.mix.volume).toBeGreaterThan(0.25);
    expect(form.primitiveAtoms).toEqual(expect.objectContaining({
      transient: expect.objectContaining({ onset: 'instant' }),
      tone: expect.objectContaining({ lowEndWeight: expect.any(Number) }),
      role: expect.objectContaining({
        intent: 'impact-accent',
        emotionalRole: 'punctuate',
        compatibilityToken: 'impact',
      }),
      policy: expect.objectContaining({ fallback: 'library-first' }),
    }));
    expect(form.northstar).toEqual({
      sourceOfTruth: 'primitive-atoms',
      selectsAssets: false,
      callsExternalApis: false,
      compatibilityTokenOnly: true,
    });
  });

  it('derives motion whoosh timing from visual motion atoms instead of transition presets', () => {
    const form = resolveAtomicSfxForm({
      frame: 240,
      signals: {
        motion_intensity: 0.86,
        visual_significance: 0.62,
        speech_energy: 0.24,
        beat_strength: 0.44,
        text_on_screen: 0.1,
        restraint: 0.15,
      },
    });

    expect(form.shouldPlace).toBe(true);
    expect(form.intent).toBe('motion-accent');
    expect(form.compatibilityToken).toBe('whoosh');
    expect(form.timing.anchor).toBe('motion-peak');
    expect(form.timing.preRollFrames).toBeGreaterThan(0);
    expect(form.transientSharpness).toBeGreaterThan(0.35);
    expect(form.asset.queryTerms).toContain('whoosh');
    expect(form.asset.textureTerms).toContain('cinematic');
    expect(form.primitiveAtoms.rhythm.syncAnchor).toBe('motion-peak');
    expect(form.primitiveAtoms.role.emotionalRole).toBe('lift');
  });

  it('uses beat-frame atoms as the physical sync point for beat-anchored SFX', () => {
    const form = resolveAtomicSfxForm({
      frame: 210,
      params: {
        sfxType: 'impact',
        sfxAnchor: 'beat',
        beatFrame: 228,
      },
      signals: {
        beat_strength: 0.92,
        speech_energy: 0.4,
        visual_significance: 0.52,
      },
    });

    expect(form.shouldPlace).toBe(true);
    expect(form.compatibilityToken).toBe('impact');
    expect(form.timing.anchor).toBe('beat');
    expect(form.timing.syncFrame).toBe(228);
    expect(form.timing.startFrame).toBeLessThanOrEqual(228);
  });

  it('uses transition-frame atoms for transition-anchored SFX instead of rough decision frame', () => {
    const form = resolveAtomicSfxForm({
      frame: 300,
      params: {
        sfxType: 'whoosh',
        sfxAnchor: 'transition',
        transitionFrame: 318,
      },
      signals: {
        motion_intensity: 0.74,
        beat_strength: 0.5,
        restraint: 0.2,
      },
    });

    expect(form.shouldPlace).toBe(true);
    expect(form.compatibilityToken).toBe('whoosh');
    expect(form.timing.anchor).toBe('transition');
    expect(form.timing.syncFrame).toBe(318);
    expect(form.timing.startFrame).toBeLessThan(318);
  });

  it('ignores invalid explicit anchors rather than inventing timing semantics', () => {
    const form = resolveAtomicSfxForm({
      frame: 100,
      params: {
        sfxType: 'impact',
        sfxAnchor: 'make-it-hit',
        beatFrame: 140,
      },
      signals: {
        word_importance: 0.84,
        beat_strength: 0.12,
        speech_energy: 0.72,
      },
    });

    expect(form.shouldPlace).toBe(true);
    expect(form.timing.anchor).toBe('keyword');
    expect(form.timing.syncFrame).toBe(100);
  });

  it('suppresses unearned SFX on busy restrained speech frames', () => {
    const form = resolveAtomicSfxForm({
      frame: 60,
      signals: {
        speech_energy: 0.7,
        word_importance: 0.42,
        visual_complexity: 0.94,
        text_on_screen: 0.9,
        face_present: 1,
        active_overlay_count: 4,
        restraint: 0.86,
      },
    });

    expect(form.shouldPlace).toBe(false);
    expect(form.intent).toBe('silence');
    expect(form.compatibilityToken).toBe('none');
    expect(form.mix.volume).toBe(0);
    expect(form.asset.fallbackPolicy).toBe('silence');
    expect(form.reasons.join(' ')).toContain('suppressed');
  });

  it('keeps explicit ambient cues as long bed forms with conservative fallback', () => {
    const form = resolveAtomicSfxForm({
      frame: 0,
      sceneRemainingFrames: 150,
      params: { sfxCue: 'restaurant room tone and soft crowd chatter' },
      signals: {
        speech_energy: 0.32,
        visual_complexity: 0.34,
        restraint: 0.48,
      },
    });

    expect(form.shouldPlace).toBe(true);
    expect(form.intent).toBe('ambient-bed');
    expect(form.compatibilityToken).toBe('ambient');
    expect(form.timing.anchor).toBe('scene-bed');
    expect(form.timing.durationFrames).toBe(150);
    expect(form.mix.fadeInFrames).toBeGreaterThan(0);
    expect(form.asset.sourcePreference).toEqual(['curated', 'library', 'generated']);
    expect(form.asset.fallbackPolicy).toBe('subtle-bed-only');
    expect(form.primitiveAtoms.tail.release).toBe('long-bed');
    expect(form.primitiveAtoms.policy.silenceAllowed).toBe(false);
  });

  it('can consume a moment bundle and preserve primitive evidence keys', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 180,
      fps: 30,
      snapshot: {
        'speech.energy': 0.84,
        'audio.music_beat': 0.79,
        'visual.motion_intensity': 0.3,
        'visual.significance': 0.72,
        'composite.cinematic_moment': 0.7,
      },
    });
    const form = resolveAtomicSfxForm({ momentBundle: bundle });

    expect(form.timing.syncFrame).toBe(bundle.rhythm.anchorFrame);
    expect(form.evidenceAtomKeys).toContain('speech.energy');
    expect(form.evidenceAtomKeys).toContain('audio.music_beat');
    expect(JSON.stringify(form)).not.toContain('presetId');
    expect(JSON.stringify(form)).not.toContain('templateId');
  });

  it('accepts library candidates that match the atomic asset plan', () => {
    const form = resolveAtomicSfxForm({
      frame: 240,
      signals: {
        motion_intensity: 0.86,
        visual_significance: 0.62,
        speech_energy: 0.24,
        beat_strength: 0.44,
      },
    });

    const quality = evaluateAtomicSfxAssetCandidate(form, {
      source: 'freesound',
      originalTitle: 'Cinematic whoosh sweep transition',
      durationMs: 760,
    });

    expect(quality.accepted).toBe(true);
    expect(quality.decision).toBe('accept');
    expect(quality.score).toBeGreaterThanOrEqual(quality.qualityFloor);
    expect(quality.matchedTerms).toContain('whoosh');
    expect(quality.reasons).toContain('token-match');
  });

  it('uses provider tags as atomic evidence without requiring the title to carry every term', () => {
    const form = resolveAtomicSfxForm({
      frame: 240,
      params: { sfxCue: 'smooth cinematic whoosh transition' },
      signals: {
        motion_intensity: 0.72,
        visual_significance: 0.62,
      },
    });

    const quality = evaluateAtomicSfxAssetCandidate(form, {
      source: 'freesound',
      originalTitle: 'Air movement pass',
      tags: ['whoosh', 'cinematic', 'smooth', 'transition'],
      durationMs: 780,
    });

    expect(quality.accepted).toBe(true);
    expect(quality.matchedTerms).toEqual(expect.arrayContaining(['whoosh', 'cinematic']));
    expect(quality.reasons.join(' ')).toContain('texture:');
  });

  it('rejects ugly or mismatched library candidates instead of forcing a bad SFX', () => {
    const form = resolveAtomicSfxForm({
      frame: 240,
      signals: {
        motion_intensity: 0.86,
        visual_significance: 0.62,
        speech_energy: 0.24,
        beat_strength: 0.44,
        restraint: 0.65,
      },
    });

    const quality = evaluateAtomicSfxAssetCandidate(form, {
      source: 'freesound',
      originalTitle: 'Cartoon coin pickup meme vocal noisy',
      durationMs: 900,
    });

    expect(quality.accepted).toBe(false);
    expect(quality.decision).toBe('reject');
    expect(quality.avoidTermsHit).toEqual(expect.arrayContaining(['noisy', 'vocal', 'meme']));
    expect(quality.reasons.join(' ')).toContain('fallback:library-first');
  });
});
