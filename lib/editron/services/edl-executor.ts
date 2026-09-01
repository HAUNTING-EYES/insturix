/**
 * EDL Executor
 *
 * Converts Edit Decision List entries into concrete tool calls
 * that modify the Editron project. This bridges the gap between
 * "the AI decided to put a transition here" and "the transition
 * actually exists on the timeline."
 *
 * Called by the Director Agent after 5-track analysis generates
 * the EDL. Each decision becomes one or more overlay mutations.
 */

import type { EditDecision, EditDecisionList } from './reactive-edit-engine';
import { DEFAULT_TRANSITION_FRAMES } from '@/lib/editron/data/transition-templates';
import { OverlayType, type Overlay, type Keyframe, type KeyframeTrack } from '@/components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { searchAndDownloadSFX, isSFXLibraryAvailable, type SFXLibraryResult, type SFXLibrarySearchReport } from '@/lib/pipeline/sfx-library-service';
import { resolveMotionTokens, type BrandInputs, type DeepPartial, type MotionTokens } from '@/lib/editron/data/motion-theme-resolver';
import { brandInputsFromUnifiedBrandAtomic } from '@/lib/editron/motion-graphics/engine/brand-composition-rules';
import { brandInputsFromBrandSignalProfile, brandVaultToMotionOverrides } from '@/lib/editron/motion-graphics/engine/brand-vault-to-motion';
import { brandSignalProfileToCreativeSignalDefaults } from '@/lib/shared/brand-to-creative-signals';
import { planComposition, type MgOverlayScores } from '@/lib/editron/motion-graphics/engine/composition-planner';
import { checkCompositionStructure } from '@/lib/editron/motion-graphics/engine/structural-gate';
import { buildAtomicOverlayPlan } from '@/lib/editron/motion-graphics/engine/atomic-overlay-plan';
import { decideAtomicOverlay } from '@/lib/editron/motion-graphics/engine/atomic-overlay-decision';
import {
  resolveSemanticMgLedgerGate,
  selectSemanticMgCandidate,
} from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';
import { resolveAtomicZoomForm } from '@/lib/editron/services/zoom-form';
import { resolveAtomicTransitionForm } from '@/lib/editron/services/transition-form';
import { evaluateAtomicSfxAssetCandidate, resolveAtomicSfxForm, type AtomicSfxCandidateEvaluation, type AtomicSfxForm } from '@/lib/editron/services/sfx-form';
import { normalizeEdlDecisionParams } from '@/lib/editron/services/edl-param-contract';
import {
  resolveVjepaScreenContextPolicy,
  type VjepaScreenContextPolicy,
} from '@/lib/editron/services/vjepa-coverage-audit';
import {
  findNearestVisualClipBoundary,
  TRANSITION_BOUNDARY_SNAP_TOLERANCE_FRAMES,
  type ClipBoundaryMatch as SharedClipBoundaryMatch,
} from '@/lib/editron/services/transition-boundary';
import { resolveAtomicPlacement } from '@/lib/editron/services/atomic-placement';
import { normalizeMotionGraphicContent } from '@/lib/editron/services/mg-content-atoms';
import {
  applyMgExpressionAuthorityToRecipe,
  applyMgExpressionAuthorityToScores,
  resolveMgExpressionAuthority,
} from '@/lib/editron/services/mg-expression-authority';
import { buildAtomicMomentBundle, type AtomicMomentBundle, type MomentAtom } from '@/lib/editron/services/moment-bundle';
import { resolveMomentBundleGrammar, type AtomicMomentGrammar } from '@/lib/editron/services/moment-bundle-grammar';
import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayReceipt,
} from '@/lib/editron/engine/atomic-overlay-core';
import type { OverlayCategory, OverlayDefinition, ScoringResult } from '@/lib/editron/engine/utility-types';
import type { SignalCurves } from '@/lib/editron/motion-graphics/engine/primitive-renderers';
import type { UnifiedBrandLike } from '@/lib/editron/motion-graphics/codegen/brand-mapper';
import { listMgRenderableDataProps } from '@/lib/editron/motion-graphics/codegen/codegen-service';
import type { MgAnchors, MgReceipt } from '@/lib/editron/motion-graphics/codegen/types';
import type { FootageSignals } from '@/lib/editron/motion-graphics/codegen/style/footage-character';
import { normalizeEditorialPreferences, type EditorialFamilyPreference } from '@/lib/editron/production-brief/editorial-preferences';
import { computeMgMotionIntensity } from '@/lib/editron/motion-graphics/codegen/design/motion-intensity';
// P5-1 Phase C 2/2 — the video-level DESIGN pre-pass (design-then-code producer). Dark until the flag flips.
import { computeMgDensityBudget } from '@/lib/editron/motion-graphics/codegen/design/density-budget';
import {
  buildVideoTasteContract,
  type TasteContractBuildResult,
} from '@/lib/editron/motion-graphics/codegen/taste/contract-resolver';
import { tasteContractLiveEnabled } from '@/lib/editron/motion-graphics/codegen/taste/shadow';
import { formatTasteContractForPrompt } from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
import { resolveVideoStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';
import {
  runDesignPrepass,
  type MgDesignPrepassBeat,
  type MgDesignPrepassDisposition,
  type MgDesignPrepassResult,
} from '@/lib/editron/motion-graphics/codegen/design/design-prepass';
import { defaultGeminiDesignerGenerate } from '@/lib/editron/motion-graphics/codegen/design/designer-client';
import type { MgDesignerMoment } from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
import type { MgDesignPlanMomentContext } from '@/lib/editron/motion-graphics/codegen/design/design-plan';
import {
  getGeneratedNativeVideoReceiptIssue,
  resolveAudioRightsClaim,
} from '@/lib/editron/shared/render-request-payload';
import type { MGDeliveryRecord } from '@/lib/editron/motion-graphics/codegen/mg-delivery-record';

// Deterministic overlay ID for EDL-generated overlays. OLD: Date.now() + Math.random()
// produced different IDs per render → broke Lambda caching and A/B comparisons.
// NEW: hash the decision's anchor fields (frame + type + index) + a Director-run epoch.
// The epoch is per-executeEDL call so IDs are still unique within a project but stable
// for a single render pass. See Phase A3 notes in editron_master_remaining.md.
function deterministicOverlayId(epoch: number, decisionType: string, frame: number, index: number): number {
  // FNV-1a–ish fold into 53-bit integer safe for JS Number
  let h = 2166136261 >>> 0;
  const str = `${epoch}|${decisionType}|${frame}|${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Combine with epoch to guarantee project-level uniqueness across multiple EDL runs
  return epoch * 1_000_000 + (h % 1_000_000);
}

// ─── Seeded PRNG (deterministic random) ─────────────────────────
// OLD: Math.random() produced different shake patterns every render.
// NEW: mulberry32 seeded with frame + overlay position → identical output per render.

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Frame Snapping Helpers ─────────────────────────────────────
// Decision frames from Unified Intelligence may not align with actual clip
// positions due to pacing shifts, sub-shot splitting, or other overlay
// modifications that happen between decision generation and EDL execution.
// These helpers snap decision frames to the nearest actual clip positions.

export type ClipBoundaryMatch = SharedClipBoundaryMatch<Overlay>;

/**
 * Find the nearest clip boundary to a decision frame.
 * Used by applyTransition to snap transition placement to actual clip edges.
 */
export function snapToClipBoundary(
  decisionFrame: number,
  overlays: Overlay[],
  maxTolerance: number = TRANSITION_BOUNDARY_SNAP_TOLERANCE_FRAMES,
): ClipBoundaryMatch | null {
  return findNearestVisualClipBoundary(decisionFrame, overlays, maxTolerance);
}

/**
 * Find the video overlay that contains a given frame, with tolerance
 * for small frame drift. If exact containment fails, checks ±tolerance
 * frames and returns the nearest containing clip.
 */
export function findClipAtFrame(
  decisionFrame: number,
  overlays: Overlay[],
  tolerance: number = 15,
): { clip: Overlay; snappedFrame: number; drift: number } | null {
  // Try exact containment first (timeline position)
  const exact = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decisionFrame &&
    o.from + o.durationInFrames > decisionFrame,
  );
  if (exact) return { clip: exact, snappedFrame: decisionFrame, drift: 0 };

  // Mode 2 fallback: decision frames may be in pre-removal source timeline.
  // After silence removal, overlay.from positions shifted but videoStartTime
  // still references the original source. Match against source frame range.
  const sourceMatch = overlays.find(o => {
    if (o.type !== 'video') return false;
    const srcStart = (o as any).videoStartTime || 0;
    const srcEnd = srcStart + o.durationInFrames;
    return decisionFrame >= srcStart && decisionFrame < srcEnd;
  });
  if (sourceMatch) {
    const srcStart = (sourceMatch as any).videoStartTime || 0;
    const localOffset = decisionFrame - srcStart;
    const snapped = sourceMatch.from + localOffset;
    return { clip: sourceMatch, snappedFrame: snapped, drift: 0 };
  }

  // Try with tolerance — find nearest clip that contains decisionFrame ± tolerance
  let bestClip: Overlay | null = null;
  let bestDrift = Infinity;
  let bestFrame = decisionFrame;

  for (const o of overlays) {
    if (o.type !== 'video') continue;
    const clipStart = o.from;
    const clipEnd = o.from + o.durationInFrames;

    // Check if decisionFrame is just outside this clip
    if (decisionFrame < clipStart && clipStart - decisionFrame <= tolerance) {
      const drift = clipStart - decisionFrame;
      if (drift < bestDrift) {
        bestDrift = drift;
        bestClip = o;
        bestFrame = clipStart + 1; // Snap just inside clip start
      }
    } else if (decisionFrame >= clipEnd && decisionFrame - clipEnd < tolerance) {
      const drift = decisionFrame - clipEnd + 1;
      if (drift < bestDrift) {
        bestDrift = drift;
        bestClip = o;
        bestFrame = clipEnd - 1; // Snap just inside clip end
      }
    }
  }

  if (bestClip) return { clip: bestClip, snappedFrame: bestFrame, drift: bestDrift };
  return null;
}

// ─── Types ───────────────────────────────────────────────────────


type AudioBoundaryTransitionKind = 'j-cut' | 'l-cut';

const AUDIO_BOUNDARY_FPS = 30;
const MIN_AUDIO_BOUNDARY_OFFSET_FRAMES = 10;
const MAX_AUDIO_BOUNDARY_OFFSET_FRAMES = 90;

function resolveAudioBoundaryTransitionKind(decision: EditDecision): AudioBoundaryTransitionKind | null {
  const params = decision.params ?? {};
  const candidates = [
    params.transitionType,
    params.transitionCompatibilityHint,
    params.transitionStyle,
    params.creativeDecisionType,
    params.transitionRelation,
    params.transitionIntent,
    params.type,
    decision.type,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase().replace(/_/g, '-'));

  if (candidates.some((value) => isAudioBoundaryKindToken(value, 'j-cut') || value === 'audio-leads-picture')) return 'j-cut';
  if (candidates.some((value) => isAudioBoundaryKindToken(value, 'l-cut') || value === 'audio-trails-picture')) return 'l-cut';
  return null;
}

function isAudioBoundaryKindToken(value: string, kind: AudioBoundaryTransitionKind): boolean {
  return value === kind || value.endsWith(`-${kind}`) || value.endsWith(`.${kind}`) || value.endsWith(`:${kind}`);
}

function resolveAudioBoundaryOffsetFrames(decision: EditDecision): number {
  const params = decision.params ?? {};
  const offsetMs = readAudioBoundaryNumber(
    params.offsetMs,
    params.audioOffsetMs,
    params.audioLeadMs,
    params.audioTailMs,
    params.incomingAudioLeadMs,
    params.outgoingAudioTailMs,
  ) ?? 500;
  const offsetFrames = Math.round((offsetMs / 1000) * AUDIO_BOUNDARY_FPS);
  return Math.max(MIN_AUDIO_BOUNDARY_OFFSET_FRAMES, Math.min(MAX_AUDIO_BOUNDARY_OFFSET_FRAMES, offsetFrames));
}

function readAudioBoundaryNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return undefined;
}

function sourceStartFrameForClip(clip: Record<string, any>): number {
  return readAudioBoundaryNumber(clip.sourceStartFrame, clip.videoStartTime) ?? 0;
}

function applyAudioBoundaryTransition(
  kind: AudioBoundaryTransitionKind,
  decision: EditDecision,
  overlays: Overlay[],
  boundaryMatch: ClipBoundaryMatch,
  idEpoch: number,
  decisionIndex: number,
): { created: number; modified: number } | null {
  const offsetFrames = resolveAudioBoundaryOffsetFrames(decision);
  const targetClip = kind === 'j-cut' ? boundaryMatch.clipB as any : boundaryMatch.clipA as any;
  const sourceUrl = targetClip.src || targetClip.content;
  if (!sourceUrl) {
    console.log(`[EDL-Exec] ${kind} at frame ${decision.frame}: SKIPPED - target clip has no audio source URL`);
    return null;
  }
  if (targetClip.hasNativeAudio !== true) {
    console.log(`[EDL-Exec] ${kind} at frame ${decision.frame}: SKIPPED - target clip has no native-audio evidence`);
    return null;
  }
  const sourceAssetId = typeof targetClip.assetId === 'string' && targetClip.assetId.trim()
    ? targetClip.assetId.trim()
    : null;
  const rightsClaim = resolveAudioRightsClaim(targetClip);
  const nativeAudioRights = rightsClaim.rights;
  if (
    !sourceAssetId
    || rightsClaim.issue
    || !nativeAudioRights
    || nativeAudioRights.mediaRole !== 'native-video'
    || !nativeAudioRights.licensed
    || nativeAudioRights.source === 'preview-only'
    || nativeAudioRights.evidence?.sourceAssetId !== sourceAssetId
  ) {
    console.log(`[EDL-Exec] ${kind} at frame ${decision.frame}: SKIPPED - target clip has no renderable native-audio rights receipt`);
    return null;
  }
  if (nativeAudioRights.source === 'generated') {
    const receiptIssue = getGeneratedNativeVideoReceiptIssue(
      targetClip.generatedVideoReceipt,
      {
        assetId: sourceAssetId,
        licenseId: nativeAudioRights.evidence?.licenseId,
      },
    );
    if (receiptIssue) {
      console.log(`[EDL-Exec] ${kind} at frame ${decision.frame}: SKIPPED - generated native-audio receipt is invalid (${receiptIssue})`);
      return null;
    }
  }

  const existing = overlays.find((overlay: any) =>
    overlay.type === 'sound'
    && overlay.metadata?.source === 'edl-native-audio-boundary'
    && overlay.metadata?.audioBoundaryKind === kind
    && overlay.metadata?.sourceClipId === targetClip.id
  );
  if (existing) {
    console.log(`[EDL-Exec] ${kind} at frame ${decision.frame}: SKIPPED - native-audio boundary already exists for clip ${targetClip.id}`);
    return null;
  }

  const originalVolume = typeof targetClip.styles?.volume === 'number' ? targetClip.styles.volume : 1;
  const sourceStart = sourceStartFrameForClip(targetClip);
  const visualStart = targetClip.from;
  const visualEnd = targetClip.from + targetClip.durationInFrames;
  const audioStartFrame = kind === 'j-cut'
    ? Math.max(0, visualStart - offsetFrames)
    : visualStart;
  const audioLeadFrames = visualStart - audioStartFrame;
  const audioEndFrame = kind === 'l-cut'
    ? visualEnd + offsetFrames
    : visualEnd;
  const sourceOffsetFrames = kind === 'j-cut'
    ? Math.max(0, sourceStart - audioLeadFrames)
    : sourceStart;
  const durationFrames = Math.max(1, audioEndFrame - audioStartFrame);
  const soundId = deterministicOverlayId(idEpoch, `native-audio-${kind}`, decision.frame, decisionIndex);
  const atomicOverlayReceipt = buildOverlayAtomicReceipt({
    family: 'sound',
    intent: kind === 'j-cut' ? 'audio-leads-picture' : 'audio-trails-picture',
    frame: boundaryMatch.boundaryFrame,
    durationFrames,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: {
      overlayId: soundId,
      clipAId: (boundaryMatch.clipA as any).id,
      clipBId: (boundaryMatch.clipB as any).id,
      sourceClipId: targetClip.id,
      boundaryFrame: boundaryMatch.boundaryFrame,
    },
    payload: {
      audioBoundaryKind: kind,
      sourceClipId: targetClip.id,
      sourceOffsetFrames,
      offsetFrames,
      audioStartFrame,
      audioEndFrame,
    },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.boundary_frame', boundaryMatch.boundaryFrame, 1, 'edl'),
      overlayAtom('transition-relation', 'audio.boundary_kind', kind, decision.confidence, 'edl'),
      overlayAtom('start-frame', 'audio.start_frame', audioStartFrame, 1, 'derived-signal'),
      overlayAtom('end-frame', 'audio.end_frame', audioEndFrame, 1, 'derived-signal'),
      overlayAtom('duration', 'audio.duration_frames', durationFrames, decision.confidence, 'derived-signal'),
    ],
  });

  targetClip.styles = { ...(targetClip.styles ?? {}), volume: 0 };
  targetClip.metadata = {
    ...(targetClip.metadata ?? {}),
    nativeAudioBoundaryMutedBy: kind,
    nativeAudioBoundaryCloneId: soundId,
  };

  overlays.push({
    id: soundId,
    type: 'sound',
    from: audioStartFrame,
    durationInFrames: durationFrames,
    startFromSound: sourceOffsetFrames,
    audioStartFrame,
    audioEndFrame,
    row: ROW.VOICEOVER,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    content: sourceUrl,
    src: sourceUrl,
    assetId: sourceAssetId,
    audioRights: nativeAudioRights,
    ...(targetClip.generatedVideoReceipt
      ? { generatedVideoReceipt: targetClip.generatedVideoReceipt }
      : {}),
    styles: { volume: originalVolume, opacity: 1 },
    metadata: {
      source: 'edl-native-audio-boundary',
      audioBoundaryKind: kind,
      sourceClipId: targetClip.id,
      clipAId: (boundaryMatch.clipA as any).id,
      clipBId: (boundaryMatch.clipB as any).id,
      boundaryFrame: boundaryMatch.boundaryFrame,
      sourceOffsetFrames,
      offsetFrames,
      ...atomicMomentBundleMetadata(decision),
      atomicOverlayReceipt,
      atomicOverlayReceipts: [atomicOverlayReceipt],
      atomicOverlayForm: atomicOverlayReceipt.form,
      atomicOverlayForms: [atomicOverlayReceipt.form],
      atomicPlanObserveMode: true,
    },
  } as any);

  console.log(`[EDL-Exec] ${kind} APPLIED: native audio clone for clip ${targetClip.id} at boundary ${boundaryMatch.boundaryFrame}`);
  return { created: 1, modified: 1 };
}

export interface RejectedDecision {
  type: string;
  frame: number;
  reason: string;
  ruleId?: string;
  params?: Record<string, unknown>;
}

export type DecisionExecutionTraceOutcome = 'executed' | 'deferred' | 'budget-rejected' | 'guard-rejected' | 'error';

export interface DecisionExecutionTraceEntry {
  decisionIndex: number;
  type: string;
  frame: number;
  source?: string;
  signal?: string;
  confidence?: number;
  outcome: DecisionExecutionTraceOutcome;
  reason?: string;
  ruleId?: string;
  createdOverlayIds: Array<string | number>;
  modifiedOverlayIds: Array<string | number>;
  beforeOverlayCount: number;
  afterOverlayCount: number;
  paramsPreview?: Record<string, unknown>;
}

export interface ExecutionResult {
  decisionsExecuted: number;
  decisionsDeferred: number;
  decisionsSkipped: number;
  overlaysCreated: number;
  overlaysModified: number;
  errors: string[];
  /** Per-decision rejection reasons — surfaces WHY decisions were dropped (A3.5.10 fix) */
  rejectedDecisions: RejectedDecision[];
  /** Bounded decision-to-overlay trace for Phase 0 debugging. */
  decisionExecutionTrace: DecisionExecutionTraceEntry[];
  decisionExecutionTraceTotal: number;
  decisionExecutionTraceTruncated: boolean;
  /** AssetIds of overlays whose zoom decisions were rejected by budget — drift-zoom should skip these */
  budgetRejectedZoomAssetIds: Set<string>;
  /** AssetIds that already received a zoom from EDL — drift-zoom should skip these too */
  zoomedAssetIds: Set<string>;
  mgDesignJob?: {
    jobId?: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    decisionCount: number;
    reason?: string;
  };
  mgDesignSummary?: {
    attempts: number;
    approvedCount: number;
    declinedCount: number;
    unavailableCount: number;
    reason?: string;
  };
  projectEvidence: EdlProjectEvidenceV1;
}

export interface EdlMgKineticSfxContextV1 {
  version: 'mg-kinetic-sfx-context-v1';
  momentId: string;
  policy: 'full' | 'subtle' | 'off' | null;
  profileId: string | null;
  policySource: 'director-effective-profile' | 'unavailable';
  speechEnergy: number | null;
  speechSource: 'moment-signals' | 'wav2vec-segment' | 'unavailable';
  writtenAt: Date;
}

export interface EdlMgCodegenRunEvidenceV1 {
  version: 'mg-codegen-run-v2';
  queuedCount: number;
  generatedCount: number;
  failedCount: number;
  outcomes: MgCodegenDecisionOutcome[];
  truncated: boolean;
  completedAt: Date;
}

export interface EdlProjectEvidenceV1 {
  schemaVersion: 1;
  mgCodegenRun?: EdlMgCodegenRunEvidenceV1;
  mgKineticSfxContexts: EdlMgKineticSfxContextV1[];
  mgDeliveryRecords: MGDeliveryRecord[];
  mgTasteContract?: TasteContractBuildResult;
}

export interface ExecuteEDLOptions {
  deferMgDesign?: boolean;
  enqueueMgDesignJob?: (input: {
    projectId: string;
    userId: string;
    edl: EditDecisionList;
    canvas: { width: number; height: number };
    graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  }) => Promise<{ jobId: string; status: 'queued' | 'running' | 'completed' }>;
}

interface EDLSignalContext {
  vjepaSegments?: Array<Record<string, unknown>>;
  codegenBrand?: UnifiedBrandLike;
  hasConfiguredBrand?: boolean;
  orgId?: string;
  wav2vecSegments?: Array<Record<string, unknown>>;
  musicAnalysis?: Record<string, unknown>;
  vjepaScreenContextPolicy?: VjepaScreenContextPolicy;
  /** The user's stated PURPOSE (productionBriefIntake.userIntent) — drives the MG codegen style identity. */
  intent?: string;
  /** The video's aggregate signal character (energy/formality) — the SIGNAL-driven style identity primary. */
  videoSignals?: { energy?: number; formality?: number };
  /** The project's motionGraphics family preference (the user's dial: mode/frequency/intensity) — feeds the
   *  density budget + motion-intensity resolver. Absent = 'auto' (no user push). */
  motionGraphicsPref?: EditorialFamilyPreference;
  /** Phase 4b: the resolved video taste contract in judge-ready compact form ({hash, direction}). Set at the
   *  design pre-pass when live taste contracts are enabled; applyGraphic forwards it to each moment's judge. */
  tasteContractForJudge?: { hash: string; direction: string } | null;
  kineticSfxPolicy?: {
    policy: 'full' | 'subtle' | 'off';
    profileId: string;
    source: 'director-effective-profile';
  };
  /** Per-decision authority results from the video-level design pre-pass, keyed by decision reference.
   *  Live codegen requires an explicit approval; decline, failure, or absence fails closed. */
  mgDesignAuthority?: MgDesignPrepassResult<EditDecision>;
}

type ScoreAllOverlaysFn = typeof import('@/lib/editron/engine/utility-scorer').scoreAllOverlays;

interface UtilityScoringRuntime {
  definitions: OverlayDefinition[];
  scoreAllOverlays: ScoreAllOverlaysFn;
}

interface SfxCacheEntry {
  audioUrl: string;
  audioAssetId: string;
  durationMs: number;
  audioRights: SFXLibraryResult['audioRights'];
  source?: SFXLibraryResult['source'];
  originalTitle?: string;
  assetQuality: AtomicSfxCandidateEvaluation;
  providerSearchReport?: SFXLibrarySearchReport;
}

type SfxAssetCache = Map<string, SfxCacheEntry | null>;

const MAX_DECISION_EXECUTION_TRACE_ENTRIES = 300;

type OverlayTraceSnapshot = {
  overlayCount: number;
  signatures: Map<string, { id: string | number; signature: string }>;
};

type OverlayTraceDiff = {
  createdOverlayIds: Array<string | number>;
  modifiedOverlayIds: Array<string | number>;
  beforeOverlayCount: number;
  afterOverlayCount: number;
};

function appendDecisionExecutionTrace(result: ExecutionResult, entry: DecisionExecutionTraceEntry): void {
  result.decisionExecutionTraceTotal += 1;
  if (result.decisionExecutionTrace.length < MAX_DECISION_EXECUTION_TRACE_ENTRIES) {
    result.decisionExecutionTrace.push(entry);
  } else {
    result.decisionExecutionTraceTruncated = true;
  }
}

function buildDecisionExecutionTraceEntry(
  decision: EditDecision,
  decisionIndex: number,
  outcome: DecisionExecutionTraceOutcome,
  beforeSnapshot: OverlayTraceSnapshot,
  overlays: Overlay[],
  options: { reason?: string; ruleId?: string } = {},
): DecisionExecutionTraceEntry {
  const diff = diffOverlayTraceSnapshot(beforeSnapshot, overlays);
  const entry: DecisionExecutionTraceEntry = {
    decisionIndex,
    type: decision.type,
    frame: decision.frame,
    source: typeof decision.source === 'string' ? decision.source : undefined,
    signal: typeof decision.signal === 'string' ? decision.signal : undefined,
    confidence: typeof decision.confidence === 'number' ? round4(decision.confidence) : undefined,
    outcome,
    reason: options.reason,
    ruleId: options.ruleId,
    createdOverlayIds: diff.createdOverlayIds,
    modifiedOverlayIds: diff.modifiedOverlayIds,
    beforeOverlayCount: diff.beforeOverlayCount,
    afterOverlayCount: diff.afterOverlayCount,
  };
  const paramsPreview = compactDecisionParamsPreview(decision.params);
  if (paramsPreview) entry.paramsPreview = paramsPreview;
  return entry;
}

function captureOverlayTraceSnapshot(overlays: Overlay[]): OverlayTraceSnapshot {
  const signatures = new Map<string, { id: string | number; signature: string }>();
  overlays.forEach((overlay, index) => {
    const key = overlayTraceKey(overlay, index);
    signatures.set(key, { id: overlayTraceId(overlay, index), signature: overlayTraceSignature(overlay) });
  });
  return { overlayCount: overlays.length, signatures };
}

function diffOverlayTraceSnapshot(before: OverlayTraceSnapshot, overlays: Overlay[]): OverlayTraceDiff {
  const createdOverlayIds: Array<string | number> = [];
  const modifiedOverlayIds: Array<string | number> = [];
  overlays.forEach((overlay, index) => {
    const key = overlayTraceKey(overlay, index);
    const previous = before.signatures.get(key);
    const id = overlayTraceId(overlay, index);
    if (!previous) {
      createdOverlayIds.push(id);
      return;
    }
    if (previous.signature !== overlayTraceSignature(overlay)) {
      modifiedOverlayIds.push(id);
    }
  });
  return {
    createdOverlayIds,
    modifiedOverlayIds,
    beforeOverlayCount: before.overlayCount,
    afterOverlayCount: overlays.length,
  };
}

function overlayTraceKey(overlay: Overlay, index: number): string {
  const id = (overlay as any).id;
  if (typeof id === 'string' || typeof id === 'number') return `${typeof id}:${String(id)}`;
  return `index:${index}`;
}

function overlayTraceId(overlay: Overlay, index: number): string | number {
  const id = (overlay as any).id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return `index:${index}`;
}

function overlayTraceSignature(overlay: Overlay): string {
  const metadata = isTraceRecord((overlay as any).metadata) ? (overlay as any).metadata : {};
  const styles = isTraceRecord((overlay as any).styles) ? compactTraceRecord((overlay as any).styles, 24) : null;
  const keyframeTracks = Array.isArray((overlay as any).keyframeTracks)
    ? (overlay as any).keyframeTracks.slice(0, 12).map((track: any) => ({
      property: typeof track?.property === 'string' ? track.property : null,
      keyframeCount: Array.isArray(track?.keyframes) ? track.keyframes.length : 0,
      firstFrame: Array.isArray(track?.keyframes) ? track.keyframes[0]?.frame : undefined,
      lastFrame: Array.isArray(track?.keyframes) ? track.keyframes[track.keyframes.length - 1]?.frame : undefined,
    }))
    : [];

  return JSON.stringify({
    type: (overlay as any).type,
    from: (overlay as any).from,
    durationInFrames: (overlay as any).durationInFrames,
    row: (overlay as any).row,
    left: (overlay as any).left,
    top: (overlay as any).top,
    width: (overlay as any).width,
    height: (overlay as any).height,
    transitionStyle: (overlay as any).transitionStyle,
    styles,
    keyframeTracks,
    metadata: {
      source: traceScalar(metadata.source),
      placementRegion: traceScalar(metadata.placementRegion),
      atomicPlanObserveMode: metadata.atomicPlanObserveMode === true,
      atomicOverlayReceiptCount: Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts.length : (metadata.atomicOverlayReceipt ? 1 : 0),
      atomicOverlayFormCount: Array.isArray(metadata.atomicOverlayForms) ? metadata.atomicOverlayForms.length : (metadata.atomicOverlayForm ? 1 : 0),
      atomicZoomForm: compactTraceRecord(metadata.atomicZoomForm, 16),
      atomicTransitionForm: compactTraceRecord(metadata.atomicTransitionForm, 16),
      atomicSfxForm: compactTraceRecord(metadata.atomicSfxForm, 16),
      sfxPlannerEvidence: compactTraceRecord(metadata.sfxPlannerEvidence, 16),
      transitionSfxPlacement: compactTraceRecord(metadata.transitionSfxPlacement, 12),
    },
  });
}

function compactDecisionParamsPreview(params: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const keys = [
    'graphicType', 'creativeDecisionType', 'text', 'emphasisWord', 'sfxType', 'technique',
    'zoomType', 'transitionType', 'transitionStyle', 'style', 'role', 'source',
  ];
  const preview: Record<string, unknown> = {};
  for (const key of keys) {
    if (params[key] !== undefined) preview[key] = traceScalar(params[key]);
  }
  if (isTraceRecord(params.unifiedDecisionMerge)) {
    preview.unifiedDecisionMerge = compactTraceRecord(params.unifiedDecisionMerge, 10);
  }
  if (isTraceRecord(params.unifiedDecisionOwner)) {
    preview.unifiedDecisionOwner = compactTraceRecord(params.unifiedDecisionOwner, 10);
  }
  return Object.keys(preview).length > 0 ? preview : undefined;
}

function compactTraceRecord(value: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!isTraceRecord(value)) return null;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort().slice(0, maxKeys)) {
    output[key] = traceScalar(value[key]);
  }
  return output;
}

function traceScalar(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (typeof value === 'number') return Number.isFinite(value) ? round4(value) : null;
  if (typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return { length: value.length };
  if (isTraceRecord(value)) return { keys: Object.keys(value).slice(0, 12) };
  return String(value).slice(0, 120);
}

function isTraceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function traceRecordField(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const value = source[key];
  return isTraceRecord(value) ? value : undefined;
}

function traceStringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function traceBooleanField(source: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function traceNumberField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? round4(value) : undefined;
}

function traceStringArrayField(source: Record<string, unknown> | undefined, key: string): string[] {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim())
    .slice(0, 12);
}

function traceNestedNumberField(source: Record<string, unknown> | undefined, objectKey: string, key: string): number | undefined {
  return traceNumberField(traceRecordField(source, objectKey), key);
}

function traceNestedBooleanField(source: Record<string, unknown> | undefined, objectKey: string, key: string): boolean | undefined {
  return traceBooleanField(traceRecordField(source, objectKey), key);
}

function traceNestedStringField(source: Record<string, unknown> | undefined, objectKey: string, key: string): string | undefined {
  return traceStringField(traceRecordField(source, objectKey), key);
}

function buildSfxPlannerEvidence(
  sfxSyncPlan: Record<string, unknown> | undefined,
  sfxFamilyPlanner: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!sfxSyncPlan && !sfxFamilyPlanner) return undefined;
  const reasonKeys = Array.from(new Set([
    ...traceStringArrayField(sfxSyncPlan, 'reasonKeys'),
    ...traceStringArrayField(sfxFamilyPlanner, 'reasonKeys'),
  ])).slice(0, 12);
  const crossFamily = traceRecordField(sfxSyncPlan, 'crossFamily')
    ?? traceRecordField(sfxFamilyPlanner, 'crossFamily');

  return {
    version: 'sfx-planner-evidence-v1',
    placementAllowed: traceBooleanField(sfxSyncPlan, 'placementAllowed')
      ?? traceBooleanField(sfxFamilyPlanner, 'placementAllowed'),
    executionLicense: traceStringField(sfxFamilyPlanner, 'executionLicense'),
    reasonKeys,
    syncWindow: {
      anchorFrame: traceNestedNumberField(sfxSyncPlan, 'syncWindow', 'anchorFrame'),
      distanceFrames: traceNestedNumberField(sfxSyncPlan, 'syncWindow', 'distanceFrames'),
      driftRisk: traceNestedNumberField(sfxSyncPlan, 'syncWindow', 'driftRisk'),
      toleranceFrames: traceNestedNumberField(sfxSyncPlan, 'syncWindow', 'toleranceFrames'),
    },
    mixSafety: {
      overmixRisk: traceNestedNumberField(sfxSyncPlan, 'mixSafety', 'overmixRisk'),
      nearestSoundDistanceFrames: traceNestedNumberField(sfxSyncPlan, 'mixSafety', 'nearestSoundDistanceFrames'),
      recentSfxCount: traceNestedNumberField(sfxSyncPlan, 'mixSafety', 'recentSfxCount'),
    },
    providerGate: {
      providerRisk: traceNestedNumberField(sfxSyncPlan, 'providerGate', 'providerRisk'),
      qualityFloor: traceNestedNumberField(sfxSyncPlan, 'providerGate', 'qualityFloor'),
      expectedQueryStrength: traceNestedNumberField(sfxSyncPlan, 'providerGate', 'expectedQueryStrength'),
    },
    crossFamily: {
      transitionAnchored: traceNestedBooleanField(sfxSyncPlan, 'crossFamily', 'transitionAnchored')
        ?? traceNestedBooleanField(sfxFamilyPlanner, 'crossFamily', 'transitionAnchored'),
      mgAnchored: traceNestedBooleanField(sfxSyncPlan, 'crossFamily', 'mgAnchored')
        ?? traceNestedBooleanField(sfxFamilyPlanner, 'crossFamily', 'mgAnchored'),
      zoomAnchored: traceNestedBooleanField(sfxSyncPlan, 'crossFamily', 'zoomAnchored')
        ?? traceNestedBooleanField(sfxFamilyPlanner, 'crossFamily', 'zoomAnchored'),
      captionConflict: traceNestedBooleanField(sfxSyncPlan, 'crossFamily', 'captionConflict')
        ?? traceNestedBooleanField(sfxFamilyPlanner, 'crossFamily', 'captionConflict'),
      syncSource: traceNestedStringField(sfxSyncPlan, 'crossFamily', 'syncSource')
        ?? traceNestedStringField(sfxFamilyPlanner, 'crossFamily', 'syncSource'),
      evidenceKeys: crossFamily ? Object.keys(crossFamily).sort().slice(0, 12) : [],
    },
  };
}

// ─── Executor ────────────────────────────────────────────────────

/**
 * Execute an Edit Decision List on a project.
 *
 * @param edl - The Edit Decision List from the Reactive Edit Engine
 * @param projectId - Project to modify
 * @param userId - Owner
 * @param overlays - Current overlay state (mutated in place)
 * @param canvasDimensions - { width, height } for overlay positioning
 */
export async function executeEDL(
  edl: EditDecisionList,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  canvasDimensions: { width: number; height: number },
  /** Optional 5-Track analyses keyed by assetId — used to validate zoom placement */
  analyses?: Map<string, any>,
  /** Profile's graphic density — drives budget guardrails. */
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal',
  options: ExecuteEDLOptions = {},
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    decisionsExecuted: 0,
    decisionsDeferred: 0,
    decisionsSkipped: 0,
    overlaysCreated: 0,
    overlaysModified: 0,
    errors: [],
    rejectedDecisions: [],
    decisionExecutionTrace: [],
    decisionExecutionTraceTotal: 0,
    decisionExecutionTraceTruncated: false,
    budgetRejectedZoomAssetIds: new Set<string>(),
    zoomedAssetIds: new Set<string>(),
    projectEvidence: {
      schemaVersion: 1,
      mgKineticSfxContexts: [],
      mgDeliveryRecords: [],
    },
  };

  // ─── Budget enforcement (Director Knowledge Base) ──────────────
  // Prevents "amateur AI editing" where the engine goes overboard with
  // zoom-punches, shakes, and graphics on every frame.
  const { DecisionBudget } = await import('./decision-budget');
  const totalDurationMs = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .reduce((max, o) => Math.max(max, (o.from + o.durationInFrames) / DEFAULT_CONFIG.timing.fps * 1000), 0);
  const densityOverrides: Partial<import('./decision-budget').BudgetLimits> | undefined =
    graphicsDensity === 'minimal' ? { KEYWORD_GRAPHIC_PER_30S: 3, KEYWORD_MIN_GAP_FRAMES: 180, GRAPHIC_BREATHING_FRAMES: 90 }
    : graphicsDensity === 'heavy' ? { KEYWORD_GRAPHIC_PER_30S: 9, KEYWORD_MIN_GAP_FRAMES: 60, GRAPHIC_BREATHING_FRAMES: 30 }
    : graphicsDensity === 'moderate' ? { KEYWORD_GRAPHIC_PER_30S: 5, KEYWORD_MIN_GAP_FRAMES: 120 }
    : undefined;
  const budget = new DecisionBudget(totalDurationMs || 30000, 30, densityOverrides);

  // Execute decisions at or above confidence threshold (>=0.5)
  // OLD: strict > 0.5 silently killed ~60% of decisions when flat moment weights = 0.5 exactly.
  // FIX: inclusive >= lets budget system be the gatekeeper (as designed).
  const minConfidence = DEFAULT_CONFIG.analysis.minConfidenceForDecisions;
  const actionable = edl.decisions.filter(d => d.confidence >= minConfidence);

  // ── G-2: resolve the customer's brand ONCE and stamp it onto graphic decisions ──
  // The renderer already reads decision.params.brand (applyGraphic → resolveMotionTokens at the two
  // composition sites), but NOTHING ever populated it → every MG rendered DEFAULT_BRAND gold. Populate
  // it here, the single sink all four director paths reach. Empty/no brand → {} → DEFAULT (unchanged).
  let projectBrand: Partial<BrandInputs> = {};
  let projectBrandMotionOverrides: DeepPartial<MotionTokens> | undefined;
  let projectBrandSignalDefaults: Record<string, number | string> = {};
  let projectSignalContext: EDLSignalContext = {};
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const projectDoc = await (await getDatabase()).collection('projects').findOne({ projectId });
    const kineticPolicyReceipt = recordValue(projectDoc?.intelligence?.kineticSfxPolicy);
    const kineticPolicyVersion = kineticPolicyReceipt ? readString(kineticPolicyReceipt, 'version') : undefined;
    const kineticPolicy = kineticPolicyReceipt ? readString(kineticPolicyReceipt, 'policy') : undefined;
    const kineticProfileId = kineticPolicyReceipt ? readString(kineticPolicyReceipt, 'profileId') : undefined;
    const kineticPolicySource = kineticPolicyReceipt ? readString(kineticPolicyReceipt, 'source') : undefined;
    const vjepaSegs = arrayOrUndefined(projectDoc?.vjepaAnalysis?.segments);
    const wav2vecSegs = arrayOrUndefined(projectDoc?.wav2vecAnalysis?.segments);
    // SIGNAL-driven MG style identity (Phase B): aggregate the video's ENERGY from its per-segment motion +
    // emotion, and read the user's stated INTENT (productionBriefIntake.userIntent). These feed resolveVideoStyle
    // at the codegen seam so the style comes from the video's signals + purpose, not the brand font. (Formality is
    // not aggregated here yet — energy + intent are the primary drivers; styleFromSignals defaults formality to 0.5.)
    const mgMeanOf = (segs: Array<Record<string, unknown>> | undefined, ...keys: string[]): number | undefined => {
      const vals = (segs ?? []).map((s) => readNumber(s, ...keys)).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
    };
    const mgMotion = mgMeanOf(vjepaSegs, 'motionIntensity', 'motion_intensity');
    const mgArousal = mgMeanOf(wav2vecSegs, 'emotionIntensity', 'emotion_intensity');
    const mgEnergy = mgMotion === undefined && mgArousal === undefined
      ? undefined
      : Math.max(0, Math.min(1, 0.5 * (mgMotion ?? mgArousal ?? 0) + 0.5 * (mgArousal ?? mgMotion ?? 0)));
    const mgUserIntent = typeof projectDoc?.productionBriefIntake?.userIntent === 'string' && projectDoc.productionBriefIntake.userIntent.trim()
      ? String(projectDoc.productionBriefIntake.userIntent)
      : undefined;
    // The user's motionGraphics dial (mode/frequency/intensity) — normalized defensively (absent/garbage →
    // undefined = 'auto'). Feeds the density budget + the motion-intensity resolver at the codegen seam.
    const mgPrefs = normalizeEditorialPreferences(projectDoc?.productionBriefIntake?.editorialPreferences ?? projectDoc?.editorialPreferences);
    const mgGraphicsPref = mgPrefs?.families?.motionGraphics;
    projectSignalContext = {
      codegenBrand: undefined,
      hasConfiguredBrand: Boolean(projectDoc?.brandId),
      orgId: typeof projectDoc?.orgId === 'string' ? projectDoc.orgId : undefined,
      vjepaSegments: vjepaSegs,
      wav2vecSegments: wav2vecSegs,
      musicAnalysis: recordValue(projectDoc?.musicAnalysis) ?? recordValue(projectDoc?.essentiaAnalysis) ?? undefined,
      vjepaScreenContextPolicy: projectDoc?.intelligence?.vjepaCoverageAudit
        ? resolveVjepaScreenContextPolicy(projectDoc.intelligence.vjepaCoverageAudit)
        : undefined,
      intent: mgUserIntent,
      videoSignals: mgEnergy !== undefined ? { energy: mgEnergy } : undefined,
      motionGraphicsPref: mgGraphicsPref,
      kineticSfxPolicy:
        kineticPolicyVersion === 'kinetic-sfx-policy-v1'
        && kineticPolicySource === 'director-effective-profile'
        && (kineticPolicy === 'full' || kineticPolicy === 'subtle' || kineticPolicy === 'off')
        && kineticProfileId
          ? { policy: kineticPolicy, profileId: kineticProfileId, source: 'director-effective-profile' }
          : undefined,
    };
    if (projectDoc?.brandId && userId) {
      const { resolveEffectiveBrandWithProfile } = await import('@/lib/shared/brand-effective-resolver');
      const resolution = await resolveEffectiveBrandWithProfile(userId, projectDoc.brandId, {
        service: 'editron',
        orgId: projectDoc.orgId ?? null,
      });
      projectSignalContext.codegenBrand = resolution.brand ?? undefined;
      projectBrand = resolution.acceptedProfile
        ? {
            ...brandInputsFromUnifiedBrandAtomic(resolution.brand),
            ...brandInputsFromBrandSignalProfile(resolution.acceptedProfile, resolution.brand),
          }
        : brandInputsFromUnifiedBrandAtomic(resolution.brand);
      projectBrandMotionOverrides = brandVaultToMotionOverrides(resolution.acceptedProfile);
      if (resolution.acceptedProfile) {
        projectBrandSignalDefaults = normalizePlannerSignals(
          brandSignalProfileToCreativeSignalDefaults(resolution.acceptedProfile).signals,
        );
      }
      if (projectBrand.accentColor) console.log(`[EDL] Brand accent ${projectBrand.accentColor} → MG (brand ${projectDoc.brandId})`);
    }
  } catch (e) {
    console.warn('[EDL] brand resolve failed (non-fatal, using DEFAULT_BRAND):', e instanceof Error ? e.message : e);
  }
  for (const d of actionable) {
    if (d.type === 'graphic' || d.type === 'caption-emphasis') {
      d.params = d.params || {};
      if (d.params.brand == null) d.params.brand = projectBrand;
      if (projectBrandMotionOverrides && d.params.brandMotionOverrides == null) {
        d.params.brandMotionOverrides = projectBrandMotionOverrides;
      }
    }
  }

  // Keep decisions in frame-first order (as produced by signal executor / reactive engine).
  // OLD: sorted by confidence descending — a high-confidence zoom at minute 8 consumed
  // budget before a medium-confidence zoom at minute 1. The viewer watches linearly;
  // budget consumption should be linear. Confidence is for tie-breaking within the
  // same frame window, which the signal executor already handles (deduplicateDecisions).
  actionable.sort((a, b) => a.frame - b.frame || b.confidence - a.confidence);
  for (const decision of actionable) {
    decision.params = normalizeEdlDecisionParams(decision.type, decision.params, {
      canvasWidth: canvasDimensions.width,
      technique: (decision as any).technique,
    });
  }

  console.log(`[EDL-Exec] Executing ${actionable.length}/${edl.totalDecisions} decisions (confidence > ${minConfidence}) with budget enforcement, sorted by frame`);

  // Deterministic epoch for overlay IDs — stable within this Director run, unique across runs.
  // Derived from projectId hash so the same EDL on the same project always produces the same IDs.
  // Stable per-PROJECT epoch so the same project renders identical overlay IDs every run (Lambda
  // caching + A/B comparisons). Was Date.now() — wall-clock changed every render, which is exactly
  // what deterministicOverlayId (line 32) was built to avoid; the old comment claimed projectId-stable
  // but used the clock. FNV-1a of projectId mirrors the helper's fold; empty id → stable constant.
  let idEpoch = 2166136261 >>> 0;
  for (let i = 0; i < projectId.length; i += 1) {
    idEpoch ^= projectId.charCodeAt(i);
    idEpoch = Math.imul(idEpoch, 16777619) >>> 0;
  }

  // Pre-resolve unique atomic SFX queries when enough cue/signal data exists.
  // The apply path re-resolves after enrichment and lazily fetches misses.
  const sfxCache: SfxAssetCache | null = isSFXLibraryAvailable() ? new Map() : null;
  if (sfxCache) {
    // Resolve SFX from both signal executor and creative brief decisions.
    const sfxDecisions = actionable.filter(d => d.type === 'sfx-trigger' || d.type === 'sfx');
    const uniqueForms = new Map<string, AtomicSfxForm>();
    for (const decision of sfxDecisions) {
      const form = resolveDecisionAtomicSfxForm(decision);
      if (form?.shouldPlace && validateDecisionSfxTiming(form, overlays, decision).ok) {
        uniqueForms.set(atomicSfxSearchQuery(form), form);
      }
    }
    for (const [searchQuery, form] of uniqueForms) {
      try {
        // Atomic SFX form converts raw labels/signals into concrete search terms and timing.
        let providerSearchReport: SFXLibrarySearchReport | undefined;
        const result = await searchAndDownloadSFX(
          searchQuery,
          userId,
          form.asset.maxDurationSec,
          form,
          (report) => { providerSearchReport = report; },
        );
        const accepted = acceptedSfxCacheEntry(form, result, providerSearchReport);
        sfxCache.set(searchQuery, accepted);
        const token = form.intent;
        console.log(`[EDL-Exec] SFX pre-resolve: "${token}" → query="${searchQuery}" → ${accepted ? 'accepted' : 'null/rejected'}`);
      } catch (err: unknown) {
        sfxCache.set(searchQuery, null);
        console.warn(`[EDL-Exec] SFX pre-resolve failed for "${searchQuery}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Single-source detection: per-boundary visual similarity check ──
  // OLD: blanket-killed ALL transition/sfx decisions when overlays share one assetId.
  // This was wrong — a vlog with 3 locations IS single-source but SHOULD get
  // transitions at location changes. Blanket approach was tried and reverted
  // in commit a42a358d ("single-source doesn't mean single-scene").
  //
  // NEW: for single-source projects, each transition/sfx decision is checked
  // individually during the execution loop. We compare 5-Track keyframe colors
  // on either side of the boundary. Same colors = same scene = suppress.
  // Different colors = visual change = allow. No data = allow (respect intelligence).
  let utilityScoringRuntime: UtilityScoringRuntime | null = null;
  try {
    const [{ scoreAllOverlays }, { getOverlayDefinitions }] = await Promise.all([
      import('@/lib/editron/engine/utility-scorer'),
      import('@/lib/editron/engine/overlay-definitions-loader'),
    ]);
    utilityScoringRuntime = {
      definitions: getOverlayDefinitions(),
      scoreAllOverlays,
    };
    console.log(`[EDL-Exec] Path E+D merge: loaded ${utilityScoringRuntime.definitions.length} utility curve definitions`);
  } catch (utilityErr) {
    console.warn('[EDL-Exec] Path E+D merge unavailable; continuing without utility scoring:', utilityErr instanceof Error ? utilityErr.message : utilityErr);
  }

  const videoOverlaysForSourceCheck = overlays.filter(o => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
  const uniqueSourceAssets = new Set(
    videoOverlaysForSourceCheck.map(o => (o as any).assetId).filter(Boolean)
  );
  const isSingleSource = uniqueSourceAssets.size === 1 && videoOverlaysForSourceCheck.length > 1;
  const singleSourceAssetId = isSingleSource ? uniqueSourceAssets.values().next().value as string : null;

  let budgetRejected = 0;
  let decisionIndex = 0;
  const deferredGraphicDecisions = new Set<EditDecision>();
  let deferredGraphicFailure: string | undefined;

  if (isLiveMgCodegenEnabled() && options.deferMgDesign) {
    const graphics = actionable.filter((decision) => decision.type === 'graphic');
    if (graphics.length > 0) {
      const graphicEdl: EditDecisionList = {
        ...edl,
        decisions: graphics,
        totalDecisions: graphics.length,
        stats: {
          ...edl.stats,
          transitionCount: 0,
          zoomCount: 0,
          speedChangeCount: 0,
          graphicCount: graphics.length,
          averageConfidence: graphics.reduce((sum, decision) => sum + decision.confidence, 0) / graphics.length,
        },
      };
      try {
        const enqueue = options.enqueueMgDesignJob
          ?? (await import('@/lib/editron/motion-graphics/codegen/mg-design-job-runner')).enqueueDurableMgDesignJob;
        const queued = await enqueue({
          projectId,
          userId,
          edl: graphicEdl,
          canvas: canvasDimensions,
          graphicsDensity,
        });
        graphics.forEach((decision) => deferredGraphicDecisions.add(decision));
        result.mgDesignJob = {
          jobId: queued.jobId,
          status: queued.status,
          decisionCount: graphics.length,
        };
        console.log(`[EDL-MG-Design] deferred ${graphics.length} graphic decisions to durable job ${queued.jobId}`);
      } catch (error) {
        deferredGraphicFailure = error instanceof Error ? error.message : String(error);
        graphics.forEach((decision) => deferredGraphicDecisions.add(decision));
        result.mgDesignJob = {
          status: 'failed',
          decisionCount: graphics.length,
          reason: deferredGraphicFailure,
        };
        result.errors.push(`MG design queue failed: ${deferredGraphicFailure}`);
        console.error(`[EDL-MG-Design] durable queue failed; ${graphics.length} MG decisions fail closed: ${deferredGraphicFailure}`);
      }
    }
  }

  // Author the video's coherent MgVideoDesignPlan once before the loop. Every offered graphic receives an
  // explicit authority disposition; a failed pre-pass cannot silently license free-form codegen.
  if (isLiveMgCodegenEnabled() && !options.deferMgDesign) {
    try {
      projectSignalContext.mgDesignAuthority = await runMgDesignPrepass(
        actionable,
        overlays,
        projectSignalContext,
        graphicsDensity,
        canvasDimensions,
        {
          shadowTarget: { projectId, userId },
          onTasteContractShadow: (shadow) => {
            result.projectEvidence.mgTasteContract = shadow;
          },
        },
      );
      const dispositions = [...projectSignalContext.mgDesignAuthority.dispositions.values()];
      result.mgDesignSummary = {
        attempts: projectSignalContext.mgDesignAuthority.attempts,
        approvedCount: dispositions.filter((entry) => entry.status === 'approved').length,
        declinedCount: dispositions.filter((entry) => entry.status === 'declined').length,
        unavailableCount: dispositions.filter((entry) => entry.status === 'unavailable').length,
        ...(projectSignalContext.mgDesignAuthority.reason ? { reason: projectSignalContext.mgDesignAuthority.reason } : {}),
      };
    } catch (designPrepassErr) {
      const reason = `MG design pre-pass crashed: ${designPrepassErr instanceof Error ? designPrepassErr.message : designPrepassErr}`;
      projectSignalContext.mgDesignAuthority = { dispositions: new Map(), attempts: 0, reason };
      result.mgDesignSummary = {
        attempts: 0,
        approvedCount: 0,
        declinedCount: 0,
        unavailableCount: actionable.filter((decision) => decision.type === 'graphic').length,
        reason,
      };
      console.error(`[EDL-MG-Design] ${reason}; live MGs fail closed`);
    }
  }

  for (const decision of actionable) {
    const currentDecisionIndex = decisionIndex++;

    if (deferredGraphicDecisions.has(decision)) {
      const beforeTraceSnapshot = captureOverlayTraceSnapshot(overlays);
      if (deferredGraphicFailure) {
        const reason = `MG-DESIGN-QUEUE: ${deferredGraphicFailure}`;
        result.decisionsSkipped++;
        result.rejectedDecisions.push({ type: decision.type, frame: decision.frame, reason });
        appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
          decision,
          currentDecisionIndex,
          'error',
          beforeTraceSnapshot,
          overlays,
          { reason },
        ));
      } else {
        result.decisionsDeferred++;
        appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
          decision,
          currentDecisionIndex,
          'deferred',
          beforeTraceSnapshot,
          overlays,
          { reason: `durable-mg-design-job:${result.mgDesignJob?.jobId ?? 'unknown'}` },
        ));
      }
      continue;
    }

    try {
      enrichDecisionSignals(decision, overlays, analyses, projectSignalContext, projectBrandSignalDefaults);
      if (utilityScoringRuntime) {
        enrichDecisionWithUtilityScoring(decision, utilityScoringRuntime);
      }
    } catch (enrichErr) {
      console.warn(`[EDL-Exec] decision enrichment failed for ${decision.type} @${decision.frame} (non-fatal):`, enrichErr instanceof Error ? enrichErr.message : enrichErr);
    }

    const beforeTraceSnapshot = captureOverlayTraceSnapshot(overlays);
    const visualCoverageGate = evaluateVjepaVisualOnlyExecutionGate(decision, projectSignalContext.vjepaScreenContextPolicy);
    if (!visualCoverageGate.allowed) {
      const gateReason = `VJEPA-COVERAGE: ${visualCoverageGate.reason}`;
      result.decisionsSkipped++;
      result.rejectedDecisions.push({
        type: decision.type,
        frame: decision.frame,
        reason: gateReason,
        ruleId: visualCoverageGate.ruleId,
        params: {
          source: decision.source,
          signal: decision.signal,
          visualEvidenceKeys: visualCoverageGate.evidenceKeys.slice(0, 8),
        },
      });
      console.log(`[EDL-Exec] VJEPA COVERAGE REJECTED: ${decision.type} at frame ${decision.frame} - ${visualCoverageGate.reason}`);
      appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
        decision,
        currentDecisionIndex,
        'guard-rejected',
        beforeTraceSnapshot,
        overlays,
        { reason: gateReason, ruleId: visualCoverageGate.ruleId },
      ));
      continue;
    }
    const budgetResult = budget.evaluate(decision as any);
    if (!budgetResult.allowed) {
      result.decisionsSkipped++;
      budgetRejected++;
      result.rejectedDecisions.push({
        type: decision.type,
        frame: decision.frame,
        reason: `BUDGET: ${budgetResult.reason}`,
        ruleId: budgetResult.ruleId,
        params: { graphicType: decision.params?.graphicType, text: (decision.params?.text || '').substring(0, 60) },
      });
      console.log(`[EDL-Exec] BUDGET REJECTED: ${decision.type} at frame ${decision.frame} — ${budgetResult.reason} (${budgetResult.ruleId})`);
      if (decision.type === 'graphic') {
        const gType = decision.params?.graphicType || 'unknown';
        const gText = (decision.params?.text || '').substring(0, 40);
        console.log(`[EDL-Exec] EDITORIAL: ${gType} "${gText}" → REJECTED by budget (density: ${graphicsDensity || 'default'})`);
      }

      // Track budget-rejected zooms so post-processing drift-zoom doesn't re-add them
      if (decision.type === 'zoom') {
        const video = overlays.find(o =>
          o.type === 'video' && o.from <= decision.frame && o.from + o.durationInFrames > decision.frame
        );
        if (video?.assetId) {
          result.budgetRejectedZoomAssetIds.add(video.assetId);
        }
      }

      appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
        decision,
        currentDecisionIndex,
        'budget-rejected',
        beforeTraceSnapshot,
        overlays,
        { reason: `BUDGET: ${budgetResult.reason}`, ruleId: budgetResult.ruleId },
      ));

      // Budget rejected = skip. No substitution.
      // OLD: budget suggested alternatives (e.g., caption-emphasis when zoom was rejected).
      // This broke the signal→mapping→technique chain — the intelligence chose zoom
      // because a specific graph mapping fired on motion intensity. Caption emphasis
      // has nothing to do with motion intensity. Budget should FILTER, not INVENT.
      continue;
    }

    try {
      const applied = await applyDecision(
        decision,
        overlays,
        projectId,
        userId,
        canvasDimensions,
        result.projectEvidence,
        analyses,
        idEpoch,
        currentDecisionIndex,
        sfxCache,
        graphicsDensity,
        projectSignalContext,
      );
      if (applied) {
        appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
          decision,
          currentDecisionIndex,
          'executed',
          beforeTraceSnapshot,
          overlays,
          { reason: 'handler-applied' },
        ));
        budget.commit(decision as any);
        result.decisionsExecuted++;
        if (decision.type === 'graphic') {
          const gType = decision.params?.graphicType || 'unknown';
          const gText = (decision.params?.text || '').substring(0, 40);
          const summary = budget.getSummary();
          console.log(`[EDL-Exec] EDITORIAL: ${gType} "${gText}" → ALLOWED (budget: ${summary.keywordGraphics || 0} used, density: ${graphicsDensity || 'default'})`);
        }
        if (applied.created) result.overlaysCreated += applied.created;
        if (applied.modified) result.overlaysModified += applied.modified;
        // Track zoomed assets so drift-zoom post-processing skips them
        if (decision.type === 'zoom') {
          const video = overlays.find(o =>
            o.type === 'video' && o.from <= decision.frame && o.from + o.durationInFrames > decision.frame
          );
          if (video?.assetId) result.zoomedAssetIds.add(video.assetId);
        }
      } else {
        result.decisionsSkipped++;
        const guardReason = `GUARD: ${decision.reason?.substring(0, 80) || 'handler returned null (dedup/validation)'}`;
        result.rejectedDecisions.push({
          type: decision.type,
          frame: decision.frame,
          reason: guardReason,
          params: { graphicType: decision.params?.graphicType, text: (decision.params?.text || '').substring(0, 60) },
        });
        appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
          decision,
          currentDecisionIndex,
          'guard-rejected',
          beforeTraceSnapshot,
          overlays,
          { reason: guardReason },
        ));
        console.log(`[EDL-Exec] SKIPPED (returned null): ${decision.type} at frame ${decision.frame} — ${decision.reason?.substring(0, 80) || 'no reason'}`);
      }
    } catch (err: any) {
      result.decisionsSkipped++;
      const errorReason = `ERROR: ${err.message}`;
      result.rejectedDecisions.push({
        type: decision.type,
        frame: decision.frame,
        reason: errorReason,
      });
      result.errors.push(`${decision.type} at frame ${decision.frame}: ${err.message}`);
      appendDecisionExecutionTrace(result, buildDecisionExecutionTraceEntry(
        decision,
        currentDecisionIndex,
        'error',
        beforeTraceSnapshot,
        overlays,
        { reason: errorReason },
      ));
      console.error(`[EDL-Exec] ERROR: ${decision.type} at frame ${decision.frame} — ${err.message}`);
    }
  }

  const budgetSummary = budget.getSummary();
  console.log(`[EDL-Exec] Complete: ${result.decisionsExecuted} executed, ${result.decisionsDeferred} deferred, ${result.decisionsSkipped} skipped (${budgetRejected} budget-rejected), ${result.overlaysCreated} created, ${result.overlaysModified} modified`);
  console.log(`[EDL-Exec] Budget: ${JSON.stringify(budgetSummary)}`);

  // Surface rejection reasons grouped by type (A3.5.10 fix — no more silent drops)
  if (result.rejectedDecisions.length > 0) {
    const grouped: Record<string, number> = {};
    for (const r of result.rejectedDecisions) {
      const key = r.reason.split(':')[0] || 'UNKNOWN';
      grouped[key] = (grouped[key] || 0) + 1;
    }
    console.log(`[EDL-Exec] REJECTION SUMMARY: ${result.rejectedDecisions.length} decisions rejected — ${Object.entries(grouped).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }

  const mgCodegenOutcomes = actionable
    .map((decision) => decision.params?.mgCodegenOutcome)
    .filter((outcome): outcome is MgCodegenDecisionOutcome => (
      Boolean(outcome)
      && typeof outcome === 'object'
      && ['queued', 'generated', 'declined', 'fallback'].includes((outcome as MgCodegenDecisionOutcome).status)
    ));
  if (mgCodegenOutcomes.length > 0) {
    const runEvidence: EdlMgCodegenRunEvidenceV1 = {
      version: 'mg-codegen-run-v2',
      queuedCount: mgCodegenOutcomes.filter((outcome) => outcome.status === 'queued').length,
      generatedCount: mgCodegenOutcomes.filter((outcome) => outcome.status === 'generated').length,
      failedCount: mgCodegenOutcomes.filter((outcome) => outcome.status === 'declined' || outcome.status === 'fallback').length,
      outcomes: mgCodegenOutcomes.slice(0, 100),
      truncated: mgCodegenOutcomes.length > 100,
      completedAt: new Date(),
    };
    result.projectEvidence.mgCodegenRun = runEvidence;
    try {
      const { getDatabase } = await import('@/lib/editron/db/mongodb');
      await (await getDatabase()).collection('projects').updateOne(
        { projectId, userId },
        {
          $set: {
            'intelligence.mgCodegenRun.version': runEvidence.version,
            'intelligence.mgCodegenRun.queuedCount': runEvidence.queuedCount,
            'intelligence.mgCodegenRun.generatedCount': runEvidence.generatedCount,
            'intelligence.mgCodegenRun.failedCount': runEvidence.failedCount,
            'intelligence.mgCodegenRun.outcomes': runEvidence.outcomes,
            'intelligence.mgCodegenRun.truncated': runEvidence.truncated,
            'intelligence.mgCodegenRun.completedAt': runEvidence.completedAt,
          },
        },
      );
    } catch (error) {
      console.error('[EDL-MG-Codegen] failed to persist run evidence:', error);
    }
  }
  return result;
}

// ─── Per-Decision Handlers ───────────────────────────────────────

function enrichDecisionSignals(
  decision: EditDecision,
  overlays: Overlay[],
  analyses?: Map<string, any>,
  projectSignalContext: EDLSignalContext = {},
  brandSignalDefaults: Record<string, number | string> = {},
): void {
  decision.params = decision.params || {};
  const existingSignals = normalizePlannerSignals(decision.params.signals);
  const derivedSignals = deriveSignalsAtDecisionFrame(decision.frame, overlays, analyses, projectSignalContext);
  const mergedSignals = normalizePlannerSignals({ ...brandSignalDefaults, ...derivedSignals, ...existingSignals });

  if (Object.keys(mergedSignals).length > 0) {
    decision.params.signals = mergedSignals;
  }
  enrichDecisionMomentBundle(decision, overlays, mergedSignals);
}

function enrichDecisionMomentBundle(
  decision: EditDecision,
  overlays: Overlay[],
  signals: Record<string, number | string>,
): void {
  decision.params = decision.params || {};
  const frameRef = resolveSourceFrame(decision.frame, overlays);
  const fps = DEFAULT_CONFIG.timing.fps;
  const bundle = buildAtomicMomentBundle({
    frame: decision.frame,
    fps,
    snapshot: momentSnapshotFromSignals(signals, frameRef.sourceFrame, fps),
    sourceFrame: frameRef.sourceFrame,
    sourceTimestampMs: (frameRef.sourceFrame / fps) * 1000,
    overlayAtoms: activeOverlayMomentAtomsAt(overlays, decision.frame),
  });
  decision.params.atomicMomentBundle = bundle;
  decision.params.atomicMomentGrammar = resolveMomentBundleGrammar({ bundle });
}

function momentSnapshotFromSignals(
  signals: Record<string, number | string>,
  sourceFrame: number,
  fps: number,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    frame: sourceFrame,
    timestampMs: (sourceFrame / fps) * 1000,
  };
  const signedKeys = new Set(['visual.motion_vector.x', 'visual.motion_vector.y']);

  for (const [key, value] of Object.entries(signals)) {
    if (!key.includes('.')) continue;
    setMomentSnapshotValue(snapshot, key, value, signedKeys.has(key));
  }

  const aliases: Array<[string, string[]]> = [
    ['speech.energy', ['speech_energy']],
    ['speech.emotion_intensity', ['emotion_intensity', 'emotional_arousal']],
    ['speech.emotional_valence', ['emotional_valence']],
    ['audio.music_beat', ['music_beat']],
    ['audio.music_energy', ['music_energy']],
    ['visual.significance', ['visual_significance']],
    ['visual.motion_intensity', ['motion_intensity', 'visual_change_rate']],
    ['visual.motion_vector.x', ['motion_vector_x']],
    ['visual.motion_vector.y', ['motion_vector_y']],
    ['visual.action_type', ['visual_action_type']],
    ['visual.motion_type', ['visual_motion_type']],
    ['visual.face_present', ['face_present']],
    ['visual.face_emotion', ['visual_face_emotion']],
    ['visual.eye_contact', ['visual_eye_contact']],
    ['visual.shot_scale', ['shot_scale']],
    ['visual.main_subject.x', ['main_subject_x']],
    ['visual.main_subject.y', ['main_subject_y']],
    ['visual.main_subject.width', ['main_subject_width']],
    ['visual.main_subject.height', ['main_subject_height']],
    ['visual.text_coverage', ['text_coverage']],
    ['visual.text_box_count', ['text_box_count']],
    ['visual.negative_space.top', ['negative_space_top']],
    ['visual.negative_space.right', ['negative_space_right']],
    ['visual.negative_space.bottom', ['negative_space_bottom']],
    ['visual.negative_space.left', ['negative_space_left']],
    ['visual.text_on_screen', ['text_on_screen']],
    ['visual.complexity', ['visual_complexity']],
    ['composite.cinematic_moment', ['cinematic_moment']],
    ['composite.narrative_pressure', ['narrative_pressure']],
    ['structural.position_in_video', ['position_in_video']],
    ['structural.time_since_last_cut', ['time_since_last_cut']],
  ];

  for (const [target, sourceKeys] of aliases) {
    if (snapshot[target] != null) continue;
    for (const sourceKey of sourceKeys) {
      const value = signals[sourceKey];
      if (value == null) continue;
      setMomentSnapshotValue(snapshot, target, value, signedKeys.has(target));
      break;
    }
  }

  return snapshot;
}

function setMomentSnapshotValue(
  target: Record<string, unknown>,
  key: string,
  value: number | string,
  signedValue = false,
): void {
  if (typeof value === 'number' && isFinite(value)) {
    target[key] = signedValue ? clampSigned(value) : clamp01(value);
  } else if (typeof value === 'string' && value.trim()) {
    target[key] = value;
  }
}

function activeOverlayMomentAtomsAt(overlays: Overlay[], frame: number): MomentAtom[] {
  return overlays
    .filter((overlay) => overlay.type !== 'video' && overlay.type !== 'image')
    .filter((overlay) => frame >= overlay.from && frame < overlay.from + overlay.durationInFrames)
    .map((overlay) => ({
      channel: 'overlay' as const,
      key: `active.${overlay.type}`,
      value: String(overlay.id ?? overlay.type),
      strength: 1,
      source: 'overlay' as const,
      level: 'derived' as const,
    }));
}

function deriveSignalsAtDecisionFrame(
  frame: number,
  overlays: Overlay[],
  analyses?: Map<string, any>,
  projectSignalContext: EDLSignalContext = {},
): Record<string, number | string> {
  const frameRef = resolveSourceFrame(frame, overlays);
  const analysis = analysisForAsset(analyses, frameRef.assetId);
  const sourceFrame = frameRef.sourceFrame;
  const sourceMs = (sourceFrame / DEFAULT_CONFIG.timing.fps) * 1000;
  const signals: Record<string, number | string> = {};

  const vjepaSegments = arrayOrUndefined(analysis?.vjepaAnalysis?.segments)
    ?? arrayOrUndefined(analysis?.vjepa?.segments)
    ?? projectSignalContext.vjepaSegments;
  const vjepa = findTimeSegment(vjepaSegments, sourceMs);
  if (vjepa) {
    setNumericSignal(signals, 'visual_significance', readNumber(vjepa, 'visualSignificance', 'visual_significance'));
    setNumericSignal(signals, 'motion_intensity', readNumber(vjepa, 'motionIntensity', 'motion_intensity'));
    setSignedSignal(signals, 'motion_vector_x', readSignedNumber(vjepa, 'motionVectorX', 'motion_vector_x', 'subjectMotionX', 'subject_motion_x', 'cameraMotionX', 'camera_motion_x'));
    setSignedSignal(signals, 'motion_vector_y', readSignedNumber(vjepa, 'motionVectorY', 'motion_vector_y', 'subjectMotionY', 'subject_motion_y', 'cameraMotionY', 'camera_motion_y'));
    setNumericSignal(signals, 'face_present', vjepa.faceEmotion != null || vjepa.eyeContact != null ? 1 : undefined);
    setStringSignal(signals, 'visual_action_type', readString(vjepa, 'actionType', 'action_type'));
    setStringSignal(signals, 'visual_motion_type', readString(vjepa, 'motionType', 'motion_type'));
    setStringSignal(signals, 'visual_face_emotion', readString(vjepa, 'faceEmotion', 'face_emotion'));
    setNumericSignal(signals, 'visual_eye_contact', readBoolean(vjepa, 'eyeContact', 'eye_contact'));
    setNumericSignal(signals, 'main_subject_x', readNumber(vjepa, 'mainSubjectX', 'main_subject_x', 'subjectX', 'subject_x'));
    setNumericSignal(signals, 'main_subject_y', readNumber(vjepa, 'mainSubjectY', 'main_subject_y', 'subjectY', 'subject_y'));
    setNumericSignal(signals, 'main_subject_width', readNumber(vjepa, 'mainSubjectWidth', 'main_subject_width', 'subjectWidth', 'subject_width'));
    setNumericSignal(signals, 'main_subject_height', readNumber(vjepa, 'mainSubjectHeight', 'main_subject_height', 'subjectHeight', 'subject_height'));
    setNumericSignal(signals, 'text_coverage', readNumber(vjepa, 'textCoverage', 'text_coverage'));
    setUnboundedNumericSignal(signals, 'text_box_count', readNumber(vjepa, 'textBoxCount', 'text_box_count'));
    setUnboundedNumericSignal(signals, 'object_count', readNumber(vjepa, 'objectCount', 'object_count'));
    setUnboundedNumericSignal(signals, 'face_count', readNumber(vjepa, 'faceCount', 'face_count'));
    setNumericSignal(signals, 'negative_space_top', readNumber(vjepa, 'negativeSpaceTop', 'negative_space_top'));
    setNumericSignal(signals, 'negative_space_right', readNumber(vjepa, 'negativeSpaceRight', 'negative_space_right'));
    setNumericSignal(signals, 'negative_space_bottom', readNumber(vjepa, 'negativeSpaceBottom', 'negative_space_bottom'));
    setNumericSignal(signals, 'negative_space_left', readNumber(vjepa, 'negativeSpaceLeft', 'negative_space_left'));
  }

  const wav2vecSegments = arrayOrUndefined(analysis?.wav2vecAnalysis?.segments)
    ?? arrayOrUndefined(analysis?.wav2vec?.segments)
    ?? projectSignalContext.wav2vecSegments;
  const wav2vec = findTimeSegment(wav2vecSegments, sourceMs);
  if (wav2vec) {
    setNumericSignal(signals, 'emotion_intensity', readNumber(wav2vec, 'emotionIntensity', 'emotion_intensity'));
    setNumericSignal(signals, 'emotional_arousal', readNumber(wav2vec, 'emotionIntensity', 'emotion_intensity'));
    setNumericSignal(signals, 'speech_energy', readNumber(wav2vec, 'energy', 'speech_energy'));
  }

  const motion = findFrameSegment(arrayOrUndefined(analysis?.motionSegments), sourceFrame);
  if (motion && signals.motion_intensity == null) {
    setNumericSignal(signals, 'motion_intensity', readNumber(motion, 'motionIntensity', 'motion_intensity'));
  }

  const keyframe = nearestKeyframe(arrayOrUndefined(analysis?.keyframeAnalyses), sourceFrame);
  if (keyframe) {
    setNumericSignal(signals, 'shot_scale', shotScaleSignal(keyframe.shotType));
    setNumericSignal(signals, 'visual_complexity', visualComplexitySignal(keyframe));
    setNumericSignal(signals, 'text_on_screen', keyframeHasText(keyframe) ? 1 : 0);
    const existingFaceSignal = typeof signals.face_present === 'number' ? signals.face_present : undefined;
    setNumericSignal(signals, 'face_present', existingFaceSignal ?? (keyframeHasPerson(keyframe) ? 1 : 0));
  }

  if (signals.motion_intensity != null && signals.visual_change_rate == null) {
    signals.visual_change_rate = signals.motion_intensity;
  }
  appendVjepaScreenContextPolicySignals(signals, projectSignalContext.vjepaScreenContextPolicy);

  return signals;
}

function appendVjepaScreenContextPolicySignals(
  signals: Record<string, number | string>,
  policy?: VjepaScreenContextPolicy,
): void {
  if (!policy) return;
  signals['vjepa.screen_context.mode'] = policy.mode;
  signals['vjepa.screen_context.score'] = policy.score;
  signals['vjepa.allow_subject_avoidance'] = policy.allowSubjectAvoidance ? 1 : 0;
  signals['vjepa.allow_negative_space_placement'] = policy.allowNegativeSpacePlacement ? 1 : 0;
  signals['vjepa.allow_motion_direction'] = policy.allowMotionDirection ? 1 : 0;
  signals['vjepa.allow_text_avoidance'] = policy.allowTextAvoidance ? 1 : 0;
}

function evaluateVjepaVisualOnlyExecutionGate(
  decision: EditDecision,
  policy?: VjepaScreenContextPolicy,
): { allowed: true; evidenceKeys: string[] } | { allowed: false; reason: string; ruleId: string; evidenceKeys: string[] } {
  const evidenceKeys = visualCoverageEvidenceKeys(decision);
  if (evidenceKeys.length === 0 || hasNonVisualExecutionEvidence(decision)) {
    return { allowed: true, evidenceKeys };
  }

  if (!policy || policy.mode === 'trusted') {
    return { allowed: true, evidenceKeys };
  }

  const mode = policy.mode;
  const score = typeof policy?.score === 'number' ? ` score=${round4(policy.score)}` : '';
  const reasons = policy?.reasons?.slice(0, 3).join('|');
  return {
    allowed: false,
    ruleId: 'VJ-001',
    evidenceKeys,
    reason: `V-JEPA ${mode} screen context cannot license visual-only ${decision.type} (${evidenceKeys.slice(0, 6).join(',')})${score}${reasons ? `: ${reasons}` : ''}`,
  };
}

function visualCoverageEvidenceKeys(decision: EditDecision): string[] {
  const keys = new Set<string>();
  const signals = normalizePlannerSignals(decisionSignals(decision));
  const params = decision.params ?? {};
  const joinedContext = [decision.source, decision.signal, params.source, params.technique, params.transitionJob]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (/\b(visual|motion|camera|subject|face|eye|gaze|negative[_ -]?space|composition)\b/.test(joinedContext)) {
    keys.add('visual-context');
  }

  for (const key of Object.keys(signals)) {
    if (isVisualCoverageSignalKey(key)) keys.add(key);
  }

  for (const key of Object.keys(params)) {
    if (isVisualCoverageSignalKey(key)) keys.add(key);
  }

  return [...keys].sort();
}

function isVisualCoverageSignalKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/\./g, '_');
  return normalized === 'visual_context'
    || normalized.includes('visual_significance')
    || normalized.includes('visual_change')
    || normalized.includes('motion_intensity')
    || normalized.includes('motion_vector')
    || normalized.includes('motion_type')
    || normalized.includes('action_type')
    || normalized.includes('face_present')
    || normalized.includes('face_count')
    || normalized.includes('eye_contact')
    || normalized.includes('shot_scale')
    || normalized.includes('main_subject')
    || normalized.includes('text_coverage')
    || normalized.includes('text_box_count')
    || normalized.includes('text_on_screen')
    || normalized.includes('object_count')
    || normalized.includes('negative_space');
}

function hasNonVisualExecutionEvidence(decision: EditDecision): boolean {
  const signals = normalizePlannerSignals(decisionSignals(decision));
  const params = decision.params ?? {};
  const joinedContext = [decision.source, decision.signal, params.source, params.reason, params.sfxType, params.sfxCue]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (/\b(speech|audio|music|beat|keyword|word|phrase|semantic|narrative|topic|claim|quote|caption|sfx)\b/.test(joinedContext)) {
    return true;
  }

  const nonVisualKeys = [
    'speech_energy', 'speech.energy', 'emotion_intensity', 'speech.emotion_intensity', 'emotional_arousal',
    'beat_strength', 'music_beat', 'audio.music_beat', 'music_energy', 'audio.music_energy',
    'word_importance', 'topic_shift', 'claim_strength', 'phrase_impact', 'semanticAtoms',
    'contentAtoms', 'contentStructure', 'momentBundle', 'text', 'value', 'label', 'quote',
    'name', 'sfxType', 'sfxCue', 'beatFrame', 'keywordFrame', 'wordFrame', 'phraseFrame',
  ];

  return nonVisualKeys.some((key) => signals[key] !== undefined || params[key] !== undefined);
}

function resolveSourceFrame(frame: number, overlays: Overlay[]): { sourceFrame: number; assetId?: string } {
  const match = findClipAtFrame(frame, overlays, 20);
  if (!match) return { sourceFrame: frame };

  const clip = match.clip as Overlay & { sourceStartFrame?: number; videoStartTime?: number };
  const sourceStartFrame = typeof clip.sourceStartFrame === 'number'
    ? clip.sourceStartFrame
    : typeof clip.videoStartTime === 'number'
      ? clip.videoStartTime
      : 0;
  const localFrame = Math.max(0, match.snappedFrame - clip.from);
  return { sourceFrame: sourceStartFrame + localFrame, assetId: clip.assetId };
}

function analysisForAsset(analyses: Map<string, any> | undefined, assetId?: string): any | undefined {
  if (!analyses || analyses.size === 0) return undefined;
  if (assetId && analyses.has(assetId)) return analyses.get(assetId);
  if (analyses.size === 1) return Array.from(analyses.values())[0];
  return undefined;
}

function normalizePlannerSignals(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const signals: Record<string, number | string> = {};
  const signedKeys = new Set([
    'formality',
    'content.formality',
    'personality.formality',
    'emotional_valence',
    'speech.emotional_valence',
    'motion_vector_x',
    'motion_vector_y',
    'visual.motion_vector.x',
    'visual.motion_vector.y',
  ]);
  const unboundedNumericKeys = new Set([
    'object_count', 'visual.object_count',
    'face_count', 'visual.face_count',
    'text_box_count', 'visual.text_box_count',
    'active_overlay_count', 'structural.active_overlays_count',
    'speaking_rate_wpm', 'speech.speaking_rate_wpm',
    'silence_duration_ms', 'speech.silence_duration_ms',
    'time_since_last_cut', 'structural.time_since_last_cut',
    'bpm', 'audio.bpm',
  ]);

  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === 'number' && isFinite(raw)) {
      signals[key] = signedKeys.has(key)
        ? clampSigned(raw)
        : unboundedNumericKeys.has(key)
          ? raw
          : clamp01(raw);
    } else if (typeof raw === 'boolean') {
      signals[key] = raw ? 1 : 0;
    } else if (typeof raw === 'string' && raw.trim()) {
      const numeric = Number(raw);
      signals[key] = Number.isFinite(numeric) && raw.trim() !== ''
        ? signedKeys.has(key)
          ? clampSigned(numeric)
          : unboundedNumericKeys.has(key)
            ? numeric
            : clamp01(numeric)
        : raw;
    }
  }

  const aliases: Array<[string, string]> = [
    ['content.formality', 'formality'],
    ['personality.formality', 'formality'],
    ['personality.enthusiasm', 'enthusiasm'],
    ['personality.warmth', 'warmth'],
    ['personality.emotional_arousal', 'emotional_arousal'],
    ['personality.pacing_velocity', 'pacing_velocity'],
    ['personality.humor', 'humor'],
    ['personality.visceral_impact', 'visceral_impact'],
    ['personality.visual_dependency', 'visual_dependency'],
    ['visual.motion_intensity', 'motion_intensity'],
    ['visual.significance', 'visual_significance'],
    ['visual.motion_vector.x', 'motion_vector_x'],
    ['visual.motion_vector.y', 'motion_vector_y'],
    ['visual.action_type', 'visual_action_type'],
    ['visual.motion_type', 'visual_motion_type'],
    ['visual.scene_type', 'scene_type'],
    ['visual.face_emotion', 'visual_face_emotion'],
    ['visual.complexity', 'visual_complexity'],
    ['visual.text_on_screen', 'text_on_screen'],
    ['visual.text_coverage', 'text_coverage'],
    ['visual_text_coverage', 'text_coverage'],
    ['visual.text_box_count', 'text_box_count'],
    ['visual.object_count', 'object_count'],
    ['visual.face_count', 'face_count'],
    ['visual.shot_scale', 'shot_scale'],
    ['visual.face_present', 'face_present'],
    ['visual.eye_contact', 'visual_eye_contact'],
    ['visual.main_subject.x', 'main_subject_x'],
    ['visual.main_subject.y', 'main_subject_y'],
    ['visual.main_subject.width', 'main_subject_width'],
    ['visual.main_subject.height', 'main_subject_height'],
    ['visual.negative_space.top', 'negative_space_top'],
    ['visual.negative_space.right', 'negative_space_right'],
    ['visual.negative_space.bottom', 'negative_space_bottom'],
    ['visual.negative_space.left', 'negative_space_left'],
    ['speech.emotion_intensity', 'emotion_intensity'],
    ['speech.emotional_valence', 'emotional_valence'],
    ['speech.energy', 'speech_energy'],
    ['speech.energy_delta', 'energy_delta'],
    ['speech.energy_ema', 'speech_energy_ema'],
    ['speech.energy_surprise', 'energy_surprise'],
    ['speech.pitch_variability', 'pitch_variability'],
    ['speech.pitch_contour', 'pitch_variability'],
    ['speech.speaking_rate_wpm', 'speaking_rate_wpm'],
    ['speech.silence_duration_ms', 'silence_duration_ms'],
    ['speech.silence_normalized', 'silence_normalized'],
    ['speech.coverage', 'speech_coverage'],
    ['speech.stress_detected', 'stress_detected'],
    ['audio.music_beat', 'music_beat'],
    ['audio.music_energy', 'music_energy'],
    ['audio.music_section', 'music_section'],
    ['audio.music_tatum', 'music_tatum'],
    ['audio.bpm', 'bpm'],
    ['composite.cinematic_moment', 'cinematic_moment'],
    ['composite.narrative_pressure', 'narrative_pressure'],
    ['composite.montage_mode', 'montage_mode'],
    ['composite.emotional_alignment', 'emotional_alignment'],
    ['structural.position_in_video', 'position_in_video'],
    ['structural.time_since_last_cut', 'time_since_last_cut'],
    ['structural.active_overlays_count', 'active_overlay_count'],
  ];
  for (const [from, to] of aliases) {
    if (signals[to] == null && signals[from] != null) signals[to] = signals[from];
    if (signals[from] == null && signals[to] != null) signals[from] = signals[to];
  }
  if (signals.motion_intensity == null && typeof signals.visual_change_rate === 'number') {
    signals.motion_intensity = signals.visual_change_rate;
  }

  return signals;
}

function findTimeSegment(
  segments: Array<Record<string, unknown>> | undefined,
  timestampMs: number,
): Record<string, unknown> | undefined {
  if (!segments?.length) return undefined;
  const exact = segments.find((segment) => {
    const startMs = readNumber(segment, 'startMs', 'start_ms') ?? 0;
    const endMs = readNumber(segment, 'endMs', 'end_ms') ?? startMs;
    return timestampMs >= startMs && timestampMs < endMs;
  });
  if (exact) return exact;

  let best: Record<string, unknown> | undefined;
  let bestDistance = Infinity;
  for (const segment of segments) {
    const startMs = readNumber(segment, 'startMs', 'start_ms') ?? 0;
    const endMs = readNumber(segment, 'endMs', 'end_ms') ?? startMs;
    const distance = timestampMs < startMs ? startMs - timestampMs : timestampMs - endMs;
    if (distance >= 0 && distance < bestDistance) {
      bestDistance = distance;
      best = segment;
    }
  }

  return bestDistance <= 5000 ? best : undefined;
}

function findFrameSegment(
  segments: Array<Record<string, unknown>> | undefined,
  frame: number,
): Record<string, unknown> | undefined {
  if (!segments?.length) return undefined;
  return segments.find((segment) => {
    const startFrame = readNumber(segment, 'startFrame', 'start_frame') ?? 0;
    const endFrame = readNumber(segment, 'endFrame', 'end_frame') ?? startFrame;
    return frame >= startFrame && frame < endFrame;
  });
}

function nearestKeyframe(
  keyframes: Array<Record<string, unknown>> | undefined,
  frame: number,
): Record<string, unknown> | undefined {
  if (!keyframes?.length) return undefined;
  let best = keyframes[0];
  let bestDistance = Infinity;
  for (const keyframe of keyframes) {
    const keyframeFrame = readNumber(keyframe, 'frame') ?? 0;
    const distance = Math.abs(keyframeFrame - frame);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = keyframe;
    }
  }
  return bestDistance <= 150 ? best : undefined;
}

function shotScaleSignal(shotType: unknown): number | undefined {
  if (typeof shotType !== 'string') return undefined;
  if (shotType === 'extreme-close-up') return 1;
  if (shotType === 'close-up') return 0.85;
  if (shotType === 'medium') return 0.55;
  if (shotType === 'wide') return 0.25;
  return undefined;
}

function visualComplexitySignal(keyframe: Record<string, unknown>): number {
  const colors = Array.isArray(keyframe.dominantColors) ? keyframe.dominantColors.length : 0;
  const subjects = Array.isArray(keyframe.subjects) ? keyframe.subjects.length : 0;
  const brightness = readNumber(keyframe, 'brightness') ?? 0.5;
  const energy = readNumber(keyframe, 'energyLevel', 'energy_level') ?? 0.5;
  return clamp01(
    (Math.min(1, colors / 8) * 0.35)
    + (Math.min(1, subjects / 6) * 0.25)
    + (Math.abs(brightness - 0.5) * 2 * 0.2)
    + (energy * 0.2),
  );
}

function keyframeHasText(keyframe: Record<string, unknown>): boolean {
  const subjects = Array.isArray(keyframe.subjects) ? keyframe.subjects : [];
  return subjects.some((subject) => {
    if (!subject || typeof subject !== 'object') return false;
    const label = String((subject as Record<string, unknown>).label ?? '').toLowerCase();
    return label.includes('text') || label.includes('subtitle') || label.includes('caption')
      || label.includes('logo') || label.includes('sign') || label.includes('screen');
  });
}

function keyframeHasPerson(keyframe: Record<string, unknown>): boolean {
  const subjects = Array.isArray(keyframe.subjects) ? keyframe.subjects : [];
  return subjects.some((subject) => {
    if (!subject || typeof subject !== 'object') return false;
    const label = String((subject as Record<string, unknown>).label ?? '').toLowerCase();
    return label.includes('person') || label.includes('face') || label.includes('speaker')
      || label.includes('man') || label.includes('woman');
  });
}

function readNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return undefined;
}

function readSignedNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return Math.max(-1, Math.min(1, value));
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return undefined;
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function readBoolean(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number' && isFinite(value)) return value >= 0.5 ? 1 : 0;
  }
  return undefined;
}

function setNumericSignal(target: Record<string, number | string>, key: string, value: number | undefined): void {
  if (typeof value === 'number' && isFinite(value)) target[key] = clamp01(value);
}

function setUnboundedNumericSignal(target: Record<string, number | string>, key: string, value: number | undefined): void {
  if (typeof value === 'number' && isFinite(value)) target[key] = value;
}

function setSignedSignal(target: Record<string, number | string>, key: string, value: number | undefined): void {
  if (typeof value === 'number' && isFinite(value)) target[key] = clampSigned(value);
}

function setStringSignal(target: Record<string, number | string>, key: string, value: string | undefined): void {
  if (typeof value === 'string' && value.trim()) target[key] = value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function arrayOrUndefined(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : undefined;
}

function appendAtomicOverlayReceipt(overlay: Record<string, any>, receipt: AtomicOverlayReceipt): void {
  overlay.metadata = overlay.metadata || {};
  const receipts = Array.isArray(overlay.metadata.atomicOverlayReceipts)
    ? overlay.metadata.atomicOverlayReceipts
    : [];
  overlay.metadata.atomicOverlayReceipts = [...receipts, receipt];
  overlay.metadata.atomicOverlayReceipt = receipt;
  const forms = Array.isArray(overlay.metadata.atomicOverlayForms)
    ? overlay.metadata.atomicOverlayForms
    : [];
  overlay.metadata.atomicOverlayForms = [...forms, receipt.form];
  overlay.metadata.atomicOverlayForm = receipt.form;
  overlay.metadata.atomicPlanObserveMode = true;
}

function decisionMomentBundle(decision: EditDecision): AtomicMomentBundle | undefined {
  const bundle = decision.params?.atomicMomentBundle;
  if (!bundle || typeof bundle !== 'object') return undefined;
  return (bundle as AtomicMomentBundle).version === 'moment-bundle-v1'
    ? bundle as AtomicMomentBundle
    : undefined;
}

function decisionMomentGrammar(decision: EditDecision): AtomicMomentGrammar | undefined {
  const grammar = decision.params?.atomicMomentGrammar;
  if (!grammar || typeof grammar !== 'object') return undefined;
  return (grammar as AtomicMomentGrammar).version === 'moment-bundle-grammar-v1'
    ? grammar as AtomicMomentGrammar
    : undefined;
}

function atomicMomentBundleMetadata(
  decision: EditDecision,
): { atomicMomentBundle?: AtomicMomentBundle; atomicMomentGrammar?: AtomicMomentGrammar } {
  const bundle = decisionMomentBundle(decision);
  const grammar = decisionMomentGrammar(decision);
  return {
    ...(bundle ? { atomicMomentBundle: bundle } : {}),
    ...(grammar ? { atomicMomentGrammar: grammar } : {}),
  };
}

function attachAtomicMomentBundleMetadata(overlay: Record<string, any>, decision: EditDecision): void {
  const bundle = decisionMomentBundle(decision);
  const grammar = decisionMomentGrammar(decision);
  if (!bundle && !grammar) return;
  overlay.metadata = overlay.metadata || {};
  if (bundle) overlay.metadata.atomicMomentBundle = bundle;
  if (grammar) overlay.metadata.atomicMomentGrammar = grammar;
}

function decisionSignals(decision: EditDecision): Record<string, unknown> {
  return decision.params?.signals && typeof decision.params.signals === 'object'
    ? decision.params.signals as Record<string, unknown>
    : {};
}

const VISIBLE_SPECIAL_TRANSITIONS = new Set<string>([
  'blur-transition',
  'dip-to-black',
  'dip-to-white',
  'dissolve',
  'film-burn',
  'flash',
  'glitch',
  'iris-wipe',
  'slide-down',
  'slide-up',
  'whip-pan',
  'wipe-down',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'zoom-punch',
]);

const TRANSITION_REPETITION_LIMIT = 3;

function transitionStyleFromOverlay(overlay: Overlay): string | undefined {
  const metadata = (overlay as any).metadata ?? {};
  const atomicForm = metadata.atomicTransitionForm ?? {};
  const style = atomicForm.compatibilityType
    ?? atomicForm.style
    ?? metadata.transitionType
    ?? (overlay as any).transitionStyle
    ?? (overlay as any).content;
  return typeof style === 'string' && style.trim() ? style : undefined;
}

function recentTransitionRunLength(overlays: Overlay[], style: string): number {
  const transitions = overlays
    .filter((overlay) => overlay.type === 'transition' || Boolean((overlay as any).metadata?.isTransition))
    .sort((a, b) => a.from - b.from);

  let runLength = 0;
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    if (transitionStyleFromOverlay(transitions[index]) !== style) break;
    runLength += 1;
  }
  return runLength;
}

function transitionSignalEnabled(source: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    if (typeof value === 'string' && value.trim()) {
      if (value === 'true') return true;
      if (value === 'false') return false;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric >= 0.5;
    }
  }
  return false;
}

function transitionAllowsUniformRun(decision: EditDecision): boolean {
  return transitionSignalEnabled(decisionSignals(decision), 'montage_mode', 'composite.montage_mode')
    || transitionSignalEnabled(decision.params ?? {}, 'montage_mode', 'montageMode', 'composite.montage_mode');
}

function resolveTransitionRepetitionPolicy(
  transType: string,
  overlays: Overlay[],
  decision: EditDecision,
): { allowed: true; runLength: number } | { allowed: false; runLength: number; reason: string } {
  if (!VISIBLE_SPECIAL_TRANSITIONS.has(transType) || transitionAllowsUniformRun(decision)) {
    return { allowed: true, runLength: 1 + recentTransitionRunLength(overlays, transType) };
  }

  const runLength = 1 + recentTransitionRunLength(overlays, transType);
  if (runLength >= TRANSITION_REPETITION_LIMIT) {
    return {
      allowed: false,
      runLength,
      reason: `would create ${runLength} consecutive "${transType}" transitions`,
    };
  }

  return { allowed: true, runLength };
}

function resolveDecisionAtomicSfxForm(decision: EditDecision): AtomicSfxForm | null {
  const cue = decisionSfxCue(decision);
  const params: Record<string, unknown> = {
    ...(decision.params ?? {}),
    frame: decision.frame,
    ...(cue ? { sfxCue: cue } : {}),
  };
  if (typeof decision.durationFrames === 'number') params.durationFrames = decision.durationFrames;

  const form = resolveAtomicSfxForm({
    signals: decisionSignals(decision),
    params,
    momentBundle: decisionMomentBundle(decision),
    frame: decision.frame,
    durationFrames: decision.durationFrames,
    sceneRemainingFrames: decision.durationFrames ?? 90,
  });

  return form.shouldPlace ? form : null;
}

function decisionSfxCue(decision: EditDecision): string | undefined {
  const params = decision.params ?? {};
  const technique = typeof (decision as any).technique === 'string'
    ? (decision as any).technique.replace(/^sfx_/, '')
    : undefined;
  const cueParts = [
    params.sfxCue,
    params.sfxType,
    params.audioDescription,
    params.soundDescription,
    params.intent,
    technique,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return cueParts.length > 0 ? cueParts.join(' ') : undefined;
}

function atomicSfxSearchQuery(form: AtomicSfxForm): string {
  return form.asset.queryTerms.length > 0
    ? form.asset.queryTerms.join(' ')
    : form.compatibilityToken;
}

function validateDecisionSfxTiming(
  form: AtomicSfxForm,
  overlays: Overlay[],
  decision?: EditDecision,
): { ok: true } | { ok: false; reason: string } {
  if (form.timing.anchor !== 'transition') return { ok: true };
  if (decision && !hasExplicitTransitionSfxRelation(decision)) {
    return {
      ok: false,
      reason: 'transition-anchored SFX requires explicit transition anchor or boundary frame',
    };
  }

  const syncFrame = form.timing.syncFrame;
  const anchors = transitionSfxSyncAnchors(overlays);
  const nearest = nearestFrameDistance(syncFrame, anchors);
  if (nearest != null && nearest <= 3) return { ok: true };

  return {
    ok: false,
    reason: nearest == null
      ? `transition-anchored SFX has no transition/cut anchor near sync frame ${syncFrame}`
      : `transition-anchored SFX sync frame ${syncFrame} is ${nearest} frames from nearest transition/cut anchor`,
  };
}

function hasExplicitTransitionSfxRelation(decision: EditDecision): boolean {
  const params = decision.params ?? {};
  const anchor = stringParam(params, 'sfxAnchor')
    ?? stringParam(params, 'syncAnchor')
    ?? stringParam(params, 'anchor');
  if (anchor === 'transition') return true;
  return numberParam(params, 'transitionFrame') != null
    || numberParam(params, 'boundaryFrame') != null
    || numberParam(params, 'cutFrame') != null;
}

function stringParam(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberParam(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function transitionSfxSyncAnchors(overlays: Overlay[]): number[] {
  const anchors: number[] = [];
  const visualOverlays = overlays
    .filter((overlay) => overlay.type === 'video' || overlay.type === 'image')
    .sort((a, b) => a.from - b.from);

  for (let index = 1; index < visualOverlays.length; index += 1) {
    const previous = visualOverlays[index - 1];
    const current = visualOverlays[index];
    anchors.push(previous.from + previous.durationInFrames, current.from);
  }

  for (const overlay of overlays) {
    if (overlay.type === 'transition') anchors.push(overlay.from);
  }

  return anchors.filter((frame) => Number.isFinite(frame));
}

function nearestFrameDistance(frame: number, anchors: number[]): number | null {
  let best: number | null = null;
  for (const anchor of anchors) {
    const distance = Math.abs(anchor - frame);
    if (best == null || distance < best) best = distance;
  }
  return best;
}

function acceptedSfxCacheEntry(
  form: AtomicSfxForm,
  result: SFXLibraryResult | null,
  providerSearchReport?: SFXLibrarySearchReport,
): SfxCacheEntry | null {
  const assetQuality = evaluateAtomicSfxAssetCandidate(form, result);
  if (!result || !assetQuality.accepted) return null;
  return {
    audioUrl: result.audioUrl,
    audioAssetId: result.audioAssetId,
    durationMs: result.durationMs,
    audioRights: result.audioRights,
    source: result.source,
    originalTitle: result.originalTitle,
    assetQuality,
    providerSearchReport,
  };
}

function enrichDecisionWithUtilityScoring(
  decision: EditDecision,
  runtime: UtilityScoringRuntime,
): void {
  const category = utilityCategoryForDecision(decision);
  if (!category) return;

  const signalSnapshot = buildUtilitySignalSnapshot(decisionSignals(decision));
  if (Object.keys(signalSnapshot).length === 0) return;

  const definitions = runtime.definitions.filter((definition) => definition.category === category);
  if (definitions.length === 0) return;

  const results = runtime.scoreAllOverlays(definitions, signalSnapshot);
  if (results.length === 0) return;

  const winner = selectUtilityWinnerForDecision(category, results, runtime);
  decision.params = decision.params || {};
  decision.params.atomicUtilityScoring = {
    version: 'path-e-d-utility-merge-v1',
    source: 'edl-shared-executor',
    category,
    selection: {
      method: 'support-aware-curve-fit',
      coverage: round4(utilitySignalCoverage(winner, runtime)),
      rawTopOverlayId: results[0]?.overlayId,
    },
    winner: summarizeUtilityResult(winner),
    alternatives: results.slice(1, 4).map(summarizeUtilityResult),
  };
  mergeUtilityOutputValues(decision, category, winner.outputValues);
}

function selectUtilityWinnerForDecision(
  category: OverlayCategory,
  results: ScoringResult[],
  runtime: UtilityScoringRuntime,
): ScoringResult {
  if (results.length <= 1) return results[0];

  const definitionsById = new Map(runtime.definitions.map((definition) => [definition.id, definition]));
  const ranked = results.map((result) => {
    const coverage = utilitySignalCoverage(result, runtime, definitionsById);
    const outputFit = utilityOutputFit(category, result.outputValues);
    return {
      result,
      coverage,
      outputFit,
      supportAwareScore: result.totalScore * coverage,
    };
  });

  ranked.sort((a, b) => {
    if (b.supportAwareScore !== a.supportAwareScore) return b.supportAwareScore - a.supportAwareScore;
    if (b.outputFit !== a.outputFit) return b.outputFit - a.outputFit;
    if (b.result.rank !== a.result.rank) return b.result.rank - a.result.rank;
    return b.result.totalScore - a.result.totalScore;
  });

  return ranked[0].result;
}

function utilitySignalCoverage(
  result: ScoringResult,
  runtime: UtilityScoringRuntime,
  definitionsById = new Map(runtime.definitions.map((definition) => [definition.id, definition])),
): number {
  const definition = definitionsById.get(result.overlayId);
  const required = definition?.considerations.length ?? result.considerationScores.length;
  if (required <= 0) return 1;
  return Math.max(0, Math.min(1, result.considerationScores.length / required));
}

function utilityOutputFit(
  category: OverlayCategory,
  outputValues: Record<string, number | string | boolean>,
): number {
  if (category === 'zoom') {
    const scaleTo = typeof outputValues.scaleTo === 'number' ? outputValues.scaleTo : 1;
    return Math.abs(scaleTo - 1);
  }

  const duration = outputValues.durationFrames;
  if ((category === 'transition' || category === 'sfx' || category === 'camera') && typeof duration === 'number') {
    return Math.max(0, Math.min(1, duration / 60)) * 0.01;
  }

  return 0;
}

function utilityCategoryForDecision(decision: EditDecision): OverlayCategory | undefined {
  switch (decision.type) {
    case 'zoom':
      return 'zoom';
    case 'transition':
      return 'transition';
    case 'graphic':
    case 'caption-emphasis':
      return decision.type === 'graphic' ? 'graphic' : 'caption';
    case 'sfx':
    case 'sfx-trigger':
      return 'sfx';
    case 'camera-shake':
    case 'speed-change':
      return 'camera';
    case 'cut':
      return 'cut';
    default:
      return undefined;
  }
}

function summarizeUtilityResult(result: ScoringResult): Record<string, unknown> {
  return {
    overlayId: result.overlayId,
    score: round4(result.totalScore),
    rank: result.rank,
    outputValues: result.outputValues,
    placementAdjustment: result.placementAdjustment,
    considerations: result.considerationScores.map((score) => ({
      signalId: score.signalId,
      rawInput: round4(score.rawInput),
      curveOutput: round4(score.curveOutput),
      compensated: round4(score.compensated),
    })),
  };
}

function mergeUtilityOutputValues(
  decision: EditDecision,
  category: OverlayCategory,
  outputValues: Record<string, number | string | boolean>,
): void {
  const params = decision.params as Record<string, unknown>;
  const copy = (key: string, mode: 'override' | 'fill' = 'override') => {
    const value = outputValues[key];
    if (value === undefined || value === null) return;
    if (mode === 'fill' && params[key] !== undefined && params[key] !== null) return;
    params[key] = value;
  };

  if (category === 'graphic') {
    // Do not let the old utility graphicType menu become the new source of truth.
    // MG form should emerge from content atoms + signals + brand. We keep the score
    // evidence above for calibration and future no-preset resolving.
    return;
  }

  if (category === 'zoom') {
    // Zoom form is owned by resolveAtomicZoomForm(content signals + moment atoms).
    // Utility outputs stay in atomicUtilityScoring as evidence; copying scaleTo
    // here made upload-to-edit collapse into the same harsh legacy punch.
    copy('durationFrames', 'fill');
    return;
  }

  if (category === 'transition') {
    // Utility transition scoring is evidence, not the source of form truth.
    // The atomic resolver reads semantic transition atoms + moment signals.
    if (outputValues.transitionType != null && params.utilityTransitionCompatibilityHint == null) {
      params.utilityTransitionCompatibilityHint = outputValues.transitionType;
    }
    copy('durationFrames');
    return;
  }

  if (category === 'sfx') {
    copy('sfxType');
    copy('volume');
    copy('durationFrames');
    return;
  }

  if (category === 'camera') {
    copy('speedMult');
    copy('intensity');
    copy('durationFrames');
    return;
  }

  if (category === 'caption') {
    for (const key of Object.keys(outputValues)) copy(key, 'fill');
  }
}

function buildUtilitySignalSnapshot(source: Record<string, unknown>): Record<string, number> {
  const signals: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && isFinite(value)) {
      signals[key] = value;
    } else if (typeof value === 'boolean') {
      signals[key] = value ? 1 : 0;
    }
  }

  const aliases: Array<[string, string]> = [
    ['speech_energy', 'speech.energy'],
    ['energy_delta', 'speech.energy_delta'],
    ['speech_energy_ema', 'speech.energy_ema'],
    ['energy_surprise', 'speech.energy_surprise'],
    ['emotion_intensity', 'speech.emotion_intensity'],
    ['emotional_arousal', 'speech.emotion_intensity'],
    ['speaking_rate_wpm', 'speech.speaking_rate_wpm'],
    ['silence_normalized', 'speech.silence_normalized'],
    ['silence_duration_ms', 'speech.silence_duration_ms'],
    ['speech_coverage', 'speech.coverage'],
    ['visual_change_rate', 'visual.motion_intensity'],
    ['motion_intensity', 'visual.motion_intensity'],
    ['visual_significance', 'visual.significance'],
    ['face_present', 'visual.face_present'],
    ['shot_scale', 'visual.shot_scale'],
    ['visual_complexity', 'visual.complexity'],
    ['text_on_screen', 'visual.text_on_screen'],
    ['text_coverage', 'visual.text_coverage'],
    ['text_box_count', 'visual.text_box_count'],
    ['object_count', 'visual.object_count'],
    ['face_count', 'visual.face_count'],
    ['motion_vector_x', 'visual.motion_vector.x'],
    ['motion_vector_y', 'visual.motion_vector.y'],
    ['main_subject_x', 'visual.main_subject.x'],
    ['main_subject_y', 'visual.main_subject.y'],
    ['main_subject_width', 'visual.main_subject.width'],
    ['main_subject_height', 'visual.main_subject.height'],
    ['negative_space_top', 'visual.negative_space.top'],
    ['negative_space_right', 'visual.negative_space.right'],
    ['negative_space_bottom', 'visual.negative_space.bottom'],
    ['negative_space_left', 'visual.negative_space.left'],
    ['cinematic_moment', 'composite.cinematic_moment'],
    ['montage_mode', 'composite.montage_mode'],
    ['narrative_pressure', 'composite.narrative_pressure'],
    ['position_in_video', 'structural.position_in_video'],
    ['time_since_last_cut', 'structural.time_since_last_cut'],
    ['music_energy', 'audio.music_energy'],
    ['music_beat', 'audio.music_beat'],
    ['music_tatum', 'audio.music_tatum'],
    ['bpm', 'audio.bpm'],
    ['formality', 'content.formality'],
    ['enthusiasm', 'personality.enthusiasm'],
    ['warmth', 'personality.warmth'],
    ['emotional_arousal', 'personality.emotional_arousal'],
    ['pacing_velocity', 'personality.pacing_velocity'],
    ['humor', 'personality.humor'],
    ['visceral_impact', 'personality.visceral_impact'],
    ['visual_dependency', 'personality.visual_dependency'],
  ];

  for (const [from, to] of aliases) {
    if (signals[to] == null && typeof signals[from] === 'number') {
      signals[to] = signals[from];
    }
    if (signals[from] == null && typeof signals[to] === 'number') {
      signals[from] = signals[to];
    }
  }

  return signals;
}

function buildMotionGraphicSignalSnapshot(decision: EditDecision): Record<string, number | string> {
  return normalizePlannerSignals(decisionSignals(decision));
}

function buildMotionGraphicSignalCurves(
  decision: EditDecision,
  overlays: Overlay[],
  overlayFrom: number,
  durationInFrames: number,
  signals: Record<string, number | string>,
  analyses?: Map<string, any>,
  projectSignalContext: EDLSignalContext = {},
): { curves: SignalCurves; summary: Record<string, unknown> } | undefined {
  if (durationInFrames <= 0) return undefined;
  const curves: SignalCurves = {};
  const ensureCurve = (key: string): number[] => {
    if (!curves[key]) curves[key] = new Array(durationInFrames).fill(0);
    return curves[key];
  };

  for (const [key, value] of Object.entries(signals)) {
    if (typeof value === 'number' && isFinite(value)) {
      curves[key] = new Array(durationInFrames).fill(value);
    }
  }

  let beatSamples = 0;
  let onsetSamples = 0;
  let musicEnergySamples = 0;
  let wav2vecSamples = 0;
  let vjepaSamples = 0;

  for (let localFrame = 0; localFrame < durationInFrames; localFrame++) {
    const timelineFrame = overlayFrom + localFrame;
    const frameRef = resolveSourceFrame(timelineFrame, overlays);
    const sourceMs = (frameRef.sourceFrame / DEFAULT_CONFIG.timing.fps) * 1000;
    const analysis = analysisForAsset(analyses, frameRef.assetId);

    const wav2vecSegments = arrayOrUndefined(analysis?.wav2vecAnalysis?.segments)
      ?? arrayOrUndefined(analysis?.wav2vec?.segments)
      ?? projectSignalContext.wav2vecSegments;
    const wav2vec = findTimeSegment(wav2vecSegments, sourceMs);
    if (wav2vec) {
      const energy = readNumber(wav2vec, 'energy', 'speech_energy');
      const emotion = readNumber(wav2vec, 'emotionIntensity', 'emotion_intensity');
      if (energy != null) {
        ensureCurve('energy')[localFrame] = clamp01(energy);
        ensureCurve('speech_energy')[localFrame] = clamp01(energy);
      }
      if (emotion != null) ensureCurve('emotion_intensity')[localFrame] = clamp01(emotion);
      wav2vecSamples++;
    }

    const vjepaSegments = arrayOrUndefined(analysis?.vjepaAnalysis?.segments)
      ?? arrayOrUndefined(analysis?.vjepa?.segments)
      ?? projectSignalContext.vjepaSegments;
    const vjepa = findTimeSegment(vjepaSegments, sourceMs);
    if (vjepa) {
      const motion = readNumber(vjepa, 'motionIntensity', 'motion_intensity');
      const significance = readNumber(vjepa, 'visualSignificance', 'visual_significance');
      if (motion != null) ensureCurve('motion_intensity')[localFrame] = clamp01(motion);
      if (significance != null) ensureCurve('visual_significance')[localFrame] = clamp01(significance);
      vjepaSamples++;
    }

    const music = resolveMotionGraphicMusicAnalysis(analysis, projectSignalContext);
    if (music) {
      const energy = sampleMotionGraphicEnergyCurve(music['energyCurve'], sourceMs, readNumber(music, 'durationMs', 'duration_ms'));
      if (energy != null) {
        ensureCurve('music_energy')[localFrame] = clamp01(energy);
        musicEnergySamples++;
      }

      const beat = nearestMotionGraphicBeat(music['beats'], sourceMs);
      if (beat) {
        ensureCurve('beat_level')[localFrame] = beat.level;
        ensureCurve('music_beat')[localFrame] = beat.level >= 0.25 ? 1 : 0;
        ensureCurve('onset')[localFrame] = beat.strength;
        beatSamples++;
        if (beat.strength > 0.5) onsetSamples++;
      }
    }
  }

  const curveKeys = Object.keys(curves).sort();
  if (curveKeys.length === 0) return undefined;
  return {
    curves,
    summary: {
      version: 'mg-signal-curves-v1',
      source: beatSamples || musicEnergySamples || wav2vecSamples || vjepaSamples
        ? 'edl-timeline-analysis'
        : 'edl-signal-snapshot',
      durationInFrames,
      curveKeys,
      beatSamples,
      onsetSamples,
      musicEnergySamples,
      wav2vecSamples,
      vjepaSamples,
      varyingCurves: curveKeys.filter((key) => curveHasVariation(curves[key])).slice(0, 20),
      decisionFrame: decision.frame,
      overlayFrom,
    },
  };
}

function resolveMotionGraphicMusicAnalysis(
  analysis: any,
  projectSignalContext: EDLSignalContext,
): Record<string, unknown> | undefined {
  return recordValue(analysis?.musicAnalysis)
    ?? recordValue(analysis?.essentiaAnalysis)
    ?? recordValue(analysis?.beatAnalysis)
    ?? projectSignalContext.musicAnalysis;
}

function nearestMotionGraphicBeat(
  beats: unknown,
  sourceMs: number,
): { level: number; strength: number } | undefined {
  if (!Array.isArray(beats) || beats.length === 0) return undefined;
  let best: { index: number; beat: Record<string, unknown>; distance: number } | undefined;
  beats.forEach((entry, index) => {
    const beat = recordValue(entry);
    if (!beat) return;
    const timestampMs = readNumber(beat, 'timestampMs', 'timeMs', 'timestamp_ms', 'time_ms');
    if (timestampMs == null) return;
    const distance = Math.abs(timestampMs - sourceMs);
    if (!best || distance < best.distance) best = { index, beat, distance };
  });
  if (!best || best.distance > 50) return undefined;
  const strength = clamp01(readNumber(best.beat, 'strength', 'magnitude') ?? 0.5);
  const metricLevel = best.index % 4 === 0 ? 0.6 : 0.25;
  return { level: clamp01(metricLevel * Math.max(0.35, strength)), strength };
}

function sampleMotionGraphicEnergyCurve(
  energyCurve: unknown,
  sourceMs: number,
  durationMs: number | undefined,
): number | undefined {
  if (!Array.isArray(energyCurve) || energyCurve.length === 0) return undefined;
  if (typeof energyCurve[0] === 'number') {
    if (!durationMs || durationMs <= 0) return undefined;
    const index = Math.max(0, Math.min(energyCurve.length - 1, Math.round((sourceMs / durationMs) * (energyCurve.length - 1))));
    const value = energyCurve[index];
    return typeof value === 'number' && isFinite(value) ? value : undefined;
  }

  let best: { value: number; distance: number } | undefined;
  for (const entry of energyCurve) {
    const point = recordValue(entry);
    if (!point) continue;
    const timestampMs = readNumber(point, 'timestampMs', 'timeMs', 'timestamp_ms', 'time_ms');
    const energy = readNumber(point, 'energy', 'value');
    if (timestampMs == null || energy == null) continue;
    const distance = Math.abs(timestampMs - sourceMs);
    if (!best || distance < best.distance) best = { value: energy, distance };
  }
  return best && best.distance <= 500 ? best.value : undefined;
}

function curveHasVariation(values: number[] | undefined): boolean {
  if (!values || values.length < 2) return false;
  const first = values[0];
  return values.some((value) => Math.abs(value - first) > 0.0001);
}

function contentSalienceFromDecisionSignals(decision: EditDecision): number | undefined {
  const signals = buildMotionGraphicSignalSnapshot(decision);
  const candidates = [
    readNumber(signals, 'visceral_impact'),
    readNumber(signals, 'cinematic_moment'),
    readNumber(signals, 'emotional_arousal', 'emotion_intensity'),
  ].filter((value): value is number => typeof value === 'number' && isFinite(value));
  if (candidates.length === 0) return undefined;
  const salience = Math.max(...candidates);
  return salience >= 0.66 ? round4(clamp01(salience)) : undefined;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

async function applyDecision(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  projectEvidence: EdlProjectEvidenceV1,
  analyses?: Map<string, any>,
  idEpoch: number = 0,
  decisionIndex: number = 0,
  sfxCache?: SfxAssetCache | null,
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal',
  projectSignalContext: EDLSignalContext = {},
): Promise<{ created: number; modified: number } | null> {

  switch (decision.type) {
    case 'transition':
      return applyTransition(decision, overlays, projectId, userId, canvas, idEpoch, decisionIndex);

    case 'zoom':
      return applyZoom(decision, overlays, canvas, analyses);

    case 'speed-change':
      return applySpeedChange(decision, overlays);

    case 'fade':
      return applyFade(decision, overlays);

    case 'graphic':
      return await applyGraphic(
        decision,
        overlays,
        projectId,
        userId,
        canvas,
        projectEvidence,
        idEpoch,
        decisionIndex,
        graphicsDensity,
        analyses,
        projectSignalContext,
      );

    case 'audio-duck':
      return applyAudioDuck(decision, overlays);

    case 'pacing':
      return applyPacingNoop(decision);

    case 'cut':
      // Cuts are informational — they indicate where scene boundaries SHOULD be
      // but don't create new overlays (the scenes already exist from ThinkForge)
      return null;

    case 'caption-emphasis': {
      // Caption emphasis belongs in the caption layer. Only fall back to MG if
      // there is no caption word to mark and the decision carries real standalone structure.
      const emphasisWord = (decision as any).params?.emphasisWord;
      if (!emphasisWord) return null;
      const captionApplied = applyCaptionLayerEmphasis(decision, overlays);
      if (captionApplied) return captionApplied;
      if (!hasStandaloneGraphicStructure((decision as any).params ?? {})) {
        console.log(`[EDL-Exec] Caption emphasis at frame ${decision.frame}: no matching caption word; not promoted to standalone MG`);
        return null;
      }
      if (isLiveMgCodegenEnabled()) {
        const reason = 'caption-emphasis cannot become an MG after the video-level designer has run; emit an explicit graphic opportunity upstream';
        decision.params.mgCodegenOutcome = {
          status: 'declined',
          frame: decision.frame,
          candidateId: `caption-emphasis:${decision.frame}`,
          factKind: 'caption-emphasis',
          reason,
        } satisfies MgCodegenDecisionOutcome;
        console.log(`[EDL-MG-Codegen] Caption emphasis at frame ${decision.frame}: ${reason}`);
        return null;
      }
      const emphasisDecision = {
        ...decision,
        params: { ...decision.params, text: emphasisWord, graphicType: 'atomic-graphic' },
        durationFrames: 60, // 2s pop
      };
      return await applyGraphic(
        emphasisDecision as any,
        overlays,
        projectId,
        userId,
        canvas,
        projectEvidence,
        idEpoch,
        decisionIndex,
        graphicsDensity,
        analyses,
        projectSignalContext,
      );
    }
    case 'sfx':
    case 'sfx-trigger': {
      // 'sfx-trigger' from signal executor (Path D) has params.sfxType
      // 'sfx' from creative brief (Path E) has technique name like 'sfx_whoosh'
      const atomicSfxForm = resolveDecisionAtomicSfxForm(decision);
      const sfxType = atomicSfxForm?.shouldPlace ? atomicSfxForm.compatibilityToken : undefined;
      if (!atomicSfxForm || !sfxType || sfxType === 'none') {
        console.warn(`[EDL-Exec] SFX at frame ${decision.frame}: no sfxType or technique — SKIPPED (not guessing)`);
        return null;
      }
      const timingValidation = validateDecisionSfxTiming(atomicSfxForm, overlays, decision);
      if (!timingValidation.ok) {
        console.warn(`[EDL-Exec] SFX at frame ${decision.frame}: ${timingValidation.reason} - SKIPPED`);
        return null;
      }
      if (!sfxCache) return null;
      const searchQuery = atomicSfxSearchQuery(atomicSfxForm);
      let cached = sfxCache.get(searchQuery);
      if (cached === undefined) {
        let providerSearchReport: SFXLibrarySearchReport | undefined;
        const fetched = await searchAndDownloadSFX(
          searchQuery,
          userId,
          atomicSfxForm.asset.maxDurationSec,
          atomicSfxForm,
          (report) => { providerSearchReport = report; },
        );
        cached = acceptedSfxCacheEntry(atomicSfxForm, fetched, providerSearchReport);
        sfxCache.set(searchQuery, cached);
      }
      if (!cached) return null;

      const sfxStartFrame = atomicSfxForm.timing.startFrame;
      const sfxDurFrames = atomicSfxForm.timing.durationFrames;
      const sfxId = deterministicOverlayId(idEpoch, 'sfx-trigger', decision.frame, decisionIndex);
      const sfxSyncPlan = isTraceRecord(decision.params.sfxSyncPlan) ? decision.params.sfxSyncPlan : undefined;
      const unifiedDecisionMerge = isTraceRecord(decision.params.unifiedDecisionMerge) ? decision.params.unifiedDecisionMerge : undefined;
      const familyPlannerCandidate = unifiedDecisionMerge?.['familyPlanner'];
      const sfxFamilyPlanner = isTraceRecord(familyPlannerCandidate) ? familyPlannerCandidate : undefined;
      const sfxPlannerEvidence = buildSfxPlannerEvidence(sfxSyncPlan, sfxFamilyPlanner);
      const atomicOverlayReceipt = buildOverlayAtomicReceipt({
        family: 'sfx',
        intent: atomicSfxForm.intent,
        frame: sfxStartFrame,
        durationFrames: sfxDurFrames,
        source: decision.source,
        reason: decision.reason,
        signals: decisionSignals(decision),
        target: { overlayId: sfxId },
        payload: {
          formVersion: atomicSfxForm.version,
          sfxType,
          sfxIntent: atomicSfxForm.intent,
          sfxSyncFrame: atomicSfxForm.timing.syncFrame,
          sfxStartFrame: atomicSfxForm.timing.startFrame,
          sfxAnchor: atomicSfxForm.timing.anchor,
          primarySearchToken: atomicSfxForm.asset.primarySearchToken,
          searchQuery,
          fallbackPolicy: atomicSfxForm.asset.fallbackPolicy,
          syncAnchor: atomicSfxForm.timing.anchor,
          attackFrames: atomicSfxForm.timing.attackFrames,
          tailFrames: atomicSfxForm.timing.tailFrames,
          volume: atomicSfxForm.mix.volume,
          mixPressure: atomicSfxForm.mixPressure,
          transientSharpness: atomicSfxForm.transientSharpness,
          assetQualityScore: cached.assetQuality.score,
          assetQualityFloor: cached.assetQuality.qualityFloor,
          assetQualityDecision: cached.assetQuality.decision,
          assetQualityReasons: cached.assetQuality.reasons.join('|'),
          assetSource: cached.source,
          assetTitle: cached.originalTitle,
          sfxPlannerPlacementAllowed: traceBooleanField(sfxPlannerEvidence, 'placementAllowed') ?? '',
          sfxPlannerReasonKeys: traceStringArrayField(sfxPlannerEvidence, 'reasonKeys').join('|'),
          sfxPlannerSyncDistanceFrames: traceNestedNumberField(sfxPlannerEvidence, 'syncWindow', 'distanceFrames') ?? '',
          sfxPlannerDriftRisk: traceNestedNumberField(sfxPlannerEvidence, 'syncWindow', 'driftRisk') ?? '',
          sfxPlannerOvermixRisk: traceNestedNumberField(sfxPlannerEvidence, 'mixSafety', 'overmixRisk') ?? '',
          sfxPlannerProviderRisk: traceNestedNumberField(sfxPlannerEvidence, 'providerGate', 'providerRisk') ?? '',
          sfxPlannerExecutionLicense: traceStringField(sfxPlannerEvidence, 'executionLicense') ?? '',
        },
        atoms: [
          overlayAtom('temporal-anchor', 'timeline.frame', atomicSfxForm.timing.syncFrame, 1, 'edl'),
          overlayAtom('start-frame', 'sfx.start_frame', atomicSfxForm.timing.startFrame, 1, 'derived-signal'),
          overlayAtom('end-frame', 'sfx.end_frame', atomicSfxForm.timing.endFrame, 1, 'derived-signal'),
          overlayAtom('duration', 'sfx.duration_frames', atomicSfxForm.timing.durationFrames, atomicSfxForm.intensity, 'derived-signal'),
          overlayAtom('audio-hit', 'sfx.token', sfxType, decision.confidence, 'decision-param'),
          overlayAtom('volume', 'audio.volume', atomicSfxForm.mix.volume, atomicSfxForm.mix.volume, 'decision-param'),
          overlayAtom('audio-hit', 'audio.asset_quality', cached.assetQuality.score, cached.assetQuality.score, 'audio-library'),
        ],
      });

      overlays.push({
        id: sfxId,
        type: 'sound',
        from: sfxStartFrame,
        durationInFrames: sfxDurFrames,
        startFromSound: atomicSfxForm.timing.sourceOffsetFrames,
        audioStartFrame: atomicSfxForm.timing.startFrame,
        audioEndFrame: atomicSfxForm.timing.endFrame,
        row: ROW.SFX,
        left: 0, top: 0, width: 0, height: 0,
        isDragging: false, rotation: 0,
        content: cached.audioUrl,
        src: cached.audioUrl,
        assetId: cached.audioAssetId,
        audioRights: cached.audioRights,
        styles: { volume: atomicSfxForm.mix.volume, opacity: 1 },
        metadata: {
          source: 'edl-sfx-trigger',
          sfxType,
          sfxQuery: searchQuery,
          sfxIntent: atomicSfxForm.intent,
          sfxSyncFrame: atomicSfxForm.timing.syncFrame,
          sfxStartFrame: atomicSfxForm.timing.startFrame,
          sfxAnchor: atomicSfxForm.timing.anchor,
          sfxAssetQuality: cached.assetQuality,
          sfxProviderSearchReport: cached.providerSearchReport,
          sfxPlannerEvidence,
          ...atomicMomentBundleMetadata(decision),
          atomicSfxForm,
          atomicSfxForms: [atomicSfxForm],
          atomicOverlayReceipt,
          atomicOverlayReceipts: [atomicOverlayReceipt],
          atomicOverlayForm: atomicOverlayReceipt.form,
          atomicOverlayForms: [atomicOverlayReceipt.form],
          atomicPlanObserveMode: true,
        },
      } as any);

      console.log(`[EDL-Exec] sfx-trigger: placed "${sfxType}" intent="${atomicSfxForm.intent}" at frame ${sfxStartFrame}`);
      return { created: 1, modified: 0 };
    }

    case 'camera-shake':
      return applyCameraShake(decision, overlays, canvas);

    default:
      return null;
  }
}

function applyCaptionLayerEmphasis(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const params = decision.params ?? {};
  const emphasisWord = typeof params.emphasisWord === 'string' ? params.emphasisWord.trim() : '';
  if (!emphasisWord) return null;

  const targetTokens = tokenizeCaptionEmphasis(emphasisWord);
  if (targetTokens.length === 0) return null;

  const fps = DEFAULT_CONFIG.timing.fps || 30;
  const targetMs = Math.round((decision.frame / fps) * 1000);
  let best: { overlay: any; words: any[]; start: number; distanceMs: number } | null = null;

  for (const overlay of overlays as any[]) {
    if (overlay?.type !== 'caption' || !Array.isArray(overlay.captions)) continue;
    for (const caption of overlay.captions) {
      const words = Array.isArray(caption?.words) ? caption.words : [];
      const match = findCaptionWordSequence(words, targetTokens, targetMs);
      if (!match) continue;
      if (!best || match.distanceMs < best.distanceMs) {
        best = { overlay, words, start: match.start, distanceMs: match.distanceMs };
      }
    }
  }

  if (!best || best.distanceMs > 1200) return null;

  const emphasisType = captionEmphasisType(params.emphasisType);
  const markedWords = best.words.slice(best.start, best.start + targetTokens.length);
  for (const word of markedWords) {
    word.emphasis = { type: emphasisType, source: decision.source || 'edl-caption-emphasis' };
  }
  markOverlayWordList(best.overlay.words, targetTokens, targetMs, emphasisType, decision.source || 'edl-caption-emphasis');

  best.overlay.metadata = {
    ...(best.overlay.metadata ?? {}),
    captionEmphasisDecisions: [
      ...((best.overlay.metadata?.captionEmphasisDecisions as unknown[]) ?? []),
      {
        word: emphasisWord,
        frame: decision.frame,
        targetMs,
        source: decision.source,
        distanceMs: best.distanceMs,
      },
    ],
  };
  appendAtomicOverlayReceipt(best.overlay, buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'caption-emphasis',
    frame: decision.frame,
    durationFrames: decision.durationFrames ?? 30,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: { overlayId: best.overlay.id },
    payload: { emphasisWord, emphasisType, markedWordCount: markedWords.length, targetMs },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', decision.frame, 1, 'edl'),
      overlayAtom('caption-word', 'caption.emphasis.word', emphasisWord, decision.confidence, 'decision-param'),
      overlayAtom('emphasis-role', 'caption.emphasis.type', emphasisType, decision.confidence, 'decision-param'),
    ],
  }));
  attachAtomicMomentBundleMetadata(best.overlay, decision);

  return { created: 0, modified: 1 };
}

function tokenizeCaptionEmphasis(value: string): string[] {
  return value
    .split(/\s+/)
    .map(normalizeCaptionToken)
    .filter((token) => token.length > 0);
}

function findCaptionWordSequence(
  words: any[],
  targetTokens: string[],
  targetMs: number,
): { start: number; distanceMs: number } | null {
  let best: { start: number; distanceMs: number } | null = null;
  for (let start = 0; start <= words.length - targetTokens.length; start += 1) {
    const matches = targetTokens.every((token, offset) => normalizeCaptionToken(words[start + offset]?.word) === token);
    if (!matches) continue;
    const startMs = Number(words[start]?.startMs ?? targetMs);
    const endMs = Number(words[start + targetTokens.length - 1]?.endMs ?? startMs);
    const distanceMs = targetMs >= startMs && targetMs <= endMs
      ? 0
      : Math.min(Math.abs(targetMs - startMs), Math.abs(targetMs - endMs));
    if (!best || distanceMs < best.distanceMs) best = { start, distanceMs };
  }
  return best;
}

function markOverlayWordList(
  words: unknown,
  targetTokens: string[],
  targetMs: number,
  emphasisType: 'keyword' | 'statistic' | 'cta' | 'entity',
  source: string,
): void {
  if (!Array.isArray(words)) return;
  const match = findCaptionWordSequence(words, targetTokens, targetMs);
  if (!match || match.distanceMs > 1200) return;
  for (const word of words.slice(match.start, match.start + targetTokens.length) as any[]) {
    word.emphasis = { type: emphasisType, source };
  }
}

function normalizeCaptionToken(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';
}

function captionEmphasisType(value: unknown): 'keyword' | 'statistic' | 'cta' | 'entity' {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'statistic' || normalized === 'cta' || normalized === 'entity') return normalized;
  return 'keyword';
}
function applyCameraShake(
  decision: EditDecision,
  overlays: Overlay[],
  canvas: { width: number; height: number } = { width: 1920, height: 1080 },
): { created: number; modified: number } | null {
  const intensity = decision.params?.intensity || 0.3;
  const durationFrames = decision.durationFrames || 10;
  const frame = decision.frame;

  // Find the video overlay at this frame
  const video = overlays.find(o =>
    o.type === 'video' && o.from <= frame && (o.from + o.durationInFrames) > frame
  ) as any;
  if (!video) return null;

  // Create rapid position jitter keyframes (alternating X/Y offsets)
  const shakeFrames = Math.min(durationFrames, 15);
  const relativeStart = frame - video.from;
  const xKeyframes: any[] = [{ frame: relativeStart, value: 0, easing: 'linear' }];
  const yKeyframes: any[] = [{ frame: relativeStart, value: 0, easing: 'linear' }];

  // Seed PRNG with frame + overlay position for deterministic shake across renders
  const seed = frame * 31 + video.from * 17 + (video.durationInFrames || 0) * 7;
  const rand = mulberry32(seed);

  const maxOffset = intensity * canvas.width * 0.01; // 1% of canvas width (scales with resolution)
  for (let i = 1; i <= shakeFrames; i++) {
    const decay = 1 - (i / shakeFrames); // decay over time
    const xOff = (rand() - 0.5) * 2 * maxOffset * decay;
    const yOff = (rand() - 0.5) * 2 * maxOffset * decay;
    xKeyframes.push({ frame: relativeStart + i, value: xOff, easing: 'linear' });
    yKeyframes.push({ frame: relativeStart + i, value: yOff, easing: 'linear' });
  }
  // Return to center
  xKeyframes.push({ frame: relativeStart + shakeFrames + 1, value: 0, easing: 'ease-out' });
  yKeyframes.push({ frame: relativeStart + shakeFrames + 1, value: 0, easing: 'ease-out' });

  if (!video.keyframeTracks) video.keyframeTracks = [];
  video.keyframeTracks.push({ property: 'x', keyframes: xKeyframes });
  video.keyframeTracks.push({ property: 'y', keyframes: yKeyframes });
  appendAtomicOverlayReceipt(video, buildOverlayAtomicReceipt({
    family: 'camera-shake',
    intent: 'impact-shake',
    frame,
    durationFrames,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: { overlayId: video.id, localFrame: relativeStart },
    payload: { intensity: Number(intensity), maxOffset, shakeFrames },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', frame, 1, 'edl'),
      overlayAtom('motion-curve', 'camera-shake.xy-jitter', maxOffset, Number(intensity), 'keyframe'),
    ],
  }));
  attachAtomicMomentBundleMetadata(video, decision);

  return { created: 0, modified: 1 };
}

function applyTransition(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  idEpoch: number = 0,
  decisionIndex: number = 0,
): { created: number; modified: number } | null {
  decision.params = decision.params || {};
  const requestedTransType = (decision.params.transitionType || decision.params.transitionCompatibilityHint || 'soft-cut') as string;
  const audioBoundaryKind = resolveAudioBoundaryTransitionKind(decision);
  // Dissolve needs minimum duration to feel like a real crossfade, not a flash.
  // Intelligence layer often sets 15 frames (0.5s) → too fast. Clamp to 30+ (1s).
  const transitionForm = resolveAtomicTransitionForm({
    signals: decisionSignals(decision),
    params: decision.params,
    momentBundle: decisionMomentBundle(decision),
    durationFrames: decision.durationFrames,
    defaultDurationFrames: (DEFAULT_TRANSITION_FRAMES as any)[requestedTransType] || 15,
  });
  const transType = transitionForm.compatibilityType;
  const durationFrames = transitionForm.durationFrames;
  const isEditorialCut = ['hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action'].includes(transType);

  // Snap decision frame to nearest actual clip boundary FIRST so the dedup
  // below can use clipA/clipB identity (authoritative) instead of frame
  // proximity alone (fragile — misses when EDL and Director use different
  // reference frames for the same boundary).
  const boundaryMatch = snapToClipBoundary(decision.frame, overlays, 45);
  if (!boundaryMatch) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — no clip boundary found within 45 frames`);
    return null;
  }
  if (boundaryMatch.drift > 0) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: snapped to boundary ${boundaryMatch.boundaryFrame} (drift: ${boundaryMatch.drift} frames)`);
  }
  const clipA = boundaryMatch.clipA;
  const clipB = boundaryMatch.clipB;
  const anchorFrame = boundaryMatch.boundaryFrame;

  if (audioBoundaryKind) {
    return applyAudioBoundaryTransition(audioBoundaryKind, decision, overlays, boundaryMatch, idEpoch, decisionIndex);
  }

  // Editorial cuts are already represented by the adjacent video clip boundary.
  // They intentionally render no visual transition tile, but they are still a
  // valid executed decision when anchored to a real boundary. Returning a
  // zero-change result keeps Phase-0/quality audit from misclassifying a
  // deliberate match-cut or hard-cut as a dropped executor path.
  if (isEditorialCut) {
    decision.params.transitionType = transType;
    decision.params.transitionStyle = transType;
    decision.params.atomicTransitionForm = transitionForm;
    decision.params.editorialCutExecution = {
      version: 'editorial-cut-execution-v1',
      boundaryFrame: boundaryMatch.boundaryFrame,
      clipAId: (boundaryMatch.clipA as any).id,
      clipBId: (boundaryMatch.clipB as any).id,
      compatibilityType: transType,
    };
    return { created: 0, modified: 0 };
  }

  // Check if a transition already exists for this clip pair. Clip-pair match
  // is the authoritative dedup key — a pair of clips has exactly one boundary,
  // so at most one transition belongs between them. Frame-proximity is kept
  // as a fallback for legacy overlays that don't have clipAId/clipBId set
  // (e.g. the pre-A1 in-memory markers that could still exist if someone
  // re-runs Director on an older project state).
  // See pipeline_investigations.md 2026-04-18 (Dual transition regression)
  // for why frame-only dedup missed same-pair duplicates across systems.
  const existingTransition = overlays.find(o => {
    if (o.type !== 'transition' && !(o as any).metadata?.isTransition) return false;
    // Authoritative: same clip pair
    if ((o as any).clipAId === clipA.id && (o as any).clipBId === clipB.id) return true;
    // Fallback: frame proximity for overlays missing clipAId/clipBId
    if ((o as any).clipAId == null || (o as any).clipBId == null) {
      return Math.abs(o.from - decision.frame) < 15;
    }
    return false;
  });
  if (existingTransition) {
    const reason = ((existingTransition as any).clipAId === clipA.id && (existingTransition as any).clipBId === clipB.id)
      ? `clipA=${clipA.id}/clipB=${clipB.id} pair match (source: ${(existingTransition as any).metadata?.source || 'unknown'})`
      : `legacy overlay within 15 frames`;
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — ${reason}`);
    return null;
  }

  const repetitionPolicy = resolveTransitionRepetitionPolicy(transType, overlays, decision);
  if (!repetitionPolicy.allowed) {
    console.log(
      `[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — ${repetitionPolicy.reason}; ` +
      'leaving boundary clean unless montage_mode licenses uniformity',
    );
    return null;
  }

  // Create proper TransitionOverlay tile (System A — editor renders these)
  const transitionOverlay = {
    // Deterministic ID: stable across render passes, unique per decision index
    id: deterministicOverlayId(idEpoch, 'transition', decision.frame, decisionIndex),
    type: 'transition' as const,
    from: anchorFrame - Math.floor(durationFrames / 2),
    durationInFrames: durationFrames,
    row: ROW.VIDEO, // DaVinci-style: transitions render inline between clips on the video track
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
    isDragging: false,
    rotation: 0,
    transitionStyle: transType,
    clipAId: clipA.id,
    clipBId: clipB.id,
    easing: 'ease-in-out' as const,
    content: transType, // Display name for timeline tile
    styles: { opacity: 1 },
    metadata: {
      isTransition: true,
      transitionType: transType,
      keyframeBased: transitionForm.keyframeBased,
      source: 'edl',
      edlReason: decision.reason,
      ...atomicMomentBundleMetadata(decision),
      atomicTransitionForm: transitionForm,
      atomicOverlayReceipt: buildOverlayAtomicReceipt({
        family: 'transition',
        intent: transitionForm.intent,
        frame: anchorFrame,
        durationFrames,
        source: decision.source,
        reason: decision.reason,
        signals: decisionSignals(decision),
        target: { clipAId: clipA.id, clipBId: clipB.id, boundaryFrame: anchorFrame },
        payload: {
          formVersion: transitionForm.version,
          transitionType: transType,
          directionX: transitionForm.direction.x,
          directionY: transitionForm.direction.y,
          directionLabel: transitionForm.direction.label,
          durationFrames,
          softness: transitionForm.softness,
          blurPx: transitionForm.blurPx,
          smear: transitionForm.smear,
          exposure: transitionForm.exposure,
          maskFeather: transitionForm.maskFeather,
          visualPressure: transitionForm.visualPressure,
          intensity: transitionForm.intensity,
          sfxRole: transitionForm.sfxRole,
          keyframeBased: transitionForm.keyframeBased,
        },
        atoms: [
          overlayAtom('temporal-anchor', 'timeline.boundary_frame', anchorFrame, 1, 'edl'),
          overlayAtom('transition-relation', 'transition.clip_pair', `${clipA.id}->${clipB.id}`, decision.confidence, 'edl'),
          overlayAtom('direction-x', 'transition.direction_x', transitionForm.direction.x, transitionForm.direction.magnitude, 'derived-signal'),
          overlayAtom('direction-y', 'transition.direction_y', transitionForm.direction.y, transitionForm.direction.magnitude, 'derived-signal'),
          overlayAtom('duration', 'transition.duration_frames', durationFrames, transitionForm.intensity, 'derived-signal'),
          overlayAtom('softness', 'transition.softness', transitionForm.softness, transitionForm.softness, 'derived-signal'),
          overlayAtom('blur', 'transition.blur_px', transitionForm.blurPx, transitionForm.intensity, 'derived-signal'),
          overlayAtom('exposure', 'transition.exposure', transitionForm.exposure, transitionForm.exposure, 'derived-signal'),
        ],
      }),
      atomicPlanObserveMode: true,
    },
  };
  (transitionOverlay.metadata as any).atomicOverlayReceipts = [(transitionOverlay.metadata as any).atomicOverlayReceipt];
  (transitionOverlay.metadata as any).atomicOverlayForm = (transitionOverlay.metadata as any).atomicOverlayReceipt.form;
  (transitionOverlay.metadata as any).atomicOverlayForms = [(transitionOverlay.metadata as any).atomicOverlayReceipt.form];

  overlays.push(transitionOverlay as any);

  // Clean up clip-overlap opacity keyframes that edit-direction-applier may
  // have placed on the adjacent clips at this boundary. Without this, both
  // the keyframe-based crossfade AND the transition tile render simultaneously
  // → double transition visual. Per creative doc §6 (Transition Psychology):
  // each boundary should have ONE transition effect, not two.
  //
  // Only remove opacity tracks near the boundary frame — preserve opacity
  // keyframes placed for other purposes (fade-in at clip start, fade-out at end).
  const boundaryLocalA = clipA.durationInFrames; // end of clipA (relative to clipA.from)
  const boundaryLocalB = 0; // start of clipB (relative to clipB.from)
  const cleanupMarginFrames = Math.ceil(durationFrames * 1.5); // generous margin

  for (const clip of [clipA, clipB]) {
    if (!clip.keyframeTracks) continue;
    const opacityIdx = clip.keyframeTracks.findIndex(
      (t: any) => t.property === 'opacity',
    );
    if (opacityIdx < 0) continue;

    const track = clip.keyframeTracks[opacityIdx];
    const isClipA = clip === clipA;
    // Check if ANY opacity keyframe is near the boundary
    const nearBoundary = track.keyframes.some((kf: any) => {
      const dist = isClipA
        ? Math.abs(kf.frame - boundaryLocalA)
        : Math.abs(kf.frame - boundaryLocalB);
      return dist <= cleanupMarginFrames;
    });

    if (nearBoundary) {
      // Remove opacity keyframes near the boundary, keep others
      const filtered = track.keyframes.filter((kf: any) => {
        const dist = isClipA
          ? Math.abs(kf.frame - boundaryLocalA)
          : Math.abs(kf.frame - boundaryLocalB);
        return dist > cleanupMarginFrames;
      });

      if (filtered.length === 0) {
        // All opacity keyframes were near boundary — remove entire track
        clip.keyframeTracks.splice(opacityIdx, 1);
      } else {
        clip.keyframeTracks[opacityIdx] = { ...track, keyframes: filtered };
      }
    }
  }

  console.log(`[EDL-Exec] Transition APPLIED: ${transType} tile at frame ${anchorFrame} (clipA=${clipA.id}, clipB=${clipB.id}, drift=${boundaryMatch.drift})`);
  return { created: 1, modified: 0 };
}

