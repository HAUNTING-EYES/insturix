import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

import {
  buildContextKey,
  buildSignalBucket,
  recordProjectOutcome,
  resolveBanditOutcomeWritePolicy,
} from '../../lib/editron/services/genre-parameter-bandit';

describe('genre parameter bandit learning gate', () => {
  beforeEach(() => {
    mocks.getDatabase.mockReset();
  });

  it('blocks metadata-only quality scores from training live bandits', async () => {
    expect(resolveBanditOutcomeWritePolicy({
      userRendered: true,
      evidenceSource: 'metadata-only',
    })).toMatchObject({
      allowed: false,
      reason: 'missing_rendered_quality_evidence',
      evidenceSource: 'metadata-only',
    });

    const result = await recordProjectOutcome('user_1', 'project_1', 82, false, false);

    expect(result).toEqual({
      recorded: false,
      reason: 'missing_rendered_quality_evidence',
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it('allows rendered aesthetic pass evidence to reach persistence', async () => {
    expect(resolveBanditOutcomeWritePolicy({
      evidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'pass',
    })).toMatchObject({
      allowed: true,
      reason: 'rendered_evidence_passed',
      evidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'pass',
    });
  });

  it('allows explicit publish acceptance even before rendered aesthetic automation exists', () => {
    expect(resolveBanditOutcomeWritePolicy({
      userPublished: true,
    })).toMatchObject({
      allowed: true,
      reason: 'user_published',
      evidenceSource: 'user-published',
    });
  });
  it('keys bandit contexts by measured signal buckets, not content-type labels', () => {
    const context = {
      signalBucket: buildSignalBucket({
        speechCoverage: 0.18,
        motionIntensity: 0.86,
        visualSignificance: 0.91,
        musicEnergy: 0.12,
      }),
      speechCoverageBucket: 'low' as const,
      durationBucket: 'medium' as const,
      platform: 'youtube',
      contentType: 'vlog',
    };

    const key = buildContextKey(context);

    expect(key).toBe('visual-led:low:medium:youtube');
    expect(key).not.toMatch(/vlog|documentary|talking-head|content-type/i);
  });

  it('records rendered outcomes under signal-bucket arm keys even when the project has a legacy content type', async () => {
    const genreParameters = {
      pacing_tolerance: 6,
      energy_baseline: 0.45,
      transition_density: 7,
      graphic_density: 2,
      silence_tolerance: 1.1,
      zoom_budget: 4,
      sfx_density: 0.25,
      color_temperature: 5600,
      formality: 0.4,
    };
    const banditUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collections = {
      projects: {
        findOne: vi.fn().mockResolvedValue({
          projectId: 'project_signal_bucket',
          durationInFrames: 3600,
          fps: 30,
          syntheticStoryboard: { platform: 'youtube' },
          genreParameters: {
            ...genreParameters,
            graphic_density: 2.4,
          },
          genreParametersSignalComputed: genreParameters,
          rawFootageAnalysis: {
            contentTypeDetection: { contentType: 'vlog', confidence: 0.93 },
            originalDurationMs: 30000,
            segments: [{ startMs: 0, endMs: 6000 }],
          },
          vjepaAnalysis: {
            segments: [
              { motionIntensity: 0.92, visualSignificance: 0.94 },
              { motionIntensity: 0.86, visualSignificance: 0.88 },
            ],
          },
          wav2vecAnalysis: { segments: [{ energy: 0.22 }] },
          musicAnalysis: { musicPresence: 0.1, energyCurve: [0.12, 0.18] },
        }),
      },
      bandit_states: {
        findOne: vi.fn().mockResolvedValue(null),
        updateOne: banditUpdateOne,
      },
    };
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: keyof typeof collections) => collections[name]),
    });

    const result = await recordProjectOutcome('user_1', 'project_signal_bucket', 91, false, false, {
      evidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'pass',
    });

    expect(result.recorded).toBe(true);
    const savedArms = banditUpdateOne.mock.calls[0]?.[1]?.$set?.arms as Array<[string, unknown]>;
    expect(savedArms.length).toBeGreaterThan(0);
    const armKeys = savedArms.map(([key]) => key).join('|');
    expect(armKeys).toContain(':visual-led:low:medium:youtube');
    expect(armKeys).not.toMatch(/vlog|documentary|talking-head|content-type/i);
  });
});
