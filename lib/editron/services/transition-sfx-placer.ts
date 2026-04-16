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

// ─── KB Part 9 transition-style → SFX-token mapping ─────────────

type SFXToken = 'whoosh' | 'impact';

interface SFXPlacementSpec {
  token: SFXToken;
  volume: number;      // linear 0-1
  rule: string;        // KB rule ID for traceability
}

/**
 * Map TransitionStyle to KB Part 9 SFX spec. Returns null if the style
 * intentionally gets silence (hard-cut / dip-to-black / dip-to-white).
 */
function mapTransitionStyleToSFX(style: string): SFXPlacementSpec | null {
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
      return { token: 'whoosh', volume: 0.30, rule: 'A-001' };

    // A-002: percussive transitions — impact
    case 'zoom-punch':
    case 'flash':
      return { token: 'impact', volume: 0.55, rule: 'A-002' };

    // Silence wins — dip-to-black is end-of-chapter, dip-to-white is flashbulb
    // (both expect the silence to be the effect, NOT a whoosh to fight it)
    case 'dip-to-black':
    case 'dip-to-white':
      return null;

    // Unknown / hard-cut / not in enum — no SFX
    default:
      return null;
  }
}

// ─── Profile-aware volume adjustment ─────────────────────────────

/**
 * Adjust the KB default volume based on profile character.
 *
 * Cinematic, documentary, luxury profiles mix SFX quieter to preserve the
 * organic feel. Social, gaming, UGC profiles keep KB defaults because the
 * audience expects prominent SFX.
 *
 * Deliberately simple for MVP — a more nuanced per-profile SFX policy can be
 * added later via an EditProfile.sfxPolicy field (deferred).
 */
function adjustVolumeForProfile(baseVolume: number, profile: EditProfile | null): number {
  if (!profile) return baseVolume;

  const profileId = (profile.profileId || '').toUpperCase();

  // Documentary (D-prefix) + Luxury brand ad profiles: subtle SFX (-6 dB vs default)
  // D-01 Cinematic, D-05 Documentary, D-08 Luxury all fall into this bucket.
  if (profileId.startsWith('D-')) {
    return baseVolume * 0.5; // -6 dB additional attenuation
  }

  // Gaming / high-energy social profiles: keep default KB volume
  // (B-13 Gaming intentionally has prominent SFX per KB A-100 allowance)
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
  const seed = (
    (transition.clipAId || 0) * 31 +
    (transition.clipBId || 0) * 17 +
    transition.from * 7 +
    (token === 'whoosh' ? 1 : 2)
  );
  // Offset well clear of audio-worker SFX IDs (which use Date.now()*1000 + 500000)
  // and EDL executor IDs (which use deterministicOverlayId with different seed).
  // Range reserved for transition SFX: 700_000_000 - 799_999_999.
  return 700_000_000 + (seed % 99_999_999);
}

// ─── Public API ──────────────────────────────────────────────────

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
  const sfxCache = new Map<SFXToken, SFXLibraryResult | null>();

  async function getOrFetchSFX(token: SFXToken): Promise<SFXLibraryResult | null> {
    if (sfxCache.has(token)) return sfxCache.get(token) ?? null;
    const res = await searchAndDownloadSFX(token, userId, 3);
    sfxCache.set(token, res);
    if (!result.tokensUsed.includes(token)) result.tokensUsed.push(token);
    return res;
  }

  console.log(`[TransitionSFX] Processing ${transitions.length} transition(s) for SFX placement`);

  for (const transition of transitions) {
    const style = transition.transitionStyle || 'unknown';
    const spec = mapTransitionStyleToSFX(style);

    // Silence-wins case (dip-to-black, dip-to-white, unknown)
    if (!spec) {
      result.skipped++;
      const reason = style === 'dip-to-black' || style === 'dip-to-white'
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
    const sfx = await getOrFetchSFX(spec.token);
    if (!sfx || !sfx.audioUrl) {
      result.skipped++;
      result.skipReasons[`library-miss-${spec.token}`] = (result.skipReasons[`library-miss-${spec.token}`] || 0) + 1;
      if (warnings) {
        warnings.degraded('sfx', `transition ${style} @ frame ${transition.from}`,
          `SFX library returned no "${spec.token}" audio — transition has no SFX`);
      }
      continue;
    }

    // Create SFX overlay aligned with transition timing
    const overlay: SFXOverlayShape = {
      id: sfxId,
      type: 'sound',
      from: transition.from,
      durationInFrames: transition.durationInFrames,
      row: ROW.SFX,
      left: 0, top: 0, width: 0, height: 0,
      isDragging: false, rotation: 0,
      content: sfx.audioUrl,
      src: sfx.audioUrl,
      assetId: sfx.audioAssetId,
      styles: {
        volume: adjustVolumeForProfile(spec.volume, profile),
        opacity: 1,
      },
      metadata: {
        source: 'transition-sfx-placer',
        kbRule: spec.rule,
        transitionStyle: style,
        transitionOverlayId: transition.id,
        token: spec.token,
      },
    };

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
