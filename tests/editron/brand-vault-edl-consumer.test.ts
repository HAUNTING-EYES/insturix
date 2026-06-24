import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectDoc: null as Record<string, unknown> | null,
  resolveEffectiveBrandWithProfile: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => mocks.projectDoc),
    })),
  })),
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/services/motion-graphics-service', () => ({
  findBestTemplate: vi.fn(async () => null),
}));

vi.mock('@/lib/shared/brand-effective-resolver', () => ({
  resolveEffectiveBrandWithProfile: mocks.resolveEffectiveBrandWithProfile,
}));

import type { Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '../../lib/editron/config/editron-config';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import { deriveBrandSignalProfile, type BrandSignal, type BrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { brandSignalProfileToUnifiedBrand } from '../../lib/shared/brand-signal-profile-adapter';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';

const originalUseCompositionEngine = DEFAULT_CONFIG.features?.useCompositionEngine;

beforeEach(() => {
  mocks.projectDoc = null;
  mocks.resolveEffectiveBrandWithProfile.mockReset();
  if (DEFAULT_CONFIG.features) DEFAULT_CONFIG.features.useCompositionEngine = false;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  if (DEFAULT_CONFIG.features) DEFAULT_CONFIG.features.useCompositionEngine = originalUseCompositionEngine;
  vi.restoreAllMocks();
});

describe('Brand Vault Editron EDL consumer', () => {
  it('stamps accepted Vault colours, motion overrides, and signal defaults into real graphic output', async () => {
    const profile = acceptedProfile();
    const legacy = legacyBrand();
    const brand = brandSignalProfileToUnifiedBrand(profile, legacy);
    mocks.projectDoc = { projectId: 'brand-vault-edl-consumer', brandId: 'brand_edl' };
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand,
      acceptedProfile: profile,
      source: 'brand_vault',
    });

    const overlays: Overlay[] = [videoOverlay()];
    const edl: EditDecisionList = {
      projectId: 'brand-vault-edl-consumer',
      generatedAt: new Date('2026-06-24T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 30,
        durationFrames: 90,
        priority: 3,
        source: 'brand-vault-consumer:test',
        signal: 'statistic_detected',
        reason: 'Prove accepted Brand Vault profile reaches EDL graphic output',
        confidence: 0.95,
        params: {
          graphicType: 'stat-counter',
          text: '42%',
          value: '42%',
          label: 'brand lift',
          semanticAtoms: {
            quantity: {
              value: 42,
              displayText: '42%',
              kind: 'percent',
              bounded: true,
              denominator: 100,
            },
            evidencePhrase: '42 percent brand lift in the launch cohort',
          },
          contextPhrase: '42 percent brand lift in the launch cohort',
          contextStartMs: 1000,
          contextEndMs: 2400,
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    const result = await executeEDL(
      edl,
      'brand-vault-edl-consumer',
      'user_edl',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(mocks.resolveEffectiveBrandWithProfile).toHaveBeenCalledWith(
      'user_edl',
      'brand_edl',
      { service: 'editron' },
    );

    const decisionParams = edl.decisions[0]?.params as Record<string, any>;
    expect(decisionParams.brand).toMatchObject({
      primaryColor: '#101820',
      accentColor: '#ffcc00',
      motionEnergy: 0.78,
      transitionSharpness: 0.82,
    });
    expect(decisionParams.brandMotionOverrides).toMatchObject({
      color: { primary: '#101820', accent: '#ffcc00' },
      typography: { headingTransform: 'uppercase' },
    });
    expect(decisionParams.signals).toMatchObject({
      formality: -0.5,
      enthusiasm: 0.78,
      pacing_velocity: 0.78,
      emotional_arousal: 0.78,
      pivot_intensity: 0.82,
    });

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    expect(
      result.overlaysCreated,
      JSON.stringify({ errors: result.errors, rejectedDecisions: result.rejectedDecisions }, null, 2),
    ).toBe(1);
    expect(motionGraphic).toBeDefined();
    expect(motionGraphic.resolvedTokens.color.primary).toBe('#101820');
    expect(motionGraphic.resolvedTokens.color.accent).toBe('#ffcc00');
    expect(motionGraphic.resolvedTokens.typography.headingTransform).toBe('uppercase');
    expect(motionGraphic.contentSignals.enthusiasm).toBe(0.78);
    expect(motionGraphic.contentSignals.pacing_velocity).toBe(0.78);
  });
});

function legacyBrand(): UnifiedBrand {
  return {
    brandId: 'brand_edl',
    userId: 'user_edl',
    name: 'EDL Signal Supply',
    voice: {
      voiceLock: 'Direct, structured, proof-led.',
      nicheMap: 'Creative operations teams',
      killList: [],
      hookArchetypes: ['system'],
      structuralHabits: ['lead with proof'],
    },
    visual: {
      industry: 'creative software',
      colors: ['#111827', '#f97316'],
      visualStyle: 'structured technical dashboard',
      typography: 'Geometric sans',
    },
    learning: { banditProjectCount: 0 },
  };
}

function acceptedProfile(): BrandSignalProfile {
  const profile = deriveBrandSignalProfile(legacyBrand(), {
    generatedAt: '2026-06-24T00:00:00.000Z',
  });

  setSignal(profile.palette.primary!, '#101820', 0.92, 'brand_fact');
  setSignal(profile.palette.accent!, '#ffcc00', 0.9, 'brand_preference');
  setSignal(profile.typography.casingBias, 'uppercase', 0.9, 'brand_preference');
  setSignal(profile.voice.defaultFormality, 0.25, 0.86, 'brand_preference');
  setSignal(profile.motion.motionEnergy, 0.78, 0.84, 'brand_preference');
  setSignal(profile.motion.transitionSharpness, 0.82, 0.84, 'brand_preference');

  return profile;
}

function setSignal<T>(
  signal: BrandSignal<T>,
  value: T,
  confidence: number,
  authorityClass: BrandSignal<T>['authorityClass'],
): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = authorityClass;
  delete signal.fallbackReason;
}

function videoOverlay(): Overlay {
  return {
    id: 1001,
    type: OverlayType.VIDEO,
    from: 0,
    durationInFrames: 120,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    content: 'https://example.com/source.mp4',
    src: 'https://example.com/source.mp4',
    styles: { opacity: 1 },
  } as Overlay;
}
