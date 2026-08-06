import { ROW } from '../lib/pipeline/scene-to-editron';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';
import {
  buildMusicCoverageOverlays,
  resolveRuntimeMusicCoveragePlan,
} from '../lib/editron/services/music-coverage-runtime';

export const MUSIC_COVERAGE_CANARY_VERSION = 'editron-music-coverage-render-canary-v1' as const;
export const MUSIC_COVERAGE_CANARY_FPS = 30;
export const MUSIC_COVERAGE_CANARY_TOTAL_FRAMES = 600; // 20s

export interface CoverageModeExpectation {
  mode: 'none' | 'sections' | 'full';
  expectedMusicOverlayCount: number;
  /** For sections: at least one section must exist and none may overlap speech. */
  requireGapAtSpeech?: boolean;
}

export interface CoverageCanaryResult {
  mode: 'none' | 'sections' | 'full';
  planMode: 'none' | 'sections' | 'full';
  musicOverlayCount: number;
  assembledSoundOverlayCount: number;
  coverageRatio: number;
  rightsNotices: number;
}

export function buildCoverageBaseOverlay(): Record<string, unknown> {
  return {
    id: 6_001,
    type: 'sound',
    from: 0,
    durationInFrames: MUSIC_COVERAGE_CANARY_TOTAL_FRAMES,
    row: ROW.BGM,
    left: 0,
    top: 0,
    width: 320,
    height: 180,
    isDragging: false,
    rotation: 0,
    assetId: 'coverage_canary_music',
    src: 'data:audio/wav;base64,AAAA',
    content: 'data:audio/wav;base64,AAAA',
    styles: { volume: 0.8 },
    audioRights: {
      mediaRole: 'music',
      source: 'generated',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'generated-provider',
        sourceAssetId: 'coverage_canary_music',
        licenseId: 'synthetic-local-canary-v1',
      },
    },
    metadata: { source: 'zero-credit-music-coverage-render-canary' },
  };
}

interface RuntimeBgmOverlayLike {
  id: unknown;
  from: number;
  durationInFrames: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Prove each coverage mode through the REAL runtime planner, coverage overlay
 * builder, and production render assembler. Returns the assembled music overlay
 * layout so a test can assert none/sections/full produce the correct structure.
 */
export function driveCoverageMode(
  mode: 'none' | 'sections' | 'full',
  speechSegments: Array<{ startFrame: number; endFrame: number }> = [],
): CoverageCanaryResult {
  const totalFrames = MUSIC_COVERAGE_CANARY_TOTAL_FRAMES;
  const fps = MUSIC_COVERAGE_CANARY_FPS;

  const project: Record<string, unknown> =
    mode === 'full'
      ? { musicCoverageContext: { authoredMusicIntent: { coverage: 'full', source: 'canary' } } }
      : mode === 'sections'
        ? { musicCoverageContext: { authoredMusicIntent: { coverage: 'sections', source: 'canary' } } }
        : { musicPreference: 'none' };

  const plan = resolveRuntimeMusicCoveragePlan({
    totalFrames,
    fps,
    project,
    musicPreference: mode === 'none' ? 'none' : undefined,
    speechSegments: speechSegments.length > 0 ? speechSegments : null,
    authoredMusicIntent: mode === 'full'
      ? { coverage: 'full', source: 'canary' }
      : mode === 'sections'
        ? { coverage: 'sections', source: 'canary' }
        : null,
  });

  const baseOverlay = buildCoverageBaseOverlay();
  const musicOverlays = mode === 'none'
    ? []
    : buildMusicCoverageOverlays({
        baseOverlay: baseOverlay as RuntimeBgmOverlayLike,
        plan,
        totalFrames,
        idFactory: index => 6_100 + index,
      });

  const assembled = buildLambdaRenderInputProps({
    overlays: musicOverlays as never as Array<Record<string, unknown>>,
    durationInFrames: totalFrames,
    fps,
    width: 320,
    height: 180,
    baseUrl: '',
    isRendering: true,
    renderMediaMode: 'audio-only',
  });
  const assembledRecord = assembled as unknown as Record<string, unknown>;
  const assembledOverlays = (assembledRecord.overlays as Array<Record<string, unknown>> | undefined) ?? [];
  const rightsNotices = Array.isArray((assembledRecord as { audioRightsNotices?: unknown }).audioRightsNotices)
    ? ((assembledRecord as { audioRightsNotices: unknown[] }).audioRightsNotices.length)
    : 0;

  return {
    mode,
    planMode: plan.mode as 'none' | 'sections' | 'full',
    musicOverlayCount: musicOverlays.length,
    assembledSoundOverlayCount: assembledOverlays.filter(overlay => overlay?.type === 'sound').length,
    coverageRatio: plan.evidence?.coverageRatio ?? 0,
    rightsNotices,
  };
}
