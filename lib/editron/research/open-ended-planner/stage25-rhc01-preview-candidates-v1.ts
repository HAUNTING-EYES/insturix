import {
  OverlayType,
  type ClipOverlay,
  type KeyframeTrack,
  type Overlay,
  type ShapeOverlay,
  type TextOverlay,
} from '@/components/editron/editor/version-7.0.0/types';
import {
  RHC01_PREVIEW_ASSET_IDS_V1,
  buildRhc01GeneratedCompositionFixtureV1,
  type Rhc01PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc01-preview-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { verifyGeneratedCompositionProgramV1 } from './generated-composition-program-verifier-v1';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 } from './stage25-heldout-route-freeze-v1';

export const STAGE25_RHC01_PREVIEW_CANDIDATES_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC01_PREVIEW_CANDIDATES_V1_2' as const;

const CANVAS = Object.freeze({ width: 1080, height: 1920, fps: 30 });
const BOARD_END = 180;
const PREVIEW_END = 210;

export function buildStage25Rhc01PreviewCandidatesV1(
  identity: Rhc01PreviewFixtureIdentityV1,
) {
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-01') ?? fail('TASK_MISSING');
  const generated = buildRhc01GeneratedCompositionFixtureV1({
    identity,
    route: 'GENERATED_COMPOSITION',
  });
  const hybrid = buildRhc01GeneratedCompositionFixtureV1({
    identity,
    route: 'HYBRID',
  });
  for (const candidate of [generated, hybrid]) {
    const verification = verifyGeneratedCompositionProgramV1(candidate);
    if (verification.disposition !== 'CONTRACT_PASS'
      || verification.programHash !== hashCanonicalJsonV1(candidate.program)) {
      fail(`PROGRAM_CONTRACT_${candidate.program.programId}`);
    }
  }
  const nativeOverlays = buildStage25Rhc01NativePreviewOverlaysV1();
  const common = {
    version: STAGE25_RHC01_PREVIEW_CANDIDATES_VERSION_V1,
    authority: 'RESEARCH_PREVIEW_CANDIDATE_NO_PROJECT_MUTATION' as const,
    taskId: 'RHC-01' as const,
    taskSha256: String(task.taskSha256),
    canvas: { ...CANVAS, durationInFrames: PREVIEW_END },
    boardRange: { startFrame: 0, endExclusiveFrame: BOARD_END },
    followingRange: { startFrame: BOARD_END, endExclusiveFrame: PREVIEW_END },
    sourceBindings: RHC01_PREVIEW_ASSET_IDS_V1.map((assetId) => ({
      assetId,
      assetVersion: identity.assetVersions[assetId],
    })),
    targetPredicateIds: predicateIds(task.targetPredicates),
    preservationPredicateIds: predicateIds(task.preservationPredicates),
    renderDisposition: 'NOT_RENDERED' as const,
    routeQualityDisposition: 'UNJUDGED' as const,
    productExecutionDisposition: 'NOT_AUTHORIZED' as const,
    providerInferenceCalls: 0 as const,
    stateEffects: [] as const,
  };
  const candidates = [
    {
      ...common,
      candidateId: 'RHC-01:NATIVE:V1.2',
      route: 'NATIVE' as const,
      boardRange: { startFrame: 0, endExclusiveFrame: 150 },
      followingRange: { startFrame: 150, endExclusiveFrame: PREVIEW_END },
      editableRepresentation: {
        kind: 'EDITRON_OVERLAY_PLAN',
        overlayPlanHash: hashCanonicalJsonV1(nativeOverlays),
        overlayCount: nativeOverlays.length,
        overlays: nativeOverlays,
      },
      handoffs: {
        nativeBoundary: {
          projectFrame: 150,
          exitingAssetId: 'rhc01-product-c',
          exitingSourceFrame: 149,
          followingAssetId: 'rhc01-following-shot',
          followingSourceFrame: 150,
        },
        generatedToNativeBoundary: null,
        audio: 'NO_AUDIO_IN_BOUNDED_FIXTURE',
        timebase: '30/1_PROJECT_AND_SOURCE_CFR',
      },
    },
    {
      ...common,
      candidateId: 'RHC-01:GENERATED_COMPOSITION:V1.2',
      route: 'GENERATED_COMPOSITION' as const,
      editableRepresentation: {
        kind: 'GENERATED_COMPOSITION_PROGRAM',
        program: generated.program,
        sourceBundle: generated.sourceBundle,
        evidencePack: generated.evidencePack,
        referenceBlueprint: generated.referenceBlueprint,
        supplementalFacts: generated.supplementalFacts,
      },
      handoffs: {
        nativeBoundary: null,
        generatedToNativeBoundary: {
          projectFrame: BOARD_END,
          generatedSourceSlotId: 'source-light',
          generatedExitSourceFrame: 179,
          followingAssetId: 'rhc01-following-shot',
          followingSourceFrame: 180,
        },
        audio: 'CUE_HANDOFF_ONLY_NO_AUDIO_IN_BOUNDED_FIXTURE',
        timebase: '30/1_PROJECT_COMPOSITION_AND_SOURCE_CFR',
      },
    },
    {
      ...common,
      candidateId: 'RHC-01:HYBRID:V1.2',
      route: 'HYBRID' as const,
      boardRange: { startFrame: 0, endExclusiveFrame: 150 },
      followingRange: { startFrame: 150, endExclusiveFrame: PREVIEW_END },
      editableRepresentation: {
        kind: 'GENERATED_ISLAND_PLUS_NATIVE_CONTINUATION',
        generatedProgram: hybrid.program,
        sourceBundle: hybrid.sourceBundle,
        evidencePack: hybrid.evidencePack,
        referenceBlueprint: hybrid.referenceBlueprint,
        supplementalFacts: hybrid.supplementalFacts,
        nativeContinuation: {
          assetId: 'rhc01-following-shot',
          assetVersion: identity.assetVersions['rhc01-following-shot'],
          projectRange: { startFrame: 150, endExclusiveFrame: PREVIEW_END },
          sourceRange: { startFrame: 150, endExclusiveFrame: PREVIEW_END },
        },
      },
      handoffs: {
        nativeBoundary: null,
        generatedToNativeBoundary: {
          projectFrame: 150,
          generatedSourceSlotId: 'source-light',
          generatedExitSourceFrame: 149,
          followingAssetId: 'rhc01-following-shot',
          followingSourceFrame: 150,
        },
        audio: 'CUE_HANDOFF_ONLY_NO_AUDIO_IN_BOUNDED_FIXTURE',
        timebase: '30/1_PROJECT_COMPOSITION_AND_SOURCE_CFR',
      },
    },
  ];
  return deepFreezeV1({
    version: STAGE25_RHC01_PREVIEW_CANDIDATES_VERSION_V1,
    artifactType: 'Stage25Rhc01PreviewCandidatesV1' as const,
    authority: 'RESEARCH_PREVIEW_CANDIDATES_ONLY' as const,
    taskSha256: String(task.taskSha256),
    candidates,
    candidateSetHash: hashCanonicalJsonV1(candidates),
    providerInferenceCalls: 0 as const,
    renderCalls: 0 as const,
    canonicalProjectMutationWrites: 0 as const,
    stateEffects: [] as const,
  });
}

