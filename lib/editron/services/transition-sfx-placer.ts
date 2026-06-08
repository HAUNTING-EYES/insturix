/**
 * Transition SFX Placer
 *
 * Iterates transition overlays in a finalized project and places SFX
 * primitives per DIRECTOR_KNOWLEDGE_BASE.md Part 9 (rules A-001, A-002).
 *
 * DESIGN PRINCIPLES (Rule 18N: reduce LLM dependency, Rule 19N: domain-expert
 * approach):
 * - Rule-driven and deterministic. No LLM calls. No creative intent dependency.
 * - Iterates the FINAL state of transitions (ground truth), not the LLM's
 *   sfx-trigger decisions (which can have rule violations like ding-on-dip-to-black).
 * - A sound designer looks at the cut and places the sound. This does the same.
 *
 * MAPPING (KB Part 9):
 *   dissolve / wipe-* / iris-wipe / blur-transition / slide-push → whoosh   (A-001, subtle)
 *   zoom-punch / flash                                           → impact  (A-002, prominent)
 *   dip-to-black / dip-to-white                                  → SKIP    (silence wins)
 *   (hard cuts have no transition overlay — nothing to process)
 *
 * VOLUMES (per KB Part 9, converted from dB to linear amplitude):
 *   whoosh: -10 dB → 0.30  (A-001 range: -12 to -8 dB)
 *   impact:  -5 dB → 0.55  (A-002 range:  -6 to -3 dB)
 *
 * Atomic SFX form now owns exact timing, volume, query, and fallback. The
 * whoosh/impact tokens above are compatibility hints for library search.
 *
 * PROFILE POLICY (EditProfile.transitionSFXPolicy):
 *   'full'   (default): KB volumes as-is. Energetic, social, brand content.
 *   'subtle' (50% vol): Cinematic, emotional, retro — felt not heard. Half volume.
 *   'off'    (skip):    Documentary, luxury, minimalist — silence is the aesthetic.
 *
 * IDEMPOTENCY:
 *   Uses deterministic overlay IDs based on transition.id + token.
 *   Running twice won't produce duplicate SFX overlays (filter by existing IDs).
 *
 * RUNS AS: Director step 3.6, after profile action loop completes
 * (so all transitions from edit-direction-applier + EDL executor + add_transition
 * tool are visible), before the async overlay merge + save.
 */

import { searchAndDownloadSFX, isSFXLibraryAvailable, type SFXLibraryResult } from '@/lib/pipeline/sfx-library-service';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import type { EditProfile } from '@/lib/editron/data/edit-profile-types';
import type { PipelineWarningCollector } from '@/lib/editron/services/pipeline-warnings';
import { buildOverlayAtomicReceipt, overlayAtom } from '@/lib/editron/engine/atomic-overlay-core';
import {
  evaluateAtomicSfxAssetCandidate,
  resolveAtomicSfxForm,
  type AtomicSfxCandidateEvaluation,
  type AtomicSfxCompatibilityToken,
  type AtomicSfxForm,
} from '@/lib/editron/services/sfx-form';
import type { AtomicMomentBundle } from '@/lib/editron/services/moment-bundle';

// ─── KB Part 9 transition-style → SFX-token mapping ─────────────

type SFXToken = Exclude<AtomicSfxCompatibilityToken, 'none'> | 'digital-tick';
type TransitionSFXRole = 'none' | 'soft-whoosh' | 'fast-whoosh' | 'impact' | 'digital-tick';

interface TransitionSFXHint {
  cue: string;
  rule: string;
  role?: TransitionSFXRole;
}

interface SFXPlacementSpec {
  token: SFXToken;
  searchQuery: string;
  volume: number;      // linear 0-1, resolved from atomic SFX mix form
  rule: string;        // KB/atomic bridge rule ID for traceability
  role?: TransitionSFXRole;
  form: AtomicSfxForm;
}

interface AcceptedTransitionSFX {
  result: SFXLibraryResult;
  assetQuality: AtomicSfxCandidateEvaluation;
}

/**
 * Map TransitionStyle to KB Part 9 SFX spec. Returns null if the style
 * intentionally gets silence (hard-cut / dip-to-black / dip-to-white).
 */
