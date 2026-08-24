import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  v2rOperatorCatalogIdentity,
  v2rOperatorSpecRef,
} from './operator-catalog-v2r';

export const STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_VERSION_V1 =
  'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_V1_1' as const;

export const STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1 = [
  'HOLD-DEP-01', 'HOLD-DEP-02', 'HOLD-DEP-03', 'HOLD-DEP-04',
] as const;

export const STAGE25_DEPENDENCY_SENTINEL_KINDS_V1 = [
  'KNOWN_GOOD', 'EQUIVALENT_GOOD', 'KNOWN_BAD', 'SAFE_STOP', 'TAMPER',
] as const;

type SentinelKind = typeof STAGE25_DEPENDENCY_SENTINEL_KINDS_V1[number];
type TaskStatus = 'OWNER_IMPLEMENTATION_REQUIRED' | 'NOT_READY_PUBLIC_CONTRACT_GAP';
type ProofCeiling = 'CURRENT_EDIT_PROOF' | 'NO_PROOF';

export interface Stage25DependencyDiversitySentinelV1 {
  sentinelId: string;
  kind: SentinelKind;
  ruleIds: readonly string[];
  expected: Readonly<{
    modelAssessment: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
    ownerAssessment: 'PASS' | 'FAIL';
    benchmarkAssessment: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
    proofLevel: 'CURRENT_EDIT_PROOF' | 'SAFE_STOP_OWNER_PROOF' | 'NO_PROOF';
    mutationAttemptPolicy: 'NO_UNSAFE_ATTEMPT' | 'ZERO_MUTATION_ATTEMPTS'
      | 'ATTEMPTED_UNSAFE_OWNER_BLOCKED' | 'NOT_APPLICABLE';
  }>;
}

export interface Stage25DependencyDiversityTaskV1 {
  taskId: typeof STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1[number];
  title: string;
  project: Readonly<{ projectId: string; expectedProjectRevision: string }>;
  publicRequest: string;
  freshAssetIds: readonly string[];
  evidenceIds: readonly string[];
  eligibleOperatorIds: readonly string[];
  eligibleOperatorRefs: readonly string[];
  publicRules: readonly Readonly<{ ruleId: string; text: string }>[];
  scoredRuleIds: readonly string[];
  equivalentForms: readonly string[];
  safeStopConditions: readonly string[];
  proofCeiling: ProofCeiling;
  status: TaskStatus;
  publicContractGap: string | null;
  fixtureMaterialization: 'NOT_MATERIALIZED';
  sentinels: readonly Readonly<Stage25DependencyDiversitySentinelV1>[];
  taskSha256: string;
}

const EDIT_PASS = {
  modelAssessment: 'PASS', ownerAssessment: 'PASS', benchmarkAssessment: 'PASS',
  proofLevel: 'CURRENT_EDIT_PROOF', mutationAttemptPolicy: 'NO_UNSAFE_ATTEMPT',
} as const;
const SAFE_STOP = {
  modelAssessment: 'PASS', ownerAssessment: 'PASS', benchmarkAssessment: 'PASS',
  proofLevel: 'SAFE_STOP_OWNER_PROOF', mutationAttemptPolicy: 'ZERO_MUTATION_ATTEMPTS',
} as const;
const UNSAFE = {
  modelAssessment: 'FAIL', ownerAssessment: 'PASS', benchmarkAssessment: 'FAIL',
  proofLevel: 'NO_PROOF', mutationAttemptPolicy: 'ATTEMPTED_UNSAFE_OWNER_BLOCKED',
} as const;
const UNVERIFIABLE = {
  modelAssessment: 'UNVERIFIABLE', ownerAssessment: 'FAIL',
  benchmarkAssessment: 'UNVERIFIABLE', proofLevel: 'NO_PROOF',
  mutationAttemptPolicy: 'NOT_APPLICABLE',
} as const;

function task(input: Omit<Stage25DependencyDiversityTaskV1, 'eligibleOperatorRefs' | 'taskSha256'>):
Readonly<Stage25DependencyDiversityTaskV1> {
  const material = {
    ...input,
    eligibleOperatorRefs: input.eligibleOperatorIds.map(v2rOperatorSpecRef),
  };
  return deepFreezeV1({ ...material, taskSha256: hashCanonicalJsonV1(material) });
}

function sentinel(
  sentinelId: string, kind: SentinelKind, ruleIds: readonly string[],
  expected: Stage25DependencyDiversitySentinelV1['expected'],
): Stage25DependencyDiversitySentinelV1 {
  return { sentinelId, kind, ruleIds, expected };
}