export function buildStage25Rhc01NativePreviewOverlaysV1(): readonly Overlay[] {
  return deepFreezeV1([
    shape(4100, 0, PREVIEW_END, 20, { left: 0, top: 0, width: 1080, height: 1920 }, '#080808'),
    video(4101, 'rhc01-product-a', 0, BOARD_END, 0, 10,
      { left: 0, top: 0, width: 360, height: 1920 }, '25% 50%', [track('x', [[0, -360], [24, 0]])]),
    video(4102, 'rhc01-product-b', 0, BOARD_END, 0, 9,
      { left: 360, top: 0, width: 360, height: 1920 }, '50% 50%', [track('y', [[0, 1920], [24, 0]])]),
    video(4103, 'rhc01-product-c', 0, 150, 0, 8,
      { left: 720, top: 0, width: 360, height: 1920 }, '75% 50%', [track('x', [[0, 1080], [24, 720]])]),
    text(4110, 'FAST', 0, BOARD_END, 3, { left: 16, top: 760, width: 328, height: 160 }),
    text(4111, 'QUIET', 24, BOARD_END - 24, 2, { left: 376, top: 760, width: 328, height: 160 }),
    text(4112, 'LIGHT', 48, 102, 1, { left: 736, top: 760, width: 328, height: 160 }),
    video(4104, 'rhc01-following-shot', 150, 60, 150, 7,
      { left: 0, top: 0, width: 1080, height: 1920 }, '50% 50%'),
  ] satisfies Overlay[]);
}

type Geometry = Readonly<{ left: number; top: number; width: number; height: number }>;
function base(id: number, from: number, durationInFrames: number, row: number, geometry: Geometry) {
  return { id, from, durationInFrames, row, ...geometry, isDragging: false, rotation: 0 };
}
function track(property: KeyframeTrack['property'], points: readonly (readonly [number, number])[]): KeyframeTrack {
  return { property, keyframes: points.map(([frame, value]) => ({ frame, value, easing: 'ease-out' })) };
}
function video(id: number, assetId: string, from: number, duration: number, sourceStartFrame: number, row: number, geometry: Geometry, objectPosition: string, keyframeTracks?: KeyframeTrack[]): ClipOverlay {
  return {
    ...base(id, from, duration, row, geometry),
    type: OverlayType.VIDEO,
    assetId,
    src: `/${assetId}.mp4`,
    content: `/${assetId}.mp4`,
    videoStartTime: sourceStartFrame / CANVAS.fps,
    hasNativeAudio: false,
    styles: { objectFit: 'cover', objectPosition, opacity: 1, volume: 0 },
    ...(keyframeTracks ? { keyframeTracks } : {}),
  };
}
function text(id: number, content: string, from: number, duration: number, row: number, geometry: Geometry): TextOverlay {
  return {
    ...base(id, from, duration, row, geometry),
    type: OverlayType.TEXT,
    content,
    styles: {
      fontSize: '82px',
      fontWeight: '700',
      color: '#F4E8C1',
      backgroundColor: 'transparent',
      fontFamily: 'Noto Sans',
      fontStyle: 'normal',
      textDecoration: 'none',
      lineHeight: '1',
      letterSpacing: '-1px',
      textAlign: 'center',
      textShadow: '0 3px 12px rgba(0,0,0,0.85)',
      opacity: 1,
    },
  };
}
function shape(id: number, from: number, duration: number, row: number, geometry: Geometry, fill: string): ShapeOverlay {
  return { ...base(id, from, duration, row, geometry), type: OverlayType.SHAPE, content: 'rectangle', styles: { fill, opacity: 1 } };
}
function predicateIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String((entry as { predicateId?: unknown }).predicateId ?? ''))
      .filter(Boolean)
    : [];
}
function fail(code: string): never { throw new Error(`STAGE25_RHC01_PREVIEW_${code}`); }
