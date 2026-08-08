import type { MotionTokens } from '@/lib/editron/data/motion-theme-resolver';
import { buildOverlayAtomicReceipt, overlayAtom } from '@/lib/editron/engine/atomic-overlay-core';
import { computeChoreography } from '@/lib/editron/motion-graphics/engine/choreography-computer';
import { resolveElements } from '@/lib/editron/motion-graphics/engine/property-resolver';
import type { Recipe, ResolvedElement } from '@/lib/editron/motion-graphics/engine/recipe-types';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import {
  evaluateAtomicSfxAssetCandidate,
  resolveAtomicSfxForm,
} from '@/lib/editron/services/sfx-form';
import {
  isSFXLibraryAvailable,
  searchAndDownloadSFX,
  type SFXLibraryResult,
  type SFXLibrarySearchReport,
} from '@/lib/pipeline/sfx-library-service';
import { deriveSfxSelectionEvidence } from '@/lib/pipeline/sfx-selection-evidence';
import { ROW } from '@/lib/pipeline/scene-to-editron';

/** S1: event kinds that imply REAL realized movement → legitimate motion-speed evidence.
 *  Static settles (tick), rustles and stings carry no motion speed (never fabricated). */
const KINETIC_MOVEMENT_EVENT_KINDS: ReadonlySet<string> = new Set(['entrance-pop', 'directional-swipe']);

function isKineticMovementEvent(kind: string | undefined): boolean {
  return Boolean(kind && KINETIC_MOVEMENT_EVENT_KINDS.has(kind));
}

export type KineticSfxEventKind =
  | 'entrance-pop'
  | 'directional-swipe'
  | 'count-settle-tick'
  | 'quote-card-rustle'
  | 'logo-reveal-sting';

export type KineticSfxPolicy = 'full' | 'subtle' | 'off';

export interface KineticSfxEvent {
  version: 'kinetic-sfx-event-v1';
  eventId: string;
  surface: 'motion-graphic';
  kind: KineticSfxEventKind;
  sourceOverlayId: number | string;
  anchorFrame: number;
  fps: number;
  cue: string;
  ruleId: 'mapping:sound.sfx_for_editorial_moments';
  energy: number;
  speechEnergy: number;
  silenceAllowed: true;
  evidence: string[];
}

export interface CodegenKineticSfxEvidence {
  speechEnergy: number;
  evidence: string[];
}

export interface TransitionKineticSfxHint {
  cue: string;
  rule: string;
  role?: 'none' | 'soft-whoosh' | 'fast-whoosh' | 'impact' | 'digital-tick';
}

export interface MotionGraphicKineticSfxResult {
  placed: number;
  skipped: number;
  skipReasons: Record<string, number>;
  eventKindsUsed: KineticSfxEventKind[];
}

interface OverlayShape {
  id: number | string;
  type: string;
  from: number;
  durationInFrames: number;
  row?: number;
  recipe?: Recipe;
  resolvedTokens?: MotionTokens;
  content?: Record<string, unknown>;
  contentSignals?: Record<string, unknown>;
  metadata?: Record<string, any>;
}

interface KineticEventSpec {
  kind: KineticSfxEventKind;
  cue: string;
}

interface AcceptedSfx {
  result: SFXLibraryResult;
  quality: ReturnType<typeof evaluateAtomicSfxAssetCandidate>;
  report?: SFXLibrarySearchReport;
}

const CKG_EDITORIAL_SFX_RULE = 'mapping:sound.sfx_for_editorial_moments' as const;
const CKG_HIGH_ENERGY_FLOOR = 0.8;
const CKG_KEY_ELEMENT_FLOOR = 0.5;
const CKG_ENERGETIC_SPEECH_FLOOR = 0.82;
const CKG_EDITORIAL_SFX_GAP_SECONDS = 5;
const COMPOSITION_FPS = 30;
const MG_SFX_ID_START = 800_000_000;
const MG_SFX_ID_SPAN = 99_999_999;
const KINETIC_EVENT_KINDS = new Set<KineticSfxEventKind>([
  'entrance-pop',
  'directional-swipe',
  'count-settle-tick',
  'quote-card-rustle',
  'logo-reveal-sting',
]);

