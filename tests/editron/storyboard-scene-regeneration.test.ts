import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  regenerateWithContext: vi.fn(),
}));

vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: {
    deductCredits: mocks.deductCredits,
    refundCredits: mocks.refundCredits,
  },
}));

vi.mock('@/lib/pipeline/storyboard-interactive-service', () => ({
  regenerateWithContext: mocks.regenerateWithContext,
}));

import {
  regenerateStoryboardSceneImage,
  StoryboardSceneRegenerationError,
} from '@/lib/pipeline/storyboard-scene-regeneration';

describe('storyboard scene regeneration service', () => {
  beforeEach(() => {
    mocks.deductCredits.mockReset();
    mocks.refundCredits.mockReset();
    mocks.regenerateWithContext.mockReset();
  });

  it('charges once and returns the scene persisted by the existing generator', async () => {
    mocks.deductCredits.mockResolvedValue({
      success: true,
      creditsDeducted: 3,
      transactionId: 'txn-scene-1',
    });
    mocks.regenerateWithContext.mockResolvedValue({
      sceneIndex: 1,
      imageAssetId: 'image-new-1',
    });

    await expect(regenerateStoryboardSceneImage({
      storyboardId: 'sb-1',
      sceneIndex: 1,
      userId: 'user-1',
      feedback: 'Use warmer light.',
    })).resolves.toMatchObject({
      sceneIndex: 1,
      imageAssetId: 'image-new-1',
    });

    expect(mocks.deductCredits).toHaveBeenCalledWith(
      'user-1',
      'pipeline',
      'storyboard_context_regeneration',
    );
    expect(mocks.regenerateWithContext).toHaveBeenCalledWith(
      'sb-1',
      1,
      'user-1',
      {
        feedback: 'Use warmer light.',
        modelId: undefined,
        referenceImageUrl: undefined,
      },
    );
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('does not invoke the image provider when the credit charge fails', async () => {
    mocks.deductCredits.mockResolvedValue({
      success: false,
      creditsDeducted: 0,
      error: 'Insufficient media credits.',
    });

    await expect(regenerateStoryboardSceneImage({
      storyboardId: 'sb-1',
      sceneIndex: 1,
      userId: 'user-1',
    })).rejects.toMatchObject({
      code: 'CREDIT_CHARGE_FAILED',
      httpStatus: 402,
    });
    expect(mocks.regenerateWithContext).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('refunds the exact charge when generation fails', async () => {
    mocks.deductCredits.mockResolvedValue({
      success: true,
      creditsDeducted: 3,
      transactionId: 'txn-scene-2',
    });
    mocks.regenerateWithContext.mockRejectedValue(new Error('provider unavailable'));
    mocks.refundCredits.mockResolvedValue({ success: true });

    await expect(regenerateStoryboardSceneImage({
      storyboardId: 'sb-1',
      sceneIndex: 1,
      userId: 'user-1',
    })).rejects.toMatchObject({
      code: 'GENERATION_FAILED',
      httpStatus: 502,
      message: 'Scene regeneration failed: provider unavailable',
    });
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      'user-1',
      3,
      'Storyboard scene regeneration failed: provider unavailable',
      {
        service: 'pipeline',
        action: 'storyboard_context_regeneration',
        originalTransactionId: 'txn-scene-2',
      },
    );
  });

  it('surfaces a refund failure instead of hiding monetary inconsistency', async () => {
    mocks.deductCredits.mockResolvedValue({
      success: true,
      creditsDeducted: 3,
      transactionId: 'txn-scene-3',
    });
    mocks.regenerateWithContext.mockRejectedValue(new Error('provider unavailable'));
    mocks.refundCredits.mockResolvedValue({
      success: false,
      error: 'transaction not found',
    });

    const error = await regenerateStoryboardSceneImage({
      storyboardId: 'sb-1',
      sceneIndex: 1,
      userId: 'user-1',
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(StoryboardSceneRegenerationError);
    expect(error).toMatchObject({
      code: 'CREDIT_REFUND_FAILED',
      httpStatus: 500,
      message: expect.stringContaining('transaction not found'),
    });
  });
});
