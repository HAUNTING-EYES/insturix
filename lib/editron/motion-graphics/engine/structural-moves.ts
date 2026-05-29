/**
 * Structural Move Vocabulary
 *
 * A move is a small, reusable cluster of primitives that attaches to the content
 * block to give it a structural "register" (news, broadcast, editorial, energetic).
 * Moves are SELECTED by signals (overlay scoring, see mg.structure.* overlays) and
 * COMPOSED on top of any content skeleton — the same composeIdentity yields a clean
 * news lower-third or an energetic backdrop one depending on which moves fire.
 *
 * This is the Tier 3 unlock: structure emerges from a signal-selected vocabulary,
 * not 8 hand-written skeletons. Bounded primitives, unbounded combinations.
 *
 * Every move:
 *   - is a pure function (tokens [+ content]) => RecipeElement[]
 *   - uses ONLY existing primitives (shape, container, decoration, text)
 *   - binds colors/fonts to tokens (brand-driven), never hardcoded
 *   - namespaces roles 'sm-<move>' so they never collide with content roles
 *   - attaches via the anchor system (deterministic CSS, no DOM measurement)
 *
 * ⚠️ Pixel dimensions are INVENTED broadcast-standard defaults, refined via the
 * structural-gate render check + overlay-score tuning. They are BOUNDS, not values
 * the system can't change.
 */

import type { RecipeElement } from './recipe-types';
import type { MotionTokens } from '../types';

/** Thin horizontal accent rule at the bottom of the content block. News/structural. */
export function moveAccentLine(): RecipeElement[] {
  return [{
    primitive: 'decoration',
    role: 'sm-accent-line',
    layer: 'midground',
    shape: 'line',
    anchor: { mode: 'block-edge', side: 'bottom', thickness: 3 }, // ⚠️ 3px INVENTED
    bind: { color: 'token:color.accent', width: 3 },
  }];
}

/** Vertical accent bar on the left edge of the block. Broadcast lower-third. */
export function moveSideBar(): RecipeElement[] {
  return [{
    primitive: 'shape',
    role: 'sm-side-bar',
    layer: 'midground',
    shape: 'rect',
    anchor: { mode: 'block-edge', side: 'left', thickness: 5 }, // ⚠️ 5px INVENTED
    bind: { fill: 'token:color.accent' },
  }];
}

/** Glass/solid rounded card behind the entire content block. Modern/clean separation. */
export function moveBackdropCard(tokens: MotionTokens): RecipeElement[] {
  return [{
    primitive: 'container',
    role: 'sm-backdrop',
    layer: 'background',
    shape: tokens.surface.cornerRadius > 12 ? 'pill' : 'rect',
    anchor: { mode: 'block-fill', inset: -14 }, // ⚠️ -14px INVENTED — card padding around text
    bind: {
      fill: 'token:color.surfaceBase',
      opacity: 'token:surface.surfaceOpacity',
      blur: 'token:surface.backdropBlur',
      radius: 'token:surface.cornerRadius',
      borderWeight: 'token:surface.borderWeight',
      borderOpacity: 'token:surface.borderOpacity',
      shadow: 'token:surface.shadow',
    },
  }];
}

/** Hairline rule that separates stacked content (e.g. name / title). Editorial. */
export function moveDivider(): RecipeElement[] {
  return [{
    primitive: 'decoration',
    role: 'sm-divider',
    layer: 'foreground',
    shape: 'line',
    anchor: { mode: 'flow-span', thickness: 1 }, // ⚠️ 1px INVENTED — hairline
    bind: { color: 'token:color.textSecondary', width: 1, opacity: 0.3 }, // ⚠️ 0.3 INVENTED
  }];
}

/** Bold accent stroke under the primary line. Marker-style emphasis. */
export function moveUnderline(): RecipeElement[] {
  return [{
    primitive: 'decoration',
    role: 'sm-underline',
    layer: 'foreground',
    shape: 'line',
    anchor: { mode: 'flow-span', thickness: 5 }, // ⚠️ 5px INVENTED — heavier than divider
    bind: { color: 'token:color.accent', width: 5 },
  }];
}

/** Small uppercase tracked label above the primary (category / section tag). */
export function moveKicker(text: string): RecipeElement[] {
  return [{
    primitive: 'text',
    role: 'sm-kicker',
    layer: 'foreground',
    bind: {
      text,
      font: 'token:typography.bodyFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.accent',
      transform: 'uppercase',
      tracking: '0.15em', // ⚠️ INVENTED — kicker tracking, broadcast standard
      minSize: 14,        // ⚠️ 14px INVENTED — small label
    },
  }];
}