export function deriveTransitionKineticSfxHint(style: string): TransitionKineticSfxHint | null {
  switch (style) {
    case 'dissolve':
    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down':
    case 'iris-wipe':
    case 'blur-transition':
    case 'slide-up':
    case 'slide-down':
    case 'slide-push':
      return { cue: 'subtle directional transition whoosh', rule: 'A-001' };
    case 'glitch':
      return { cue: 'digital glitch tick', rule: 'A-002', role: 'digital-tick' };
    case 'whip-pan':
      return { cue: 'fast directional whoosh whip sweep', rule: 'A-001', role: 'fast-whoosh' };
    case 'zoom-punch':
    case 'flash':
      return { cue: 'impact hit punch', rule: 'A-002', role: 'impact' };
    case 'hard-cut':
    case 'soft-cut':
    case 'film-burn':
    case 'dip-to-black':
    case 'dip-to-white':
      return null;
    default:
      return null;
  }
}

export function deriveCompositionKineticSfxEvents(overlay: unknown): KineticSfxEvent[] {
  if (!isOverlayShape(overlay) || overlay.type !== 'motion-graphic') return [];
  const recipe = overlay.recipe;
  const tokens = overlay.resolvedTokens;
  if (!recipe || !tokens) return [];

  const speechEnergy = signal01(overlay.contentSignals?.speech_energy);
  if (speechEnergy >= CKG_ENERGETIC_SPEECH_FLOOR) return [];

  const eventSpec = compositionEventSpec(overlay);
  if (!eventSpec) return [];
  const energy = overlayEnergy(overlay);
  const keyElement = eventSpec.kind !== 'entrance-pop';
  if (energy < (keyElement ? CKG_KEY_ELEMENT_FLOOR : CKG_HIGH_ENERGY_FLOOR)) return [];

  const elements = resolveElements(recipe.elements, tokens, overlay.content ?? {});
  const target = targetElement(elements, eventSpec.kind);
  if (!target) return [];
  const choreography = computeChoreography({
    elements,
    tokens,
    durationInFrames: overlay.durationInFrames,
    fps: COMPOSITION_FPS,
    exitStyle: recipe.exitStyle,
    recipeChoreography: recipe.choreography,
  });
  const timing = choreography.get(target.role);
  if (!timing) return [];
  const anchorOffset = eventSpec.kind === 'count-settle-tick'
    ? timing.holdStartFrame + Math.min(45, Math.max(0, timing.holdEndFrame - timing.holdStartFrame))
    : timing.enterEndFrame;
  const anchorFrame = overlay.from + Math.min(overlay.durationInFrames - 1, Math.max(0, anchorOffset));

  return [buildEvent({
    sourceOverlayId: overlay.id,
    anchorFrame,
    fps: COMPOSITION_FPS,
    eventSpec,
    energy,
    speechEnergy,
    evidence: [
      `graphic-type:${String(overlay.metadata?.graphicType ?? 'unknown')}`,
      `recipe:${recipe.id}`,
      `choreography-role:${target.role}`,
    ],
  })];
}

