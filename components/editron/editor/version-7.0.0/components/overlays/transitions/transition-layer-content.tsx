import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { TransitionOverlay, TransitionStyle } from "../../../types";
import { useAllOverlays } from "../../../contexts/rendering-context";

/**
 * TransitionLayerContent — renders the visual effect of a transition.
 *
 * Instead of being a separate visual element, this component modifies
 * the opacity/transform of the adjacent clips (clipA and clipB) via
 * CSS variables that the Layer component reads.
 *
 * For the timeline, it renders a small visual indicator (gradient/icon).
 * For the player, it renders the actual blend effect.
 */
export const TransitionLayerContent: React.FC<{
  overlay: TransitionOverlay;
}> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const allOverlays = useAllOverlays();
  const { transitionStyle, durationInFrames } = overlay;

  // Progress through the transition (0 = start, 1 = end)
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Get the blend visualization based on transition type
  const blendStyle = getBlendVisualization(transitionStyle, progress);

  // Render a subtle visual indicator (the actual blending is done via
  // keyframes on the adjacent clips — see Layer component)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        ...blendStyle,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * Get CSS for the transition blend visualization.
 * This is what the user sees during playback — the actual transition effect.
 */
function getBlendVisualization(
  style: TransitionStyle,
  progress: number,
): React.CSSProperties {
  switch (style) {
    case 'dip-to-black': {
      // Black overlay that peaks at 50% progress
      const opacity = progress < 0.5
        ? interpolate(progress, [0, 0.5], [0, 1])
        : interpolate(progress, [0.5, 1], [1, 0]);
      return { backgroundColor: '#000', opacity };
    }

    case 'dip-to-white': {
      const opacity = progress < 0.5
        ? interpolate(progress, [0, 0.5], [0, 1])
        : interpolate(progress, [0.5, 1], [1, 0]);
      return { backgroundColor: '#fff', opacity };
    }

    case 'flash': {
      // Quick white flash
      const opacity = progress < 0.3
        ? interpolate(progress, [0, 0.15], [0, 1])
        : interpolate(progress, [0.3, 1], [1, 0]);
      return { backgroundColor: '#fff', opacity: Math.max(0, opacity) };
    }

    case 'dissolve':
    case 'zoom-punch':
    case 'blur-transition':
    case 'iris-wipe':
    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down':
    case 'slide-push':
    default:
      // These transitions are done via keyframes on the clips themselves
      // No additional overlay element needed
      return { opacity: 0 };
  }
}
