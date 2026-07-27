import { parseShotPlan, SHOT_PLAN_VERSION, type ShotPlan } from './shot-plan';

export const SHOT_PLAN_OPTIMIZER_VERSION = 1 as const;

// Ignore serialization noise only. Physical differences remain separate resolver-owned marks.
const GEOMETRY_TOLERANCE = 1e-6;
const DEFAULT_BETWEEN_SCENE_RESET_MINUTES = 1;

type SetupGroup = ShotPlan['setupGroups'][number];
type SceneShot = ShotPlan['scenes'][number];
type PlanResource = ShotPlan['resources'][number];
type CameraMark = SetupGroup['cameraMarks'][number];
type LightMark = SetupGroup['lightMarks'][number];
type PerformerMark = SetupGroup['performerMarks'][number];
type AudioMark = SetupGroup['audioMarks'][number];

interface Candidate {
  plan: ShotPlan;
  scene: SceneShot;
  setup: SetupGroup;
}

interface SetupCluster {
  members: Candidate[];
}

function near(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= GEOMETRY_TOLERANCE;
}

function vectorNear(
  left: { x: number; y: number; z: number } | undefined,
  right: { x: number; y: number; z: number } | undefined,
): boolean {
  if (!left || !right) return left === right;
  return near(left.x, right.x) && near(left.y, right.y) && near(left.z, right.z);
}

function cameraMarkEquivalent(left: CameraMark, right: CameraMark): boolean {
  return left.resourceId === right.resourceId
    && left.orientation === right.orientation
    && near(left.heightM, right.heightM)
    && vectorNear(left.position, right.position)
    && vectorNear(left.target, right.target);
}

function lightMarkEquivalent(left: LightMark, right: LightMark): boolean {
  return left.resourceId === right.resourceId
    && left.role === right.role
    && left.modifierResourceId === right.modifierResourceId
    && near(left.intensityPercent, right.intensityPercent)
    && near(left.colorTemperatureK, right.colorTemperatureK)
    && vectorNear(left.position, right.position)
    && vectorNear(left.target, right.target);
}

function performerMarkEquivalent(left: PerformerMark, right: PerformerMark): boolean {
  return left.characterId === right.characterId
    && left.stance === right.stance
    && near(left.bodyAngleDeg, right.bodyAngleDeg)
    && vectorNear(left.position, right.position);
}

function audioMarkEquivalent(left: AudioMark, right: AudioMark): boolean {
  return left.resourceId === right.resourceId
    && left.placementInstruction === right.placementInstruction
    && vectorNear(left.position, right.position);
}

function equivalentSet<T>(left: T[], right: T[], equivalent: (a: T, b: T) => boolean): boolean {
  return left.length === right.length && left.every((item) => right.some((candidate) => equivalent(item, candidate)));
}