export function deriveCodegenKineticSfxEvents(
  input: Pick<MgMomentInput, 'candidate' | 'window' | 'anchors' | 'expressiveness' | 'design'>,
  sourceOverlayId: number | string,
  audioEvidence?: CodegenKineticSfxEvidence,
): KineticSfxEvent[] {
  if (!audioEvidence || !Number.isFinite(audioEvidence.speechEnergy)) return [];
  const speechEnergy = signal01(audioEvidence.speechEnergy);
  if (speechEnergy >= CKG_ENERGETIC_SPEECH_FLOOR) return [];
  const landingFrame = input.anchors?.landingFrame;
  if (landingFrame == null || !Number.isFinite(landingFrame)) return [];
  const eventSpec = codegenEventSpec(input);
  if (!eventSpec) return [];
  const energy = signal01(input.expressiveness.intensity);
  const keyElement = eventSpec.kind !== 'entrance-pop';
  if (energy < (keyElement ? CKG_KEY_ELEMENT_FLOOR : CKG_HIGH_ENERGY_FLOOR)) return [];
  if (input.design?.plan.targetBar === 'restraint' && energy < CKG_HIGH_ENERGY_FLOOR) return [];

  const startFrame = Math.max(0, Math.round(input.window.startFrame));
  const endFrame = Math.max(startFrame, Math.round(input.window.endFrame));
  const anchorFrame = Math.min(endFrame, startFrame + Math.max(0, Math.round(landingFrame)));
  return [buildEvent({
    sourceOverlayId,
    anchorFrame,
    fps: Math.max(1, Math.round(input.window.fps)),
    eventSpec,
    energy,
    speechEnergy,
    evidence: [
      `fact-kind:${input.candidate.factKind}`,
      `expressiveness:${input.expressiveness.tier}`,
      `anchor:landing-frame-${Math.round(landingFrame)}`,
      ...(input.design ? [`target-bar:${input.design.plan.targetBar}`] : []),
      ...audioEvidence.evidence,
    ],
  })];
}

export async function placeMotionGraphicKineticSFX(
  overlays: any[],
  userId: string,
  policy: KineticSfxPolicy,
): Promise<MotionGraphicKineticSfxResult> {
  const result: MotionGraphicKineticSfxResult = {
    placed: 0,
    skipped: 0,
    skipReasons: {},
    eventKindsUsed: [],
  };
  const work = overlays
    .filter(isOverlayShape)
    .flatMap(source => eventsForOverlay(source).map(event => ({ source, event })))
    .sort((a, b) => a.event.anchorFrame - b.event.anchorFrame);
  if (work.length === 0) return result;

  if (policy === 'off') {
    for (const item of work) recordPlacement(item.source, item.event, 'suppressed', 'profile-policy-off', policy);
    result.skipped = work.length;
    result.skipReasons['profile-policy-off'] = work.length;
    return result;
  }
  if (!isSFXLibraryAvailable()) {
    for (const item of work) recordPlacement(item.source, item.event, 'skipped', 'sfx-library-unavailable', policy);
    result.skipped = work.length;
    result.skipReasons['sfx-library-unavailable'] = work.length;
    return result;
  }

  const existingIds = new Set(overlays.map(item => typeof item?.id === 'number' ? item.id : null));
  const cache = new Map<string, AcceptedSfx | null>();
  for (const { source, event } of work) {
    const sfxId = deterministicMgSfxId(event);
    if (existingIds.has(sfxId)) {
      result.skipped++;
      bump(result, 'already-placed');
      recordPlacement(source, event, 'placed', 'already-placed', policy, sfxId);
      continue;
    }
    const nearest = nearestSfxDistance(event.anchorFrame, overlays);
    const minGap = Math.round(CKG_EDITORIAL_SFX_GAP_SECONDS * event.fps);
    if (nearest != null && nearest < minGap) {
      result.skipped++;
      bump(result, `editorial-sfx-too-dense-${nearest}f`);
      recordPlacement(source, event, 'skipped', `editorial-sfx-too-dense-${nearest}f`, policy);
      continue;
    }

    const form = resolveAtomicSfxForm({
      signals: {
        motion_intensity: event.energy,
        visual_significance: event.energy,
        speech_energy: event.speechEnergy,
        active_overlay_count: activeOverlayCount(overlays, event.anchorFrame),
      },
      params: {
        sfxCue: event.cue,
        sfxAnchor: 'mg-landing',
        mgLandingFrame: event.anchorFrame,
        syncFrame: event.anchorFrame,
        durationFrames: source.durationInFrames,
      },
      frame: source.from,
      durationFrames: source.durationInFrames,
      sceneRemainingFrames: source.durationInFrames,
    });
    if (!form.shouldPlace || form.compatibilityToken === 'none') {
      result.skipped++;
      bump(result, 'atomic-form-resolved-silence');
      recordPlacement(source, event, 'suppressed', 'atomic-form-resolved-silence', policy);
      continue;
    }

    const query = form.asset.queryTerms.join(' ') || event.cue;
    let accepted = cache.get(query);
    if (accepted === undefined) {
      let report: SFXLibrarySearchReport | undefined;
      // S1: realized evidence — surface=motion-graphic; real motionSpeed only for
      // genuinely kinetic event kinds (directional swipes), none for static settles.
      const evidence = deriveSfxSelectionEvidence({
        surface: 'motion-graphic',
        ...(isKineticMovementEvent(event.kind)
          ? { motion: { magnitude: 0.5 }, durationMs: (form.timing.durationFrames / 30) * 1000 }
          : {}),
        receiptKeys: [`mg-kinetic-event:${event.kind ?? 'unknown'}`],
      });
      const libraryResult = await searchAndDownloadSFX(
        query,
        userId,
        form.asset.maxDurationSec,
        form,
        value => { report = value; },
        undefined,
        undefined,
        evidence,
      );
      const quality = evaluateAtomicSfxAssetCandidate(form, libraryResult);
      accepted = libraryResult && quality.accepted ? { result: libraryResult, quality, report } : null;
      cache.set(query, accepted);
    }
    if (!accepted) {
      result.skipped++;
      bump(result, 'library-miss-or-quality-reject');
      recordPlacement(source, event, 'skipped', 'library-miss-or-quality-reject', policy);
      continue;
    }

    const soundOverlay = buildSoundOverlay(sfxId, source, event, form, accepted, policy);
    overlays.push(soundOverlay);
    existingIds.add(sfxId);
    result.placed++;
    if (!result.eventKindsUsed.includes(event.kind)) result.eventKindsUsed.push(event.kind);
    recordPlacement(source, event, 'placed', 'placed', policy, sfxId, accepted.report);
  }
  return result;
}

