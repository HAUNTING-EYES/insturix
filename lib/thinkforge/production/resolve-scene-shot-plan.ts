import { z } from 'zod';

import {
  parseProductionCapabilityProfile,
  type ProductionCapabilityProfile,
  type ProductionEquipment,
} from './production-capability-profile';
import {
  CAMERA_KIND_RANK,
  FRAMING_KNOWLEDGE,
  HOUSEHOLD_SUBSTITUTIONS,
  MOVEMENT_REQUIREMENTS,
  estimateSetupMinutes,
  resolveFramingForDepth,
  type CameraAngle,
  type CameraMovement,
  type ShotFraming,
} from './production-knowledge';
import {
  addSceneShotIntentIssues,
  SceneShotIntentObjectSchema,
} from './scene-shot-intent';
import { parseShotPlan, SHOT_PLAN_VERSION, type ShotPlan } from './shot-plan';

type CameraEquipment = Extract<ProductionEquipment, { category: 'camera' }>;
type SupportEquipment = Extract<ProductionEquipment, { category: 'support' }>;
type LightEquipment = Extract<ProductionEquipment, { category: 'light' }>;
type AudioEquipment = Extract<ProductionEquipment, { category: 'audio' }>;
type ModifierEquipment = Extract<ProductionEquipment, { category: 'modifier' }>;
type PlanResource = ShotPlan['resources'][number];

export const SceneProductionIntentSchema = z.object({
  sceneId: z.string().min(1),
  sidecarSceneIndex: z.number().int().min(0),
  generationUnitId: z.string().min(1),
  durationSec: z.number().finite().positive(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']),
  ...SceneShotIntentObjectSchema.shape,
}).strict().superRefine(addSceneShotIntentIssues);

export type SceneProductionIntent = z.infer<typeof SceneProductionIntentSchema>;

export interface ShotPlanBlocker {
  code: 'camera_required' | 'camera_orientation' | 'performer_capacity' | 'stable_support_required'
    | 'camera_selection' | 'camera_calibration' | 'space_required' | 'space_selection'
    | 'room_depth' | 'subject_calibration' | 'audio_required' | 'setup_time' | 'budget';
  message: string;
}

export type SceneShotPlanResolution =
  | { status: 'resolved'; plan: ShotPlan }
  | { status: 'needs-user-input'; blockers: ShotPlanBlocker[]; questions: string[] };

export interface ResolveSceneShotPlanInput {
  profile: unknown;
  intent: unknown;
  tier?: ShotPlan['tier'];
}

function sourceForEquipment(item: ProductionEquipment): PlanResource['source'] {
  if (item.availability === 'rental-approved') return 'rent';
  if (item.availability === 'purchase-approved') return 'buy';
  return item.availability;
}

function itemCost(item: ProductionEquipment): number {
  return item.availability === 'owned' || item.availability === 'borrowed'
    ? 0
    : item.estimatedIncrementalCost;
}

function itemAllowed(
  item: ProductionEquipment,
  profile: ProductionCapabilityProfile,
  tier: ShotPlan['tier'],
  remainingBudget: number,
): boolean {
  if (item.availability === 'owned' || item.availability === 'borrowed') return true;
  if (tier === 'no-spend' || item.estimatedIncrementalCost > remainingBudget) return false;
  if (item.availability === 'rental-approved') return profile.constraints.rentalAllowed;
  return profile.constraints.purchaseAllowed;
}

function rankEquipment<T extends ProductionEquipment>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.preferred !== right.preferred) return left.preferred ? -1 : 1;
    const costDelta = itemCost(left) - itemCost(right);
    if (costDelta !== 0) return costDelta;
    if (left.category === 'camera' && right.category === 'camera') {
      return CAMERA_KIND_RANK[right.kind] - CAMERA_KIND_RANK[left.kind];
    }
    return left.id.localeCompare(right.id);
  });
}