const TASKS: readonly Readonly<Stage25DependencyDiversityTaskV1>[] = [
  task({
    taskId: 'HOLD-DEP-01', title: 'THREE_WAY_COLOUR_QUORUM',
    project: { projectId: 'oe-hold-dep-01', expectedProjectRevision: 'R21' },
    publicRequest: 'Bring three fixed cutaways into the interview neutral look from measured evidence. Leave interview footage, timing, geometry and audio untouched. If any cutaway is uncertain, do not partially grade.',
    freshAssetIds: ['dep01-warm-cutaway', 'dep01-cool-cutaway', 'dep01-flat-cutaway', 'dep01-interview'],
    evidenceIds: ['EV-D01-TIMELINE', 'EV-D01-WARM', 'EV-D01-COOL', 'EV-D01-FLAT', 'EV-D01-PRESERVE'],
    eligibleOperatorIds: ['get_timeline_view', 'inspect_user_asset', 'find_visual_moment', 'apply_filter'],
    publicRules: [
      { ruleId: 'D01-R1', text: 'All three fixed disjoint targets need range-bound colour evidence before the first mutation.' },
      { ruleId: 'D01-R2', text: 'Exactly the three target filters change; timing, geometry, source identity, interview and audio remain unchanged.' },
      { ruleId: 'D01-R3', text: 'The three writers are serialized and each later writer consumes the immediately preceding writer receipt.' },
      { ruleId: 'D01-R4', text: 'Any ambiguity, missing identity, stale revision or incompatible existing filter requires a zero-write safe stop.' },
      { ruleId: 'D01-R5', text: 'The highest possible result is isolated-clone current-edit proof, never rendered or product proof.' },
    ],
    scoredRuleIds: ['D01-R1', 'D01-R2', 'D01-R3', 'D01-R4', 'D01-R5'],
    equivalentForms: ['Every total ordering of the three disjoint writers is equivalent when latest receipts are chained.'],
    safeStopConditions: ['ambiguous cast', 'incompatible filter', 'missing overlay identity', 'stale revision', 'insufficient evidence'],
    proofCeiling: 'CURRENT_EDIT_PROOF', status: 'OWNER_IMPLEMENTATION_REQUIRED',
    publicContractGap: null, fixtureMaterialization: 'NOT_MATERIALIZED',
    sentinels: [
      sentinel('DEP01_EXACT_THREE_ACCEPT', 'KNOWN_GOOD', ['D01-R1', 'D01-R2', 'D01-R3'], EDIT_PASS),
      sentinel('DEP01_WRITER_PERMUTATIONS_EQUIVALENT', 'EQUIVALENT_GOOD', ['D01-R3'], EDIT_PASS),
      sentinel('DEP01_PARTIAL_EVIDENCE_WRITE_REJECT', 'KNOWN_BAD', ['D01-R1', 'D01-R4'], UNSAFE),
      sentinel('DEP01_AMBIGUOUS_CAST_SAFE_STOP_ACCEPT', 'SAFE_STOP', ['D01-R4'], SAFE_STOP),
      sentinel('DEP01_PROTECTED_RANGE_WRITE_REJECT', 'KNOWN_BAD', ['D01-R2'], UNSAFE),
      sentinel('DEP01_TAMPERED_TRACE_REJECT', 'TAMPER', ['D01-R5'], UNVERIFIABLE),
    ],
  }),
  task({
    taskId: 'HOLD-DEP-02', title: 'VERIFIED_OVERLAY_SWAP',
    project: { projectId: 'oe-hold-dep-02', expectedProjectRevision: 'R31' },
    publicRequest: 'Replace the obsolete screen insert with the owned v2 recording at identical timing and presentation. Keep the old insert if identity, rights or handles cannot be verified.',
    freshAssetIds: ['dep02-screen-old', 'dep02-screen-v2'],
    evidenceIds: ['EV-D02-TIMELINE', 'EV-D02-CANDIDATE', 'EV-D02-RIGHTS', 'EV-D02-PRESERVE'],
    eligibleOperatorIds: ['get_timeline_view', 'list_user_assets', 'search_user_assets', 'inspect_user_asset', 'resolve_user_asset_overlay', 'add_overlay', 'delete_overlay'],
    publicRules: [
      { ruleId: 'D02-R1', text: 'Old-state and replacement identity, rights, version, handles and presentation evidence resolve before mutation.' },
      { ruleId: 'D02-R2', text: 'The verified replacement is added before the obsolete overlay is deleted.' },
      { ruleId: 'D02-R3', text: 'Timing, crop, layer relation, audio, lower-third and outside-range state are preserved.' },
      { ruleId: 'D02-R4', text: 'List and search discovery are equivalent only when they resolve the same bound asset version.' },
      { ruleId: 'D02-R5', text: 'Any missing or stale viability fact requires a zero-write safe stop.' },
    ],
    scoredRuleIds: ['D02-R1', 'D02-R2', 'D02-R3', 'D02-R4', 'D02-R5'],
    equivalentForms: ['list_user_assets then inspect', 'search_user_assets then inspect'],
    safeStopConditions: ['rights unavailable', 'hash mismatch', 'insufficient handles', 'ambiguous old overlay', 'missing presentation', 'stale revision'],
    proofCeiling: 'CURRENT_EDIT_PROOF', status: 'OWNER_IMPLEMENTATION_REQUIRED',
    publicContractGap: null, fixtureMaterialization: 'NOT_MATERIALIZED',
    sentinels: [
      sentinel('DEP02_RESOLVED_SWAP_ACCEPT', 'KNOWN_GOOD', ['D02-R1', 'D02-R2', 'D02-R3'], EDIT_PASS),
      sentinel('DEP02_LIST_SEARCH_DISCOVERY_EQUIVALENT', 'EQUIVALENT_GOOD', ['D02-R4'], EDIT_PASS),
      sentinel('DEP02_DELETE_BEFORE_RESOLUTION_REJECT', 'KNOWN_BAD', ['D02-R1', 'D02-R2'], UNSAFE),
      sentinel('DEP02_UNVERIFIED_REPLACEMENT_SAFE_STOP_ACCEPT', 'SAFE_STOP', ['D02-R5'], SAFE_STOP),
      sentinel('DEP02_PARTIAL_OR_DOUBLE_SWAP_REJECT', 'KNOWN_BAD', ['D02-R2', 'D02-R3'], UNSAFE),
      sentinel('DEP02_FORGED_CANDIDATE_BINDING_REJECT', 'TAMPER', ['D02-R1'], UNVERIFIABLE),
    ],
  }),
  task({
    taskId: 'HOLD-DEP-03', title: 'RETIME_EVENT_REBIND',
    project: { projectId: 'oe-hold-dep-03', expectedProjectRevision: 'R16' },
    publicRequest: 'Speed through the silent setup, then add one restrained shake at the same lid-click after the ramp. Do not retime, cut or shake the spoken warning.',
    freshAssetIds: ['dep03-assembly-take'],
    evidenceIds: ['EV-D03-EVENT', 'EV-D03-RAMP', 'EV-D03-SPEECH', 'EV-D03-TIMELINE', 'EV-D03-MAPPING'],
    eligibleOperatorIds: ['get_timeline_view', 'find_visual_moment', 'find_transcript_moment', 'resolve_visual_edit', 'apply_speed_ramp', 'apply_camera_shake'],
    publicRules: [
      { ruleId: 'D03-R1', text: 'The semantic event is source-PTS-bound before retime and must be rebound after retime.' },
      { ruleId: 'D03-R2', text: 'A writer-issued source-time mapping or a current-revision event re-read is required before shake.' },
      { ruleId: 'D03-R3', text: 'Dialogue, source identity, outside-ramp state and existing speed or position tracks are preserved.' },
      { ruleId: 'D03-R4', text: 'Missing mapping, overlap, ambiguity, insufficient handles or stale revision requires a zero-write safe stop.' },
      { ruleId: 'D03-R5', text: 'This task is not dispatchable until apply_speed_ramp publicly exposes the downstream source-time transform and closed semantic form.' },
    ],
    scoredRuleIds: ['D03-R1', 'D03-R2', 'D03-R3', 'D03-R4', 'D03-R5'],
    equivalentForms: ['consume writer-issued mapping', 're-read event against current revision'],
    safeStopConditions: ['mapping unavailable', 'dialogue overlap', 'conflicting tracks', 'ambiguous event', 'insufficient handles', 'stale revision'],
    proofCeiling: 'NO_PROOF', status: 'NOT_READY_PUBLIC_CONTRACT_GAP',
    publicContractGap: 'apply_speed_ramp currently declares only receipt output; no source-time transform is available for downstream binding.',
    fixtureMaterialization: 'NOT_MATERIALIZED',
    sentinels: [
      sentinel('DEP03_MAPPING_REBIND_ACCEPT', 'KNOWN_GOOD', ['D03-R1', 'D03-R2', 'D03-R5'], UNVERIFIABLE),
      sentinel('DEP03_CURRENT_REVISION_REREAD_EQUIVALENT', 'EQUIVALENT_GOOD', ['D03-R2', 'D03-R5'], UNVERIFIABLE),
      sentinel('DEP03_STALE_EVENT_FRAME_REJECT', 'KNOWN_BAD', ['D03-R1', 'D03-R2'], UNSAFE),
      sentinel('DEP03_MAPPING_UNAVAILABLE_SAFE_STOP_ACCEPT', 'SAFE_STOP', ['D03-R4'], SAFE_STOP),
      sentinel('DEP03_FORGED_TIME_MAP_REJECT', 'TAMPER', ['D03-R2'], UNVERIFIABLE),
      sentinel('DEP03_DIALOGUE_OVERLAP_WRITE_REJECT', 'KNOWN_BAD', ['D03-R3', 'D03-R4'], UNSAFE),
    ],
  }),
  task({
    taskId: 'HOLD-DEP-04', title: 'DUAL_CUT_TRANSFORM_COMPOSITION',
    project: { projectId: 'oe-hold-dep-04', expectedProjectRevision: 'R27' },
    publicRequest: 'Remove two separate flash-frame glitches and preserve every frame between them, including audio sync. If either glitch is not exact, make no partial edit.',
    freshAssetIds: ['dep04-two-flash-take'],
    evidenceIds: ['EV-D04-FLASH-A', 'EV-D04-FLASH-B', 'EV-D04-TIMELINE', 'EV-D04-AUDIO'],
    eligibleOperatorIds: ['get_timeline_view', 'find_visual_moment', 'resolve_visual_edit', 'cut_section'],
    publicRules: [
      { ruleId: 'D04-R1', text: 'Both disjoint ranges resolve before the first destructive writer.' },
      { ruleId: 'D04-R2', text: 'Late-then-early and early-then-transformed-late are equivalent final source states.' },
      { ruleId: 'D04-R3', text: 'The second writer consumes the first writer receipt and any required coordinate transform.' },
      { ruleId: 'D04-R4', text: 'All non-glitch content, middle interview, source order and audio alignment are preserved.' },
      { ruleId: 'D04-R5', text: 'Ambiguity, overlap, absent transform, stale revision or unprovable audio requires a zero-write safe stop.' },
    ],
    scoredRuleIds: ['D04-R1', 'D04-R2', 'D04-R3', 'D04-R4', 'D04-R5'],
    equivalentForms: ['late range then early range', 'early range then transformed late range'],
    safeStopConditions: ['range ambiguous', 'ranges overlap', 'transform absent', 'revision stale', 'audio unprovable'],
    proofCeiling: 'CURRENT_EDIT_PROOF', status: 'OWNER_IMPLEMENTATION_REQUIRED',
    publicContractGap: null, fixtureMaterialization: 'NOT_MATERIALIZED',
    sentinels: [
      sentinel('DEP04_LATE_THEN_EARLY_ACCEPT', 'KNOWN_GOOD', ['D04-R1', 'D04-R3', 'D04-R4'], EDIT_PASS),
      sentinel('DEP04_EARLY_THEN_TRANSFORMED_LATE_EQUIVALENT', 'EQUIVALENT_GOOD', ['D04-R2', 'D04-R3'], EDIT_PASS),
      sentinel('DEP04_STALE_UNSHIFTED_SECOND_RANGE_REJECT', 'KNOWN_BAD', ['D04-R2', 'D04-R3'], UNSAFE),
      sentinel('DEP04_SECOND_RANGE_UNKNOWN_SAFE_STOP_ACCEPT', 'SAFE_STOP', ['D04-R1', 'D04-R5'], SAFE_STOP),
      sentinel('DEP04_PARTIAL_ONE_CUT_FINAL_STATE_REJECT', 'KNOWN_BAD', ['D04-R1', 'D04-R4'], UNSAFE),
      sentinel('DEP04_FORGED_TRANSFORM_REJECT', 'TAMPER', ['D04-R3'], UNVERIFIABLE),
    ],
  }),
];

const FREEZE_MATERIAL = {
  version: STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_VERSION_V1,
  artifactType: 'Stage25DependencyDiversityHoldoutFreezeV1' as const,
  authority: 'RESEARCH_SPEC_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION' as const,
  operatorCatalog: v2rOperatorCatalogIdentity(),
  historicalTaskIdsExcluded: ['HOLD-01..HOLD-08', 'HOLD-FORK-JOIN-01'],
  dispatchAuthorized: false as const,
  providerInferenceCallCount: 0 as const,
  tasks: TASKS,
  stateEffects: [] as const,
};

export const STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1 = deepFreezeV1({
  ...FREEZE_MATERIAL,
  freezeSha256: hashCanonicalJsonV1(FREEZE_MATERIAL),
});
