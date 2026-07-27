import { describe, expect, it } from 'vitest';
import { buildStagingPrompt, stageAvatarReference } from '../../lib/avatar/avatar-reference-staging';

describe('buildStagingPrompt', () => {
  it('wraps the scene/wardrobe prompt with identity-lock + quality guidance', () => {
    const p = buildStagingPrompt('in a modern office, wearing a black blazer').toLowerCase();
    expect(p).toContain('in a modern office, wearing a black blazer');
    expect(p).toContain('identical to the');
    expect(p).toContain('do not alter the face');
    expect(p).toContain('full body');
  });
});

describe('stageAvatarReference', () => {
  it('stages a reference via the injected image model (caps at 10 source photos)', async () => {
    let submitted: Record<string, unknown> | undefined;
    const result = await stageAvatarReference(
      { sourceImageUrls: Array.from({ length: 15 }, (_, i) => `p${i}.jpg`), scenePrompt: 'in a studio' },
      {
        submit: async (_model, input) => {
          submitted = input;
          return { requestId: 'r1' };
        },
        poll: async () => ({ done: true, imageUrl: 'https://cdn/staged.png' }),
      },
    );
    expect(result.imageUrl).toBe('https://cdn/staged.png');
    expect((submitted!.image_urls as string[]).length).toBe(10); // capped
  });

  it('refuses to run without a source photo', async () => {
    await expect(stageAvatarReference({ sourceImageUrls: [], scenePrompt: 'x' })).rejects.toThrow(/at least one source photo/);
  });

  it('fails loud when the model reports failure', async () => {
    await expect(
      stageAvatarReference(
        { sourceImageUrls: ['a.jpg'], scenePrompt: 'x' },
        { submit: async () => ({ requestId: 'r1' }), poll: async () => ({ done: false, failed: true, error: 'blocked' }) },
      ),
    ).rejects.toThrow(/Reference staging failed/);
  });
});
