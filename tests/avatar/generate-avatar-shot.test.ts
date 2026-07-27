import { describe, expect, it } from 'vitest';
import {
  buildKlingI2vInput,
  buildSeedanceR2vInput,
  generateAvatarShot,
  selectAvatarShotModel,
  type AvatarShotSpec,
} from '../../lib/avatar/generate-avatar-shot';
import { MODEL_CAPABILITIES } from '../../lib/shared/capabilities';

const baseSpec = (over: Partial<AvatarShotSpec> = {}): AvatarShotSpec => ({
  avatarImageRefs: ['ref1.jpg', 'ref2.jpg'],
  durationSec: 5,
  resolution: '1080p',
  ...over,
});

describe('selectAvatarShotModel (router)', () => {
  it('picks Kling i2v for a real-person avatar shot (the default)', () => {
    expect(selectAvatarShotModel(baseSpec())?.name).toBe('kling-2.6-i2v');
  });

  it('excludes Seedance for real people (it rejects real faces)', () => {
    expect(selectAvatarShotModel(baseSpec())?.name).not.toBe('seedance-2.0-r2v');
  });

  it('uses Seedance 2.0 for a NON-real-person shot that needs >10s', () => {
    const model = selectAvatarShotModel(baseSpec({ requiresRealPerson: false, durationSec: 15, resolution: '720p' }));
    expect(model?.name).toBe('seedance-2.0-r2v');
  });

  it('returns null when nothing available fits a real-person 30s shot', () => {
    // Kling i2v maxes at 10s; Seedance is excluded (real faces); 2.5 unavailable.
    expect(selectAvatarShotModel(baseSpec({ durationSec: 30, resolution: '4K' }))).toBeNull();
  });

  it('never selects a placeholder or deprecated model', () => {
    const model = selectAvatarShotModel(baseSpec({ requiresRealPerson: false, durationSec: 15, resolution: '720p' }));
    expect(model?.name).not.toBe('seedance-2.5');
    expect(model?.name).not.toBe('omnihuman-fal');
  });

  // ★ Swap story (non-real-person body shots): flip seedance-2.5 available → router prefers it.
  it('auto-prefers seedance-2.5 once available (non-real-person shot)', () => {
    const caps = structuredClone(MODEL_CAPABILITIES);
    caps['seedance-2.5'].available = true;
    const model = selectAvatarShotModel(baseSpec({ requiresRealPerson: false, durationSec: 30, resolution: '4K' }), caps);
    expect(model?.name).toBe('seedance-2.5');
  });
});

describe('buildKlingI2vInput', () => {
  it('snaps duration to 5 or 10 and uses the first ref as the start image', () => {
    expect(buildKlingI2vInput(baseSpec({ durationSec: 4 })).durationSec).toBe(5);
    expect(buildKlingI2vInput(baseSpec({ durationSec: 8 })).durationSec).toBe(10);
    const { input } = buildKlingI2vInput(baseSpec({ avatarImageRefs: ['a.jpg', 'b.jpg'] }));
    expect(input.start_image_url).toBe('a.jpg');
    expect(input.duration).toBe('5');
  });
});

describe('buildSeedanceR2vInput', () => {
  it('caps refs at 9, locks identity, forbids generated speech, clamps duration', () => {
    const input = buildSeedanceR2vInput(baseSpec({ avatarImageRefs: Array(20).fill('r.jpg'), durationSec: 40 }));
    expect((input.image_urls as string[]).length).toBe(9);
    expect(String(input.prompt)).toContain('@Image9');
    expect(String(input.prompt).toLowerCase()).toContain('no vocals, no speech');
    expect(input.duration).toBe('15');
  });

  it('passes end_user_id when provided', () => {
    expect(buildSeedanceR2vInput(baseSpec(), 'user_123').end_user_id).toBe('user_123');
    expect(buildSeedanceR2vInput(baseSpec()).end_user_id).toBeUndefined();
  });
});

describe('generateAvatarShot (dispatch)', () => {
  it('routes a real-person shot to the Kling i2v adapter', async () => {
    let submittedModel = '';
    const result = await generateAvatarShot(baseSpec(), {
      submit: async (modelId) => {
        submittedModel = modelId;
        return { requestId: 'r1' };
      },
      poll: async () => ({ done: true, videoUrl: 'https://cdn/shot.mp4' }),
    });
    expect(submittedModel).toBe('fal-ai/kling-video/v2.6/pro/image-to-video');
    expect(result.modelUsed).toBe('kling-2.6-i2v');
    expect(result.hasNativeAudio).toBe(false); // relip provides the voice
  });

  it('fails loud when no available model satisfies the spec', async () => {
    await expect(generateAvatarShot(baseSpec({ durationSec: 30, resolution: '4K' }))).rejects.toThrow(/No available avatar-shot model/);
  });

  it('fails loud when the adapter reports failure', async () => {
    await expect(
      generateAvatarShot(baseSpec(), {
        submit: async () => ({ requestId: 'r1' }),
        poll: async () => ({ done: false, failed: true, error: 'boom' }),
      }),
    ).rejects.toThrow(/Kling 2\.6 i2v failed/);
  });
});
