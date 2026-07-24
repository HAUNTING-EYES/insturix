/**
 * Stable editor import surface for keyframe and speed-curve evaluation.
 *
 * The implementation lives in a server-safe module so timeline mutation,
 * preview, and render paths all use identical source-time math.
 */

export {
  computeSpeedSegments,
  evaluateAllTracks,
  evaluateKeyframeTrack,
} from '@/lib/editron/utils/keyframe-math';
export type { SpeedSegment } from '@/lib/editron/utils/keyframe-math';
