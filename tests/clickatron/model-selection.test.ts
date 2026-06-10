import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_MODELS,
  DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID,
  DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
  getDefaultClickatronModelIdForInput,
} from '../../lib/config/clickatron-models';

describe('Clickatron model selection', () => {
  it('defaults text-only prompts to a text-to-image model', () => {
    const modelId = getDefaultClickatronModelIdForInput({
      context: 'newVariation',
      referenceImageCount: 0,
    });

    expect(modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(CLICKATRON_MODELS[modelId].types).toContain('text-to-image');
    expect(CLICKATRON_MODELS[modelId].constraints.minImages ?? 0).toBe(0);
  });

  it('defaults reference-image prompts to an image-to-image model', () => {
    const modelId = getDefaultClickatronModelIdForInput({
      context: 'newVariation',
      referenceImageCount: 1,
    });

    expect(modelId).toBe(DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID);
    expect(CLICKATRON_MODELS[modelId].types).toContain('image-to-image');
    expect(CLICKATRON_MODELS[modelId].constraints.minImages ?? 0).toBeLessThanOrEqual(1);
  });

  it('treats parent variation edits as image-to-image even without uploaded references', () => {
    const modelId = getDefaultClickatronModelIdForInput({
      context: 'edit',
      referenceImageCount: 0,
      hasParentImage: true,
    });

    expect(CLICKATRON_MODELS[modelId].types).toContain('image-to-image');
  });
});