function compositionEventSpec(overlay: OverlayShape): KineticEventSpec | null {
  const graphicType = String(overlay.metadata?.graphicType ?? '').toLowerCase();
  if (graphicType === 'stat-counter' || overlay.recipe?.elements.some(element => element.animation === 'count-up')) {
    return { kind: 'count-settle-tick', cue: 'subtle clean stat settle ding tick' };
  }
  if (graphicType === 'lower-third') return { kind: 'directional-swipe', cue: 'subtle directional slide whoosh' };
  if (graphicType === 'quote-card') return { kind: 'quote-card-rustle', cue: 'subtle paper card foley rustle' };
  if (graphicType === 'logo-reveal') return { kind: 'logo-reveal-sting', cue: 'short tonal logo reveal shimmer' };
  if (graphicType === 'keyword-highlight' || graphicType === 'callout') {
    return { kind: 'entrance-pop', cue: 'very subtle editorial entrance pop tick' };
  }
  return null;
}

function codegenEventSpec(input: Pick<MgMomentInput, 'candidate' | 'design'>): KineticEventSpec | null {
  switch (input.candidate.factKind) {
    case 'weak-stat':
    case 'bounded-stat':
    case 'magnitude-stat':
    case 'series':
    case 'comparison':
      return { kind: 'count-settle-tick', cue: 'subtle clean stat settle ding tick' };
    case 'quote':
      return { kind: 'quote-card-rustle', cue: 'subtle paper card foley rustle' };
    case 'identity':
      return input.design?.plan.elements.some(element => element.kind === 'reveal')
        ? { kind: 'logo-reveal-sting', cue: 'short tonal logo reveal shimmer' }
        : { kind: 'directional-swipe', cue: 'subtle directional identity slide whoosh' };
    case 'concept':
    case 'refutation':
    case 'list':
    case 'narrative':
      return { kind: 'entrance-pop', cue: 'very subtle editorial entrance pop tick' };
    default:
      return null;
  }
}

function buildEvent(input: {
  sourceOverlayId: number | string;
  anchorFrame: number;
  fps: number;
  eventSpec: KineticEventSpec;
  energy: number;
  speechEnergy: number;
  evidence: string[];
}): KineticSfxEvent {
  return {
    version: 'kinetic-sfx-event-v1',
    eventId: `${String(input.sourceOverlayId)}:${input.eventSpec.kind}:${input.anchorFrame}`,
    surface: 'motion-graphic',
    kind: input.eventSpec.kind,
    sourceOverlayId: input.sourceOverlayId,
    anchorFrame: input.anchorFrame,
    fps: input.fps,
    cue: input.eventSpec.cue,
    ruleId: CKG_EDITORIAL_SFX_RULE,
    energy: input.energy,
    speechEnergy: input.speechEnergy,
    silenceAllowed: true,
    evidence: input.evidence,
  };
}

