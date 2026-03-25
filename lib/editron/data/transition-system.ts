/**
 * Production Transition System
 *
 * Transitions work by OVERLAPPING two adjacent clips and applying
 * keyframe animations to both during the overlap zone. No HTML overlays.
 *
 * How it works:
 * 1. Scene A's overlay is extended by overlapFrames past its normal end
 * 2. Scene B's overlay is started overlapFrames before its normal start
 * 3. Both clips play simultaneously in the overlap zone
 * 4. Keyframe tracks control the blend (opacity, clip-path, transform, etc.)
 *
 * This is how DaVinci Resolve, Premiere, and Final Cut do transitions.
 */

import type { KeyframeTrack, Keyframe } from '../../editor/version-7.0.0/types';

// ─── Transition Type Definitions ─────────────────────────────────

export type TransitionCategory = 'blend' | 'wipe' | 'push' | 'zoom' | 'editorial';

export interface TransitionDefinition {
  id: string;
  name: string;
  category: TransitionCategory;
  description: string;
  /** Default duration in frames (at 30fps) */
  defaultDurationFrames: number;
  /** Min/max duration range */
  minFrames: number;
  maxFrames: number;
  /** Whether this transition creates visual overlap (false = editorial cut, no overlay) */
  hasVisualOverlap: boolean;
  /** Preview thumbnail/icon class */
  icon: string;
  /** Generate keyframe tracks for outgoing clip (Scene A) */
  getOutgoingTracks: (overlapFrames: number, width: number, height: number) => KeyframeTrack[];
  /** Generate keyframe tracks for incoming clip (Scene B) */
  getIncomingTracks: (overlapFrames: number, width: number, height: number) => KeyframeTrack[];
}

// ─── Keyframe Helpers ────────────────────────────────────────────

function kf(frame: number, value: number, easing: Keyframe['easing'] = 'ease-in-out'): Keyframe {
  return { frame, value, easing };
}

function track(property: KeyframeTrack['property'], keyframes: Keyframe[]): KeyframeTrack {
  return { property, keyframes };
}

// ─── Transition Library ──────────────────────────────────────────