function equipmentResource(item: ProductionEquipment): PlanResource {
  return {
    id: `equipment_${item.id}`,
    category: item.category,
    label: item.label,
    source: sourceForEquipment(item),
    quantity: 1,
    equipmentId: item.id,
    incrementalCost: itemCost(item),
    required: true,
    notes: [...item.notes],
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function orientationForAspect(aspectRatio: SceneProductionIntent['aspectRatio']): 'landscape' | 'portrait' {
  return aspectRatio === '9:16' || aspectRatio === '4:5' ? 'portrait' : 'landscape';
}

function focalLengthForCamera(camera: CameraEquipment): number | null {
  const range = camera.focalLengthEquivalentMm;
  if (!range) return null;
  return Math.min(range.max, Math.max(range.min, 35));
}

function measuredEyeHeightForStance(
  profile: ProductionCapabilityProfile,
  stance: SceneProductionIntent['performance'][number]['stance'],
): number | null {
  return profile.people.subjectCalibration?.eyeHeightMByStance[stance] ?? null;
}

function heightForAngle(angle: CameraAngle, eyeHeight: number): number {
  if (angle === 'high') return eyeHeight + 0.35;
  if (angle === 'low') return Math.max(0.35, eyeHeight - 0.35);
  if (angle === 'overhead') return eyeHeight + 0.9;
  return eyeHeight;
}

function movementPath(
  movement: CameraMovement,
  distance: number,
  maxDistance: number,
): Array<{ x: number; y: number; z: number }> {
  const d = distance;
  const maxD = maxDistance;
  if (movement === 'push-in' || movement === 'dolly') return [{ x: 0, y: 0, z: -d }, { x: 0, y: 0, z: -(d * 0.78) }];
  if (movement === 'pull-out') return [{ x: 0, y: 0, z: -d }, { x: 0, y: 0, z: -Math.min(maxD, d * 1.2) }];
  if (movement === 'tracking') return [{ x: -0.45, y: 0, z: -d }, { x: 0.45, y: 0, z: -d }];
  if (movement === 'orbit') return [{ x: -0.45, y: 0, z: -d }, { x: 0, y: 0, z: -(d * 0.8) }, { x: 0.45, y: 0, z: -d }];
  return [];
}

function upgradeBenefit(item: ProductionEquipment): string {
  if (item.category === 'light') return 'More consistent exposure and facial modelling when natural light changes.';
  if (item.category === 'audio') return 'Cleaner speech with less room echo and background noise.';
  if (item.category === 'support') return 'More stable framing and access to controlled camera movement.';
  if (item.category === 'camera') return 'More framing and lens flexibility for this scene.';
  return 'Adds production control without changing the creative intent.';
}

function priorityRank(profile: ProductionCapabilityProfile, priority: ProductionCapabilityProfile['preferences']['prioritize'][number]): number {
  const index = profile.preferences.prioritize.indexOf(priority);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

export function resolveSceneShotPlan(input: ResolveSceneShotPlanInput): SceneShotPlanResolution {
  const profile = parseProductionCapabilityProfile(input.profile);
  const intent = SceneProductionIntentSchema.parse(input.intent);
  const tier = input.tier ?? profile.preferences.defaultPlanTier;
  const orientation = orientationForAspect(intent.aspectRatio);
  const blockers: ShotPlanBlocker[] = [];
  const questions: string[] = [];
  let spent = 0;
  const remainingBudget = () => profile.constraints.maxIncrementalSpend - spent;
  const eligible = <T extends ProductionEquipment>(items: T[]) => rankEquipment(items.filter(
    (item) => itemAllowed(item, profile, tier, remainingBudget()),
  ));

  const cameras = eligible(profile.equipment.filter(
    (item): item is CameraEquipment => item.category === 'camera' && item.orientations.includes(orientation),
  ));
  const preferredCameras = cameras.filter((item) => item.preferred);
  if (cameras.length > 1 && preferredCameras.length !== 1) {
    return {
      status: 'needs-user-input',
      blockers: [{
        code: 'camera_selection',
        message: `More than one approved camera supports ${orientation} capture, but none is uniquely selected.`,
      }],
      questions: ['Choose one camera as preferred for this production profile.'],
    };
  }
  const camera = preferredCameras[0] ?? cameras[0];
  if (!camera) {
    const hasCamera = profile.equipment.some((item) => item.category === 'camera');
    blockers.push({
      code: hasCamera ? 'camera_orientation' : 'camera_required',
      message: hasCamera
        ? `No approved camera supports ${orientation} capture within the selected tier and budget.`
        : 'A physical shoot plan requires at least one available camera or phone.',
    });
    questions.push(hasCamera ? `Which camera may be used in ${orientation} orientation?` : 'Which phone or camera will you use?');
    return { status: 'needs-user-input', blockers, questions };
  }
  spent += itemCost(camera);
  const focalLengthEquivalentMm = focalLengthForCamera(camera);
  if (focalLengthEquivalentMm === null) {
    return {
      status: 'needs-user-input',
      blockers: [{
        code: 'camera_calibration',
        message: `${camera.label} has no confirmed equivalent focal-length range, so ThinkForge cannot calculate camera distance.`,
      }],
      questions: ['Add the camera or lens equivalent focal-length range to the production profile.'],
    };
  }

  if (intent.simultaneousPerformers > profile.people.performersAvailable) {
    blockers.push({
      code: 'performer_capacity',
      message: `${intent.simultaneousPerformers} simultaneous performers are required, but only ${profile.people.performersAvailable} are available.`,
    });
    questions.push('Will you add performers, or should ThinkForge restage the scene for fewer people?');
    return { status: 'needs-user-input', blockers, questions };
  }

  const warnings: string[] = [];
  const assumptions: string[] = [];
  let framing: ShotFraming = intent.desiredFraming;
  if (intent.action === 'demonstrating' && (framing === 'wide' || framing === 'extreme-wide')) {
    framing = 'medium';
    warnings.push('Framing tightened to medium so the demonstrated action remains readable.');
  }
  if (intent.simultaneousPerformers > 1
    && ['extreme-close-up', 'close-up', 'medium-close-up', 'insert'].includes(framing)) {
    framing = 'medium-wide';
    warnings.push('Framing widened to keep all simultaneous performers visible.');
  }

  if (profile.spaces.length === 0) {
    return {
      status: 'needs-user-input',
      blockers: [{ code: 'space_required', message: 'A measured physical space is required before camera positions can be planned.' }],
      questions: ['Add the space you will use and its usable depth.'],
    };
  }
  const preferredSpaces = profile.spaces.filter((candidate) => candidate.preferred);
  if (profile.spaces.length > 1 && preferredSpaces.length !== 1) {
    return {
      status: 'needs-user-input',
      blockers: [{ code: 'space_selection', message: 'More than one production space is available and none is selected for this capture.' }],
      questions: ['Choose one production space as preferred before resolving camera positions.'],
    };
  }
  const space = preferredSpaces[0] ?? profile.spaces[0]!;
  const measuredDepthM = space?.usableDepthM ?? space?.dimensionsM?.depth;
  if (measuredDepthM === undefined) {
    return {
      status: 'needs-user-input',
      blockers: [{ code: 'room_depth', message: `${space.label} has no confirmed usable depth, so ThinkForge cannot place a camera safely.` }],
      questions: ['Measure and add the usable depth, or complete a live framing calibration before generating a technical plan.'],
    };
  }
  const maxCameraDistance = Math.max(0, measuredDepthM - 0.8);
  const framingResolution = resolveFramingForDepth(
    framing,
    maxCameraDistance,
    focalLengthEquivalentMm,
    orientation,
  );
  if (!framingResolution) {
    blockers.push({ code: 'room_depth', message: `The available depth (${measuredDepthM.toFixed(1)}m) cannot safely fit the requested shot.` });
    questions.push('Can you provide a deeper room, a wider lens, or approve a tighter insert-style shot?');
    return { status: 'needs-user-input', blockers, questions };
  }
  if (framingResolution.changed) {
    warnings.push(`Framing changed from ${framing} to ${framingResolution.framing} to fit the available room depth.`);
    framing = framingResolution.framing;
  }
  const cameraDistance = framingResolution.distanceM;

  let angle: CameraAngle = intent.desiredAngle;
  let movement: CameraMovement = intent.desiredMovement;
  const movementRequirement = MOVEMENT_REQUIREMENTS[movement];
  const supports = eligible(profile.equipment.filter(
    (item): item is SupportEquipment => item.category === 'support'
      && movementRequirement.acceptableSupports.includes(item.kind),
  ));
  let support = supports[0];
  const hasOperator = profile.people.cameraOperatorsAvailable >= movementRequirement.minimumOperators;

  if (!hasOperator || (movementRequirement.acceptableSupports.length > 0 && !support)) {
    warnings.push(`Requested ${movement} movement is not feasible with the available operator/support profile; using a locked static shot.`);
    movement = 'static';
    const staticSupports = eligible(profile.equipment.filter(
      (item): item is SupportEquipment => item.category === 'support'
        && MOVEMENT_REQUIREMENTS.static.acceptableSupports.includes(item.kind),
    ));
    support = staticSupports[0];
  }
  if (support) spent += itemCost(support);

  let householdSupport = false;
  if (movement === 'static' && !support) {
    if (profile.preferences.householdSubstitutionsAllowed) {
      householdSupport = true;
      assumptions.push(`A ${HOUSEHOLD_SUBSTITUTIONS.cameraSupport.label.toLowerCase()} is available and safe to use.`);
    } else {
      blockers.push({ code: 'stable_support_required', message: 'A locked shot requires a stable support, but none is available or approved.' });
      questions.push('Can you add a tripod/tabletop stand or allow a secured household surface?');
      return { status: 'needs-user-input', blockers, questions };
    }
  }

  if (intent.performance.length === 0) {
    return {
      status: 'needs-user-input',
      blockers: [{
        code: 'subject_calibration',
        message: 'This legacy physical scene has no measured subject reference, so ThinkForge cannot place camera or light targets without inventing geometry.',
      }],
      questions: ['Regenerate this scene with the semantic capture contract before planning its physical setup.'],
    };
  }
  const leadStance = intent.performance[0]!.stance;
  const leadEyeHeight = measuredEyeHeightForStance(profile, leadStance);
  if (leadEyeHeight === null) {
    return {
      status: 'needs-user-input',
      blockers: [{
        code: 'subject_calibration',
        message: `The legacy physical scene has ${leadStance} performance direction but no measured ${leadStance} eye height. Performance direction is not geometry evidence.`,
      }],
      questions: [`Measure the lead performer's ${leadStance} eye height in the production profile, or regenerate this scene with the semantic capture contract.`],
    };
  }
  if (angle === 'overhead') {
    const requiredHeight = leadEyeHeight + 0.9;
    if (!support || profile.people.cameraOperatorsAvailable < 1 || (support.maxHeightM ?? 0) < requiredHeight) {
      angle = 'high';
      warnings.push('Overhead angle changed to high angle because the available support/operator cannot place the camera safely overhead.');
    }
  }

  const resources: PlanResource[] = [equipmentResource(camera)];
  if (support) resources.push(equipmentResource(support));
  if (householdSupport) {
    resources.push({
      id: HOUSEHOLD_SUBSTITUTIONS.cameraSupport.id,
      category: 'household',
      label: HOUSEHOLD_SUBSTITUTIONS.cameraSupport.label,
      source: 'household',
      quantity: 1,
      incrementalCost: 0,
      required: true,
      notes: [HOUSEHOLD_SUBSTITUTIONS.cameraSupport.instruction],
    });
  }
  if (space) {
    resources.push({ id: `space_${space.id}`, category: 'space', label: space.label, source: 'owned', quantity: 1, incrementalCost: 0, required: true, notes: [...space.constraints] });
  }

  const availableLights = eligible(profile.equipment.filter((item): item is LightEquipment => item.category === 'light'));
  const naturalLight = space?.naturalLightSources[0];
  const preferControlledLight = priorityRank(profile, 'image-quality')
    < priorityRank(profile, 'cost') && availableLights.length > 0;
  const selectedLight = preferControlledLight || !naturalLight ? availableLights[0] : undefined;
  if (selectedLight) {
    spent += itemCost(selectedLight);
    resources.push(equipmentResource(selectedLight));
  } else if (naturalLight) {
    resources.push({ id: `natural_${naturalLight.id}`, category: 'light', label: `${naturalLight.kind} key light`, source: 'natural', quantity: 1, incrementalCost: 0, required: true, notes: naturalLight.notes ? [naturalLight.notes] : [] });
    assumptions.push(`The ${naturalLight.kind} provides stable usable light at the planned shoot time.`);
  } else if (profile.preferences.householdSubstitutionsAllowed) {
    resources.push({ id: 'household_existing_lamp', category: 'household', label: 'Existing shaded household lamp', source: 'household', quantity: 1, incrementalCost: 0, required: true, notes: ['Keep fabric and diffusion material away from hot bulbs.'] });
    assumptions.push('A safe, existing shaded household lamp is available as the key light.');
  } else {
    warnings.push('No controllable key light is available; exposure and facial modelling must be checked on location.');
  }

  const modifiers = eligible(profile.equipment.filter((item): item is ModifierEquipment => item.category === 'modifier'));
  const selectedModifier = modifiers.find((item) => item.kind === 'reflector' || item.kind === 'bounce-board');
  let householdFill = false;
  if (selectedModifier) {
    spent += itemCost(selectedModifier);
    resources.push(equipmentResource(selectedModifier));
  } else if (profile.preferences.householdSubstitutionsAllowed) {
    householdFill = true;
    resources.push({ id: HOUSEHOLD_SUBSTITUTIONS.fill.id, category: 'household', label: HOUSEHOLD_SUBSTITUTIONS.fill.label, source: 'household', quantity: 1, incrementalCost: 0, required: false, notes: [HOUSEHOLD_SUBSTITUTIONS.fill.instruction] });
    assumptions.push(`A ${HOUSEHOLD_SUBSTITUTIONS.fill.label.toLowerCase()} is available.`);
  }

  const requiredAudioSubjects = intent.spokenAudio ? intent.performance.length : 0;
  const audioItems = intent.spokenAudio
    ? eligible(profile.equipment.filter(
      (item): item is AudioEquipment => item.category === 'audio'
        && item.maxSubjects >= requiredAudioSubjects,
    ))
    : [];
  const audio = audioItems[0];
  if (audio) {
    spent += itemCost(audio);
    resources.push(equipmentResource(audio));
  } else if (intent.spokenAudio) {
    if (requiredAudioSubjects > 1) {
      blockers.push({
        code: 'audio_required',
        message: `The scene records ${requiredAudioSubjects} speaking performers, but no approved audio setup covers that many subjects.`,
      });
      questions.push(`Can you add an audio setup rated for at least ${requiredAudioSubjects} subjects or restage the speaking beat?`);
      return { status: 'needs-user-input', blockers, questions };
    }
    if (space?.noiseFloor === 'noisy') {
      blockers.push({ code: 'audio_required', message: 'The room is marked noisy and no suitable speech microphone is available.' });
      questions.push('Can you add a suitable lav/shotgun microphone or move the shoot to a quieter room?');
      return { status: 'needs-user-input', blockers, questions };
    }
    resources.push({ id: `builtin_audio_${camera.id}`, category: 'audio', label: `${camera.label} built-in microphone`, source: sourceForEquipment(camera), quantity: 1, equipmentId: camera.id, incrementalCost: 0, required: true, notes: ['Keep the camera within 0.8m of the speaker and record a ten-second room-tone test.'] });
    warnings.push('Using the camera built-in microphone; keep the camera close and verify room noise before recording.');
  }

  const sceneKey = safeId(intent.sceneId);
  const setupId = `setup_${sceneKey}`;
  const cameraMarkId = `camera_${sceneKey}`;
  const distance = cameraDistance;
  const eyeHeight = leadEyeHeight;
  const cameraHeight = heightForAngle(angle, leadEyeHeight);
  const performerSpacing = 0.8;
  const performerMarks = intent.performance.map((entry, index) => ({
    id: `performer_${sceneKey}_${safeId(entry.characterId)}`,
    characterId: entry.characterId,
    position: { x: (index - (intent.performance.length - 1) / 2) * performerSpacing, y: 0, z: 0 },
    bodyAngleDeg: intent.performance.length > 1 ? (index < intent.performance.length / 2 ? 12 : -12) : 0,
    stance: entry.stance,
  }));

  const keyResource = resources.find((resource) => resource.category === 'light' || resource.id === 'household_existing_lamp');
  const lightMarks: ShotPlan['setupGroups'][number]['lightMarks'] = [];
  if (keyResource) {
    lightMarks.push({
      id: `key_${sceneKey}`,
      resourceId: keyResource.id,
      role: 'key',
      position: { x: -1.2, y: leadEyeHeight + 0.25, z: -0.25 },
      target: { x: 0, y: eyeHeight, z: 0 },
      ...(selectedLight?.colorTemperatureK ? { colorTemperatureK: Math.round((selectedLight.colorTemperatureK.min + selectedLight.colorTemperatureK.max) / 2) } : {}),
    });
  }
  const fillResource = selectedModifier ? resources.find((resource) => resource.equipmentId === selectedModifier.id) : householdFill ? resources.find((resource) => resource.id === HOUSEHOLD_SUBSTITUTIONS.fill.id) : undefined;
  if (fillResource) {
    lightMarks.push({
      id: `fill_${sceneKey}`,
      resourceId: fillResource.id,
      role: 'fill',
      position: { x: 1.1, y: leadEyeHeight, z: -0.1 },
      target: { x: 0, y: eyeHeight, z: 0 },
    });
  }

  const audioResource = audio
    ? resources.find((resource) => resource.equipmentId === audio.id)
    : resources.find((resource) => resource.id === `builtin_audio_${camera.id}`);
  const audioMarks = audioResource ? [{
    id: `audio_${sceneKey}`,
    resourceId: audioResource.id,
    characterIds: intent.performance.map((entry) => entry.characterId),
    placementInstruction: audio ? 'Place the microphone close to the speaking subject and record a level test.' : 'Keep the camera within 0.8m of the speaker and record a room-tone test.',
  }] : [];

  const setupMinutes = estimateSetupMinutes({
    lightCount: lightMarks.length,
    audioCount: audioMarks.length,
    movingCamera: movement !== 'static',
    householdSubstitutionCount: Number(householdSupport) + Number(householdFill),
  });
  if (profile.constraints.maxSetupMinutes && setupMinutes > profile.constraints.maxSetupMinutes) {
    return {
      status: 'needs-user-input',
      blockers: [{ code: 'setup_time', message: `The safest setup needs about ${setupMinutes} minutes, above the ${profile.constraints.maxSetupMinutes}-minute limit.` }],
      questions: ['Can you allow more setup time, remove optional fill, or use a previously prepared setup?'],
    };
  }
  if (spent > profile.constraints.maxIncrementalSpend) {
    return {
      status: 'needs-user-input',
      blockers: [{ code: 'budget', message: `The selected resources cost ${spent} ${profile.constraints.currency}, above the approved limit.` }],
      questions: ['Should ThinkForge use a no-spend alternative or should the budget be increased?'],
    };
  }

  const supportResourceId = support ? `equipment_${support.id}` : householdSupport ? HOUSEHOLD_SUBSTITUTIONS.cameraSupport.id : undefined;
  const framingChanged = framing !== intent.desiredFraming;
  const movementChanged = movement !== intent.desiredMovement;
  const angleChanged = angle !== intent.desiredAngle;
  const fallback = framingChanged || movementChanged || angleChanged ? {
    framing,
    instruction: `Use ${framing} framing, ${angle} angle, and ${movement} camera behavior with the available setup.`,
    reason: warnings.filter((warning) => warning.includes('Framing') || warning.includes('movement') || warning.includes('angle')).join(' '),
  } : undefined;
  const upgradeOptions = rankEquipment(profile.equipment.filter(
    (item) => (item.availability === 'purchase-approved' || item.availability === 'rental-approved')
      && !resources.some((resource) => resource.equipmentId === item.id)
      && item.estimatedIncrementalCost <= profile.constraints.maxIncrementalSpend,
  )).slice(0, 3).map((item) => ({
    id: `upgrade_${item.id}`,
    label: item.label,
    benefit: upgradeBenefit(item),
    affectedSceneIds: [intent.sceneId],
    incrementalCost: item.estimatedIncrementalCost,
    resourceLabels: [item.label],
  }));
  const knowledgeRefs = Array.from(new Set([
    'signal:visual.shot_scale',
    'signal:visual.motion_type',
    'signal:visual.action_type',
    FRAMING_KNOWLEDGE[framing].knowledgeRef,
    MOVEMENT_REQUIREMENTS[movement].knowledgeRef,
  ]));
  const score = Math.max(0, Math.min(1, 1 - assumptions.length * 0.06 - warnings.length * 0.08));
  const cameraResource = resources.find((resource) => resource.equipmentId === camera.id);
  if (!cameraResource) throw new Error('Camera resource resolution failed');

  const plan = parseShotPlan({
    version: SHOT_PLAN_VERSION,
    capabilityProfileVersion: profile.version,
    ...(profile.profileId ? { capabilityProfileId: profile.profileId } : {}),
    sourceSidecarVersion: 1,
    tier,
    currency: profile.constraints.currency,
    coordinateSystem: { unit: 'meters', origin: 'room-center', xAxis: 'camera-right', yAxis: 'up', zAxis: 'toward-background' },
    resources,
    setupGroups: [{
      id: setupId,
      label: `${space.label} - ${framing} setup`,
      spaceId: space.id,
      sceneIds: [intent.sceneId],
      setupMinutes,
      resetMinutes: 0,
      cameraMarks: [{
        id: cameraMarkId,
        resourceId: cameraResource.id,
        position: { x: 0, y: cameraHeight, z: -distance },
        target: { x: 0, y: eyeHeight, z: 0 },
        heightM: cameraHeight,
        orientation,
      }],
      lightMarks,
      performerMarks,
      audioMarks,
      instructions: [
        `Place the camera ${cameraDistance.toFixed(1)}m from the lead performer at ${angle} height.`,
        supportResourceId ? `Stabilize the camera with ${resources.find((resource) => resource.id === supportResourceId)?.label ?? 'the selected support'}.` : 'Assign the camera operator before recording.',
        ...(keyResource ? [`Place ${keyResource.label} about 45 degrees to the performer and keep it outside frame.`] : []),
        ...(fillResource ? [`Place ${fillResource.label} opposite the key to soften facial shadows.`] : []),
        ...(intent.movementMotivation && movement !== 'static' ? [`Camera movement motivation: ${intent.movementMotivation}`] : []),
      ],
    }],
    scenes: [{
      sceneId: intent.sceneId,
      sidecarSceneIndex: intent.sidecarSceneIndex,
      generationUnitId: intent.generationUnitId,
      setupGroupId: setupId,
      durationSec: intent.durationSec,
      intent: {
        narrativePurpose: intent.narrativePurpose,
        emotionalBeat: intent.emotionalBeat,
        energy: intent.energy,
        visualPriority: intent.visualPriority,
      },
      camera: {
        markId: cameraMarkId,
        framing,
        angle,
        movement,
        movementPath: movementPath(movement, cameraDistance, maxCameraDistance),
        focalLengthEquivalentMm,
      },
      activeLightMarkIds: lightMarks.map((mark) => mark.id),
      activeAudioMarkIds: audioMarks.map((mark) => mark.id),
      performance: intent.performance.map((entry, index) => ({
        characterId: entry.characterId,
        performerMarkId: performerMarks[index]!.id,
        emotion: entry.emotion,
        intensity: entry.intensity,
        gaze: entry.gaze,
        posture: entry.posture,
        gesture: entry.gesture,
        movement: entry.movement,
      })),
      continuity: intent.continuity,
      ...(fallback ? { fallback } : {}),
    }],
    shootOrder: [intent.sceneId],
    totalIncrementalCost: spent,
    totalSetupMinutes: setupMinutes,
    knowledgeRefs,
    feasibility: {
      status: assumptions.length ? 'ready-with-assumptions' : 'ready',
      score,
      assumptions,
      warnings,
    },
    upgradeOptions,
  });

  return { status: 'resolved', plan };
}
