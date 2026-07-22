import { describe, expect, it } from 'vitest';
import {
  AVATAR_ATTRIBUTE_GUIDANCE,
  inferAvatarAttributesFromImages,
  inferredAttributesToProfilePatch,
  type InferredAvatarAttributes,
} from '../../lib/avatar/infer-avatar-attributes';

const VALID = JSON.stringify({
  identityDescription: 'Adult man with short black hair and glasses',
  build: 'average',
  hair: 'short black',
  skinTone: 'medium',
  notableTraits: ['glasses'],
  wardrobe: 'navy sweater',
  quality: { faceDetected: true, singlePerson: true, usable: true, issues: [] },
});

describe('inferAvatarAttributesFromImages', () => {
  it('returns validated appearance attributes from the reference photos', async () => {
    const result = await inferAvatarAttributesFromImages(
      [{ data: Buffer.from('img'), mimeType: 'image/png', label: 'front portrait' }],
      { generate: async () => ({ text: VALID }) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.hair).toBe('short black');
    expect(result.data.notableTraits).toEqual(['glasses']);
    expect(result.data.quality.usable).toBe(true);
  });

  it('fails soft when the vision call dies (draft creation must not break)', async () => {
    const result = await inferAvatarAttributesFromImages(
      [{ data: Buffer.from('img') }],
      { generate: async () => { throw new Error('vision timeout'); } },
    );
    expect(result.ok).toBe(false);
  });

  it('guidance refuses to infer role/tone/personality from a photo', () => {
    const g = AVATAR_ATTRIBUTE_GUIDANCE.toLowerCase();
    expect(g).toContain('do not infer profession, personality, mood');
    expect(g).toContain('never invent');
    expect(g).toContain('render fidelity');
  });
});

describe('inferredAttributesToProfilePatch', () => {
  const attrs: InferredAvatarAttributes = {
    identityDescription: 'Adult man, short black hair, glasses',
    build: 'average',
    hair: '', // not visible → must be dropped
    skinTone: 'medium',
    notableTraits: ['glasses', '  '], // whitespace-only entry must be filtered
    wardrobe: 'navy sweater',
    quality: { faceDetected: true, singlePerson: true, usable: true, issues: [] },
  };

  it('maps only non-empty fields and filters junk traits', () => {
    const patch = inferredAttributesToProfilePatch(attrs);
    expect(patch.identityDescription).toBe('Adult man, short black hair, glasses');
    expect(patch.bodyProfile.build).toBe('average');
    expect(patch.bodyProfile.skinTone).toBe('medium');
    expect(patch.bodyProfile.hair).toBeUndefined(); // empty dropped, not overwritten with ''
    expect(patch.bodyProfile.notableTraits).toEqual(['glasses']);
    expect(patch.defaultLook).toBe('navy sweater');
  });

  it('tracks provenance only for fields it actually filled', () => {
    const paths = inferredAttributesToProfilePatch(attrs).inferredFields.map((f) => f.signalPath);
    expect(paths).toContain('identityPack.bodyProfile.build');
    expect(paths).toContain('identityPack.bodyProfile.notableTraits');
    expect(paths).toContain('stylePack.defaultLook');
    expect(paths).not.toContain('identityPack.bodyProfile.hair'); // empty → no evidence
  });
});