function buildSoundOverlay(
  id: number,
  source: OverlayShape,
  event: KineticSfxEvent,
  form: ReturnType<typeof resolveAtomicSfxForm>,
  accepted: AcceptedSfx,
  policy: KineticSfxPolicy,
): Record<string, any> {
  const volume = policy === 'subtle' ? form.mix.volume * 0.5 : form.mix.volume;
  const overlay: Record<string, any> = {
    id,
    type: 'sound',
    from: form.timing.startFrame,
    durationInFrames: form.timing.durationFrames,
    startFromSound: form.timing.sourceOffsetFrames,
    audioStartFrame: form.timing.startFrame,
    audioEndFrame: form.timing.endFrame,
    row: ROW.SFX,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    content: accepted.result.audioUrl,
    src: accepted.result.audioUrl,
    assetId: accepted.result.audioAssetId,
    audioRights: accepted.result.audioRights,
    styles: { volume, opacity: 1 },
    metadata: {
      source: 'kinetic-sfx-service',
      kineticSfxEvent: event,
      sourceOverlayId: source.id,
      sfxQuery: form.asset.queryTerms.join(' ') || event.cue,
      sfxAssetQuality: accepted.quality,
      providerSearchReport: accepted.report,
      atomicSfxForm: form,
      atomicSfxForms: [form],
    },
  };
  const receipt = buildOverlayAtomicReceipt({
    family: 'sfx',
    intent: form.intent,
    frame: overlay.from,
    durationFrames: overlay.durationInFrames,
    source: 'kinetic-sfx-service',
    reason: `${event.kind} for ${event.surface} ${String(source.id)} by ${event.ruleId}`,
    signals: { motion_intensity: event.energy, speech_energy: event.speechEnergy },
    target: { overlayId: id, sourceOverlayId: String(source.id), row: ROW.SFX, volume },
    payload: {
      eventId: event.eventId,
      eventKind: event.kind,
      ruleId: event.ruleId,
      formVersion: form.version,
      compatibilityToken: form.compatibilityToken,
      assetQualityScore: accepted.quality.score,
    },
    atoms: [
      overlayAtom('temporal-anchor', 'timeline.frame', form.timing.syncFrame, 1, 'derived-signal'),
      overlayAtom('audio-hit', 'sfx.token', form.compatibilityToken, 1, 'audio-library'),
      overlayAtom('duration', 'sfx.duration_frames', form.timing.durationFrames, form.intensity, 'derived-signal'),
      overlayAtom('volume', 'audio.volume', volume, volume, 'decision-param'),
      overlayAtom('asset-id', 'media.asset_id', overlay.assetId, 1, 'audio-library'),
    ],
  });
  overlay.metadata.atomicOverlayReceipt = receipt;
  overlay.metadata.atomicOverlayReceipts = [receipt];
  overlay.metadata.atomicOverlayForm = receipt.form;
  overlay.metadata.atomicOverlayForms = [receipt.form];
  overlay.metadata.atomicPlanObserveMode = true;
  return overlay;
}

function targetElement(elements: ResolvedElement[], kind: KineticSfxEventKind): ResolvedElement | undefined {
  if (kind === 'count-settle-tick') {
    const counter = elements.find(element => element.animation === 'count-up');
    if (counter) return counter;
  }
  return [...elements].sort((a, b) => a.enterOrder - b.enterOrder)[0];
}

function eventsForOverlay(overlay: OverlayShape): KineticSfxEvent[] {
  const stored = Array.isArray(overlay.metadata?.kineticSfxEvents)
    ? overlay.metadata.kineticSfxEvents.filter(isKineticSfxEvent)
    : [];
  return stored.length > 0 ? stored : deriveCompositionKineticSfxEvents(overlay);
}

