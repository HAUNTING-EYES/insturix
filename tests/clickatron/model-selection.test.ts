import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_MODELS,
  DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID,
  DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
  getDefaultClickatronModelIdForInput,
  generateImagen4PreviewPayload,
  IMAGEN4_PREVIEW_ASPECT_RATIOS,
  resolveClickatronModelForGeneration,
} from '../../lib/config/clickatron-models';

describe('Clickatron model selection', () => {
  it('defaults text-only prompts to a text-to-image model', () => {
    const modelId = getDefaultClickatronModelIdForInput({
      context: 'newVariation',
      referenceImageCount: 0,
    });

    expect(modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(modelId).toBe('fal-ai/bytedance/seedream/v5/lite/text-to-image');
    expect(CLICKATRON_MODELS[modelId].isDeprecated).not.toBe(true);
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

  it('routes blank parent updates as text-to-image when no parent image exists', () => {
    const resolution = resolveClickatronModelForGeneration({
      requestedModelId: DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID,
      context: 'newVariation',
      referenceImageCount: 0,
      hasParentImage: false,
      aspectRatio: '16:9',
    });

    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(resolution.model.types).toContain('text-to-image');
    expect(resolution.model.constraints.minImages ?? 0).toBe(0);
  });

  it('keeps legacy Imagen4 payload ratios constrained', () => {
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

  it('compacts Imagen4 prompts to the live Fal 5000 character limit', () => {
    const longPrompt = `${'core visual request '.repeat(220)}${'brand generation rules '.repeat(120)}`;
    const payload = generateImagen4PreviewPayload({ prompt: longPrompt }, '1:1', 1);

    expect(longPrompt.length).toBeGreaterThan(5000);
    expect(payload.prompt.length).toBeLessThanOrEqual(5000);
    expect(payload.prompt).toContain('Prompt compacted to fit the selected image model provider limit');
  });
  it('keeps 4:5 text-only requests on the active text-to-image default', () => {
    const resolution = resolveClickatronModelForGeneration({
      requestedModelId: DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
      context: 'newVariation',
      referenceImageCount: 0,
      aspectRatio: '4:5',
    });

    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(resolution.model.types).toContain('text-to-image');
    expect(resolution.model.constraints.allowedAspectRatios).toContain('4:5');
    expect(resolution.reason).toBe('requested');
  });

  it('selects a 4:5-compatible default when the caller does not send a model', () => {
    const resolution = resolveClickatronModelForGeneration({
      context: 'newVariation',
      referenceImageCount: 0,
      aspectRatio: '4:5',
    });

    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(resolution.model.types).toContain('text-to-image');
    expect(resolution.model.constraints.allowedAspectRatios).toContain('4:5');
  });

  it('routes deprecated Imagen4 requests to the active text-to-image default', () => {
    const resolution = resolveClickatronModelForGeneration({
      requestedModelId: 'fal-ai/imagen4/preview',
      context: 'newVariation',
      referenceImageCount: 0,
      aspectRatio: '3:4',
    });

    expect(CLICKATRON_MODELS['fal-ai/imagen4/preview'].isDeprecated).toBe(true);
    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(resolution.reason).toBe('aspect-ratio-fallback');
  });
});