function mapTransitionStyleToSFXHint(style: string): TransitionSFXHint | null {
  switch (style) {
    // A-001: non-hard-cut motion transitions — whoosh
    case 'dissolve':
    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down':
    case 'iris-wipe':
    case 'blur-transition':
    case 'slide-push':
      return { cue: 'subtle transition whoosh', rule: 'A-001' };

    // slide-up / slide-down — directional motion, whoosh
    case 'slide-up':
    case 'slide-down':
      return { cue: 'directional whoosh sweep', rule: 'A-001' };

    // film-burn — organic, no SFX (the crackle IS the sound)
    case 'film-burn':
      return null;

    // glitch — percussive digital artifact
    case 'glitch':
      return { cue: 'digital glitch tick', rule: 'A-002', role: 'digital-tick' };

    // whip-pan — fast directional motion
    case 'whip-pan':
      return { cue: 'fast whoosh whip sweep', rule: 'A-001', role: 'fast-whoosh' };

    // soft-cut — gentle, no SFX (barely visible transition)
    case 'soft-cut':
      return null;

    // A-002: percussive transitions — impact
    case 'zoom-punch':
    case 'flash':
      return { cue: 'impact hit punch', rule: 'A-002', role: 'impact' };

    // Silence wins — dip-to-black is end-of-chapter, dip-to-white is flashbulb
    case 'dip-to-black':
    case 'dip-to-white':
      return null;

    // Unknown / hard-cut / not in enum — no SFX
    default:
      return null;
  }
}

function mapAtomicTransitionRoleToSFXHint(role: unknown): TransitionSFXHint | null | undefined {
  switch (role) {
    case 'none':
      return null;
    case 'soft-whoosh':
      return { cue: 'soft whoosh', rule: 'AT-SFX-001', role };
    case 'fast-whoosh':
      return { cue: 'fast whoosh whip sweep', rule: 'AT-SFX-002', role };
    case 'impact':
      return { cue: 'impact hit punch', rule: 'AT-SFX-003', role };
    case 'digital-tick':
      return { cue: 'digital glitch tick', rule: 'AT-SFX-004', role };
    default:
      return undefined;
  }
}

function resolveTransitionSFXSpec(transition: TransitionOverlayShape, overlays: unknown[]): SFXPlacementSpec | null {
  const atomicHint = mapAtomicTransitionRoleToSFXHint(transition.metadata?.atomicTransitionForm?.sfxRole);
  const hint = atomicHint !== undefined
    ? atomicHint
    : mapTransitionStyleToSFXHint(transition.transitionStyle || 'unknown');
  if (!hint) return null;

  const form = resolveAtomicSfxForm({
    signals: transitionSfxSignals(transition, overlays),
    params: {
      sfxCue: hint.cue,
      durationFrames: transition.durationInFrames,
    },
    momentBundle: transitionMomentBundle(transition),
    frame: transition.from,
    durationFrames: transition.durationInFrames,
    sceneRemainingFrames: transition.durationInFrames,
  });
  if (!form.shouldPlace || form.compatibilityToken === 'none') return null;

  const token = sfxTokenFromForm(form, hint);
  return {
    token,
    searchQuery: searchQueryForAtomicSFX(form, token),
    volume: form.mix.volume,
    rule: hint.rule,
    role: hint.role,
    form,
  };
}

function sfxTokenFromForm(form: AtomicSfxForm, hint: TransitionSFXHint): SFXToken {
  if (hint.role === 'digital-tick') return 'digital-tick';
  if (form.compatibilityToken === 'tick' && /\b(glitch|digital)\b/.test(hint.cue)) return 'digital-tick';
  if (form.compatibilityToken === 'none') return hint.role === 'impact' ? 'impact' : 'whoosh';
  return form.compatibilityToken;
}

function searchQueryForAtomicSFX(form: AtomicSfxForm, token: SFXToken): string {
  if (form.asset.queryTerms.length > 0) return form.asset.queryTerms.join(' ');
  return token === 'digital-tick' ? 'digital glitch tick' : token;
}

// ─── Profile-aware policy resolution ─────────────────────────────

/**
 * Resolve the profile's transitionSFXPolicy. Default is 'full' when the
 * profile doesn't specify the field — most profiles inherit KB defaults.
 *
 * Only opinionated profiles override:
 * - 'off'    → skip all transition SFX (documentary, luxury — silence IS the style)
 * - 'subtle' → half volume (cinematic, emotional, retro — felt not heard)
 * - 'full'   → KB default volumes (energetic, social, brand)
 */