function buildZoomPanTracks(
  zoomForm: ReturnType<typeof resolveAtomicZoomForm>,
  canvas: { width: number; height: number },
): KeyframeTrack[] {
  const scaleMagnitude = Math.abs(zoomForm.scaleDelta);
  if (scaleMagnitude < 0.01 || zoomForm.focal.strength < 0.1) return [];

  const firstFrame = zoomForm.keyframes[0]?.frame ?? zoomForm.startFrame;
  const settleFrame = zoomForm.keyframes[Math.min(1, zoomForm.keyframes.length - 1)]?.frame ?? zoomForm.endFrame;
  const lastFrame = zoomForm.keyframes[zoomForm.keyframes.length - 1]?.frame ?? zoomForm.endFrame;
  const movementMultiplier = zoomForm.compatibilityType === 'slow-push' ? 0.5 : 1;
  const maxPanPx = Math.max(6, Math.min(34, canvas.width * 0.018))
    * Math.max(0.45, Math.min(1.1, scaleMagnitude / 0.1))
    * movementMultiplier;
  const panX = roundPixel((0.5 - zoomForm.focal.x) * maxPanPx * zoomForm.intensity);
  const panY = roundPixel((0.5 - zoomForm.focal.y) * maxPanPx * 0.62 * zoomForm.intensity);

  const makeTrack = (property: 'x' | 'y', value: number): KeyframeTrack | null => {
    if (Math.abs(value) < 1) return null;
    return {
      property,
      keyframes: [
        { frame: firstFrame, value: 0, easing: 'ease-in' },
        { frame: settleFrame, value, easing: 'ease-out' },
        { frame: lastFrame, value, easing: 'linear' },
      ],
    };
  };

  return [makeTrack('x', panX), makeTrack('y', panY)].filter((track): track is KeyframeTrack => Boolean(track));
}

