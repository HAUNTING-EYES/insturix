import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_MODELS,
  ClickatronModelCompatibilityError,
  DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID,
  DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
  getDefaultClickatronModelIdForInput,
  generateImagen4PreviewPayload,
  generateModelPayload,
  IMAGEN4_PREVIEW_ASPECT_RATIOS,
  modelSupportsAspectRatio,
  resolveClickatronModelForGeneration,
} from '../../lib/config/clickatron-models';
import {
  ClickatronAspectRatioError,
  resolveClickatronImageGeometry,
} from '../../lib/clickatron/image-geometry';

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

  it('routes removed Imagen4 requests to the active text-to-image default', () => {
    const resolution = resolveClickatronModelForGeneration({
      requestedModelId: 'fal-ai/imagen4/preview',
      context: 'newVariation',
      referenceImageCount: 0,
      aspectRatio: '3:4',
    });

    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(resolution.reason).toBe('default');
  });

  it.each(['1.91:1', '2:3'])('routes custom product ratio %s to Seedream custom dimensions', (aspectRatio) => {
    const resolution = resolveClickatronModelForGeneration({
      context: 'newVariation',
      referenceImageCount: 0,
      aspectRatio,
    });
    const geometry = resolveClickatronImageGeometry(
      aspectRatio,
      resolution.model.constraints.customImageLongEdge,
    );
    const payload = generateModelPayload(
      resolution.modelId,
      { num_images: 1 },
      { prompt: 'Create an on-brand campaign visual.' },
      geometry.ratio,
      geometry.width,
      geometry.height,
    );

    expect(resolution.modelId).toBe(DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID);
    expect(modelSupportsAspectRatio(resolution.model, aspectRatio)).toBe(true);
    expect(geometry.ratio).toBe(aspectRatio);
    expect(payload.image_size).toEqual({
      width: geometry.width,
      height: geometry.height,
    });
  });

  it('routes reference-backed 1.91:1 handoffs to a compatible image model', () => {
    const resolution = resolveClickatronModelForGeneration({
      context: 'newVariation',
      referenceImageCount: 1,
      aspectRatio: '1.91:1',
    });

    expect(resolution.modelId).toBe('fal-ai/bytedance/seedream/v5/lite/edit');
    expect(resolution.model.types).toContain('image-to-image');
    expect(modelSupportsAspectRatio(resolution.model, '1.91:1')).toBe(true);
  });

  it.each(['0:1', '17:1', 'not-a-ratio'])('rejects invalid geometry %s before generation', (aspectRatio) => {
    expect(() => resolveClickatronImageGeometry(aspectRatio)).toThrow(ClickatronAspectRatioError);
    expect(() => resolveClickatronModelForGeneration({
      context: 'newVariation',
      aspectRatio,
    })).toThrow(ClickatronAspectRatioError);
  });

  it('fails loudly when reference evidence exceeds every configured model capability', () => {
    expect(() => resolveClickatronModelForGeneration({
      context: 'newVariation',
      referenceImageCount: 99,
      aspectRatio: '1:1',
    })).toThrow(ClickatronModelCompatibilityError);
  });
});