function resolvePolicy(profile: EditProfile | null): 'full' | 'subtle' | 'off' {
  if (!profile) return 'full';
  return profile.transitionSFXPolicy ?? 'full';
}

/**
 * Apply policy-aware volume scaling to the KB default.
 * 'subtle' → 50% (roughly -6 dB).
 * 'full' / default → unchanged.
 * 'off' is handled at a higher level (placement is skipped entirely, never reaches here).
 */
function adjustVolumeForPolicy(baseVolume: number, policy: 'full' | 'subtle' | 'off'): number {
  if (policy === 'subtle') return baseVolume * 0.5;
  return baseVolume;
}

// ─── Overlay construction ────────────────────────────────────────

interface TransitionOverlayShape {
  id: number | string;
  type: string;
  transitionStyle?: string;
  from: number;
  durationInFrames: number;
  clipAId?: number;
  clipBId?: number;
  metadata?: Record<string, any>;
}

interface SFXOverlayShape {
  id: number;
  type: 'sound';
  from: number;
  durationInFrames: number;
  startFromSound?: number;
  audioStartFrame?: number;
  audioEndFrame?: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  isDragging: boolean;
  rotation: number;
  content: string;
  src: string;
  assetId?: string;
  styles: { volume: number; opacity: number };
  metadata?: Record<string, any>;
}

/**
 * Deterministic overlay ID for idempotency — same transition produces same SFX
 * overlay ID, so re-running the placer doesn't duplicate.
 *
 * Uses transition's clip boundary IDs + frame as the stable hash seed.
 * Falls back to transition.from + transition.id if clip IDs are missing.
 */
function deterministicSFXId(transition: TransitionOverlayShape, token: SFXToken): number {
  const tokenSeed = sfxTokenSeed(token);
  const seed = (
    (transition.clipAId || 0) * 31 +
    (transition.clipBId || 0) * 17 +
    transition.from * 7 +
    tokenSeed
  );
  // Offset well clear of audio-worker SFX IDs (which use Date.now()*1000 + 500000)
  // and EDL executor IDs (which use deterministicOverlayId with different seed).
  // Range reserved for transition SFX: 700_000_000 - 799_999_999.
  return 700_000_000 + (seed % 99_999_999);
}

function sfxTokenSeed(token: SFXToken): number {
  switch (token) {
    case 'whoosh':
      return 1;
    case 'impact':
      return 2;
    case 'digital-tick':
    case 'tick':
      return 3;
    case 'riser':
      return 4;
    case 'shimmer':
      return 5;
    case 'ambient':
      return 6;
    case 'foley':
      return 7;
  }
}

// ─── Public API ──────────────────────────────────────────────────

