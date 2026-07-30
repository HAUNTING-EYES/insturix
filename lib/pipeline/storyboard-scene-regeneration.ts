import { regenerateWithContext } from './storyboard-interactive-service';
import type { StoryboardScene } from './schemas/storyboard';
import { CreditsService } from '@/lib/services/creditsService';

const CREDIT_SERVICE = 'pipeline';
const CREDIT_ACTION = 'storyboard_context_regeneration';

export type StoryboardSceneRegenerationErrorCode =
  | 'CREDIT_CHARGE_FAILED'
  | 'GENERATION_FAILED'
  | 'CREDIT_REFUND_FAILED';

export class StoryboardSceneRegenerationError extends Error {
  readonly code: StoryboardSceneRegenerationErrorCode;
  readonly httpStatus: number;

  constructor(
    message: string,
    code: StoryboardSceneRegenerationErrorCode,
    httpStatus: number,
  ) {
    super(message);
    this.name = 'StoryboardSceneRegenerationError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export async function regenerateStoryboardSceneImage(input: {
  storyboardId: string;
  sceneIndex: number;
  userId: string;
  feedback?: string;
  modelId?: string;
  referenceImageUrl?: string;
}): Promise<StoryboardScene> {
  const charge = await CreditsService.deductCredits(
    input.userId,
    CREDIT_SERVICE,
    CREDIT_ACTION,
  );
  if (!charge.success) {
    const insufficient = /insufficient/i.test(charge.error ?? '');
    throw new StoryboardSceneRegenerationError(
      charge.error || 'Failed to charge scene-regeneration credits.',
      'CREDIT_CHARGE_FAILED',
      insufficient ? 402 : 503,
    );
  }

  try {
    return await regenerateWithContext(
      input.storyboardId,
      input.sceneIndex,
      input.userId,
      {
        feedback: input.feedback,
        modelId: input.modelId,
        referenceImageUrl: input.referenceImageUrl,
      },
    );
  } catch (error) {
    const generationMessage = error instanceof Error ? error.message : String(error);
    const refundAmount = charge.creditsDeducted;
    if (refundAmount > 0) {
      let refund: Awaited<ReturnType<typeof CreditsService.refundCredits>>;
      try {
        refund = await CreditsService.refundCredits(
          input.userId,
          refundAmount,
          `Storyboard scene regeneration failed: ${generationMessage}`,
          {
            service: CREDIT_SERVICE,
            action: CREDIT_ACTION,
            originalTransactionId: charge.transactionId,
          },
        );
      } catch (refundError) {
        const refundMessage = refundError instanceof Error
          ? refundError.message
          : String(refundError);
        throw new StoryboardSceneRegenerationError(
          `Scene regeneration failed (${generationMessage}) and its credit refund threw: ${refundMessage}`,
          'CREDIT_REFUND_FAILED',
          500,
        );
      }
      if (!refund.success) {
        throw new StoryboardSceneRegenerationError(
          `Scene regeneration failed (${generationMessage}) and its credit refund failed: `
          + `${refund.error || 'unknown refund error'}`,
          'CREDIT_REFUND_FAILED',
          500,
        );
      }
    }
    throw new StoryboardSceneRegenerationError(
      `Scene regeneration failed: ${generationMessage}`,
      'GENERATION_FAILED',
      502,
    );
  }
}