function zoomPanEndValue(panTracks: KeyframeTrack[], property: 'x' | 'y'): number {
  const track = panTracks.find((candidate) => candidate.property === property);
  if (!track || track.keyframes.length === 0) return 0;
  return track.keyframes[track.keyframes.length - 1]?.value ?? 0;
}

function roundPixel(value: number): number {
  return Math.round(value * 10) / 10;
}

interface AppliedZoomRecord {
  overlayId?: number | string;
  frame: number;
  zoomType?: string;
  direction?: string;
  scaleTo?: number;
}

const ZOOM_REPETITION_LIMIT = 3;

function zoomRecordsFromOverlay(overlay: Overlay): AppliedZoomRecord[] {
  const metadata = (overlay as any).metadata ?? {};
  const seen = new Set<string>();
  const receipts = [
    ...(Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts : []),
    metadata.atomicOverlayReceipt,
  ].filter(Boolean);

  return receipts
    .filter((receipt: any) => receipt?.family === 'zoom')
    .map((receipt: any) => {
      const frame = typeof receipt.frame === 'number' ? receipt.frame : overlay.from;
      const overlayId = receipt.target?.overlayId ?? overlay.id;
      const zoomType = typeof receipt.payload?.zoomType === 'string' ? receipt.payload.zoomType : undefined;
      const direction = typeof receipt.payload?.direction === 'string' ? receipt.payload.direction : undefined;
      const scaleTo = typeof receipt.payload?.scaleTo === 'number' ? receipt.payload.scaleTo : undefined;
      return { overlayId, frame, zoomType, direction, scaleTo };
    })
    .filter((record) => {
      const key = `${record.overlayId ?? ''}|${record.frame}|${record.zoomType ?? ''}|${record.direction ?? ''}|${record.scaleTo ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function appliedZoomRecords(overlays: Overlay[]): AppliedZoomRecord[] {
  return overlays
    .flatMap(zoomRecordsFromOverlay)
    .sort((a, b) => a.frame - b.frame);
}

function zoomRecordMatchesForm(
  record: AppliedZoomRecord,
  zoomForm: ReturnType<typeof resolveAtomicZoomForm>,
): boolean {
  return record.zoomType === zoomForm.compatibilityType
    && record.direction === zoomForm.direction
    && typeof record.scaleTo === 'number'
    && Math.abs(record.scaleTo - zoomForm.scaleTo) < 0.01;
}

function resolveZoomMemoryPolicy(
  zoomForm: ReturnType<typeof resolveAtomicZoomForm>,
  overlays: Overlay[],
  videoOverlay: Overlay,
): { allowed: true } | { allowed: false; reason: string } {
  if (zoomRecordsFromOverlay(videoOverlay).length > 0) {
    return {
      allowed: false,
      reason: `clip ${videoOverlay.id} already has an applied zoom; refusing to overwrite its camera move`,
    };
  }

  const history = appliedZoomRecords(overlays);
  let runLength = 1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!zoomRecordMatchesForm(history[index], zoomForm)) break;
    runLength += 1;
  }

  if (runLength >= ZOOM_REPETITION_LIMIT) {
    return {
      allowed: false,
      reason: `would create ${runLength} consecutive identical ${zoomForm.compatibilityType} zoom targets`,
    };
  }

  return { allowed: true };
}

function decisionHasZoomEmphasisAnchor(decision: EditDecision): boolean {
  const signals = decisionSignals(decision);
  const params = decision.params ?? {};
  const wordImportance = zoomEvidenceNumber(signals, 'word_importance', 'word.importance', 'speech.word_importance');
  const emphasisStrength = zoomEvidenceNumber(signals, 'speech_emphasis', 'speech.emphasis_word', 'emphasis_strength', 'word_emphasis');
  const speechEnergy = zoomEvidenceNumber(signals, 'speech_energy', 'speech.energy');
  const anchorKind = String(params.anchorKind ?? params.anchorRole ?? params.syncSource ?? '').trim();
  const targetWord = String(params.targetWord ?? params.emphasisWord ?? params.word ?? '').trim();
  const targetWordHasSignalSupport = targetWord.length > 0
    && Math.max(wordImportance, emphasisStrength, speechEnergy) >= 0.5;

  return wordImportance >= 0.72
    || emphasisStrength >= 0.72
    || anchorKind === 'emphasis-word'
    || anchorKind === 'speaker-emphasis'
    || targetWordHasSignalSupport;
}

function zoomEvidenceNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return 0;
}

function applyZoom(
  decision: EditDecision,
  overlays: Overlay[],
  canvas: { width: number; height: number } = { width: 1920, height: 1080 },
  analyses?: Map<string, any>,
): { created: number; modified: number } | null {
  // Find the video overlay at this frame (with tolerance for pacing drift)
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) {
    console.log(`[EDL-Exec] Zoom at frame ${decision.frame}: SKIPPED — no video clip found within 15 frames`);
    return null;
  }
  if (clipMatch.drift > 0) {
    console.log(`[EDL-Exec] Zoom at frame ${decision.frame}: snapped to clip at ${clipMatch.clip.from} (drift: ${clipMatch.drift} frames)`);
  }
  const videoOverlay = clipMatch.clip;
  decision.params = decision.params || {};

  // Guard: hook zone — creative graph mapping:structural.hook_zone_treatment
  // says first 5% of VIDEO needs strong visual opening without jarring zooms.
  //
  // OLD: blocked zooms in first 30 frames of EACH CLIP. Wrong for Mode 2
  // single-source projects where clips are editorial transcript cuts of continuous
  // footage. The viewer is watching the same camera — there's no "new shot
  // orientation" at each cut. This killed 53% of zoom decisions.
  //
  // NEW: Only apply hook zone guard at the start of the OVERALL VIDEO (first 5%
  // of total duration per creative graph) OR for multi-source projects where each
  // clip is genuinely a different visual (new shot = viewer needs orientation).
  const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  const isFirstClipInTimeline = videoOverlays.length > 0 && videoOverlay === videoOverlays[0];
  const uniqueAssets = new Set(videoOverlays.map(o => (o as any).assetId).filter(Boolean));
  const isMultiSource = uniqueAssets.size > 1;

  const shouldApplyHookZone = isMultiSource
    ? decision.frame <= videoOverlay.from + 30  // Multi-source: per-clip (new shot)
    : isFirstClipInTimeline && decision.frame <= videoOverlay.from + 30; // Single-source: only first clip

  if (shouldApplyHookZone) {
    const analysis = videoOverlay.assetId ? analyses?.get(videoOverlay.assetId) : undefined;
    const peaks = (analysis as any)?.motionPeaks || [];
    if (peaks.length > 0 && peaks[0] > 30) {
      console.log(`[EDL-Exec] Zoom at frame ${decision.frame} in hook zone — shifted to first motion peak at frame ${videoOverlay.from + peaks[0]}`);
      decision.frame = videoOverlay.from + peaks[0];
    } else {
      console.log(`[EDL-Exec] Zoom at frame ${decision.frame} in hook zone — SKIPPED (no suitable motion peak)`);
      return null;
    }
  }

  // Validate zoom placement against 5-Track motion data when available.
  // Reject zoom decisions not near a motion peak or natural cut point (±10 frames).
  // This enforces Rule Z-010: "zoom-punch MUST be synced to emphasis word or visual impact."
  // If no analysis data, allow the zoom (trust Gemini's judgment from prompt context).
  if (analyses && videoOverlay.assetId) {
    const analysis = analyses.get(videoOverlay.assetId);
    if (analysis) {
      const quality = (analysis as any).analysisQuality || 'unknown';

      // Only validate against motion peaks if analysis quality is real.
      // Fallback data has no peaks — validation would pass vacuously.
      if (quality === 'high' || quality === 'medium') {
        const localDecisionFrame = decision.frame - videoOverlay.from;
        const peaks = analysis.motionPeaks || [];
        const cuts = analysis.naturalCutPoints || [];
        const allSignificantFrames = [...peaks, ...cuts];
        const nearSignificantFrame = allSignificantFrames.some(
          (f: number) => Math.abs(f - localDecisionFrame) <= 10,
        );
        const hasEmphasisAnchor = decisionHasZoomEmphasisAnchor(decision);
        if (!nearSignificantFrame && !hasEmphasisAnchor && allSignificantFrames.length > 0) {
          decision.params.zoomType = 'slow-push';
          decision.params.scaleTo = Math.min(decision.params.scaleTo || 1.1, 1.05);
          console.log(`[EDL-Exec] Zoom at frame ${decision.frame} not near motion peak or emphasis anchor — downgraded to slow-push (analysis quality: ${quality})`);
        }
      } else {
        // Low/fallback quality — trust Gemini's anchor-based placement, don't validate against fake peaks
        console.log(`[EDL-Exec] Zoom at frame ${decision.frame} — skipping motion peak validation (analysis quality: ${quality})`);
      }
    }
  }

  const localFrame = decision.frame - videoOverlay.from;
  const sceneEnd = videoOverlay.durationInFrames;
  const zoomForm = resolveAtomicZoomForm({
    signals: decisionSignals(decision),
    params: decision.params,
    momentBundle: decisionMomentBundle(decision),
    localFrame,
    sceneEnd,
    durationFrames: decision.durationFrames,
  });

  const zoomMemory = resolveZoomMemoryPolicy(zoomForm, overlays, videoOverlay);
  if (!zoomMemory.allowed) {
    console.log(`[EDL-Exec] Zoom at frame ${decision.frame}: SKIPPED — ${zoomMemory.reason}`);
    return null;
  }

  // Add zoom keyframe tracks
  if (!videoOverlay.keyframeTracks) videoOverlay.keyframeTracks = [];

  // Remove existing scale track if any. Preserve x/y tracks that may belong to
  // camera-shake or user-authored motion; zoom pan only fills empty axes.
  videoOverlay.keyframeTracks = videoOverlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'scale',
  );

  videoOverlay.styles = videoOverlay.styles || {};
  (videoOverlay.styles as any).transformOrigin = zoomForm.focal.transformOrigin;

  videoOverlay.keyframeTracks.push({
    property: 'scale',
    keyframes: zoomForm.keyframes,
  });

  const panTracks = buildZoomPanTracks(zoomForm, canvas);
  const existingTrackProperties = new Set(videoOverlay.keyframeTracks.map((track: KeyframeTrack) => track.property));
  for (const track of panTracks) {
    if (!existingTrackProperties.has(track.property)) {
      videoOverlay.keyframeTracks.push(track);
      existingTrackProperties.add(track.property);
    }
  }
  appendAtomicOverlayReceipt(videoOverlay as any, buildOverlayAtomicReceipt({
    family: 'zoom',
    intent: zoomForm.intent,
    frame: decision.frame,
    durationFrames: zoomForm.durationFrames,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: { overlayId: videoOverlay.id, localFrame },
    payload: {
      formVersion: zoomForm.version,
      zoomType: zoomForm.compatibilityType,
      direction: zoomForm.direction,
      scaleFrom: zoomForm.scaleFrom,
      scaleTo: zoomForm.scaleTo,
      scaleDelta: zoomForm.scaleDelta,
      panX: zoomPanEndValue(panTracks, 'x'),
      panY: zoomPanEndValue(panTracks, 'y'),
      focalX: zoomForm.focal.x,
      focalY: zoomForm.focal.y,
      transformOrigin: zoomForm.focal.transformOrigin,
      attackFrames: zoomForm.attackFrames,
      holdFrames: zoomForm.holdFrames,
      visualPressure: zoomForm.visualPressure,
      intensity: zoomForm.intensity,
    },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', decision.frame, 1, 'edl'),
      overlayAtom('scale-delta', 'zoom.scale_delta', zoomForm.scaleDelta, Math.abs(zoomForm.scaleDelta), 'derived-signal'),
      overlayAtom('duration', 'zoom.duration_frames', zoomForm.durationFrames, zoomForm.intensity, 'derived-signal'),
      overlayAtom('focal-x', 'zoom.focal_x', zoomForm.focal.x, zoomForm.focal.strength, 'derived-signal'),
      overlayAtom('focal-y', 'zoom.focal_y', zoomForm.focal.y, zoomForm.focal.strength, 'derived-signal'),
      overlayAtom('motion-curve', 'zoom.scale_keyframes', zoomForm.keyframes.length, Math.abs(zoomForm.scaleDelta), 'keyframe'),
      overlayAtom('motion-curve', 'zoom.pan_keyframes', panTracks.length, Math.abs(zoomForm.scaleDelta), 'keyframe'),
    ],
  }));
  attachAtomicMomentBundleMetadata(videoOverlay as any, decision);

  return { created: 0, modified: 1 };
}

function applySpeedChange(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) return null;
  const videoOverlay = clipMatch.clip as any;

  const localFrame = decision.frame - videoOverlay.from;
  const duration = decision.durationFrames || 30;
  const clipDuration = videoOverlay.durationInFrames;
  const params = decision.params ?? {};
  const speedFrom = numberParam(params, 'speedFrom') ?? 1.0;
  const speedTo = numberParam(params, 'speedTo')
    ?? numberParam(params, 'speedMultiplier')
    ?? numberParam(params, 'speed');
  const speedBack = numberParam(params, 'speedBack') ?? 1.0;
  if (speedTo == null) {
    console.warn(`[EDL-Exec] Speed-change at frame ${decision.frame}: SKIPPED - no explicit speedTo/speedMultiplier/speed parameter`);
    return null;
  }

  const signals = decisionSignals(decision);
  const speechEnergy = readNumber(signals, 'speech_energy', 'speech.energy', 'speech_energy_ema', 'speech.energy_ema') ?? 0;
  const speechCoverage = readNumber(signals, 'speech_coverage', 'speech.coverage') ?? 0;
  const silenceDurationMs = readNumber(signals, 'silence_duration_ms', 'speech.silence_duration_ms', 'speechGapMs', 'speech_gap_ms') ?? 0;
  const montageMode = (readBoolean(signals, 'montage_mode', 'composite.montage_mode') ?? 0) >= 1;
  const activeSpeech = !montageMode
    && silenceDurationMs < 200
    && (speechEnergy > 0.3 || speechCoverage > 0.45);
  if (activeSpeech) {
    console.warn(`[EDL-Exec] Speed-change at frame ${decision.frame}: SKIPPED - active speech detected (speechEnergy=${speechEnergy.toFixed(2)}, speechCoverage=${speechCoverage.toFixed(2)})`);
    return null;
  }

  // Phase A3.5.6 fix: build keyframes then validate them — clamp frames to clip bounds,
  // dedupe same-frame entries (last wins), enforce monotonic order. Previous version
  // produced invalid curves like [{frame:0}, {frame:0}, {frame:120 on 60-frame clip}, {frame:60}].
  const rawKeyframes = [
    { frame: Math.max(0, localFrame - 5), value: speedFrom, easing: 'ease-in' as const },
    { frame: localFrame + Math.floor(duration / 3), value: speedTo, easing: 'ease-in-out' as const },
    { frame: localFrame + duration, value: speedBack, easing: 'ease-out' as const },
  ];

  // Clamp each frame to [0, clipDuration - 1]
  const clamped = rawKeyframes.map(kf => ({
    ...kf,
    frame: Math.max(0, Math.min(clipDuration - 1, kf.frame)),
  }));

  // Dedupe by frame (last occurrence wins)
  const byFrame = new Map<number, typeof clamped[number]>();
  for (const kf of clamped) byFrame.set(kf.frame, kf);

  // Sort ascending by frame — guarantees monotonic order
  const validated = Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame);

  if (validated.length < 2) {
    console.log(`[EDL-Exec] Speed-change at frame ${decision.frame}: SKIPPED — after clamping, <2 distinct keyframes for clipDuration=${clipDuration}`);
    return null;
  }

  videoOverlay.speedCurve = validated;
  appendAtomicOverlayReceipt(videoOverlay, buildOverlayAtomicReceipt({
    family: 'speed',
    intent: 'speed-ramp',
    frame: decision.frame,
    durationFrames: duration,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: { overlayId: videoOverlay.id, localFrame },
    payload: { speedFrom: Number(speedFrom), speedTo: Number(speedTo), speedBack: Number(speedBack) },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', decision.frame, 1, 'edl'),
      overlayAtom('speed-curve', 'video.speed_curve', validated.length, Math.abs(Number(speedTo) - Number(speedFrom)), 'keyframe'),
    ],
  }));
  attachAtomicMomentBundleMetadata(videoOverlay, decision);
  return { created: 0, modified: 1 };
}

function applyFade(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) return null;
  const overlay = clipMatch.clip;

  const localFrame = decision.frame - overlay.from;
  const duration = decision.durationFrames || 20;
  const { fromOpacity = 1, toOpacity = 0 } = decision.params;

  mergeOpacityKeyframes(overlay, [
    { frame: localFrame, value: fromOpacity, easing: 'ease-in-out' },
    { frame: localFrame + duration, value: toOpacity, easing: 'linear' },
  ]);
  appendAtomicOverlayReceipt(overlay as any, buildOverlayAtomicReceipt({
    family: 'fade',
    intent: 'opacity-fade',
    frame: decision.frame,
    durationFrames: duration,
    source: decision.source,
    reason: decision.reason,
    signals: decisionSignals(decision),
    target: { overlayId: overlay.id, localFrame },
    payload: { fromOpacity: Number(fromOpacity), toOpacity: Number(toOpacity) },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', decision.frame, 1, 'edl'),
      overlayAtom('opacity-curve', 'video.opacity_curve', Number(toOpacity) - Number(fromOpacity), Math.abs(Number(toOpacity) - Number(fromOpacity)), 'keyframe'),
    ],
  }));
  attachAtomicMomentBundleMetadata(overlay as any, decision);

  return { created: 0, modified: 1 };
}

function mergeOpacityKeyframes(overlay: Overlay, fadeKeyframes: Keyframe[]): void {
  if (!overlay.keyframeTracks) overlay.keyframeTracks = [];

  const clipDuration = Math.max(1, Number(overlay.durationInFrames) || 1);
  const sanitizedFadeKeyframes = sanitizeOpacityKeyframes(fadeKeyframes, clipDuration);
  if (sanitizedFadeKeyframes.length < 2) return;

  const fadeStart = sanitizedFadeKeyframes[0]!.frame;
  const fadeEnd = sanitizedFadeKeyframes[sanitizedFadeKeyframes.length - 1]!.frame;
  const preservedTracks: KeyframeTrack[] = [];
  const preservedOpacityKeyframes: Keyframe[] = [];

  for (const track of overlay.keyframeTracks) {
    if (track.property !== 'opacity') {
      preservedTracks.push(track);
      continue;
    }

    for (const keyframe of track.keyframes ?? []) {
      if (keyframe.frame < fadeStart || keyframe.frame > fadeEnd) {
        preservedOpacityKeyframes.push(keyframe);
      }
    }
  }

  const byFrame = new Map<number, Keyframe>();
  for (const keyframe of [...preservedOpacityKeyframes, ...sanitizedFadeKeyframes]) {
    byFrame.set(keyframe.frame, keyframe);
  }

  overlay.keyframeTracks = [
    ...preservedTracks,
    {
      property: 'opacity',
      keyframes: Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame),
    },
  ];
}

function sanitizeOpacityKeyframes(keyframes: Keyframe[], clipDuration: number): Keyframe[] {
  const byFrame = new Map<number, Keyframe>();
  for (const keyframe of keyframes) {
    const frame = Math.max(0, Math.min(clipDuration - 1, Math.round(Number(keyframe.frame) || 0)));
    byFrame.set(frame, { ...keyframe, frame });
  }
  return Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame);
}
// ── Template-based graphic rendering helpers ──
type OverlayPlacementRegion =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'full-frame';

type OverlayPlacementAdjustment = {
  candidateRegion?: OverlayPlacementRegion;
  multiplier?: number;
  penalty?: number;
  bonus?: number;
  avoidHits?: string[];
  preferHits?: string[];
  constraints?: string[];
};

type OverlayGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : undefined;
}

function normalizePlacementRegion(value: unknown): OverlayPlacementRegion | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().replace(/_/g, '-');
  const aliases: Record<string, OverlayPlacementRegion> = {
    center: 'middle-center',
    'center-left': 'middle-left',
    'center-right': 'middle-right',
    'safe-top-left': 'top-left',
    'safe-top-center': 'top-center',
    'safe-top-right': 'top-right',
    'safe-middle-left': 'middle-left',
    'safe-middle-center': 'middle-center',
    'safe-middle-right': 'middle-right',
    'safe-bottom-left': 'bottom-left',
    'safe-bottom-center': 'bottom-center',
    'safe-bottom-right': 'bottom-right',
    fullscreen: 'full-frame',
  };
  const region = aliases[normalized] ?? normalized;
  return isPlacementRegion(region) ? region : undefined;
}

function isPlacementRegion(value: string): value is OverlayPlacementRegion {
  return [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'full-frame',
  ].includes(value);
}

function readPlacementAdjustment(value: unknown): OverlayPlacementAdjustment | undefined {
  if (!isObjectRecord(value)) return undefined;
  return {
    candidateRegion: normalizePlacementRegion(value.candidateRegion),
    multiplier: readFiniteNumber(value.multiplier),
    penalty: readFiniteNumber(value.penalty),
    bonus: readFiniteNumber(value.bonus),
    avoidHits: readStringArray(value.avoidHits),
    preferHits: readStringArray(value.preferHits),
    constraints: readStringArray(value.constraints),
  };
}

function readCaptionPlacementReservations(value: unknown): Array<{
  x: number;
  y: number;
  width: number;
  height: number;
  reason?: string;
  strength?: number;
}> | undefined {
  if (!isObjectRecord(value) || !Array.isArray(value.regions)) return undefined;
  const regions = value.regions.flatMap((item) => {
    if (!isObjectRecord(item)) return [];
    const x = readFiniteNumber(item.x);
    const y = readFiniteNumber(item.y);
    const width = readFiniteNumber(item.width);
    const height = readFiniteNumber(item.height);
    if (x === undefined || y === undefined || width === undefined || height === undefined) return [];
    return [{
      x,
      y,
      width,
      height,
      ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
      ...(readFiniteNumber(item.strength) !== undefined ? { strength: readFiniteNumber(item.strength) } : {}),
    }];
  });
  return regions.length > 0 ? regions : undefined;
}

function mergePlacementAdjustment(
  base: OverlayPlacementAdjustment | undefined,
  atomic: OverlayPlacementAdjustment | undefined,
): OverlayPlacementAdjustment | undefined {
  if (!base) return atomic;
  if (!atomic) return base;
  return {
    candidateRegion: atomic.candidateRegion ?? base.candidateRegion,
    multiplier: atomic.multiplier !== undefined && atomic.multiplier !== 1
      ? atomic.multiplier
      : base.multiplier,
    penalty: Math.max(base.penalty ?? 0, atomic.penalty ?? 0),
    bonus: Math.max(base.bonus ?? 0, atomic.bonus ?? 0),
    avoidHits: mergeStringList(base.avoidHits, atomic.avoidHits),
    preferHits: mergeStringList(base.preferHits, atomic.preferHits),
    constraints: mergeStringList(base.constraints, atomic.constraints),
  };
}

function mergeStringList(
  base: string[] | undefined,
  atomic: string[] | undefined,
): string[] | undefined {
  const merged = [...(base ?? []), ...(atomic ?? [])].filter((value, index, array) => array.indexOf(value) === index);
  return merged.length > 0 ? merged : undefined;
}

function isPointPosition(value: unknown): value is { x?: number; y?: number } {
  return isObjectRecord(value);
}

function applyPlacementRegionGeometry(
  region: OverlayPlacementRegion | undefined,
  geometry: OverlayGeometry,
  canvas: { width: number; height: number },
  safeMargin: number,
): OverlayGeometry {
  if (!region || region === 'full-frame') return geometry;

  const verticalMargin = canvas.height * 0.05;
  const width = Math.min(Math.max(geometry.width, 120), canvas.width - safeMargin * 2);
  const height = Math.min(Math.max(geometry.height, 48), canvas.height - verticalMargin * 2);
  const [, horizontal] = region.split('-');
  const vertical = region.startsWith('top-') ? 'top' : region.startsWith('bottom-') ? 'bottom' : 'middle';

  const left = horizontal === 'left'
    ? safeMargin
    : horizontal === 'right'
      ? canvas.width - width - safeMargin
      : (canvas.width - width) / 2;
  const top = vertical === 'top'
    ? verticalMargin
    : vertical === 'bottom'
      ? canvas.height - height - verticalMargin
      : (canvas.height - height) / 2;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function hasRenderableGraphicContent(params: Record<string, unknown>): boolean {
  const renderableKeys = [
    'text',
    'keyword',
    'title',
    'body',
    'value',
    'name',
    'quote',
    'from',
    'to',
    'logo',
    'avatar',
    'mediaUrl',
    'imageUrl',
    'line', // P3.5 narrative beat: the verbatim spoken words (designer-licensed; see narrative discipline below)
  ];

  if (renderableKeys.some((key) => hasNonEmptyValue(params[key]))) return true;
  return ['items', 'values', 'labels'].some((key) => hasNonEmptyValue(params[key]));
}

function hasStandaloneGraphicStructure(params: Record<string, unknown>): boolean {
  // Transcript context is supporting evidence, not standalone MG structure.
  // A keyword plus nearby transcript words belongs in captions unless another
  // atom gives it actual graphic form: scalar, identity, quote, relation, etc.
  if (hasNonEmptyValue(params.value)) return true;
  if (hasNonEmptyValue(params.name)) return true;
  if (hasNonEmptyValue(params.quote)) return true;
  if (hasNonEmptyValue(params.logo) || hasNonEmptyValue(params.avatar) || hasNonEmptyValue(params.mediaUrl) || hasNonEmptyValue(params.imageUrl)) return true;
  if (hasNonEmptyValue(params.from) && hasNonEmptyValue(params.to)) return true;
  if (hasNonEmptyValue(params.values)) return true;
  if (hasNonEmptyValue(params.title) && (hasNonEmptyValue(params.body) || hasNonEmptyValue(params.items))) return true;
  return false;
}

function hasNonEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function isKeywordGraphicIntent(decision: EditDecision, graphicType: string): boolean {
  return graphicType === 'keyword-highlight'
    || decision.params.creativeDecisionType === 'graphic_keyword_highlight';
}

function graphicTypeFromCreativeDecisionType(value: unknown): string | undefined {
  switch (value) {
    case 'graphic_stat_counter':
      return 'stat-counter';
    case 'graphic_lower_third':
      return 'lower-third';
    case 'graphic_quote_card':
      return 'quote-card';
    case 'graphic_logo_reveal':
      return 'logo-reveal';
    case 'graphic_callout':
      return 'callout';
    case 'graphic_keyword_highlight':
      return 'keyword-highlight';
    default:
      return undefined;
  }
}

function resolveGraphicDwellFrames(
  baseDurationFrames: number,
  params: Record<string, unknown>,
  content: Record<string, unknown>,
): number {
  const base = Math.max(30, Math.round(baseDurationFrames || 90));
  const isScalarStat = content.value != null && !Array.isArray(content.values);
  const maxDwell = isScalarStat ? Math.min(base, 72) : base;
  const words = readableGraphicWords(content);
  const readFrames = words > 0
    ? Math.max(36, Math.min(maxDwell, Math.round(12 + words * 10)))
    : maxDwell;
  const startMs = readNumber(params, 'targetWordStartMs');
  const endMs = readNumber(params, 'targetWordEndMs');

  if (startMs != null && endMs != null && endMs > startMs) {
    const wordFrames = Math.round(((endMs - startMs) / 1000) * DEFAULT_CONFIG.timing.fps);
    return Math.max(36, Math.min(maxDwell, Math.max(readFrames, wordFrames + 24)));
  }

  return readFrames;
}

function readableGraphicWords(content: Record<string, unknown>): number {
  const text = [
    content.value,
    content.label,
    content.title,
    content.body,
    content.quote,
    content.name,
    content.text,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ')
    .trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function isGraphicOverlayForDedupe(overlay: Overlay): boolean {
  return overlay.type === OverlayType.MG_SEQUENCE
    || overlay.type === 'html-scene'
    || overlay.type === 'motion-graphic'
    || (overlay as any).type === 'sticker';
}

function graphicDedupeKeyFromOverlay(overlay: Overlay): string {
  const metadata = (overlay as any).metadata || {};
  const content = ((overlay as any).content && typeof (overlay as any).content === 'object')
    ? (overlay as any).content as Record<string, unknown>
    : {};
  return graphicDedupeKeyFromContent(
    metadata.graphicType ?? metadata.creativeDecisionType ?? (overlay as any).graphicType ?? overlay.type,
    content,
    metadata,
  );
}

function graphicDedupeKeyFromContent(
  graphicType: unknown,
  content: Record<string, unknown>,
  params: Record<string, unknown> = {},
): string {
  const semanticAtoms = recordValue(params.semanticAtoms) ?? recordValue(content.semanticAtoms);
  const quantity = recordValue(semanticAtoms?.quantity);
  const textAtom = recordValue(semanticAtoms?.text);
  const identity = recordValue(semanticAtoms?.identity);
  const quote = recordValue(semanticAtoms?.quote);
  const relation = recordValue(semanticAtoms?.relation);
  const kind = normalizeGraphicDedupeToken(params.creativeDecisionType ?? params.graphicType ?? graphicType ?? 'graphic');
  const body = [
    quantity?.displayText,
    quantity?.label,
    textAtom?.primary,
    textAtom?.keyword,
    semanticAtoms?.concept,
    semanticAtoms?.claim,
    semanticAtoms?.evidencePhrase,
    identity?.name,
    identity?.role,
    quote?.text,
    relation?.from,
    relation?.to,
    content.value,
    content.label,
    content.title,
    content.body,
    content.name,
    content.text,
    content.quote,
    params.value,
    params.label,
    params.title,
    params.body,
    params.name,
    params.text,
    params.quote,
  ]
    .map(normalizeGraphicDedupeToken)
    .filter(Boolean)
    .join('|');
  return `${kind}:${body || 'unknown'}`;
}

function recordValue(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function normalizeGraphicDedupeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

interface MgCodegenDecisionOutcome {
  status: 'queued' | 'generated' | 'declined' | 'fallback';
  frame: number;
  candidateId: string;
  factKind: string;
  reason?: string;
  jobId?: string;
  messageId?: string | null;
  assetId?: string;
  sequenceId?: string;
  receipt?: MgReceipt;
}

// Exported for the narrative beat producer gate (director-agent) — ONE definition of the flag semantics.
export function isLiveMgCodegenEnabled(): boolean {
  const override = process.env.MG_CODEGEN_ENABLED?.trim().toLowerCase();
  if (override === 'false' || override === '0') return false;
  if (override === 'true' || override === '1') return true;
  // OFF by default until the commit-pinned Sandbox snapshot and callback secret are deployed and smoke-tested.
  // When explicitly enabled, applyGraphic sends only MgMomentInput to the isolated worker. Next.js never imports
  // the Remotion compiler/Chromium runtime, and decline/failure never falls through to a legacy card.
  return false;
}

function localMgAnchor(frame: unknown, startFrame: number, durationInFrames: number): number | undefined {
  if (typeof frame !== 'number' || !Number.isFinite(frame)) return undefined;
  const rounded = Math.round(frame);
  if (rounded >= startFrame && rounded < startFrame + durationInFrames) return rounded - startFrame;
  if (rounded >= 0 && rounded < durationInFrames) return rounded;
  return undefined;
}

function buildMgCodegenAnchors(
  decision: EditDecision,
  startFrame: number,
  durationInFrames: number,
  signalCurves?: { curves: SignalCurves },
): MgAnchors | undefined {
  const params = decision.params ?? {};
  const directWords = Array.isArray(params.wordFrames)
    ? params.wordFrames
    : Array.isArray(params.wordAnchorFrames)
      ? params.wordAnchorFrames
      : [];
  const wordFrames = [...new Set(directWords
    .map((frame: unknown) => localMgAnchor(frame, startFrame, durationInFrames))
    .filter((frame: number | undefined): frame is number => frame !== undefined))]
    .sort((a, b) => a - b)
    .slice(0, 32);

  const beatCurve = signalCurves?.curves.music_beat ?? signalCurves?.curves.beat_level;
  const beatFrames: number[] = [];
  if (Array.isArray(beatCurve)) {
    for (let frame = 0; frame < beatCurve.length && beatFrames.length < 24; frame += 1) {
      if ((beatCurve[frame] ?? 0) >= 0.5 && (beatFrames.length === 0 || frame - beatFrames[beatFrames.length - 1] >= 3)) {
        beatFrames.push(frame);
      }
    }
  }

  const directLanding = [
    params.mgLandingFrame,
    params.landingFrame,
    params.beatFrame,
    params.targetBeatFrame,
  ].map((frame) => localMgAnchor(frame, startFrame, durationInFrames)).find((frame) => frame !== undefined);
  const onset = signalCurves?.curves.onset;
  let strongestOnset: number | undefined;
  if (directLanding === undefined && Array.isArray(onset) && onset.length > 0) {
    let strength = 0;
    onset.forEach((value, frame) => {
      if (typeof value === 'number' && value > strength) {
        strength = value;
        strongestOnset = frame;
      }
    });
  }

  const anchors: MgAnchors = {};
  if (wordFrames.length) anchors.wordFrames = wordFrames;
  if (beatFrames.length) anchors.beatFrames = beatFrames;
  if (directLanding !== undefined || strongestOnset !== undefined) {
    anchors.landingFrame = directLanding ?? strongestOnset;
  }
  return Object.keys(anchors).length > 0 ? anchors : undefined;
}

function mgCodegenNotes(decision: EditDecision): string | undefined {
  const notes = [decision.params?.notes, decision.params?.editorialNotes, decision.reason]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return notes.length ? notes.join(' | ').slice(0, 400) : undefined;
}

function uniformMgDesignAuthority(
  decisions: Iterable<EditDecision>,
  disposition: Exclude<MgDesignPrepassDisposition, { status: 'approved' }>,
): MgDesignPrepassResult<EditDecision> {
  const dispositions = new Map<EditDecision, MgDesignPrepassDisposition>();
  for (const decision of decisions) dispositions.set(decision, { ...disposition });
  return { dispositions, attempts: 0, reason: disposition.reason };
}

/**
 * P5-1 Phase C 2/2 — the video-level DESIGN pre-pass. Runs ONCE before the decision loop (dark until
 * isLiveMgCodegenEnabled). For every graphic decision it derives the DESIGNER's view of the moment — reusing the
 * SAME pure derivation applyGraphic runs (content normalize → ledger gate → candidate select → expression
 * authority → placement; none of it touches overlay state) — then runs one design session and returns the approved
 * per-moment designs keyed by their DECISION (by reference), so applyGraphic can render each via the coder prompt.
 *
 * DUPLICATION IS DELIBERATE (R33 over R3 here): the derivation mirrors applyGraphic's pure prefix rather than
 * refactoring that live path. A mismatched beat is rejected at execution because only an approved disposition
 * licenses codegen; the render still uses applyGraphic's independently resolved moment input.
 */
async function runMgDesignPrepass(
  decisions: EditDecision[],
  overlays: Overlay[],
  projectSignalContext: EDLSignalContext,
  graphicsDensity: 'heavy' | 'moderate' | 'minimal' | undefined,
  canvas: { width: number; height: number },
  options: {
    shadowTarget?: { projectId: string; userId: string };
    onTasteContractShadow?: (result: TasteContractBuildResult) => void;
  } = {},
): Promise<MgDesignPrepassResult<EditDecision>> {
  const { brandToKit } = await import('@/lib/editron/motion-graphics/codegen/brand-mapper');
  const mappedBrand = brandToKit(projectSignalContext.codegenBrand);
  if (projectSignalContext.hasConfiguredBrand && mappedBrand.isDefault) {
    return uniformMgDesignAuthority(
      decisions.filter((decision) => decision.type === 'graphic'),
      { status: 'unavailable', reason: 'configured brand could not be mapped for MG design' },
    );
  }

  const fps = DEFAULT_CONFIG.timing.fps;
  const beats: MgDesignPrepassBeat<EditDecision>[] = [];
  let numericEvidenceCount = 0;
  let beatIndex = 0;

  for (const decision of decisions) {
    if (decision.type !== 'graphic') continue; // late caption-emphasis promotion is forbidden while live codegen owns MGs

    // ── mirror applyGraphic's PURE derivation prefix (decision-only; no overlay/loop-state dependency) ──
    const requestedPlacementAdjustment = readPlacementAdjustment(decision.params.placementAdjustment);
    const requestedPlacementRegion = requestedPlacementAdjustment?.candidateRegion ?? normalizePlacementRegion(decision.params.position);
    const atomicPlacement = resolveAtomicPlacement({
      family: 'graphic',
      momentBundle: decisionMomentBundle(decision),
      signals: decisionSignals(decision),
      requestedRegion: requestedPlacementRegion,
      protectedRegions: readCaptionPlacementReservations(decision.params.captionPlacementReservations),
    });
    const placementRegion = atomicPlacement.candidateRegion ?? requestedPlacementRegion;
    const {
      brand: _b, signals: _s, mgOverlayScores: _m, graphicType: _g, creativeDecisionType: _c,
      placementAdjustment: _p, position: _pos, ...contentParams
    } = decision.params;
    const signalSalience = contentSalienceFromDecisionSignals(decision);
    if (contentParams.salience == null && signalSalience != null) contentParams.salience = signalSalience;
    const normalized = normalizeMotionGraphicContent(contentParams);
    const contentMap = normalized.content;
    if (!hasRenderableGraphicContent(contentMap)) continue;
    if (!resolveSemanticMgLedgerGate(normalized.semanticMgCandidateLedger).allow) continue;
    const selected = selectSemanticMgCandidate(normalized.semanticMgCandidateLedger).selectedCandidate;
    if (!selected) continue;
    const authority = resolveMgExpressionAuthority({
      content: contentMap,
      structure: normalized.structure,
      semanticAtoms: normalized.semanticAtoms,
      signals: buildMotionGraphicSignalSnapshot(decision),
      momentBundle: decisionMomentBundle(decision),
      placementRegion,
      graphicsDensity,
      semanticCandidate: selected,
    });
    // P3.5: authority is a DATA-relevance gate — it cannot judge a factless beat. Narrative beats are always
    // OFFERED to the designer, whose approved plan (within the density budget) is their only render license.
    if (!authority.allowMotionGraphic && selected.factKind !== 'narrative') continue;

    // ── the designer's VIEW of the moment (design INPUT only; applyGraphic re-resolves the real render window) ──
    const contentProps = listMgRenderableDataProps(selected);
    const numericProps = contentProps.filter(({ kind }) => kind === 'number').map(({ name }) => name);
    if (numericProps.length > 0) numericEvidenceCount += 1;
    const momentId = `beat-${beatIndex++}`;
    const tier: MgDesignerMoment['tier'] = authority.qualityTier === 'suppressed' ? 'subtle' : authority.qualityTier;
    const sourceText = String(
      selected.sourceSpan?.text ?? contentMap.text ?? contentMap.keyword ?? contentMap.title ?? '',
    ).trim();
    const salience = typeof selected.salience === 'number' ? selected.salience : (authority.relevanceScore ?? 0.5);
    const durationFrames = typeof decision.durationFrames === 'number' && decision.durationFrames > 0 ? decision.durationFrames : 90;

    // P5-2(b): the real V-JEPA subject box for this beat (project-level segments — the pre-pass is pre-enrichment,
    // so read the raw segment directly) → the designer designs clear of the ACTUAL subject. Best-effort: no segment
    // → the `room` prose steers alone. Same box the seam feeds the coder/judge, so all three agree on the subject.
    const beatFrameRef = resolveSourceFrame(decision.frame, overlays);
    const beatVjepa = projectSignalContext.vjepaSegments
      ? findTimeSegment(projectSignalContext.vjepaSegments, (beatFrameRef.sourceFrame / fps) * 1000)
      : undefined;
    const bsx = beatVjepa ? readNumber(beatVjepa, 'mainSubjectX', 'main_subject_x', 'subjectX', 'subject_x') : undefined;
    const bsy = beatVjepa ? readNumber(beatVjepa, 'mainSubjectY', 'main_subject_y', 'subjectY', 'subject_y') : undefined;
    const bsw = beatVjepa ? readNumber(beatVjepa, 'mainSubjectWidth', 'main_subject_width', 'subjectWidth', 'subject_width') : undefined;
    const bsh = beatVjepa ? readNumber(beatVjepa, 'mainSubjectHeight', 'main_subject_height', 'subjectHeight', 'subject_height') : undefined;
    const beatSubjectBox = bsx != null && bsy != null && bsw != null && bsh != null && bsw > 0 && bsh > 0
      ? { x: clamp01(bsx), y: clamp01(bsy), width: clamp01(bsw), height: clamp01(bsh) }
      : undefined;

    beats.push({
      key: decision,
      moment: { momentId, factKind: selected.factKind, sourceText, contentProps, tier, salience, room: `${placementRegion ?? 'an open area'} — clear of the subject and captions`, durationFrames, subjectBox: beatSubjectBox },
      context: { momentId, factKind: selected.factKind, contentProps: contentProps.map((p) => p.name), numericProps, startMs: Math.max(0, (decision.frame / fps) * 1000) },
    });
  }

  if (beats.length === 0) {
    return { dispositions: new Map(), attempts: 0, reason: 'no licensed graphic beats reached the MG designer' };
  }

  const durationSec = Math.max(1, overlays.reduce((max, o) => Math.max(max, o.from + o.durationInFrames), 0) / fps);
  const budget = computeMgDensityBudget({
    durationSec,
    beatCount: beats.length,
    numericEvidenceCount,
    brandMotionEnergy: mappedBrand.brand.motion.energy,
    preference: projectSignalContext.motionGraphicsPref,
  });
  // Phase 2 (brief cycle-1 #3): VideoTasteContract in SHADOW — flag-gated, non-fatal, never changes live behavior.
  if (options.shadowTarget) {
    const { maybePersistTasteContractShadow } = await import('@/lib/editron/motion-graphics/codegen/taste/shadow');
    const shadow = await maybePersistTasteContractShadow(options.shadowTarget.projectId, options.shadowTarget.userId, {
      brand: mappedBrand.isDefault ? null : mappedBrand.brand,
      hasConfiguredBrand: projectSignalContext.hasConfiguredBrand,
      intent: projectSignalContext.intent,
      videoSignals: projectSignalContext.videoSignals,
    }).catch(() => undefined);
    if (shadow) options.onTasteContractShadow?.(shadow.result);
  }
  if (budget.maxMoments === 0) {
    return uniformMgDesignAuthority(
      beats.map((beat) => beat.key),
      { status: 'declined', reason: 'motion-graphics preference or density policy licensed zero moments' },
    );
  }

  let generate: ReturnType<typeof defaultGeminiDesignerGenerate>;
  try {
    generate = defaultGeminiDesignerGenerate();
  } catch (keyErr) {
    const reason = `designer model unavailable: ${keyErr instanceof Error ? keyErr.message : keyErr}`;
    console.error(`[EDL-MG-Design] ${reason}; live MGs fail closed`);
    return uniformMgDesignAuthority(beats.map((beat) => beat.key), { status: 'unavailable', reason });
  }

  const videoStyle = resolveVideoStyle({
    brandFont: mappedBrand.brand.fontSans,
    intent: projectSignalContext.intent,
    videoSignals: projectSignalContext.videoSignals,
  });

  // Phase 4a: when live taste contracts are enabled, resolve the video-level art direction and let it DIRECT the
  // designer (art-director mode). Otherwise behavior is unchanged (the contract stays shadow-generated only).
  const tasteContract = tasteContractLiveEnabled()
    ? buildVideoTasteContract({
        brand: mappedBrand.isDefault ? null : mappedBrand.brand,
        hasConfiguredBrand: projectSignalContext.hasConfiguredBrand,
        intent: projectSignalContext.intent,
        videoSignals: projectSignalContext.videoSignals,
      }).contract
    : undefined;
  // Phase 4b: expose the compact art direction to the judge on every rendered moment (edl-executor forwards it).
  projectSignalContext.tasteContractForJudge = tasteContract
    ? { hash: tasteContract.contractHash, direction: formatTasteContractForPrompt(tasteContract) }
    : undefined;

  // P5-1 Phase D: sample a few real footage frames across the video so the designer designs for the ACTUAL palette
  // and negative space (buildDesignerParts.footageFrames). Best-effort — any failure → a valid text-only session.
  let images: { footageFrames: Array<{ mimeType: string; data: string }> } | undefined;
  try {
    const { captureMgDesignerFootageFrames } = await import('@/lib/editron/motion-graphics/codegen/visual-evidence');
    const footageFrames = await captureMgDesignerFootageFrames({ overlays, canvas, fps, count: 4 });
    if (footageFrames.length > 0) images = { footageFrames };
  } catch (frameErr) {
    console.warn(`[EDL-MG-Design] footage frame capture failed (non-fatal, text-only design): ${frameErr instanceof Error ? frameErr.message : frameErr}`);
  }

  const result = await runDesignPrepass(
    { beats, intent: projectSignalContext.intent, videoStyle, brand: mappedBrand.brand, budget, images, tasteContract },
    { generate },
  );
  const approvedCount = [...result.dispositions.values()].filter((entry) => entry.status === 'approved').length;
  const declinedCount = [...result.dispositions.values()].filter((entry) => entry.status === 'declined').length;
  const unavailableCount = [...result.dispositions.values()].filter((entry) => entry.status === 'unavailable').length;
  console.log(`[EDL-MG-Design] pre-pass: ${beats.length} beats offered, budget ${budget.maxMoments}, approved=${approvedCount}, declined=${declinedCount}, unavailable=${unavailableCount}${result.reason ? ` (session: ${result.reason})` : ''}`);
  return result;
}

async function applyGraphic(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  projectEvidence: EdlProjectEvidenceV1,
  idEpoch: number = 0,
  decisionIndex: number = 0,
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal',
  analyses?: Map<string, any>,
  projectSignalContext: EDLSignalContext = {},
): Promise<{ created: number; modified: number } | null> {
  const { position } = decision.params;
  const requestedPlacementAdjustment = readPlacementAdjustment(decision.params.placementAdjustment);
  const requestedPlacementRegion = requestedPlacementAdjustment?.candidateRegion ?? normalizePlacementRegion(position);
  const atomicPlacement = resolveAtomicPlacement({
    family: 'graphic',
    momentBundle: decisionMomentBundle(decision),
    signals: decisionSignals(decision),
    requestedRegion: requestedPlacementRegion,
    protectedRegions: readCaptionPlacementReservations(decision.params.captionPlacementReservations),
  });
  const placementRegion = atomicPlacement.candidateRegion ?? requestedPlacementRegion;
  const placementAdjustment = mergePlacementAdjustment(requestedPlacementAdjustment, atomicPlacement.placementAdjustment);
  // Extract graphicType from params (signal executor) or technique (creative brief).
  // Creative brief outputs technique like 'graphic_stat_counter' — convert to 'stat-counter'
  // which matches the switch cases and GRAPHIC_DURATIONS keys.
  const graphicType = typeof decision.params.graphicType === 'string'
    ? decision.params.graphicType
    : 'atomic-graphic';
  const {
    brand: _brandTokensForContent,
    signals: _signalsForContent,
    mgOverlayScores: _mgOverlayScoresForContent,
    graphicType: _graphicTypeForContent,
    creativeDecisionType: _creativeDecisionTypeForContent,
    placementAdjustment: _placementAdjustmentForContent,
    position: _positionForContent,
    ...contentParamsForNormalization
  } = decision.params;
  const signalSalience = contentSalienceFromDecisionSignals(decision);
  if (contentParamsForNormalization.salience == null && signalSalience != null) {
    contentParamsForNormalization.salience = signalSalience;
  }
  const normalizedGraphicContent = normalizeMotionGraphicContent(contentParamsForNormalization);
  const contentMap = normalizedGraphicContent.content;
  const text = String(
    contentMap.text
      ?? contentMap.keyword
      ?? contentMap.title
      ?? contentMap.value
      ?? '',
  ).trim();

  if (!hasRenderableGraphicContent(contentMap)) return null;
  if (isKeywordGraphicIntent(decision, graphicType) && !hasStandaloneGraphicStructure(contentMap)) {
    console.log(`[EDL-Exec] KEYWORD FILTER: skipped standalone keyword MG "${text}" - captions should carry naked word emphasis`);
    return null;
  }

  // ── RC-8 FIX: Filler/vague word filter for keyword-highlights ──
  // A professional editor would NEVER highlight "good", "stuff", "thing".
  // ⚠️ INVENTED banned list — needs calibration against real video transcripts.
  if (isKeywordGraphicIntent(decision, graphicType) && text) {
    const BANNED_KEYWORDS = new Set([
      'good', 'bad', 'thing', 'things', 'stuff', 'like', 'really', 'very',
      'just', 'actually', 'basically', 'literally', 'pretty', 'kind', 'sort',
      'maybe', 'probably', 'definitely', 'something', 'anything', 'everything',
      'nothing', 'well', 'right', 'ok', 'okay', 'yeah', 'yes', 'no', 'so',
      'um', 'uh', 'here', 'there', 'this', 'that', 'it', 'the', 'a', 'an',
      'and', 'or', 'but', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by',
    ]);
    const normalizedText = String(text).toLowerCase().trim();
    if (BANNED_KEYWORDS.has(normalizedText) || normalizedText.length < 3) {
      console.log(`[EDL-Exec] KEYWORD FILTER: skipped "${text}" — filler/vague word or too short`);
      return null;
    }
  }

  // ── RC-6 FIX: Name hallucination guard for lower-thirds ──
  // Gemini sometimes invents names not in the transcript (e.g., "John Smith" for Hank Green).
  // Runtime guard: reject obviously hallucinated placeholder names.
  // Full transcript validation requires plumbing transcription data — deferred to signal expansion.
  // ⚠️ INVENTED placeholder list — covers most common Gemini defaults.
  if (graphicType === 'lower-third' && contentMap.name) {
    const HALLUCINATION_NAMES = new Set([
      'john smith', 'jane doe', 'john doe', 'speaker', 'host', 'guest',
      'presenter', 'narrator', 'interviewer', 'interviewee', 'person',
      'man', 'woman', 'unknown', 'name', 'first last',
    ]);
    const normalizedName = String(contentMap.name).toLowerCase().trim();
    if (HALLUCINATION_NAMES.has(normalizedName) || normalizedName.length < 2) {
      console.log(`[EDL-Exec] HALLUCINATION GUARD: skipped lower-third for "${contentMap.name}" — likely hallucinated placeholder`);
      return null;
    }
  }

  // DEDUP: block the same graphic fact near the same frame, not every nearby graphic.
  // A stat-counter and a lower-third can coexist; two copies of the same stat cannot.
  const currentGraphicKey = graphicDedupeKeyFromContent(graphicType, contentMap, decision.params);
  const existingGraphic = overlays.find(o =>
    isGraphicOverlayForDedupe(o)
    && Math.abs(o.from - decision.frame) <= 15
    && (o.type === OverlayType.MG_SEQUENCE || graphicDedupeKeyFromOverlay(o) === currentGraphicKey)
  );
  if (existingGraphic) {
    console.log(`[EDL-Exec] Graphic at frame ${decision.frame}: SKIPPED — duplicate ${currentGraphicKey} at frame ${existingGraphic.from}`);
    return null;
  }

  const semanticMgLedgerGate = resolveSemanticMgLedgerGate(normalizedGraphicContent.semanticMgCandidateLedger);
  if (!semanticMgLedgerGate.allow) {
    console.log(
      `[EDL-Exec] Graphic '${graphicType}' at frame ${decision.frame}: SKIPPED by semantic MG ledger gate - ` +
      semanticMgLedgerGate.reasons.join(', '),
    );
    return null;
  }
  const semanticMgCandidateSelection = selectSemanticMgCandidate(normalizedGraphicContent.semanticMgCandidateLedger);

  // ── P3.5 narrative discipline ──────────────────────────────────────────────────────────────────────────
  // Every live MG has exactly one render license: the designer's approved plan from the video-level pre-pass.
  // A decline, unavailable session, or unoffered moment must never become free-form output or a legacy card.
  const selectedSemanticCandidate = semanticMgCandidateSelection.selectedCandidate;
  const narrativeBeat = selectedSemanticCandidate?.factKind === 'narrative';
  const designDisposition = projectSignalContext.mgDesignAuthority?.dispositions.get(decision);
  const approvedDesign = designDisposition?.status === 'approved' ? designDisposition.design : undefined;
  if (isLiveMgCodegenEnabled() && selectedSemanticCandidate && !approvedDesign) {
    const reason = designDisposition?.status === 'declined' || designDisposition?.status === 'unavailable'
      ? `video-level designer ${designDisposition.status}: ${designDisposition.reason}`
      : projectSignalContext.mgDesignAuthority?.reason
        ? `video-level designer unavailable: ${projectSignalContext.mgDesignAuthority.reason}`
        : 'moment was not offered to the video-level MG designer';
    const outcome: MgCodegenDecisionOutcome = {
      frame: decision.frame,
      candidateId: selectedSemanticCandidate.id,
      factKind: selectedSemanticCandidate.factKind,
      status: designDisposition?.status === 'declined' ? 'declined' : 'fallback',
      reason,
    };
    decision.params.mgCodegenOutcome = outcome;
    console.error(`[EDL-MG-Codegen] ${outcome.status.toUpperCase()} ${outcome.candidateId} @${decision.frame}: ${reason}; no free-form fallback`);
    return null;
  }
  if (narrativeBeat && !isLiveMgCodegenEnabled()) {
    console.log(
      `[EDL-MG] Narrative beat at frame ${decision.frame}: SKIPPED — ` +
      'MG codegen disabled' +
      '; narrative renders ONLY via a designer-approved plan (P3.5), never free-form',
    );
    return null;
  }

  // Type-specific durations (CRG-verified at 30fps)
  const GRAPHIC_DURATIONS: Record<string, number> = {
    'stat-counter': 102,      // 3.4s ← constant:animation.stat_counter midpoint (2.2-3.8s)
    'lower-third': 141,       // 4.7s ← constant:animation.lower_third midpoint (3.5-5.9s)
    'quote-card': 120,        // 4.0s ← constant:animation.quote_card (3.6-6.0s)
    'logo-reveal': 120,       // 4.0s ← between constant:animation.logo_intro (1.0-2.3s) and logo_outro (2.1-4.6s)
    'callout': 75,            // 2.5s ← no CRG constant, kept as-is
  };
  // keyword-highlight: duration from signal-computed graphicsDensity (CRG range 1.85-3.0s = 55-90 frames)
  // High density = many MGs = shorter each. Low density = few MGs = longer each.
  // graphicsDensity comes from genre-parameter-computer (entity_rate + formality).
  const KW_DURATION: Record<string, number> = { minimal: 90, moderate: 72, heavy: 55 };
  GRAPHIC_DURATIONS['keyword-highlight'] = KW_DURATION[graphicsDensity || 'moderate'] || 72;
  const durationGraphicType = graphicTypeFromCreativeDecisionType(decision.params.creativeDecisionType);
  let duration = decision.durationFrames
    || GRAPHIC_DURATIONS[graphicType]
    || (durationGraphicType ? GRAPHIC_DURATIONS[durationGraphicType] : undefined)
    || 90;

  // ── COMPOSITION ENGINE PATH ──
  // All EDL graphics route through planComposition → MOTION_GRAPHIC (Remotion).
  // The old inline/template branch was removed so there is a single visual owner.
  {
    const rawSignals = buildMotionGraphicSignalSnapshot(decision);
    const tokens = resolveMotionTokens(
      rawSignals,
      decision.params.brand || {},
      decision.params.brandMotionOverrides as DeepPartial<MotionTokens> | undefined,
    );

    let mgScores: MgOverlayScores | undefined = decision.params.mgOverlayScores as MgOverlayScores | undefined;
    if (!mgScores && rawSignals && Object.keys(rawSignals).length > 0) {
      try {
        const { scoreAllOverlays } = await import('@/lib/editron/engine/utility-scorer');
        const { getOverlayDefinitions } = await import('@/lib/editron/engine/overlay-definitions-loader');
        const allMgDefs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
        if (allMgDefs.length > 0) {
          const SELECTION_IDS = new Set([
            'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
            'mg.animation.entrance_blur', 'mg.animation.entrance_scale',
            'mg.animation.entrance_rotate', 'mg.animation.entrance_skew', 'mg.animation.entrance_zoom_blur',
            'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float',
            'mg.animation.hold_glow',
          ]);
          const propDefs = allMgDefs.filter(d => !SELECTION_IDS.has(d.id));
          const selDefs = allMgDefs.filter(d => SELECTION_IDS.has(d.id));
          const scoringSignals = buildUtilitySignalSnapshot(rawSignals);
          const propResults = scoreAllOverlays(propDefs, scoringSignals, 'additive');
          const selResults = scoreAllOverlays(selDefs, scoringSignals, 'multiplicative');
          mgScores = {};
          for (const r of [...propResults, ...selResults]) {
            mgScores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
          }
        }
      } catch (mgErr: unknown) {
        console.warn(`[EDL] MG overlay scoring failed (non-fatal): ${mgErr instanceof Error ? mgErr.message : 'unknown'}`);
      }
    }

    const mgExpressionAuthority = resolveMgExpressionAuthority({
      content: contentMap,
      structure: normalizedGraphicContent.structure,
      semanticAtoms: normalizedGraphicContent.semanticAtoms,
      signals: rawSignals,
      momentBundle: decisionMomentBundle(decision),
      placementRegion,
      graphicsDensity,
      ...(semanticMgCandidateSelection.selectedCandidate
        ? { semanticCandidate: semanticMgCandidateSelection.selectedCandidate }
        : {}),
    });
    // P3.5: authority is a DATA-relevance gate; a narrative beat that reaches here carries a designer-approved
    // plan (the discipline check above) — the designer's license stands, authority still shapes duration/scores.
    if (!mgExpressionAuthority.allowMotionGraphic && !narrativeBeat) {
      console.log(
        `[EDL-Exec] Graphic '${graphicType}' at frame ${decision.frame}: SKIPPED by MG expression authority - ` +
        mgExpressionAuthority.reasons.join(', '),
      );
      return null;
    }
    mgScores = applyMgExpressionAuthorityToScores(mgScores, mgExpressionAuthority);
    const snappedFrame = findClipAtFrame(decision.frame, overlays, 20)?.snappedFrame ?? decision.frame;
    const baseCompositionDuration = resolveGraphicDwellFrames(duration, decision.params, contentMap);
    const compositionDuration = Math.max(
      mgExpressionAuthority.duration.minFrames,
      Math.min(
        mgExpressionAuthority.duration.maxFrames,
        Math.round(baseCompositionDuration * mgExpressionAuthority.duration.multiplier),
      ),
    );
    const signalCurves = buildMotionGraphicSignalCurves(
      decision,
      overlays,
      snappedFrame,
      compositionDuration,
      rawSignals,
      analyses,
      projectSignalContext,
    );

    if (isLiveMgCodegenEnabled()) {
      const selectedCandidate = semanticMgCandidateSelection.selectedCandidate;
      const outcomeBase = {
        frame: snappedFrame,
        candidateId: selectedCandidate?.id ?? 'none',
        factKind: selectedCandidate?.factKind ?? 'none',
      };
      const rejectCodegenMoment = (
        status: 'declined' | 'fallback',
        reason: string,
        receipt?: MgReceipt,
      ): null => {
        const outcome: MgCodegenDecisionOutcome = { ...outcomeBase, status, reason, ...(receipt ? { receipt } : {}) };
        decision.params.mgCodegenOutcome = outcome;
        console.error(`[EDL-MG-Codegen] ${status.toUpperCase()} ${outcome.candidateId} @${snappedFrame}: ${reason}`);
        return null;
      };

      if (!selectedCandidate) {
        return rejectCodegenMoment('declined', 'No licensed semantic candidate survived the MG ledger');
      }

      try {
        const [
          { brandToKit },
          { buildMgMomentInput },
          { captureMgVisualEvidence },
          { enqueueDurableMgRenderJob, resolveMgRenderAppCommit },
        ] = await Promise.all([
          import('@/lib/editron/motion-graphics/codegen/brand-mapper'),
          import('@/lib/editron/motion-graphics/codegen/moment-input'),
          import('@/lib/editron/motion-graphics/codegen/visual-evidence'),
          import('@/lib/editron/motion-graphics/codegen/mg-render-job-runner'),
        ]);
        const mappedBrand = brandToKit(projectSignalContext.codegenBrand);
        if (projectSignalContext.hasConfiguredBrand && mappedBrand.isDefault) {
          return rejectCodegenMoment('fallback', 'Configured brand could not be mapped to the MG kit');
        }
        // Resolved liveness (brand×video×user) — deterministic, identical across this video's moments; becomes
        // the reserved data.motionIntensity the coder binds for every hold/entrance (P5-1 Phase B: the producer
        // for the Phase-A socket). videoEnergy = the video's real aggregate (V-JEPA motion ⊕ audio emotion).
        const mgMotionIntensity = computeMgMotionIntensity({
          brandMotionEnergy: mappedBrand.brand.motion.energy,
          videoEnergy: projectSignalContext.videoSignals?.energy,
          preference: projectSignalContext.motionGraphicsPref,
        }).intensity;

        const codegenWindow = {
          startFrame: snappedFrame,
          endFrame: snappedFrame + compositionDuration,
          fps: DEFAULT_CONFIG.timing.fps,
        };
        const codegenAnchors = buildMgCodegenAnchors(decision, snappedFrame, compositionDuration, signalCurves);
        const visualEvidence = await captureMgVisualEvidence({
          overlays,
          window: codegenWindow,
          canvas,
          anchors: codegenAnchors,
        });
        // Seam pass 2 — THIS moment's footage character, read from its V-JEPA + wav2vec segment at the moment
        // frame (same segment lookup the signal-curve builder uses). The R2/R3 resolver fixes need the motionType
        // + faceEmotion STRINGS, which are NOT in the numeric signalCurves, so we read the segment directly. No
        // segment → {} → undefined → the video style identity holds for this moment (graceful, deterministic).
        const mgFrameRef = resolveSourceFrame(snappedFrame, overlays);
        const mgSourceMs = (mgFrameRef.sourceFrame / DEFAULT_CONFIG.timing.fps) * 1000;
        const mgAnalysis = analysisForAsset(analyses, mgFrameRef.assetId);
        const mgVjepa = findTimeSegment(
          arrayOrUndefined(mgAnalysis?.vjepaAnalysis?.segments) ?? arrayOrUndefined(mgAnalysis?.vjepa?.segments) ?? projectSignalContext.vjepaSegments,
          mgSourceMs,
        );
        const mgWav2vec = findTimeSegment(
          arrayOrUndefined(mgAnalysis?.wav2vecAnalysis?.segments) ?? arrayOrUndefined(mgAnalysis?.wav2vec?.segments) ?? projectSignalContext.wav2vecSegments,
          mgSourceMs,
        );
        const mgFootage: FootageSignals = {};
        const mgMotion = mgVjepa ? readNumber(mgVjepa, 'motionIntensity', 'motion_intensity') : undefined;
        if (mgMotion != null) mgFootage.motionEnergy = clamp01(mgMotion);
        const mgMotionType = mgVjepa ? readString(mgVjepa, 'motionType', 'motion_type') : undefined;
        if (mgMotionType === 'subject_moving' || mgMotionType === 'camera_moving' || mgMotionType === 'both' || mgMotionType === 'static') mgFootage.motionType = mgMotionType;
        const mgFace = mgVjepa ? readString(mgVjepa, 'faceEmotion', 'face_emotion') : undefined;
        if (mgFace) mgFootage.faceEmotion = mgFace;
        const mgArousal = mgWav2vec ? readNumber(mgWav2vec, 'emotionIntensity', 'emotion_intensity') : undefined;
        if (mgArousal != null) mgFootage.arousal = clamp01(mgArousal);
        // P5-2(b): the REAL V-JEPA main-subject box (frame fractions) for this moment. Feeds screen.subject so the
        // coder places clear of the ACTUAL subject and the judge checks obstruction against real coordinates (a SOFT
        // strengthening — the judge that sees the composite stays the owner, no deterministic veto). Absent → coarse.
        const mgSubjectX = mgVjepa ? readNumber(mgVjepa, 'mainSubjectX', 'main_subject_x', 'subjectX', 'subject_x') : undefined;
        const mgSubjectY = mgVjepa ? readNumber(mgVjepa, 'mainSubjectY', 'main_subject_y', 'subjectY', 'subject_y') : undefined;
        const mgSubjectW = mgVjepa ? readNumber(mgVjepa, 'mainSubjectWidth', 'main_subject_width', 'subjectWidth', 'subject_width') : undefined;
        const mgSubjectH = mgVjepa ? readNumber(mgVjepa, 'mainSubjectHeight', 'main_subject_height', 'subjectHeight', 'subject_height') : undefined;
        const mgSubjectBox = mgSubjectX != null && mgSubjectY != null && mgSubjectW != null && mgSubjectH != null && mgSubjectW > 0 && mgSubjectH > 0
          ? { x: mgSubjectX, y: mgSubjectY, width: mgSubjectW, height: mgSubjectH }
          : undefined;
        const momentId = `${projectId}:${snappedFrame}:${selectedCandidate.id}`;
        const momentInput = buildMgMomentInput({
          momentId,
          candidate: selectedCandidate,
          brand: mappedBrand.brand,
          window: codegenWindow,
          expression: mgExpressionAuthority,
          placement: atomicPlacement,
          anchors: codegenAnchors,
          visualEvidence,
          notes: mgCodegenNotes(decision),
          intent: projectSignalContext.intent, // the user's stated purpose → signal-driven style identity
          videoSignals: projectSignalContext.videoSignals, // the video's aggregate energy → style identity
          footageSignals: Object.keys(mgFootage).length > 0 ? mgFootage : undefined,
          motionIntensity: mgMotionIntensity, // brand×video×user liveness → reserved data.motionIntensity
          // The exact approved disposition for this decision. The guard above rejects absence, decline, or failure.
          design: approvedDesign,
          subjectBox: mgSubjectBox, // P5-2(b): real V-JEPA subject box → screen.subject (coder + judge context)
          // Phase 4b: the video's taste contract (hash + compact direction) → judge contract-fidelity check (§11).
          tasteContract: projectSignalContext.tasteContractForJudge,
        });
        const signalSpeechEnergy = readNumber(rawSignals, 'speech_energy', 'speech.energy');
        const segmentSpeechEnergy = mgWav2vec ? readNumber(mgWav2vec, 'energy', 'speech_energy') : undefined;
        const speechEnergy = signalSpeechEnergy ?? segmentSpeechEnergy;
        const kineticSfxContext: EdlMgKineticSfxContextV1 = {
          version: 'mg-kinetic-sfx-context-v1',
          momentId,
          policy: projectSignalContext.kineticSfxPolicy?.policy ?? null,
          profileId: projectSignalContext.kineticSfxPolicy?.profileId ?? null,
          policySource: projectSignalContext.kineticSfxPolicy?.source ?? 'unavailable',
          speechEnergy: speechEnergy == null ? null : clamp01(speechEnergy),
          speechSource: signalSpeechEnergy != null
            ? 'moment-signals'
            : segmentSpeechEnergy != null
              ? 'wav2vec-segment'
              : 'unavailable',
          writtenAt: new Date(),
        };
        projectEvidence.mgKineticSfxContexts = [
          ...projectEvidence.mgKineticSfxContexts.filter((context) => context.momentId !== momentId),
          kineticSfxContext,
        ].slice(-100);
        try {
          const { getDatabase } = await import('@/lib/editron/db/mongodb');
          const projects = (await getDatabase()).collection('projects');
          const replaced = await projects.updateOne(
            {
              projectId,
              'intelligence.mgKineticSfxContexts.momentId': momentId,
            },
            {
              $set: {
                'intelligence.mgKineticSfxContexts.$': kineticSfxContext,
              },
            },
          );
          if (replaced.matchedCount === 0) {
            await projects.updateOne(
              {
                projectId,
                'intelligence.mgKineticSfxContexts.momentId': { $ne: momentId },
              },
              {
                $push: {
                  'intelligence.mgKineticSfxContexts': {
                    $each: [kineticSfxContext],
                    $slice: -100,
                  } as never,
                },
              },
            );
          }
        } catch (error) {
          console.warn(
            `[EDL] MG kinetic SFX context persistence failed for ${momentId}; async SFX will suppress:`,
            error instanceof Error ? error.message : error,
          );
        }
        const enqueued = await enqueueDurableMgRenderJob({
          projectId,
          userId,
          orgId: projectSignalContext.orgId ?? null,
          appCommit: resolveMgRenderAppCommit(),
          input: momentInput,
          canvas,
          sequenceNamespace: userId,
        });

        // Phase 8 (§6.8/§16.2): durable per-moment delivery record so a lapsed/stale worker delivery can never
        // silently mutate the project. Best-effort, non-blocking.
        try {
          const { computeDeliveryRecord, persistMGDeliveryRecord } = await import('@/lib/editron/motion-graphics/codegen/mg-delivery-record');
          const deliveryRecord = computeDeliveryRecord({
            videoId: projectId,
            momentId,
            status: 'enqueued',
            attempt: 1,
            jobId: enqueued.jobId,
            tasteContractHash: projectSignalContext.tasteContractForJudge?.hash,
            expectedTimelineRange: { startFrame: snappedFrame, endFrame: snappedFrame + compositionDuration },
            idempotencyKey: `${projectId}:${momentId}:${enqueued.jobId}`,
          });
          projectEvidence.mgDeliveryRecords = [
            ...projectEvidence.mgDeliveryRecords.filter((record) => record.momentId !== momentId),
            deliveryRecord,
          ].slice(-200);
          await persistMGDeliveryRecord(projectId, userId, deliveryRecord);
        } catch (deliveryRecordErr) {
          console.warn('[EDL] MG delivery record persist failed (non-fatal):', deliveryRecordErr instanceof Error ? deliveryRecordErr.message : deliveryRecordErr);
        }

        if (enqueued.status !== 'completed') {
          const outcome: MgCodegenDecisionOutcome = {
            ...outcomeBase,
            status: 'queued',
            jobId: enqueued.jobId,
            messageId: enqueued.messageId,
            reason: enqueued.status === 'running'
              ? 'MG render job is already running in the isolated worker'
              : 'MG render job queued for the isolated worker',
          };
          decision.params.mgCodegenOutcome = outcome;
          console.log(`[EDL-MG-Codegen] QUEUED ${selectedCandidate.id} @${snappedFrame}: ${enqueued.jobId}`);
          return { created: 0, modified: 0 };
        }

        const generated = enqueued.result;
        if (!generated) {
          return rejectCodegenMoment('fallback', `Completed MG render job ${enqueued.jobId} has no result`);
        }
        if (generated.status !== 'generated') {
          return rejectCodegenMoment(generated.status, generated.reason, generated.receipt);
        }

        const sequence = generated.sequence;
        // A completed idempotent job was already delivered by the worker. Report it without inserting twice.
        const outcome: MgCodegenDecisionOutcome = {
          ...outcomeBase,
          status: 'generated',
          jobId: enqueued.jobId,
          assetId: `mgseq_${sequence.address.sequenceId}`,
          sequenceId: sequence.address.sequenceId,
          receipt: generated.receipt,
          reason: 'Idempotent render job was already completed and delivered',
        };
        decision.params.mgCodegenOutcome = outcome;
        return { created: 0, modified: 0 };
      } catch (error) {
        return rejectCodegenMoment(
          'fallback',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Overlays-as-signals: the mg.typography.font_weight dial (signal→curve→[300..800]) is the
    // source of boldness — feed it into the typography token every MG composer binds
    // (token:typography.headingWeight), so weight comes from the CURVE, not the resolver's
    // competing lerp (consolidation onto the dial infra). Body stays −200 subordinate (resolver
    // convention). No dial (no signals) → the lerp value stands as the fallback.
    const weightDial = mgScores?.['mg.typography.font_weight']?.values?.fontWeight;
    if (typeof weightDial === 'number' && isFinite(weightDial)) {
      const hw = Math.round(weightDial);
      tokens.typography.headingWeight = hw;
      tokens.typography.bodyWeight = Math.max(300, Math.min(600, hw - 200));
    }

    const recipe = applyMgExpressionAuthorityToRecipe(
      planComposition(
        { content: contentMap, triggerMoment: decision.reason },
        tokens,
        rawSignals,
        mgScores,
      ),
      mgExpressionAuthority,
    );

    // Tier 1 Structural Gate: WCAG contrast + CRG font floors + density/hierarchy.
    // ENFORCING (2026-06-26, was observe-only). The Rule-29 sweep over 302 real CURRENT MGs
    // (scripts/eval-mg-gate.ts) measured 1/302 would-suppress and that 1 was a genuinely
    // unreadable+cluttered graphic — FP-suppression ≈ 0, the bar to flip observe→enforce. A
    // hard-failing graphic is DROPPED rather than shipped as an unreadable/occluding card.
    // Escape hatch: MG_STRUCTURAL_GATE=observe reverts to log-only if production diversity ever
    // shows false positives. This is a SAFETY NET for the egregious tail, NOT the cure — good MGs
    // come from Phase 9 token rebind + Rule-11 generative form, not from dropping bad ones.
    const gateResult = checkCompositionStructure(recipe, tokens);
    if (!gateResult.pass) {
      if (process.env.MG_STRUCTURAL_GATE !== 'observe') {
        console.warn(`[EDL] Structural gate SUPPRESSED ${graphicType} @frame ${decision.frame}: score=${gateResult.score}/100, issues=${gateResult.issues.length} — dropped (unreadable/cluttered). Set MG_STRUCTURAL_GATE=observe to disable.`);
        return { created: 0, modified: 0 };
      }
      console.warn(`[EDL] Structural gate WARN (observe) for ${graphicType} @frame ${decision.frame}: score=${gateResult.score}/100, issues=${gateResult.issues.length}`);
    }
    const atomicOverlayPlan = buildAtomicOverlayPlan(recipe, tokens, contentMap, rawSignals, mgScores, decision.params.brand || {});
    const atomicOverlayDecision = decideAtomicOverlay(atomicOverlayPlan);

    const motionOverlay = {
      id: deterministicOverlayId(idEpoch, 'graphic', decision.frame, decisionIndex),
      type: 'motion-graphic' as const,
      from: snappedFrame,
      durationInFrames: compositionDuration,
      row: ROW.BGM,
      left: 0,
      top: 0,
      width: canvas.width,
      height: canvas.height,
      isDragging: false,
      rotation: 0,
      recipe,
      resolvedTokens: tokens,
      ...(signalCurves ? { signalCurves: signalCurves.curves } : {}),
      contentSignals: rawSignals,
      content: contentMap,
      styles: { opacity: 1, backgroundColor: 'transparent' },
      metadata: {
        sourceType: 'edl-graphic',
        graphicType,
        compositionEngine: true,
        placementRegion,
        placementAdjustment,
        atomicPlacement,
        atomicOverlayPlan,
        atomicOverlayDecision,
        atomicPlanObserveMode: true,
        mgExpressionAuthority,
        ...(signalCurves ? { signalCurves: signalCurves.summary } : {}),
        visualExplanationContract: mgExpressionAuthority.visualExplanationContract,
        semanticMgCandidateLedger: normalizedGraphicContent.semanticMgCandidateLedger,
        semanticMgCandidateSelection,
        contentStructure: normalizedGraphicContent.structure,
        semanticAtoms: normalizedGraphicContent.semanticAtoms,
        ...atomicMomentBundleMetadata(decision),
        edlSource: decision.source,
        edlReason: decision.reason,
      },
    };

    overlays.push(motionOverlay as any);
    console.log(
      `[EDL-Exec] Graphic '${graphicType}' at frame ${decision.frame}: COMPOSITION_ENGINE → ` +
      `${recipe.elements.length} elements, layout=${recipe.layout.position}`,
    );
    return { created: 1, modified: 0 };
  }}

function applyAudioDuck(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  // Find BGM overlay (row 1 sound). Match by ROW.BGM constant + assetId prefix fallback.
  const bgm = overlays.find(o => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_'))) as any;
  if (!bgm) return null;

  // Already has ducking? Skip.
  if (bgm.styles?.duckingConfig?.enabled) return null;

  // Default ~-21 dB, CKG music_under_speech_level_range (bgm-mix-levels.ts). Was 0.20 (~-14dB, too hot under speech).
  const { duckLevel = 0.089, rampDownMs = 300, rampUpMs = 600 } = decision.params;

  if (!bgm.styles) bgm.styles = {};
  bgm.styles.duckingConfig = {
    enabled: true,
    duckLevel,
    rampDownMs,
    rampUpMs,
    lookAheadMs: 200,
  };

  return { created: 0, modified: 1 };
}

function applyPacingNoop(
  decision: EditDecision,
): { created: number; modified: number } {
  console.log('[EDL-Exec] Pacing at frame ' + decision.frame + ': accepted as informational no-op');
  return { created: 0, modified: 0 };
}
