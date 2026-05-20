import { describe, it, expect } from 'vitest';
import { buildStoryboardPrompt, buildStoryboardPromptWithCinema } from '../../lib/pipeline/storyboard-prompt-builder';
import type { SceneDescriptor, StyleGuide } from '../../lib/pipeline/schemas/storyboard';
import type { CinemaSettings } from '../../lib/editron/data/cinema-prompt-config';

describe('storyboard-prompt-builder cinema integration', () => {
  const mockScene: SceneDescriptor = {
    sceneIndex: 0,
    title: 'Test Scene',
    visualDescription: 'A person walking in a park',
    narration: 'The sun was setting.',
    durationSeconds: 5,
    mood: 'epic',
  };

  const mockStyleGuide: StyleGuide = {
    artStyle: 'cinematic',
    colorPalette: ['vibrant'],
  };

  it('auto-derives cinema settings from mood and art style', () => {
    const prompt = buildStoryboardPrompt(mockScene, mockStyleGuide);
    
    // Should include blockbuster settings due to "epic" mood + "cinematic" style
    expect(prompt).toContain('shot on a grand format 70mm film camera');
    expect(prompt).toContain('classic anamorphic lens');
    expect(prompt).toContain('35mm (natural cinematic perspective)');
    expect(prompt).toContain('aperture f/1.4');
    expect(prompt).toContain('shallow depth of field, creamy bokeh');
  });

  it('uses explicit cinema settings when provided', () => {
    const explicitSettings: CinemaSettings = {
      camera: '16mm-film',
      lens: 'vintage-prime',
      focalLength: 35,
      aperture: 'f/2.8',
    };

    const prompt = buildStoryboardPrompt(mockScene, mockStyleGuide, 0, 1, explicitSettings);
    
    expect(prompt).toContain('shot on a classic 16mm film camera');
    expect(prompt).toContain('vintage prime lens');
    expect(prompt).toContain('aperture f/2.8');
  });

  it('disables cinema hardware injection when cinemaSettings is null', () => {
    const prompt = buildStoryboardPrompt(mockScene, mockStyleGuide, 0, 1, null);
    
    expect(prompt).not.toContain('shot on a');
    expect(prompt).not.toContain('using a');
    expect(prompt).not.toContain('aperture');
  });

  it('works correctly via buildStoryboardPromptWithCinema wrapper', () => {
    const explicitSettings: CinemaSettings = {
      camera: 'modular-8k',
      lens: 'clinical-sharp',
      focalLength: 85,
      aperture: 'f/8',
    };

    const prompt = buildStoryboardPromptWithCinema(mockScene, explicitSettings, mockStyleGuide);
    
    expect(prompt).toContain('shot on a modular 8K digital cinema camera');
    expect(prompt).toContain('ultra-sharp clinical prime lens');
    expect(prompt).toContain('85mm (classic portrait perspective)');
    expect(prompt).toContain('aperture f/8');
  });
});