function attachTransitionSFXAtomicReceipt(
  overlay: SFXOverlayShape,
  transition: TransitionOverlayShape,
  spec: SFXPlacementSpec,
  assetQuality: AtomicSfxCandidateEvaluation,
): void {
  const transitionVisualContext = transition.metadata?.atomicOverlayReceipt?.visualContext;
  const signals = transitionVisualContext ? visualSignalsFromContext(transitionVisualContext) : {};
  const form = spec.form;
  const receipt = buildOverlayAtomicReceipt({
    family: 'sfx',
    intent: form.intent,
    frame: overlay.from,
    durationFrames: overlay.durationInFrames,
    source: 'transition-sfx-placer',
    reason: `transition ${transition.transitionStyle || 'unknown'} resolves to ${form.intent}/${spec.token} by ${spec.rule}`,
    signals,
    target: {
      overlayId: overlay.id,
      transitionOverlayId: typeof transition.id === 'number' ? transition.id : String(transition.id),
      row: overlay.row,
      volume: overlay.styles.volume,
    },
    payload: {
      formVersion: form.version,
      token: spec.token,
      primarySearchToken: form.asset.primarySearchToken,
      searchQuery: spec.searchQuery,
      fallbackPolicy: form.asset.fallbackPolicy,
      sfxIntent: form.intent,
      syncAnchor: form.timing.anchor,
      attackFrames: form.timing.attackFrames,
      tailFrames: form.timing.tailFrames,
      mixPressure: form.mixPressure,
      transientSharpness: form.transientSharpness,
      assetQualityScore: assetQuality.score,
      assetQualityFloor: assetQuality.qualityFloor,
      assetQualityDecision: assetQuality.decision,
      assetQualityReasons: assetQuality.reasons.join('|'),
      assetSource: assetQuality.candidateSource,
      assetTitle: assetQuality.candidateTitle,
      kbRule: spec.rule,
      sfxRole: spec.role || spec.token,
      transitionStyle: transition.transitionStyle || 'unknown',
    },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', form.timing.syncFrame, 1, 'edl'),
      overlayAtom('start-frame', 'sfx.start_frame', form.timing.startFrame, 1, 'derived-signal'),
      overlayAtom('end-frame', 'sfx.end_frame', form.timing.endFrame, 1, 'derived-signal'),
      overlayAtom('duration', 'sfx.duration_frames', form.timing.durationFrames, form.intensity, 'derived-signal'),
      overlayAtom('audio-hit', 'sfx.token', spec.token, 1, 'audio-library'),
      overlayAtom('transition-relation', 'transition.overlay_id', String(transition.id), 1, 'edl'),
      overlayAtom('content-channel', 'overlay.family', 'sound', 1, 'edl'),
      overlayAtom('overlay-row', 'overlay.row', overlay.row, 1, 'layout-analysis'),
      overlayAtom('volume', 'audio.volume', overlay.styles.volume, overlay.styles.volume, 'decision-param'),
      overlayAtom('audio-hit', 'audio.asset_quality', assetQuality.score, assetQuality.score, 'audio-library'),
      overlayAtom('motion-curve', 'sfx.attack_frames', form.timing.attackFrames, form.transientSharpness, 'derived-signal'),
      overlayAtom('asset-id', 'media.asset_id', overlay.assetId || '', overlay.assetId ? 1 : 0, 'audio-library'),
      overlayAtom('media-source', 'media.src', overlay.src, 1, 'audio-library'),
    ],
  });

  overlay.metadata = {
    ...(overlay.metadata ?? {}),
    atomicOverlayReceipt: receipt,
    atomicOverlayReceipts: [receipt],
    atomicSfxForm: form,
    atomicSfxForms: [form],
    atomicOverlayForm: receipt.form,
    atomicOverlayForms: [receipt.form],
    atomicPlanObserveMode: true,
  };
}

function transitionSfxSignals(transition: TransitionOverlayShape, overlays: unknown[]): Record<string, unknown> {
  const transitionVisualContext = transition.metadata?.atomicOverlayReceipt?.visualContext;
  const signals = transitionVisualContext ? visualSignalsFromContext(transitionVisualContext) : {};
  const transitionForm = transition.metadata?.atomicTransitionForm;

  if (transitionForm && typeof transitionForm === 'object') {
    const form = transitionForm as Record<string, any>;
    const direction = form.direction && typeof form.direction === 'object' ? form.direction as Record<string, unknown> : {};
    signals.motion_intensity = Math.max(
      numberSignal(signals.motion_intensity),
      numberSignal(direction.magnitude),
      numberSignal(form.intensity) * 0.7,
    );
    signals.visual_significance = Math.max(numberSignal(signals.visual_significance), numberSignal(form.intensity) * 0.72);
    signals.visual_complexity = Math.max(numberSignal(signals.visual_complexity), numberSignal(form.visualPressure));
    signals.text_on_screen = Math.max(numberSignal(signals.text_on_screen), numberSignal(form.visualPressure) * 0.62);
    signals.cinematic_moment = Math.max(numberSignal(signals.cinematic_moment), numberSignal(form.intensity));
    signals.motion_vector_x = numberSignal(direction.x);
    signals.motion_vector_y = numberSignal(direction.y);
    if (numberSignal(form.softness) >= 0.7 || form.sfxRole === 'none') {
      signals.restraint = Math.max(numberSignal(signals.restraint), 0.74);
    }
  }

  signals.active_overlay_count = activeOverlayCountAt(overlays, transition.from);
  return signals;
}

