import { describe, expect, it } from 'vitest';
import {
  buildVideoInputFromConfig,
  getActualVideoDuration,
  getVideoModelConfig,
  getVideoModelEndpoint,
  modelHasNativeAudio,
} from '../../lib/pipeline/adapters/video-model-configs';

describe('video model config registry', () => {
  it('wires HappyHorse 1.1 to the verified fal image-to-video endpoint', () => {
    const config = getVideoModelConfig('happy-horse-v1.1');

    expect(config.label).toBe('HappyHorse 1.1 (Native Audio)');
    expect(getVideoModelEndpoint('happy-horse-v1.1')).toBe('alibaba/happy-horse/v1.1/image-to-video');
    expect(config.endpoints.textToVideo).toBe('alibaba/happy-horse/v1.1/text-to-video');
    expect(modelHasNativeAudio('happy-horse-v1.1')).toBe(true);
  });

  it('builds HappyHorse input using documented image-to-video params only', () => {
    const config = getVideoModelConfig('happy-horse-v1.1');
    const input = buildVideoInputFromConfig(
      config,
      'https://cdn.example.com/frame.png',
      'A slow cinematic push-in on the first frame.',
      16,
      '4:5',
      'unused negative prompt',
      'https://cdn.example.com/next-frame.png',
      ['https://cdn.example.com/ref.png'],
    );

    expect(input).toMatchObject({
      image_url: 'https://cdn.example.com/frame.png',
      resolution: '1080p',
      duration: 15,
      enable_safety_checker: true,
    });
    expect(input.prompt).toContain('A slow cinematic push-in on the first frame.');
    expect(input.prompt).toContain('Audio direction: ambient environmental sounds');
    expect(input).not.toHaveProperty('aspect_ratio');
    expect(input).not.toHaveProperty('negative_prompt');
    expect(input).not.toHaveProperty('generate_audio');
    expect(input).not.toHaveProperty('end_image_url');
    expect(input).not.toHaveProperty('image_urls');
    expect(getActualVideoDuration('happy-horse-v1.1', 2)).toBe(3);
    expect(getActualVideoDuration('happy-horse-v1.1', 16)).toBe(15);
  });

  it('does not add HappyHorse audio prompt guidance when the scene has voiceover', () => {
    const config = getVideoModelConfig('happy-horse-v1.1');
    const input = buildVideoInputFromConfig(
      config,
      'https://cdn.example.com/frame.png',
      'A silent camera drift across the product.',
      5,
      '16:9',
      undefined,
      undefined,
      undefined,
      { hasVoiceover: true },
    );

    expect(input.prompt).toBe('A silent camera drift across the product.');
    expect(input).not.toHaveProperty('generate_audio');
  });
});