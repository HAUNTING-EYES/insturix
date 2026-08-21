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

  it('uses ThinkForge V3 semantic treatment evidence without leaking implementation IDs', () => {
    const prompt = buildStoryboardPrompt({
      ...mockScene,
      editorialIntent: {
        source: 'thinkforge-v3-treatment',
        treatment: {
          treatmentId: 'treatment_1',
          treatmentVersion: 1,
          inputFingerprint: 'input_1',
        },
        narrativePurpose: 'Keep the host credible while the hidden process becomes legible.',
        visualEvents: [{
          id: 'event_process_cutaway',
          audienceJob: 'Make the hidden operational cost understandable.',
          visualThesis: 'Reveal the process behind the confident human claim without duplicating narration.',
          audioRelationship: 'counterpoint',
          timingNote: 'Appear during the explanatory turn, then clear before the decision.',
          continuityNotes: ['Reuse the process motif only when the consequence returns.'],
          sourceRefs: ['src_brief'],
          creativeReferenceIds: ['ref_explainer'],
          brandConstraints: ['Avoid exaggerated performance and visual clutter.'],
          accessibilityRequirements: ['Do not rely on color alone to explain the process.'],
          captureRequirementIds: ['capture_host_opening'],
        }],
      },
    }, mockStyleGuide, 0, 1, null);

    expect(prompt).toContain('Keep the host credible while the hidden process becomes legible.');
    expect(prompt).toContain('Make the hidden operational cost understandable.');
    expect(prompt).toContain('Relationship to narration: counterpoint.');
    expect(prompt).toContain('Reuse the process motif only when the consequence returns.');
    expect(prompt).toContain('Avoid exaggerated performance and visual clutter.');
    expect(prompt).toContain('Do not rely on color alone to explain the process.');
    expect(prompt).not.toContain('event_process_cutaway');
    expect(prompt).not.toContain('src_brief');
    expect(prompt).not.toContain('ref_explainer');
    expect(prompt).not.toContain('capture_host_opening');
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
