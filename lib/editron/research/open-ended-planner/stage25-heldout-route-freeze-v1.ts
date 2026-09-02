import heldoutTasks from '@/tests/fixtures/editron/open-ended-planner-v2/stage25-heldout-route-tasks-v1.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { v2rOperatorCatalogIdentity } from './operator-catalog-v2r';

type JsonRecord = Record<string, unknown>;

export const STAGE25_HELDOUT_ROUTE_FREEZE_VERSION_V1 =
  'EDITRON_OE_STAGE25_HELDOUT_ROUTE_FREEZE_V1_1' as const;
export const STAGE25_HELDOUT_ROUTE_ARMS_V1 = [
  'FREE_CHOICE', 'FORCED_NATIVE', 'FORCED_GENERATED_COMPOSITION', 'FORCED_HYBRID',
] as const;
export type Stage25HeldoutRouteArmV1 = typeof STAGE25_HELDOUT_ROUTE_ARMS_V1[number];

const ARM_INSTRUCTIONS: Record<Stage25HeldoutRouteArmV1, string> = {
  FREE_CHOICE: 'Choose NATIVE, GENERATED_COMPOSITION or HYBRID from declared qualified owners, or return an honest capability gap.',
  FORCED_NATIVE: 'Use NATIVE if its qualified owners can satisfy every target and preservation predicate; otherwise return an untouched capability gap.',
  FORCED_GENERATED_COMPOSITION: 'Use GENERATED_COMPOSITION if its qualified sandbox owner can satisfy every target, editability and preservation predicate; otherwise return an untouched capability gap.',
  FORCED_HYBRID: 'Use HYBRID only with qualified component owners and explicit timebase, audio and boundary handoff; otherwise return an untouched capability gap.',
};

function buildTasks(): readonly JsonRecord[] {
  if (heldoutTasks.version !== 'EDITRON_OE_STAGE25_HELDOUT_ROUTE_TASKS_V1_1'
    || heldoutTasks.artifactType !== 'Stage25HeldoutRouteTasksV1'
    || heldoutTasks.fixtureMaterialization !== 'NOT_MATERIALIZED') fail('TASK_FIXTURE_IDENTITY_INVALID');
  return heldoutTasks.tasks.map((task) => {
    const material = structuredClone(task) as JsonRecord;
    return deepFreezeV1({ ...material, taskSha256: hashCanonicalJsonV1(material) });
  });
}

const TASKS = buildTasks();
const ARMS = TASKS.flatMap((task) => STAGE25_HELDOUT_ROUTE_ARMS_V1.map((arm) => {
  const material = {
    armId: `${String(task.taskId)}:${arm}`,
    taskId: task.taskId,
    arm,
    armInstruction: ARM_INSTRUCTIONS[arm],
    taskSha256: task.taskSha256,
    targetMaterialSha256: task.taskSha256,
    fixtureMaterialization: 'NOT_MATERIALIZED' as const,
    dispatchAuthorized: false as const,
  };
  return deepFreezeV1({ ...material, armSha256: hashCanonicalJsonV1(material) });
}));

const FREEZE_MATERIAL = {
  version: STAGE25_HELDOUT_ROUTE_FREEZE_VERSION_V1,
  artifactType: 'Stage25HeldoutRouteFreezeV1' as const,
  authority: 'RESEARCH_SPEC_AND_SYMBOLIC_SENTINELS_ONLY' as const,
  operatorCatalog: v2rOperatorCatalogIdentity(),
  priorEvidenceCeiling: {
    native: 'ONE_HAND_AUTHORED_DEV02_PROXY',
    generatedComposition: 'DEV02_SPECIFIC_RESEARCH_PROXY_ONLY',
    hybrid: 'DEV02_ISOLATED_JOIN_NOT_PROJECTSERVICE',
  },
  evaluatorPolicy: {
    singleExpectedRoute: false,
    forcedRouteNeverGrantsCapability: true,
    untouchedGapCanPass: true,
    capabilityGapRequiresCheckedRouteFamilies: true,
    unavailableOwnerAttemptFails: true,
    editableStateRequired: true,
    hybridRequires: ['NATIVE_OWNER', 'GENERATED_SANDBOX', 'TIMEBASE_HANDOFF', 'AUDIO_HANDOFF', 'BOUNDARY_HANDOFF'],
    maximumProof: 'STRUCTURAL_SENTINEL',
  },
  tasks: TASKS,
  arms: ARMS,
  dispatchAuthorized: false as const,
  providerInferenceCallCount: 0 as const,
  stateEffects: [] as const,
};

export const STAGE25_HELDOUT_ROUTE_FREEZE_V1 = deepFreezeV1({
  ...FREEZE_MATERIAL,
  freezeSha256: hashCanonicalJsonV1(FREEZE_MATERIAL),
});

export function buildStage25HeldoutRoutePublicPacketV1(input: {
  taskId: string;
  arm: Stage25HeldoutRouteArmV1;
}): Readonly<JsonRecord> {
  const task = TASKS.find(({ taskId }) => taskId === input.taskId) ?? fail('TASK_UNKNOWN');
  const arm = ARMS.find((candidate) => candidate.taskId === input.taskId && candidate.arm === input.arm)
    ?? fail('ARM_UNKNOWN');
  const material = {
    version: STAGE25_HELDOUT_ROUTE_FREEZE_VERSION_V1,
    artifactType: 'Stage25HeldoutRoutePublicPacketV1' as const,
    task,
    taskSha256: task.taskSha256,
    arm: input.arm,
    armInstruction: arm.armInstruction,
    armSha256: arm.armSha256,
    operatorCatalog: v2rOperatorCatalogIdentity(),
    executionAuthority: 'RESEARCH_SYMBOLIC_SENTINEL_ONLY' as const,
    dispatchAuthorized: false as const,
  };
  return deepFreezeV1({ ...material, packetSha256: hashCanonicalJsonV1(material) });
}

function fail(code: string): never { throw new Error(`STAGE25_HELDOUT_ROUTE_${code}`); }