export const TRANSITIONS: Record<string, TransitionDefinition> = {
  // ─── BLEND ─────────────────────────────────────────────
  'dissolve': {
    id: 'dissolve',
    name: 'Dissolve',
    category: 'blend',
    description: 'Classic cross-dissolve — outgoing fades out while incoming fades in',
    defaultDurationFrames: 15, // 0.5s at 30fps
    minFrames: 6,
    maxFrames: 60,
    hasVisualOverlap: true,
    icon: 'Layers',
    getOutgoingTracks: (frames) => [
      track('opacity', [kf(0, 1), kf(frames, 0, 'ease-in')]),
    ],
    getIncomingTracks: (frames) => [
      track('opacity', [kf(0, 0), kf(frames, 1, 'ease-out')]),
    ],
  },

  'dip-to-black': {
    id: 'dip-to-black',
    name: 'Dip to Black',
    category: 'blend',
    description: 'Fade to black, then fade up — standard scene break',
    defaultDurationFrames: 18,
    minFrames: 8,
    maxFrames: 60,
    hasVisualOverlap: true,
    icon: 'Moon',
    getOutgoingTracks: (frames) => [
      track('opacity', [kf(0, 1), kf(Math.floor(frames * 0.45), 0, 'ease-in')]),
    ],
    getIncomingTracks: (frames) => [
      track('opacity', [kf(Math.floor(frames * 0.55), 0), kf(frames, 1, 'ease-out')]),
    ],
  },

  'dip-to-white': {
    id: 'dip-to-white',
    name: 'Dip to White',
    category: 'blend',
    description: 'Flash to white, then reveal — used for revelations and dream sequences',
    defaultDurationFrames: 12,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'Sun',
    getOutgoingTracks: (frames) => [
      // Brightens to white (scale up opacity beyond 1 won't work, so we use scale as brightness proxy)
      track('opacity', [kf(0, 1), kf(Math.floor(frames * 0.4), 0, 'ease-in')]),
      track('scale', [kf(0, 1), kf(Math.floor(frames * 0.4), 1.02)]),
    ],
    getIncomingTracks: (frames) => [
      track('opacity', [kf(Math.floor(frames * 0.6), 0), kf(frames, 1, 'ease-out')]),
    ],
  },

  // ─── WIPE ──────────────────────────────────────────────
  'wipe-left': {
    id: 'wipe-left',
    name: 'Wipe Left',
    category: 'wipe',
    description: 'Incoming scene wipes in from right to left',
    defaultDurationFrames: 15,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'ArrowLeft',
    getOutgoingTracks: (frames) => [
      track('x', [kf(0, 0), kf(frames, -100, 'ease-in-out')]), // slides left off screen (percentage based)
    ],
    getIncomingTracks: (frames) => [
      track('x', [kf(0, 100), kf(frames, 0, 'ease-in-out')]), // slides in from right
    ],
  },

  'wipe-right': {
    id: 'wipe-right',
    name: 'Wipe Right',
    category: 'wipe',
    description: 'Incoming scene wipes in from left to right',
    defaultDurationFrames: 15,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'ArrowRight',
    getOutgoingTracks: (frames) => [
      track('x', [kf(0, 0), kf(frames, 100, 'ease-in-out')]),
    ],
    getIncomingTracks: (frames) => [
      track('x', [kf(0, -100), kf(frames, 0, 'ease-in-out')]),
    ],
  },

  'slide-up': {
    id: 'slide-up',
    name: 'Slide Up',
    category: 'push',
    description: 'Incoming scene pushes up, outgoing slides away',
    defaultDurationFrames: 15,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'ArrowUp',
    getOutgoingTracks: (frames) => [
      track('y', [kf(0, 0), kf(frames, -100, 'ease-in-out')]),
    ],
    getIncomingTracks: (frames) => [
      track('y', [kf(0, 100), kf(frames, 0, 'ease-in-out')]),
    ],
  },

  'slide-down': {
    id: 'slide-down',
    name: 'Slide Down',
    category: 'push',
    description: 'Incoming scene pushes down from top',
    defaultDurationFrames: 15,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'ArrowDown',
    getOutgoingTracks: (frames) => [
      track('y', [kf(0, 0), kf(frames, 100, 'ease-in-out')]),
    ],
    getIncomingTracks: (frames) => [
      track('y', [kf(0, -100), kf(frames, 0, 'ease-in-out')]),
    ],
  },

  // ─── ZOOM ──────────────────────────────────────────────
  'zoom-punch': {
    id: 'zoom-punch',
    name: 'Zoom Punch',
    category: 'zoom',
    description: 'Quick zoom in + cut — high energy, beat-synced',
    defaultDurationFrames: 8,
    minFrames: 4,
    maxFrames: 20,
    hasVisualOverlap: true,
    icon: 'ZoomIn',
    getOutgoingTracks: (frames) => [
      track('scale', [kf(0, 1), kf(frames, 1.15, 'ease-in')]),
      track('opacity', [kf(Math.floor(frames * 0.7), 1), kf(frames, 0)]),
    ],
    getIncomingTracks: (frames) => [
      track('scale', [kf(0, 0.85), kf(frames, 1, 'ease-out')]),
      track('opacity', [kf(0, 0), kf(Math.floor(frames * 0.3), 1)]),
    ],
  },

  'zoom-out': {
    id: 'zoom-out',
    name: 'Zoom Out',
    category: 'zoom',
    description: 'Outgoing zooms out while incoming zooms to normal',
    defaultDurationFrames: 15,
    minFrames: 6,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'ZoomOut',
    getOutgoingTracks: (frames) => [
      track('scale', [kf(0, 1), kf(frames, 0.7, 'ease-in')]),
      track('opacity', [kf(0, 1), kf(frames, 0)]),
    ],
    getIncomingTracks: (frames) => [
      track('scale', [kf(0, 1.3), kf(frames, 1, 'ease-out')]),
      track('opacity', [kf(0, 0), kf(frames, 1)]),
    ],
  },

  // ─── STYLIZED ──────────────────────────────────────────
  'flash': {
    id: 'flash',
    name: 'Flash',
    category: 'blend',
    description: 'White flash burst at cut point — reveals and impacts',
    defaultDurationFrames: 8,
    minFrames: 4,
    maxFrames: 18,
    hasVisualOverlap: true,
    icon: 'Zap',
    getOutgoingTracks: (frames) => [
      track('opacity', [kf(0, 1), kf(Math.floor(frames * 0.3), 0)]),
      track('scale', [kf(0, 1), kf(Math.floor(frames * 0.3), 1.05)]),
    ],
    getIncomingTracks: (frames) => [
      track('opacity', [kf(Math.floor(frames * 0.5), 0), kf(frames, 1, 'ease-out')]),
    ],
  },

  'blur-transition': {
    id: 'blur-transition',
    name: 'Blur Bridge',
    category: 'blend',
    description: 'Motion blur crossfade — smooth and cinematic',
    defaultDurationFrames: 18,
    minFrames: 10,
    maxFrames: 45,
    hasVisualOverlap: true,
    icon: 'Eye',
    getOutgoingTracks: (frames) => [
      track('opacity', [kf(0, 1), kf(frames, 0, 'ease-in')]),
      track('scale', [kf(0, 1), kf(frames, 1.03)]),
    ],
    getIncomingTracks: (frames) => [
      track('opacity', [kf(0, 0), kf(frames, 1, 'ease-out')]),
      track('scale', [kf(0, 1.03), kf(frames, 1)]),
    ],
  },

  // ─── EDITORIAL (no visual overlap) ─────────────────────
  'hard-cut': {
    id: 'hard-cut',
    name: 'Hard Cut',
    category: 'editorial',
    description: 'Standard cut — clean and intentional',
    defaultDurationFrames: 0,
    minFrames: 0,
    maxFrames: 0,
    hasVisualOverlap: false,
    icon: 'Scissors',
    getOutgoingTracks: () => [],
    getIncomingTracks: () => [],
  },

  'smash-cut': {
    id: 'smash-cut',
    name: 'Smash Cut',
    category: 'editorial',
    description: 'Abrupt cut for shock — used after a calm moment for contrast',
    defaultDurationFrames: 0,
    minFrames: 0,
    maxFrames: 0,
    hasVisualOverlap: false,
    icon: 'AlertTriangle',
    getOutgoingTracks: () => [],
    getIncomingTracks: () => [],
  },

  'match-cut': {
    id: 'match-cut',
    name: 'Match Cut',
    category: 'editorial',
    description: 'Cut where compositions match — requires similar visual elements',
    defaultDurationFrames: 0,
    minFrames: 0,
    maxFrames: 0,
    hasVisualOverlap: false,
    icon: 'Copy',
    getOutgoingTracks: () => [],
    getIncomingTracks: () => [],
  },

  'jump-cut': {
    id: 'jump-cut',
    name: 'Jump Cut',
    category: 'editorial',
    description: 'Same angle, time skip — YouTube/vlog staple',
    defaultDurationFrames: 0,
    minFrames: 0,
    maxFrames: 0,
    hasVisualOverlap: false,
    icon: 'SkipForward',
    getOutgoingTracks: () => [],
    getIncomingTracks: () => [],
  },

  'cut-on-action': {
    id: 'cut-on-action',
    name: 'Cut on Action',
    category: 'editorial',
    description: 'Cut timed to subject movement — seamless and invisible',
    defaultDurationFrames: 0,
    minFrames: 0,
    maxFrames: 0,
    hasVisualOverlap: false,
    icon: 'Play',
    getOutgoingTracks: () => [],
    getIncomingTracks: () => [],
  },
};