function recordPlacement(
  source: OverlayShape,
  event: KineticSfxEvent,
  status: 'placed' | 'skipped' | 'suppressed',
  reason: string,
  policy: KineticSfxPolicy,
  soundOverlayId?: number,
  providerSearchReport?: SFXLibrarySearchReport,
): void {
  const receipt = {
    version: 'kinetic-sfx-placement-v1',
    eventId: event.eventId,
    eventKind: event.kind,
    status,
    reason,
    policy,
    anchorFrame: event.anchorFrame,
    soundOverlayId,
    providerSearchReport,
  };
  source.metadata = {
    ...(source.metadata ?? {}),
    kineticSfxEvents: [event],
    kineticSfxPlacement: receipt,
    kineticSfxPlacements: [receipt],
  };
}

function deterministicMgSfxId(event: KineticSfxEvent): number {
  let hash = 2166136261 >>> 0;
  for (const char of event.eventId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return MG_SFX_ID_START + ((hash >>> 0) % MG_SFX_ID_SPAN);
}

function nearestSfxDistance(frame: number, overlays: unknown[]): number | null {
  let nearest: number | null = null;
  for (const overlay of overlays) {
    if (!isOverlayShape(overlay) || !isSfxOverlay(overlay)) continue;
    const metadata = overlay.metadata ?? {};
    const syncFrame = finiteFrame(metadata.atomicSfxForm?.timing?.syncFrame)
      ?? finiteFrame(metadata.kineticSfxEvent?.anchorFrame)
      ?? finiteFrame(overlay.from);
    if (syncFrame == null) continue;
    const distance = Math.abs(syncFrame - frame);
    if (nearest == null || distance < nearest) nearest = distance;
  }
  return nearest;
}

function isSfxOverlay(overlay: OverlayShape): boolean {
  return (overlay.type === 'sound' || overlay.type === 'audio')
    && (overlay.row === ROW.SFX || Boolean(overlay.metadata?.atomicSfxForm) || Boolean(overlay.metadata?.sfxType));
}

function activeOverlayCount(overlays: unknown[], frame: number): number {
  return overlays.filter(item => isOverlayShape(item)
    && item.type !== 'sound'
    && item.from <= frame
    && item.from + item.durationInFrames > frame).length;
}

function overlayEnergy(overlay: OverlayShape): number {
  return Math.max(
    signal01(overlay.metadata?.atomicOverlayPlan?.intensity?.overall),
    signal01(overlay.metadata?.mgExpressionAuthority?.intensity),
    signal01(overlay.contentSignals?.visual_significance),
    signal01(overlay.contentSignals?.motion_intensity),
  );
}

function bump(result: MotionGraphicKineticSfxResult, reason: string): void {
  result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
}

function isOverlayShape(value: unknown): value is OverlayShape {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (typeof item.id === 'number' || typeof item.id === 'string')
    && typeof item.type === 'string'
    && typeof item.from === 'number'
    && typeof item.durationInFrames === 'number';
}

function isKineticSfxEvent(value: unknown): value is KineticSfxEvent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.version === 'kinetic-sfx-event-v1'
    && item.surface === 'motion-graphic'
    && typeof item.eventId === 'string'
    && KINETIC_EVENT_KINDS.has(item.kind as KineticSfxEventKind)
    && (typeof item.sourceOverlayId === 'number' || typeof item.sourceOverlayId === 'string')
    && typeof item.anchorFrame === 'number' && Number.isFinite(item.anchorFrame)
    && typeof item.fps === 'number' && Number.isFinite(item.fps) && item.fps > 0
    && typeof item.cue === 'string' && item.cue.length > 0
    && item.ruleId === CKG_EDITORIAL_SFX_RULE
    && typeof item.energy === 'number' && Number.isFinite(item.energy)
    && typeof item.speechEnergy === 'number' && Number.isFinite(item.speechEnergy)
    && item.silenceAllowed === true
    && Array.isArray(item.evidence)
    && item.evidence.every(entry => typeof entry === 'string');
}

function finiteFrame(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function signal01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