function requiredResourceIds(candidate: Candidate): Set<string> {
  return new Set(candidate.plan.resources.filter((resource) => resource.required).map((resource) => resource.id));
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function setupsCompatible(left: Candidate, right: Candidate): boolean {
  return left.setup.spaceId === right.setup.spaceId
    && sameStringSet(requiredResourceIds(left), requiredResourceIds(right))
    && equivalentSet(left.setup.cameraMarks, right.setup.cameraMarks, cameraMarkEquivalent)
    && equivalentSet(left.setup.lightMarks, right.setup.lightMarks, lightMarkEquivalent)
    && equivalentSet(left.setup.audioMarks, right.setup.audioMarks, audioMarkEquivalent);
}

function resourceSignature(resource: PlanResource): string {
  return JSON.stringify({
    ...resource,
    notes: [...resource.notes].sort(),
  });
}

function assertCompatibleEnvelope(plans: ShotPlan[]): void {
  const first = plans[0];
  if (!first) throw new Error('Shot plan optimization requires at least one scene plan');
  for (const plan of plans) {
    if (plan.scenes.length !== 1 || plan.setupGroups.length !== 1) {
      throw new Error('Shot plan optimizer accepts only one-scene resolver plans');
    }
    const envelopeMatches = plan.version === first.version
      && plan.capabilityProfileVersion === first.capabilityProfileVersion
      && plan.capabilityProfileId === first.capabilityProfileId
      && plan.sourceSidecarVersion === first.sourceSidecarVersion
      && plan.tier === first.tier
      && plan.currency === first.currency
      && JSON.stringify(plan.coordinateSystem) === JSON.stringify(first.coordinateSystem);
    if (!envelopeMatches) {
      throw new Error('Shot plan candidates must share profile, version, tier, currency, and coordinate system');
    }
  }
}

function clusterCandidates(candidates: Candidate[]): SetupCluster[] {
  const clusters: SetupCluster[] = [];
  for (const candidate of candidates) {
    const cluster = clusters.find((entry) => setupsCompatible(entry.members[0]!, candidate));
    if (cluster) cluster.members.push(candidate);
    else clusters.push({ members: [candidate] });
  }
  return clusters;
}

function uniqueMarkId<T extends { id: string }>(marks: T[], desired: string): string {
  if (!marks.some((mark) => mark.id === desired)) return desired;
  let suffix = 2;
  while (marks.some((mark) => mark.id === `${desired}_${suffix}`)) suffix += 1;
  return `${desired}_${suffix}`;
}

function addCameraMark(marks: CameraMark[], mark: CameraMark): string {
  const existing = marks.find((candidate) => cameraMarkEquivalent(candidate, mark));
  if (existing) return existing.id;
  const id = uniqueMarkId(marks, mark.id);
  marks.push({ ...mark, id, position: { ...mark.position }, target: { ...mark.target } });
  return id;
}

function addLightMark(marks: LightMark[], mark: LightMark): string {
  const existing = marks.find((candidate) => lightMarkEquivalent(candidate, mark));
  if (existing) return existing.id;
  const id = uniqueMarkId(marks, mark.id);
  marks.push({
    ...mark,
    id,
    position: { ...mark.position },
    ...(mark.target ? { target: { ...mark.target } } : {}),
  });
  return id;
}

function addPerformerMark(marks: PerformerMark[], mark: PerformerMark): string {
  const existing = marks.find((candidate) => performerMarkEquivalent(candidate, mark));
  if (existing) return existing.id;
  const id = uniqueMarkId(marks, mark.id);
  marks.push({ ...mark, id, position: { ...mark.position } });
  return id;
}

function addAudioMark(marks: AudioMark[], mark: AudioMark): string {
  const existing = marks.find((candidate) => audioMarkEquivalent(candidate, mark));
  if (existing) {
    existing.characterIds = Array.from(new Set([...existing.characterIds, ...mark.characterIds]));
    return existing.id;
  }
  const id = uniqueMarkId(marks, mark.id);
  marks.push({
    ...mark,
    id,
    characterIds: [...mark.characterIds],
    ...(mark.position ? { position: { ...mark.position } } : {}),
  });
  return id;
}

function mergeCluster(cluster: SetupCluster, clusterIndex: number): { setup: SetupGroup; scenes: SceneShot[] } {
  const members = [...cluster.members].sort((left, right) => left.scene.sidecarSceneIndex - right.scene.sidecarSceneIndex);
  const base = members[0]!.setup;
  const setupId = `setup_optimized_${clusterIndex + 1}`;
  const cameraMarks: CameraMark[] = [];
  const lightMarks: LightMark[] = [];
  const performerMarks: PerformerMark[] = [];
  const audioMarks: AudioMark[] = [];
  const instructions = new Set<string>();

  const scenes = members.map(({ scene, setup }) => {
    setup.instructions.forEach((instruction) => instructions.add(instruction));
    const cameraIdMap = new Map(setup.cameraMarks.map((mark) => [mark.id, addCameraMark(cameraMarks, mark)]));
    const lightIdMap = new Map(setup.lightMarks.map((mark) => [mark.id, addLightMark(lightMarks, mark)]));
    const performerIdMap = new Map(setup.performerMarks.map((mark) => [mark.id, addPerformerMark(performerMarks, mark)]));
    const audioIdMap = new Map(setup.audioMarks.map((mark) => [mark.id, addAudioMark(audioMarks, mark)]));
    const cameraMarkId = cameraIdMap.get(scene.camera.markId);
    if (!cameraMarkId) throw new Error(`Scene ${scene.sceneId} lost its camera mark during optimization`);

    return {
      ...scene,
      setupGroupId: setupId,
      camera: { ...scene.camera, markId: cameraMarkId, movementPath: scene.camera.movementPath.map((point) => ({ ...point })) },
      activeLightMarkIds: scene.activeLightMarkIds.map((id) => lightIdMap.get(id) ?? id),
      activeAudioMarkIds: scene.activeAudioMarkIds.map((id) => audioIdMap.get(id) ?? id),
      performance: scene.performance.map((entry) => ({
        ...entry,
        performerMarkId: performerIdMap.get(entry.performerMarkId) ?? entry.performerMarkId,
      })),
    };
  });

  const resetMinutes = members.length > 1
    ? Math.max(DEFAULT_BETWEEN_SCENE_RESET_MINUTES, ...members.map((member) => member.setup.resetMinutes))
    : base.resetMinutes;
  return {
    setup: {
      ...base,
      id: setupId,
      label: members.length > 1 ? `${base.label} (${members.length} scenes)` : base.label,
      sceneIds: scenes.map((scene) => scene.sceneId),
      setupMinutes: Math.max(...members.map((member) => member.setup.setupMinutes)),
      resetMinutes,
      cameraMarks,
      lightMarks,
      performerMarks,
      audioMarks,
      instructions: [...instructions],
    },
    scenes,
  };
}

function clusterResourceIds(cluster: SetupCluster): Set<string> {
  return requiredResourceIds(cluster.members[0]!);
}

function symmetricDifferenceSize(left: Set<string>, right: Set<string>): number {
  return [...left].filter((value) => !right.has(value)).length
    + [...right].filter((value) => !left.has(value)).length;
}

function transitionCost(left: SetupCluster, right: SetupCluster): number {
  const leftSetup = left.members[0]!.setup;
  const rightSetup = right.members[0]!.setup;
  const locationPenalty = leftSetup.spaceId === rightSetup.spaceId ? 0 : 100;
  return locationPenalty + symmetricDifferenceSize(clusterResourceIds(left), clusterResourceIds(right));
}

function orderClusters(clusters: SetupCluster[]): SetupCluster[] {
  if (clusters.length <= 1) return clusters;
  const remaining = [...clusters].sort((left, right) =>
    left.members[0]!.scene.sidecarSceneIndex - right.members[0]!.scene.sidecarSceneIndex);
  const ordered = [remaining.shift()!];
  while (remaining.length) {
    const current = ordered[ordered.length - 1]!;
    remaining.sort((left, right) => {
      const costDelta = transitionCost(current, left) - transitionCost(current, right);
      if (costDelta !== 0) return costDelta;
      return left.members[0]!.scene.sidecarSceneIndex - right.members[0]!.scene.sidecarSceneIndex;
    });
    ordered.push(remaining.shift()!);
  }
  return ordered;
}

function mergeResources(plans: ShotPlan[]): PlanResource[] {
  const resources = new Map<string, PlanResource>();
  for (const plan of plans) {
    for (const resource of plan.resources) {
      const existing = resources.get(resource.id);
      if (existing && resourceSignature(existing) !== resourceSignature(resource)) {
        throw new Error(`Conflicting resource definition for ${resource.id}`);
      }
      if (!existing) resources.set(resource.id, { ...resource, notes: [...resource.notes] });
    }
  }
  return [...resources.values()];
}

function mergeUpgradeOptions(plans: ShotPlan[]): ShotPlan['upgradeOptions'] {
  const options = new Map<string, ShotPlan['upgradeOptions'][number]>();
  for (const option of plans.flatMap((plan) => plan.upgradeOptions)) {
    const existing = options.get(option.id);
    if (existing) {
      existing.affectedSceneIds = Array.from(new Set([...existing.affectedSceneIds, ...option.affectedSceneIds]));
    } else {
      options.set(option.id, { ...option, affectedSceneIds: [...option.affectedSceneIds], resourceLabels: [...option.resourceLabels] });
    }
  }
  return [...options.values()];
}

export function optimizeScriptShotPlans(inputs: unknown[]): ShotPlan {
  const plans = inputs.map((input) => parseShotPlan(input));
  assertCompatibleEnvelope(plans);
  const candidates = plans.map((plan) => ({ plan, scene: plan.scenes[0]!, setup: plan.setupGroups[0]! }));
  const sceneIds = new Set(candidates.map((candidate) => candidate.scene.sceneId));
  const sceneIndexes = new Set(candidates.map((candidate) => candidate.scene.sidecarSceneIndex));
  if (sceneIds.size !== candidates.length || sceneIndexes.size !== candidates.length) {
    throw new Error('Shot plan candidates must have unique scene ids and sidecar indexes');
  }

  const originalCandidates = [...candidates].sort((left, right) => left.scene.sidecarSceneIndex - right.scene.sidecarSceneIndex);
  const originalSceneOrder = originalCandidates.map((candidate) => candidate.scene.sceneId);
  const clusters = clusterCandidates(originalCandidates);
  const orderedClusters = orderClusters(clusters);
  const merged = orderedClusters.map((cluster, index) => mergeCluster(cluster, index));
  const shootOrder = merged.flatMap((entry) => entry.scenes.map((scene) => scene.sceneId));
  const scenes = merged.flatMap((entry) => entry.scenes)
    .sort((left, right) => left.sidecarSceneIndex - right.sidecarSceneIndex);
  const setupGroups = merged.map((entry) => entry.setup);
  const resources = mergeResources(plans);
  const baselineSetupMinutes = plans.reduce((sum, plan) => sum + plan.totalSetupMinutes, 0);
  const optimizedSetupMinutes = setupGroups.reduce(
    (sum, setup) => sum + setup.setupMinutes + setup.resetMinutes * Math.max(0, setup.sceneIds.length - 1),
    0,
  );
  const setupChangeCount = Math.max(0, setupGroups.length - 1);
  let locationChangeCount = 0;
  let resourceChangeCount = 0;
  for (let index = 1; index < orderedClusters.length; index += 1) {
    if (orderedClusters[index - 1]!.members[0]!.setup.spaceId !== orderedClusters[index]!.members[0]!.setup.spaceId) {
      locationChangeCount += 1;
    }
    resourceChangeCount += symmetricDifferenceSize(
      clusterResourceIds(orderedClusters[index - 1]!),
      clusterResourceIds(orderedClusters[index]!),
    );
  }

  const reordered = shootOrder.some((sceneId, index) => originalSceneOrder[index] !== sceneId);
  const reasons = [
    `Grouped ${plans.length} scenes into ${setupGroups.length} physically compatible setups.`,
    `Deduplicated ${plans.reduce((sum, plan) => sum + plan.resources.length, 0) - resources.length} repeated resource entries.`,
    'Preserved all resolver-authored camera, light, performer, and audio coordinates.',
    ...(reordered ? ['Reordered production takes to finish compatible setups together; narrative scene order remains unchanged.'] : []),
  ];
  const assumptions = Array.from(new Set(plans.flatMap((plan) => plan.feasibility.assumptions)));
  const warnings = Array.from(new Set(plans.flatMap((plan) => plan.feasibility.warnings)));
  const first = plans[0]!;

  return parseShotPlan({
    version: SHOT_PLAN_VERSION,
    capabilityProfileVersion: first.capabilityProfileVersion,
    ...(first.capabilityProfileId ? { capabilityProfileId: first.capabilityProfileId } : {}),
    sourceSidecarVersion: first.sourceSidecarVersion,
    tier: first.tier,
    currency: first.currency,
    coordinateSystem: first.coordinateSystem,
    resources,
    setupGroups,
    scenes,
    shootOrder,
    totalIncrementalCost: resources.reduce((sum, resource) => sum + resource.incrementalCost, 0),
    totalSetupMinutes: optimizedSetupMinutes,
    knowledgeRefs: Array.from(new Set([
      ...plans.flatMap((plan) => plan.knowledgeRefs),
      'system:thinkforge.setup-optimizer.v1',
    ])),
    optimization: {
      version: SHOT_PLAN_OPTIMIZER_VERSION,
      objectives: ['feasibility', 'continuity', 'cost', 'setup-time'],
      originalSceneOrder,
      setupChangeCount,
      locationChangeCount,
      resourceChangeCount,
      baselineSetupMinutes,
      optimizedSetupMinutes,
      savedSetupMinutes: Math.max(0, baselineSetupMinutes - optimizedSetupMinutes),
      reasons,
    },
    feasibility: {
      status: assumptions.length ? 'ready-with-assumptions' : 'ready',
      score: Math.min(...plans.map((plan) => plan.feasibility.score)),
      assumptions,
      warnings,
    },
    upgradeOptions: mergeUpgradeOptions(plans),
  });
}