function visualSignalsFromContext(ctx: Record<string, any>): Record<string, unknown> {
  return {
    visual_significance: ctx.visualSignificance,
    motion_intensity: ctx.motionIntensity,
    motion_vector_x: ctx.motionVectorX,
    motion_vector_y: ctx.motionVectorY,
    visual_complexity: ctx.visualComplexity,
    text_on_screen: ctx.textOnScreen,
    shot_scale: ctx.shotScale,
    face_present: ctx.facePresent,
    visual_action_type: ctx.actionType,
    visual_motion_type: ctx.motionType,
    visual_face_emotion: ctx.faceEmotion,
    visual_eye_contact: ctx.eyeContact,
    text_coverage: ctx.textCoverage,
    negative_space_top: ctx.negativeSpaceTop,
    negative_space_right: ctx.negativeSpaceRight,
    negative_space_bottom: ctx.negativeSpaceBottom,
    negative_space_left: ctx.negativeSpaceLeft,
  };
}

function transitionMomentBundle(transition: TransitionOverlayShape): AtomicMomentBundle | undefined {
  const bundle = transition.metadata?.atomicMomentBundle;
  return bundle && typeof bundle === 'object' && (bundle as AtomicMomentBundle).version === 'moment-bundle-v1'
    ? bundle as AtomicMomentBundle
    : undefined;
}

function activeOverlayCountAt(overlays: unknown[], frame: number): number {
  return overlays.filter((overlay) => {
    if (!overlay || typeof overlay !== 'object') return false;
    const item = overlay as Record<string, unknown>;
    if (item.type === 'sound') return false;
    const from = typeof item.from === 'number' ? item.from : -1;
    const duration = typeof item.durationInFrames === 'number' ? item.durationInFrames : 0;
    return from <= frame && from + duration > frame;
  }).length;
}