// ─── Transition Application ──────────────────────────────────────

export interface ApplyTransitionResult {
  outgoingOverlayUpdate: {
    durationInFrames: number; // extended duration
    keyframeTracks: KeyframeTrack[];
  };
  incomingOverlayUpdate: {
    from: number; // moved earlier
    durationInFrames: number; // extended duration
    keyframeTracks: KeyframeTrack[];
  };
  overlapFrames: number;
}

/**
 * Calculate the overlay modifications needed to apply a transition
 * between two adjacent clips.
 *
 * @param transitionId - The transition type to apply
 * @param outgoingOverlay - Scene A (ending clip)
 * @param incomingOverlay - Scene B (starting clip)
 * @param overlapFrames - How many frames of overlap (default from transition def)
 */
export function calculateTransition(
  transitionId: string,
  outgoingOverlay: { from: number; durationInFrames: number; width: number; height: number },
  incomingOverlay: { from: number; durationInFrames: number },
  customOverlapFrames?: number,
): ApplyTransitionResult | null {
  const def = TRANSITIONS[transitionId];
  if (!def || !def.hasVisualOverlap) {
    // Editorial cut — no changes needed
    return null;
  }

  const overlapFrames = customOverlapFrames ?? def.defaultDurationFrames;
  const halfOverlap = Math.floor(overlapFrames / 2);

  // Outgoing clip: extend by halfOverlap frames past its normal end
  // Keyframes are LOCAL to the overlap zone (0 = start of overlap)
  const outTracks = def.getOutgoingTracks(overlapFrames, outgoingOverlay.width, outgoingOverlay.height);
  // Offset keyframes to be relative to the END of the outgoing clip
  const outTracksOffset = outTracks.map(t => ({
    ...t,
    keyframes: t.keyframes.map(k => ({
      ...k,
      frame: (outgoingOverlay.durationInFrames - halfOverlap) + k.frame,
    })),
  }));

  // Incoming clip: start halfOverlap frames earlier
  const inTracks = def.getIncomingTracks(overlapFrames, outgoingOverlay.width, outgoingOverlay.height);
  // Keyframes are at the beginning of the incoming clip (already 0-based)

  return {
    outgoingOverlayUpdate: {
      durationInFrames: outgoingOverlay.durationInFrames + halfOverlap,
      keyframeTracks: outTracksOffset,
    },
    incomingOverlayUpdate: {
      from: incomingOverlay.from - halfOverlap,
      durationInFrames: incomingOverlay.durationInFrames + halfOverlap,
      keyframeTracks: inTracks,
    },
    overlapFrames,
  };
}

/**
 * Get all transitions grouped by category for the browser panel.
 */
export function getTransitionsByCategory(): Record<TransitionCategory, TransitionDefinition[]> {
  const grouped: Record<TransitionCategory, TransitionDefinition[]> = {
    blend: [],
    wipe: [],
    push: [],
    zoom: [],
    editorial: [],
  };

  for (const def of Object.values(TRANSITIONS)) {
    grouped[def.category].push(def);
  }

  return grouped;
}
