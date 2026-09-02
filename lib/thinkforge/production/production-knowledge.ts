import type { ProductionEquipment } from './production-capability-profile';
import type { ShotPlan } from './shot-plan';

export type ShotFraming = ShotPlan['scenes'][number]['camera']['framing'];
export type CameraMovement = ShotPlan['scenes'][number]['camera']['movement'];
export type CameraAngle = ShotPlan['scenes'][number]['camera']['angle'];

export interface FramingKnowledge {
  visibleSubjectHeightM: number;
  minimumDistanceM: number;
  knowledgeRef: string;
}

/**
 * Physical capture interpretation of the Creative Knowledge Graph's shot-scale family.
 * Distances are operational starting points, not creative selection rules. The writer owns
 * the desired scale; the resolver only verifies whether that scale fits the available room.
 */
export const FRAMING_KNOWLEDGE: Record<ShotFraming, FramingKnowledge> = {
  'extreme-close-up': { visibleSubjectHeightM: 0.22, minimumDistanceM: 0.45, knowledgeRef: 'technique:shot-type.ecu' },
  'close-up': { visibleSubjectHeightM: 0.45, minimumDistanceM: 0.65, knowledgeRef: 'technique:shot-type.cu' },
  'medium-close-up': { visibleSubjectHeightM: 0.75, minimumDistanceM: 0.9, knowledgeRef: 'technique:shot-type.mcu' },
  medium: { visibleSubjectHeightM: 1.15, minimumDistanceM: 1.2, knowledgeRef: 'technique:shot-type.ms' },
  'medium-wide': { visibleSubjectHeightM: 1.55, minimumDistanceM: 1.7, knowledgeRef: 'signal:visual.shot_scale' },
  wide: { visibleSubjectHeightM: 1.9, minimumDistanceM: 2.3, knowledgeRef: 'technique:shot-type.ws' },
  'extreme-wide': { visibleSubjectHeightM: 3.2, minimumDistanceM: 3.4, knowledgeRef: 'technique:shot-type.ews' },
  'over-shoulder': { visibleSubjectHeightM: 1.15, minimumDistanceM: 1.35, knowledgeRef: 'signal:visual.shot_composition' },
  insert: { visibleSubjectHeightM: 0.3, minimumDistanceM: 0.5, knowledgeRef: 'technique:shot-type.ecu' },
};

export interface MovementRequirement {
  minimumOperators: number;
  acceptableSupports: readonly ProductionEquipment['kind'][];
  positionalTravel: boolean;
  knowledgeRef: string;
}

export const MOVEMENT_REQUIREMENTS: Record<CameraMovement, MovementRequirement> = {
  static: { minimumOperators: 0, acceptableSupports: ['tripod', 'tabletop-stand'], positionalTravel: false, knowledgeRef: 'technique:camera-movement.static' },
  pan: { minimumOperators: 1, acceptableSupports: ['tripod', 'gimbal'], positionalTravel: false, knowledgeRef: 'technique:camera-movement.pan' },
  tilt: { minimumOperators: 1, acceptableSupports: ['tripod', 'gimbal'], positionalTravel: false, knowledgeRef: 'technique:camera-movement.tilt' },
  'push-in': { minimumOperators: 1, acceptableSupports: ['gimbal', 'slider'], positionalTravel: true, knowledgeRef: 'technique:camera-movement.push_in' },
  'pull-out': { minimumOperators: 1, acceptableSupports: ['gimbal', 'slider'], positionalTravel: true, knowledgeRef: 'technique:camera-movement.pull_back' },
  dolly: { minimumOperators: 1, acceptableSupports: ['gimbal', 'slider'], positionalTravel: true, knowledgeRef: 'signal:visual.motion_type' },
  orbit: { minimumOperators: 1, acceptableSupports: ['gimbal'], positionalTravel: true, knowledgeRef: 'technique:camera-movement.orbit' },
  handheld: { minimumOperators: 1, acceptableSupports: [], positionalTravel: false, knowledgeRef: 'technique:camera-movement.handheld' },
  tracking: { minimumOperators: 1, acceptableSupports: ['gimbal'], positionalTravel: true, knowledgeRef: 'technique:camera-movement.tracking' },
};

export const HOUSEHOLD_SUBSTITUTIONS = {
  cameraSupport: {
    id: 'household_camera_support',
    label: 'Stable shelf or secured stack of books',
    instruction: 'Place the camera on a stable surface at eye height and secure it so it cannot slide or fall.',
  },
  fill: {
    id: 'household_white_bounce',
    label: 'White wall, foam board, or bedsheet used as bounce',
    instruction: 'Place a white surface opposite the key light, outside frame, to soften the shadow side of the face.',
  },
} as const;

export const CAMERA_KIND_RANK: Record<Extract<ProductionEquipment, { category: 'camera' }>['kind'], number> = {
  cinema: 6,
  mirrorless: 5,
  dslr: 4,
  phone: 3,
  'action-camera': 2,
  webcam: 1,
};

const TIGHTER_FALLBACKS: Record<ShotFraming, readonly ShotFraming[]> = {
  'extreme-close-up': ['extreme-close-up'],
  'close-up': ['close-up', 'extreme-close-up'],
  'medium-close-up': ['medium-close-up', 'close-up', 'extreme-close-up'],
  medium: ['medium', 'medium-close-up', 'close-up'],
  'medium-wide': ['medium-wide', 'medium', 'medium-close-up', 'close-up'],
  wide: ['wide', 'medium-wide', 'medium', 'medium-close-up'],
  'extreme-wide': ['extreme-wide', 'wide', 'medium-wide', 'medium'],
  'over-shoulder': ['over-shoulder', 'medium-close-up', 'close-up'],
  insert: ['insert', 'extreme-close-up'],
};

export function cameraDistanceForFraming(
  framing: ShotFraming,
  focalLengthEquivalentMm: number,
  orientation: 'landscape' | 'portrait',
): number {
  const framingKnowledge = FRAMING_KNOWLEDGE[framing];
  const equivalentSensorHeightMm = orientation === 'portrait' ? 36 : 24;
  const opticalDistance = (framingKnowledge.visibleSubjectHeightM * focalLengthEquivalentMm) / equivalentSensorHeightMm;
  return Math.max(framingKnowledge.minimumDistanceM, opticalDistance * 1.1);
}

export function resolveFramingForDepth(
  desired: ShotFraming,
  maxCameraDistanceM: number,
  focalLengthEquivalentMm: number,
  orientation: 'landscape' | 'portrait',
): { framing: ShotFraming; distanceM: number; changed: boolean } | null {
  for (const framing of TIGHTER_FALLBACKS[desired]) {
    const distanceM = cameraDistanceForFraming(framing, focalLengthEquivalentMm, orientation);
    // Room measurements are not survey-grade; tolerate one centimetre of float/measurement noise.
    if (distanceM <= maxCameraDistanceM + 0.01) return { framing, distanceM, changed: framing !== desired };
  }
  return null;
}

export function estimateSetupMinutes(input: {
  lightCount: number;
  audioCount: number;
  movingCamera: boolean;
  householdSubstitutionCount: number;
}): number {
  // Operational estimates are isolated here so production telemetry can calibrate them.
  return 3 + input.lightCount * 2 + input.audioCount * 2
    + (input.movingCamera ? 3 : 0) + input.householdSubstitutionCount;
}