function numberSignal(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export interface TransitionSFXResult {
  placed: number;
  skipped: number;
  skipReasons: Record<string, number>;
  tokensUsed: string[];
}

/**
 * Main entry: iterate all transition overlays in the project and place SFX
 * per KB Part 9 rules. Mutates the overlays array in place (appends SFX overlays).
 *
 * @param overlays  Project overlay array (mutated — SFX overlays appended)
 * @param userId    For SFX library GCS upload scoping
 * @param profile   Active edit profile (used for volume adjustment)
 * @param warnings  pipelineWarnings instance for degraded/error paths
 *
 * @returns Counts of placed/skipped SFX + tokens used (for logging)
 */
export async function placeTransitionSFX(
  overlays: any[],
  userId: string,
  profile: EditProfile | null,
  warnings?: PipelineWarningCollector | null,
): Promise<TransitionSFXResult> {
  const result: TransitionSFXResult = {
    placed: 0,
    skipped: 0,
    skipReasons: {},
    tokensUsed: [],
  };

  // Profile policy check — 'off' profiles skip transition SFX entirely.
  // This is the opinionated path (documentary / luxury / minimalist profiles
  // that deliberately use silence or natural-only audio).
  const policy = resolvePolicy(profile);
  if (policy === 'off') {
    console.log(
      `[TransitionSFX] Profile ${profile?.profileId || '(none)'} has transitionSFXPolicy='off' — ` +
      `skipping all transition SFX by design (silence is the aesthetic)`
    );
    return result;
  }

  // Library availability check — graceful degradation (Rule 16)
  if (!isSFXLibraryAvailable()) {
    console.warn('[TransitionSFX] SFX library not available (no PIXABAY_API_KEY/FREESOUND_API_KEY) — skipping all');
    if (warnings) {
      warnings.degraded('sfx', 'transition-placer', 'No SFX library API keys configured — transition SFX skipped');
    }
    return result;
  }

  // Find all transition overlays (TransitionOverlay tiles from EDL or edit-direction-applier)
  const transitions: TransitionOverlayShape[] = overlays.filter(
    o => o && o.type === 'transition'
  );

  if (transitions.length === 0) {
    console.log('[TransitionSFX] No transitions in project — nothing to do');
    return result;
  }

  // Idempotency: track existing SFX IDs that match our deterministic range
  // to avoid duplicates on re-runs.
  const existingIds = new Set<number>(
    overlays
      .filter(o => o && typeof o.id === 'number' && o.id >= 700_000_000 && o.id < 800_000_000)
      .map(o => o.id as number)
  );

  // In-memory cache so same SFX type across multiple transitions shares ONE
  // library download (consistency + cost savings). A single dissolve's whoosh
  // should sound like every other dissolve's whoosh in the same video.
  const sfxCache = new Map<string, AcceptedTransitionSFX | null>();

  async function getOrFetchSFX(spec: SFXPlacementSpec): Promise<AcceptedTransitionSFX | null> {
    if (sfxCache.has(spec.searchQuery)) return sfxCache.get(spec.searchQuery) ?? null;
    const res = await searchAndDownloadSFX(spec.searchQuery, userId, spec.form.asset.maxDurationSec, spec.form);
    const assetQuality = evaluateAtomicSfxAssetCandidate(spec.form, res);
    const accepted = res && assetQuality.accepted ? { result: res, assetQuality } : null;
    sfxCache.set(spec.searchQuery, accepted);
    if (!result.tokensUsed.includes(spec.token)) result.tokensUsed.push(spec.token);
    return accepted;
  }

  console.log(`[TransitionSFX] Processing ${transitions.length} transition(s) for SFX placement`);

  for (const transition of transitions) {
    const style = transition.transitionStyle || 'unknown';
    const spec = resolveTransitionSFXSpec(transition, overlays);

    // Silence-wins case (dip-to-black, dip-to-white, unknown)
    if (!spec) {
      result.skipped++;
      const atomicRole = transition.metadata?.atomicTransitionForm?.sfxRole;
      const reason = atomicRole === 'none'
        ? 'atomic-silence'
        : style === 'dip-to-black' || style === 'dip-to-white'
        ? `silence-wins (${style})`
        : `unknown-style (${style})`;
      result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1;
      continue;
    }

    // Idempotency check
    const sfxId = deterministicSFXId(transition, spec.token);
    if (existingIds.has(sfxId)) {
      result.skipped++;
      result.skipReasons['already-placed'] = (result.skipReasons['already-placed'] || 0) + 1;
      continue;
    }

    // Fetch SFX audio (cached within this run)
    const sfx = await getOrFetchSFX(spec);
    if (!sfx || !sfx.result.audioUrl) {
      result.skipped++;
      result.skipReasons[`library-miss-or-quality-reject-${spec.token}`] = (result.skipReasons[`library-miss-or-quality-reject-${spec.token}`] || 0) + 1;
      if (warnings) {
        warnings.degraded('sfx', `transition ${style} @ frame ${transition.from}`,
          `SFX library returned no acceptable "${spec.token}" audio — transition has no SFX`);
      }
      continue;
    }

    // Create SFX overlay aligned with transition timing
    const overlay: SFXOverlayShape = {
      id: sfxId,
      type: 'sound',
      from: spec.form.timing.startFrame,
      durationInFrames: spec.form.timing.durationFrames,
      startFromSound: spec.form.timing.sourceOffsetFrames,
      audioStartFrame: spec.form.timing.startFrame,
      audioEndFrame: spec.form.timing.endFrame,
      row: ROW.SFX,
      left: 0, top: 0, width: 0, height: 0,
      isDragging: false, rotation: 0,
      content: sfx.result.audioUrl,
      src: sfx.result.audioUrl,
      assetId: sfx.result.audioAssetId,
      styles: {
        volume: adjustVolumeForPolicy(spec.volume, policy),
        opacity: 1,
      },
      metadata: {
        source: 'transition-sfx-placer',
        kbRule: spec.rule,
        transitionStyle: style,
        transitionOverlayId: transition.id,
        token: spec.token,
        sfxQuery: spec.searchQuery,
        sfxIntent: spec.form.intent,
        sfxAssetQuality: sfx.assetQuality,
        atomicSfxForm: spec.form,
        atomicSfxForms: [spec.form],
      },
    };

    attachTransitionSFXAtomicReceipt(overlay, transition, spec, sfx.assetQuality);
    overlays.push(overlay);
    result.placed++;

    console.log(
      `[TransitionSFX] Placed ${spec.token} (${spec.rule}) for ${style} @ frame ${transition.from} — ` +
      `volume ${overlay.styles.volume.toFixed(2)}`
    );
  }

  console.log(
    `[TransitionSFX] Complete: ${result.placed} placed, ${result.skipped} skipped. ` +
    `Tokens used: [${result.tokensUsed.join(', ')}]. ` +
    `Skip reasons: ${JSON.stringify(result.skipReasons)}`
  );

  return result;
}
