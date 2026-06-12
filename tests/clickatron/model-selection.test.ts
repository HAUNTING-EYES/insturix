import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_MODELS,
  DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID,
  DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
  getDefaultClickatronModelIdForInput,
  generateImagen4PreviewPayload,
  IMAGEN4_PREVIEW_ASPECT_RATIOS,
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

  it('keeps Imagen4 aspect ratios aligned with the live Fal contract', () => {
    expect(CLICKATRON_MODELS['fal-ai/imagen4/preview'].constraints.allowedAspectRatios).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
    ]);
    expect(IMAGEN4_PREVIEW_ASPECT_RATIOS).not.toContain('4:5');
    expect(generateImagen4PreviewPayload({ prompt: 'Create a post visual' }, '3:4', 1)).toMatchObject({
      aspect_ratio: '3:4',
      resolution: '1K',
    });
    expect(() => generateImagen4PreviewPayload({ prompt: 'Create a post visual' }, '4:5', 1)).toThrow(/does not support aspect ratio 4:5/);
  });
});
