import { describe, expect, it } from 'vitest';
import {
  buildSeedanceR2vInput,
  generateAvatarShot,
  selectAvatarShotModel,
  type AvatarShotSpec,
} from '../../lib/avatar/generate-avatar-shot';
import { MODEL_CAPABILITIES } from '../../lib/shared/capabilities';

const baseSpec = (over: Partial<AvatarShotSpec> = {}): AvatarShotSpec => ({
  avatarImageRefs: ['ref1.jpg', 'ref2.jpg'],
  durationSec: 10,
  resolution: '720p',
  ...over,
});

describe('selectAvatarShotModel (router)', () => {
  it('picks Seedance 2.0 r2v for a normal in-bounds shot', () => {
    const model = selectAvatarShotModel(baseSpec({ avatarImageRefs: Array(9).fill('r.jpg'), durationSec: 15, resolution: '1080p' }));
    expect(model?.name).toBe('seedance-2.0-r2v');
  });

  it('returns null when nothing available satisfies the spec (2.0 too small, 2.5 unavailable)', () => {
    // 30s + 20 refs + 4K: only the unreleased 2.5 could do it, and it is available:false.
    const model = selectAvatarShotModel(baseSpec({ avatarImageRefs: Array(20).fill('r.jpg'), durationSec: 30, resolution: '4K' }));
    expect(model).toBeNull();
  });

  it('never selects a deprecated or placeholder model', () => {
    const model = selectAvatarShotModel(baseSpec());
    expect(model?.name).not.toBe('seedance-2.5'); // available:false
    expect(model?.name).not.toBe('omnihuman-fal'); // deprecated + wrong role anyway
  });

  // ★ The swap story: flipping seedance-2.5 to available makes the router auto-prefer it,
  //   with zero other code changes.
  it('auto-prefers seedance-2.5 once it is flipped available (higher ceilings win)', () => {
    const caps = structuredClone(MODEL_CAPABILITIES);
    caps['seedance-2.5'].available = true;

    // A shot only 2.5 can do now resolves to 2.5.
    const big = selectAvatarShotModel(baseSpec({ avatarImageRefs: Array(20).fill('r.jpg'), durationSec: 30, resolution: '4K' }), caps);
    expect(big?.name).toBe('seedance-2.5');

    // Even a shot BOTH can do prefers 2.5 (more reference images = better identity hold).
    const small = selectAvatarShotModel(baseSpec({ avatarImageRefs: Array(5).fill('r.jpg'), durationSec: 8, resolution: '720p' }), caps);
    expect(small?.name).toBe('seedance-2.5');
  });
});

describe('buildSeedanceR2vInput', () => {
  it('caps refs at 9, locks identity, forbids generated speech, and clamps duration', () => {
    const input = buildSeedanceR2vInput(baseSpec({ avatarImageRefs: Array(20).fill('r.jpg'), durationSec: 40 }));
    expect((input.reference_images as string[]).length).toBe(9);
    expect(String(input.prompt)).toContain('@Image9');
    expect(String(input.prompt).toLowerCase()).toContain('no vocals, no speech');
    expect(input.duration).toBe('15'); // clamped to Seedance 2.0 max
  });

  it('passes end_user_id for the geo-restriction when provided', () => {
    const input = buildSeedanceR2vInput(baseSpec(), 'user_123');
    expect(input.end_user_id).toBe('user_123');
    const without = buildSeedanceR2vInput(baseSpec());
    expect(without.end_user_id).toBeUndefined();
  });
});

describe('generateAvatarShot (dispatch)', () => {
  it('routes to the Seedance 2.0 adapter and returns its video', async () => {
    let submittedModel = '';
    const result = await generateAvatarShot(baseSpec(), {
      submit: async (modelId) => {
        submittedModel = modelId;
        return { requestId: 'req_1' };
      },
      poll: async () => ({ done: true, videoUrl: 'https://cdn.example/shot.mp4' }),
    });
    expect(submittedModel).toBe('bytedance/seedance-2.0/reference-to-video');
    expect(result.videoUrl).toBe('https://cdn.example/shot.mp4');
    expect(result.modelUsed).toBe('seedance-2.0-r2v');
    expect(result.hasNativeAudio).toBe(true); // caller must replace audio before relip
  });

  it('fails loud when no available model can satisfy the spec', async () => {
    await expect(
      generateAvatarShot(baseSpec({ durationSec: 30, resolution: '4K', avatarImageRefs: Array(20).fill('r.jpg') })),
    ).rejects.toThrow(/No available avatar-shot model/);
  });

  it('fails loud when the adapter reports failure', async () => {
    await expect(
      generateAvatarShot(baseSpec(), {
        submit: async () => ({ requestId: 'req_1' }),
        poll: async () => ({ done: false, failed: true, error: 'geo blocked' }),
      }),
    ).rejects.toThrow(/Seedance 2\.0 r2v failed/);
  });
});
