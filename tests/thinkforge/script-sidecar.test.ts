import { describe, expect, it } from 'vitest';
import {
  parseScriptGenerationResult,
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
} from '@/lib/thinkforge/schemas/script-sidecar';

function sidecar(overrides: Record<string, unknown> = {}) {
  return {
    sidecarVersion: SCRIPT_SIDECAR_VERSION,
    characters: [
      { id: 'host', name: 'Nimit', role: 'host' },
      { id: 'narrator', name: 'Narrator', role: 'narrator' },
    ],
    overallMusicPrompt: 'upbeat electronic with a driving beat',
    characterDescriptions: {
      host: 'founder in a clean studio',
    },
    colorPalette: ['cobalt blue', 'charcoal', 'warm white'],
    environmentNotes: 'Minimal studio desk with soft key light.',
    suggestedProfileCategory: 'production-mode',
    briefId: 'brief_1',
    sourceRefs: ['ref_pricing_pdf'],
    scenes: [
      {
        title: 'The Hook',
        narration: 'Adobe just raised prices again.',
        visualDescription: 'Founder facing camera at a minimal desk, medium close-up',
        videoMotionPrompt: 'subtle push-in',
        audioDescription: '',
        musicDescription: 'electronic, low energy rising',
        sfxDescription: '',
        durationSeconds: 4,
        mood: 'serious',
        imageQualityTokens: '35mm, shallow depth of field',
        videoQualityTokens: 'smooth cinematic footage',
        generationUnitId: 'host-desk',
        primaryVisualForUnit: true,
        sceneType: 'talking-head',
        assetRecommendation: 'ai-video',
        lines: [
          {
            text: 'Adobe just raised prices again.',
            speakerId: 'host',
            onCamera: true,
            delivery: 'sync-dialogue',
            sourceRefs: ['ref_pricing_pdf'],
          },
        ],
        charactersPresent: ['host'],
        relipSafe: true,
        sourceRefs: ['ref_pricing_pdf'],
      },
    ],
    ...overrides,
  };
}

describe('Script Sidecar v1 contract', () => {
  it('accepts the signed sidecar shape with parser fields plus line-level cast/provenance', () => {
    const parsed = parseScriptSidecar(sidecar());

    expect(parsed.sidecarVersion).toBe(SCRIPT_SIDECAR_VERSION);
    expect(parsed.characters.map((character) => character.id)).toEqual(['host', 'narrator']);
    expect(parsed.scenes[0]?.lines[0]).toMatchObject({
      speakerId: 'host',
      onCamera: true,
      delivery: 'sync-dialogue',
    });
  });

  it('rejects speaker ids that do not resolve to characters', () => {
    expect(() =>
      parseScriptSidecar(
        sidecar({
          characters: [{ id: 'host', name: 'Nimit', role: 'host' }],
          scenes: [
            {
              ...sidecar().scenes[0],
              lines: [
                {
                  text: 'Narrator line.',
                  speakerId: 'narrator',
                  onCamera: false,
                  delivery: 'voiceover',
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/speakerId.*narrator/);
  });

  it('rejects on-camera sync dialogue without relipSafe declared', () => {
    const scene = { ...sidecar().scenes[0] };
    delete (scene as Record<string, unknown>).relipSafe;

    expect(() => parseScriptSidecar(sidecar({ scenes: [scene] }))).toThrow(/relipSafe/);
  });

  it('rejects line source refs missing from the top-level sourceRefs union', () => {
    expect(() => parseScriptSidecar(sidecar({ sourceRefs: [] }))).toThrow(/line sourceRef/);
  });

  it('validates the one-call generation result envelope', () => {
    const parsed = parseScriptGenerationResult({
      scriptBlocks: [
        {
          id: 'blk_1',
          kind: 'paragraph',
          content: [{ type: 'text', text: 'Adobe just raised prices again.', styles: {} }],
        },
      ],
      sidecar: sidecar(),
      briefSnapshot: {
        output: {
          platform: 'instagram-reels',
          targetDurationSec: 15,
          aspectRatio: '9:16',
          count: 1,
          format: 'reel',
        },
        resolution: {
          fieldConfidence: {},
          confirmed: [],
          inferred: [],
        },
        entryPoint: 'thinkforge',
      },
      sidecarVersion: SCRIPT_SIDECAR_VERSION,
    });

    expect(parsed.sidecar.briefId).toBe('brief_1');
  });
});
