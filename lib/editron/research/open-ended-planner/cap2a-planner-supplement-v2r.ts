import {
  CAP2_PROJECT_CLASSES_V1,
  type Cap2AtomicOperationV1,
} from '../capability-census/cap2-atomic-operation-contract-v1';
import {
  parseCap2aPlannerOperationV2R,
  type Cap2aPlannerOperationV2R,
} from './cap2a-planner-operation-contract-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const CAP2A_PLANNER_SUPPLEMENT_VERSION_V2R =
  'EDITRON_CAP2A_PLANNER_SUPPLEMENT_V2R_1' as const;
export const CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R =
  '2440ed36b43a5206e4ed5f7c3d7d4e2a94cf388a' as const;

type CodeRole =
  | 'ENTRYPOINT' | 'DECISION_OWNER' | 'FORM_OWNER' | 'MUTATION_OWNER'
  | 'PERSISTENCE_OWNER' | 'VALIDATOR' | 'PROOF_OWNER' | 'CONSUMER' | 'EVIDENCE';
type CoordinateDomain = Cap2AtomicOperationV1['contract']['coordinateDomains'][number];
type DataRef = Cap2AtomicOperationV1['effects']['reads'][number];
type CodeRef = { path: string; symbol: string; role: CodeRole };
type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
type ProofKind = Cap2AtomicOperationV1['verification']['proofObligations'][number]['kind'];

interface SupplementDefinition {
  selectableOperatorId: string;
  family: string;
  kind: Cap2AtomicOperationV1['kind'];
  implementationStatus: Cap2AtomicOperationV1['support']['implementationStatus'];
  plannerEligibility: Cap2AtomicOperationV1['support']['plannerEligibility'];
  reason: string;
  aliases: string[];
  surfaces: Pick<Cap2AtomicOperationV1['surfaces'], 'manualUi' | 'chat' | 'director' | 'worker' | 'api'>;
  parityStatus: Cap2AtomicOperationV1['surfaces']['parityStatus'];
  parityReason: string;
  ownerDisposition?: Cap2AtomicOperationV1['owners']['ownerDisposition'];
  entrypoints: CodeRef[];
  decisionOwner: CodeRef;
  formOwner?: CodeRef;
  mutationOwner?: CodeRef;
  persistenceOwner?: CodeRef;
  proofOwner?: CodeRef;
  finalConsumers: CodeRef[];
  input: Record<string, FieldType>;
  requiredInput: string[];
  output: Record<string, FieldType>;
  requiredOutput: string[];
  coordinateDomains: CoordinateDomain[];
  resolverDisposition?: Cap2AtomicOperationV1['contract']['resolverHandoff']['disposition'];
  resolverOwner?: CodeRef;
  resolverInputBinding?: string;
  resolverOutputBinding?: string;
  reads: DataRef[];
  writes: DataRef[];
  requires?: DataRef[];
  produces: DataRef[];
  invalidates: DataRef[];
  stateEffects: string[];
  mutationPath?: CodeRef[];
  revisionSemantics: Cap2aPlannerOperationV2R['execution']['revisionSemantics'];
  concurrencySemantics: Cap2AtomicOperationV1['execution']['concurrencySemantics'];
  idempotencySemantics: Cap2AtomicOperationV1['execution']['idempotencySemantics'];
  failClosed: boolean;
  failureDispositions: Cap2AtomicOperationV1['execution']['failureDispositions'];
  validators?: CodeRef[];
  proofKinds: ProofKind[];
  thresholds: string[];
  undo: Cap2AtomicOperationV1['recovery']['undo'];
  redo: Cap2AtomicOperationV1['recovery']['redo'];
  replay: Cap2AtomicOperationV1['recovery']['replay'];
  reproducibilityBindings: string[];
  rights: string;
  privacy?: string;
  egress: string;
  promptInjection?: string;
  network: string;
  latencyClass: Cap2AtomicOperationV1['resources']['latencyClass'];
  computeClass: Cap2AtomicOperationV1['resources']['computeClass'];
  limits: Record<string, string | number>;
}

export interface Cap2aPlannerSupplementRowV2R {
  selectableOperatorId: string;
  supplementRecordId: string;
  sourceCommit: typeof CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R;
  dossier: Cap2aPlannerOperationV2R;
}

const code = (path: string, symbol: string, role: CodeRole): CodeRef => ({ path, symbol, role });
const ref = (refType: DataRef['refType'], selector: string, coordinateDomain: CoordinateDomain): DataRef => (
  { refType, selector, coordinateDomain }
);
const projectAccess = ref('POLICY', 'tenant-project-access', 'NONE');

const paths = {
  tools: 'lib/editron/agent/tools.ts',
  audio: 'lib/editron/agent/chat-audio-tools.ts',
  visual: 'lib/editron/agent/chat-visual-tools.ts',
  project: 'lib/editron/services/project-service.ts',
  renderer: 'components/editron/editor/version-7.0.0/components/core/layer-content.tsx',
} as const;

function closedSchema(fields: Record<string, FieldType>, required: string[]) {
  return {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, { type }])),
    required,
  };
}

function uniqueRefs(refs: readonly CodeRef[]): CodeRef[] {
  const seen = new Set<string>();
  return refs.filter(({ path, symbol, role }) => {
    const key = `${path}#${symbol}#${role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildOperation(definition: SupplementDefinition): Cap2aPlannerOperationV2R {
  const recordId = `v2r-supplement.${definition.selectableOperatorId}`;
  const validators = definition.validators ?? [];
  const mutationPath = definition.mutationPath ?? [];
  const evidenceRefs = uniqueRefs([
    ...definition.entrypoints,
    definition.decisionOwner,
    ...(definition.formOwner ? [definition.formOwner] : []),
    ...(definition.mutationOwner ? [definition.mutationOwner] : []),
    ...(definition.persistenceOwner ? [definition.persistenceOwner] : []),
    ...(definition.proofOwner ? [definition.proofOwner] : []),
    ...definition.finalConsumers,
    ...validators,
  ]).map((entry) => ({ ...entry, role: 'EVIDENCE' as const }));
  return parseCap2aPlannerOperationV2R({
    operatorId: recordId,
    version: '1.0.0',
    family: definition.family,
    kind: definition.kind,
    aliases: { usage: 'RETRIEVAL_ONLY', values: definition.aliases },
    support: {
      implementationStatus: definition.implementationStatus,
      certificationStatus: 'UNCERTIFIED',
      plannerEligibility: definition.plannerEligibility,
      reason: definition.reason,
      projectClasses: CAP2_PROJECT_CLASSES_V1.map((projectClass) => ({ projectClass, status: 'UNCERTIFIED', evidenceRefs: [] })),
    },
    surfaces: { ...definition.surfaces, entrypoints: definition.entrypoints, parityStatus: definition.parityStatus, parityReason: definition.parityReason },
    owners: {
      ownerDisposition: definition.ownerDisposition ?? 'VERIFIED',
      decisionOwner: definition.decisionOwner,
      ...(definition.formOwner ? { formOwner: definition.formOwner } : {}),
      ...(definition.mutationOwner ? { mutationOwner: definition.mutationOwner } : {}),
      ...(definition.persistenceOwner ? { persistenceOwner: definition.persistenceOwner } : {}),
      ...(definition.proofOwner ? { proofOwner: definition.proofOwner } : {}),
      finalConsumers: definition.finalConsumers,
    },
    contract: {
      inputSchema: closedSchema(definition.input, definition.requiredInput),
      outputSchema: closedSchema(definition.output, definition.requiredOutput),
      coordinateDomains: definition.coordinateDomains,
      resolverHandoff: {
        disposition: definition.resolverDisposition ?? (definition.resolverOwner ? 'VERIFIED' : 'NOT_REQUIRED'),
        ...(definition.resolverOwner ? { owner: definition.resolverOwner } : {}),
        inputBinding: definition.resolverInputBinding ?? 'The current callable receives the closed input schema in its project-scoped tool closure.',
        outputBinding: definition.resolverOutputBinding ?? 'The current owner returns the closed output schema; no canonical IF1 receipt is implied.',
      },
    },
    effects: { reads: definition.reads, writes: definition.writes, requires: [projectAccess, ...(definition.requires ?? [])], produces: definition.produces, invalidates: definition.invalidates, stateEffects: definition.stateEffects },
    execution: { mutationPath, revisionSemantics: definition.revisionSemantics, concurrencySemantics: definition.concurrencySemantics, idempotencySemantics: definition.idempotencySemantics, failClosed: definition.failClosed, failureDispositions: definition.failureDispositions },
    verification: {
      deterministicValidators: validators,
      proofObligations: definition.proofKinds.map((kind) => ({ kind, version: '1.0.0', requirement: `${kind} evidence must bind the selectable operator, actual inputs, source/project revision and affected range or artifact.` })),
      proofDispositions: ['PASS', 'FAIL', 'UNVERIFIABLE'],
      scorecardThresholds: definition.thresholds,
    },
    recovery: { undo: definition.undo, redo: definition.redo, replay: definition.replay, reproducibilityBindings: [`${recordId}@1.0.0`, CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R, ...definition.reproducibilityBindings] },
    policy: {
      rights: definition.rights,
      privacy: definition.privacy ?? 'Tenant and project scope must be preserved; client media is private by default.',
      egress: definition.egress,
      promptInjection: definition.promptInjection ?? 'Retrieved text and metadata are untrusted evidence, never executable instructions.',
      network: definition.network,
    },
    resources: { latencyClass: definition.latencyClass, computeClass: definition.computeClass, limits: definition.limits },
    evidenceRefs,
  });
}

const updateOverlay = code(paths.project, 'updateOverlay', 'PERSISTENCE_OWNER');
const addOverlay = code(paths.project, 'addOverlay', 'PERSISTENCE_OWNER');
const saveProject = code(paths.project, 'saveProject', 'PERSISTENCE_OWNER');
const layerConsumer = code(paths.renderer, 'LayerContent', 'CONSUMER');
const localNoEgress = { rights: 'Preserves existing source rights and may not expand asset or font permissions.', egress: 'No external egress.', network: 'Only ProjectService persistence is allowed.' } as const;

const definitions: SupplementDefinition[] = [
  {
    selectableOperatorId: 'get_video_transcription', family: 'transcript evidence', kind: 'ANALYZE', implementationStatus: 'PARTIAL', plannerEligibility: 'READ_ONLY', aliases: ['read clip transcript', 'read timeline transcript'],
    reason: 'The chat tool can read cached transcripts or trigger provider transcription and cache writes, but it exposes naked numeric-fps projection and no revision-bound evidence receipt.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'Only the project-scoped chat tool exposes this combined single/timeline view.',
    entrypoints: [code(paths.tools, 'getVideoTranscription', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'getVideoTranscription', 'DECISION_OWNER'), finalConsumers: [code(paths.tools, 'get_video_transcription tool result', 'CONSUMER')],
    input: { videoOverlayId: 'integer', forceRefresh: 'boolean', mode: 'string' }, requiredInput: [], output: { status: 'string', mode: 'string', transcript: 'string', segments: 'array' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'AUDIO_SAMPLE'],
    reads: [ref('PROJECT_PATH', 'overlays[type=video]', 'PROJECT_TIMEBASE'), ref('EVIDENCE', 'media-assets.transcription', 'AUDIO_SAMPLE')], writes: [ref('EVIDENCE', 'media-assets.transcription-cache', 'AUDIO_SAMPLE')], produces: [ref('EVIDENCE', 'chat-transcript-projection', 'PROJECT_TIMEBASE')], invalidates: [], stateEffects: ['May generate and cache a transcription even though the selectable operator is categorized as a read.'],
    revisionSemantics: 'EXTERNAL_JOB', concurrencySemantics: 'JOB_IDEMPOTENT', idempotencySemantics: 'SUPPORTED', failClosed: true, failureDispositions: ['RETRY_SAME_COMMAND', 'ASK_USER', 'UNVERIFIABLE'], validators: [code('lib/editron/services/media/transcription-service.ts', 'hasUsableWordTimings', 'VALIDATOR')], proofKinds: ['state', 'semantic'], thresholds: ['Frame-addressed edits require measured word timings; text-only or synthetic timing is insufficient.'],
    undo: 'NOT_APPLICABLE', redo: 'NOT_APPLICABLE', replay: 'UNAVAILABLE', reproducibilityBindings: ['asset id and transcription/provider version are required but not fully emitted today'], rights: 'Source media rights and permission for transcription-provider processing are mandatory.', egress: 'A cache miss or force refresh may send media to configured external transcription providers.', network: 'Provider calls are allowed only through transcription-service and require explicit project egress policy.', latencyClass: 'BACKGROUND', computeClass: 'EXTERNAL', limits: { timelineClipConcurrency: 'unbounded Promise.all today', frameProjection: 'naked project fps number' },
  },
  {
    selectableOperatorId: 'batch_update_overlays', family: 'overlay mutation', kind: 'MUTATE', implementationStatus: 'LIVE', plannerEligibility: 'EXCLUDED', aliases: ['batch overlay update'], reason: 'The tool loops over independent updateOverlay writes with no batch CAS or rollback, so partial success is possible.',
    surfaces: { manualUi: false, chat: true, director: true, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'The batch chat/director mutation has no equivalent atomic manual owner.', entrypoints: [code(paths.tools, 'batchUpdateOverlays', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'batchUpdateOverlays', 'DECISION_OWNER'), mutationOwner: code(paths.tools, 'batchUpdateOverlays update loop', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, finalConsumers: [layerConsumer],
    input: { updates: 'array' }, requiredInput: ['updates'], output: { status: 'string', results: 'array', affectedFrameRanges: 'array' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE'], reads: [ref('PROJECT_PATH', 'overlays[updates[].id]', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'overlays[updates[].id]', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'per-overlay status list', 'NONE')], invalidates: [ref('PROOF', 'affected-range-render-proof', 'PROJECT_TIMEBASE')], stateEffects: ['Writes each requested overlay independently; prior writes remain if a later update fails.'],
    mutationPath: [code(paths.tools, 'batchUpdateOverlays update loop', 'MUTATION_OWNER'), updateOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'NEVER_RETRY'], validators: [code(paths.tools, 'constrainChatOverlayPlacement', 'VALIDATOR'), code(paths.tools, 'protectChatTextLegibility', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render'], thresholds: ['Production use requires one CAS and one receipt for the complete batch.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['ordered updates array and starting project revision'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { maximumUpdates: 'unbounded today', atomicWrites: 'one per changed overlay' },
  },
  {
    selectableOperatorId: 'split_overlay', family: 'timeline range mutation', kind: 'MUTATE', implementationStatus: 'LIVE', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['split clip at playhead'], reason: 'Split mechanics exist, but the live path performs update, add and duration recalculation separately and generates a nondeterministic child id.',
    surfaces: { manualUi: true, chat: true, director: true, worker: false, api: false }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'Manual and agent split paths do not share one receipt/revision contract.', entrypoints: [code(paths.tools, 'splitOverlay', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'splitOverlay', 'DECISION_OWNER'), mutationOwner: code(paths.tools, 'splitOverlay', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, finalConsumers: [layerConsumer],
    input: { id: 'integer', atFrame: 'integer' }, requiredInput: ['id', 'atFrame'], output: { status: 'string', firstPart: 'object', secondPart: 'object', affectedFrameRanges: 'array' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'SOURCE_FRAME'], reads: [ref('PROJECT_PATH', 'overlays[id]', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'overlays[id] and generated child', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'split child summary', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'timeline and source projection proof', 'PROJECT_TIMEBASE')], stateEffects: ['Shortens the original, adds a source-offset child, then recalculates duration in separate writes.'],
    mutationPath: [code(paths.tools, 'splitOverlay', 'MUTATION_OWNER'), updateOverlay, addOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'NEVER_RETRY'], validators: [code(paths.tools, 'split point bounds check', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render'], thresholds: ['Range conservation, source continuity and deterministic child identity must all pass.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['overlay id, split frame, source offset and generated child id'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { affectedOverlays: 1, canonicalAtomicWrites: 'unavailable' },
  },
  {
    selectableOperatorId: 'trim_overlay', family: 'timeline range mutation', kind: 'MUTATE', implementationStatus: 'LIVE', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['trim clip head or tail'], reason: 'Trim updates source offsets for simple video/audio cases, but the live tool has no expected revision, handle proof or canonical receipt.',
    surfaces: { manualUi: true, chat: true, director: false, worker: false, api: false }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'Manual trim and chat trim do not share a closed owner/proof contract.', entrypoints: [code(paths.tools, 'trimOverlay', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'trimOverlay', 'DECISION_OWNER'), mutationOwner: code(paths.tools, 'trimOverlay', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, finalConsumers: [layerConsumer],
    input: { id: 'integer', trimStart: 'integer', trimEnd: 'integer' }, requiredInput: ['id'], output: { status: 'string', newTiming: 'object', affectedFrameRanges: 'array' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'SOURCE_FRAME'], reads: [ref('PROJECT_PATH', 'overlays[id]', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'overlays[id].timing-and-source-offset', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'trim timing summary', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'affected-range-render-proof', 'PROJECT_TIMEBASE')], stateEffects: ['Changes timeline start/duration and advances video/audio source offset for a head trim.'],
    mutationPath: [code(paths.tools, 'trimOverlay', 'MUTATION_OWNER'), updateOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: true, failureDispositions: ['CONFLICT', 'REJECTED', 'UNVERIFIABLE'], validators: [code(paths.tools, 'positive remaining duration check', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render'], thresholds: ['Remaining duration must be positive and requested source handles must exist.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['overlay id, pre-trim timing/source offset and requested trims'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { affectedOverlays: 1 },
  },
  {
    selectableOperatorId: 'close_gaps', family: 'timeline ripple mutation', kind: 'MUTATE', implementationStatus: 'LIVE', plannerEligibility: 'EXCLUDED', aliases: ['ripple close timeline gaps'], reason: 'The tool computes gaps from video clips, moves every later overlay one write at a time, and its preserveCaptions input is not consulted.',
    surfaces: { manualUi: true, chat: true, director: false, worker: false, api: false }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'UI, close_gaps and cut_section retain separate range/ripple ownership.', ownerDisposition: 'DUPLICATED_UNRESOLVED', entrypoints: [code(paths.tools, 'closeGaps', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'closeGaps', 'DECISION_OWNER'), mutationOwner: code(paths.tools, 'closeGaps overlay loop', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, finalConsumers: [layerConsumer],
    input: { preserveCaptions: 'boolean' }, requiredInput: [], output: { status: 'string', clipsMoved: 'integer', totalFramesClosed: 'integer', affectedFrameRanges: 'array' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE'], reads: [ref('PROJECT_PATH', 'overlays', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'overlays[].from and project duration', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'gap close move summary', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'all downstream timeline-timed proofs', 'PROJECT_TIMEBASE')], stateEffects: ['Shifts all overlays after detected video gaps through independent writes and recalculates duration.'],
    mutationPath: [code(paths.tools, 'closeGaps overlay loop', 'MUTATION_OWNER'), updateOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'NEVER_RETRY'], proofKinds: ['state', 'reload', 'render'], thresholds: ['Production ripple requires one range transform, one CAS and proof that connected media remain aligned.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['ordered overlay set, detected gap list and starting revision'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { movedOverlays: 'unbounded today', inputPreserveCaptions: 'declared but unused' },
  },
  {
    selectableOperatorId: 'cut_section', family: 'timeline range mutation', kind: 'MUTATE', implementationStatus: 'PARTIAL', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['remove timeline range'], reason: 'A reusable pure range transform exists, but the live chat wrapper saves whole project state without expected revision and omits its coordinate-transform/split-child details from the response.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'The pure transform and live whole-state writer are not yet exposed through one IF1 command/receipt.', entrypoints: [code(paths.tools, 'cutSection', 'ENTRYPOINT')], decisionOwner: code('lib/editron/services/timeline-range-cut.ts', 'cutTimelineRange', 'DECISION_OWNER'), formOwner: code('lib/editron/services/timeline-range-cut.ts', 'cutTimelineRange', 'FORM_OWNER'), mutationOwner: code(paths.tools, 'cutSection', 'MUTATION_OWNER'), persistenceOwner: saveProject, finalConsumers: [layerConsumer],
    input: { startFrame: 'integer', endFrame: 'integer' }, requiredInput: ['startFrame', 'endFrame'], output: { status: 'string', deleted: 'integer', trimmed: 'integer', shifted: 'integer', split: 'integer', created: 'integer', framesCut: 'integer', affectedFrameRange: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'SOURCE_FRAME'], resolverDisposition: 'DIVERGENT', resolverOwner: code('lib/editron/services/timeline-range-cut.ts', 'cutTimelineRange', 'FORM_OWNER'), resolverInputBinding: 'The research proxy can bind the pure transform, but the live tool accepts only startFrame/endFrame and does not accept expected revision/evidence.', resolverOutputBinding: 'The pure owner produces a coordinate transform and split-child mapping; the live tool response currently drops both.',
    reads: [ref('PROJECT_PATH', 'overlays and durationInFrames', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'whole project overlays and durationInFrames', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'live cut summary only', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'timeline-coordinate and affected-range proofs', 'PROJECT_TIMEBASE')], stateEffects: ['Splits, removes and shifts every affected overlay, then writes the whole project snapshot.'], mutationPath: [code('lib/editron/services/timeline-range-cut.ts', 'cutTimelineRange', 'MUTATION_OWNER'), code(paths.tools, 'cutSection', 'MUTATION_OWNER'), saveProject], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'NEVER_RETRY'], validators: [code('lib/editron/services/timeline-range-cut.ts', 'cutTimelineRange', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'semantic'], thresholds: ['Speech preservation, coordinate remap, split identity, range conservation and reload must all pass.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['pre-cut project hash, range, fps, coordinate transform and split-child map'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { wholeProjectWrite: 1, expectedRevision: 'absent in live wrapper' },
  },
  {
    selectableOperatorId: 'apply_audio_ducking', family: 'audio mix mutation', kind: 'MUTATE', implementationStatus: 'PARTIAL', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['duck background music under speech'], reason: 'The pure plan correctly targets BGM and the renderer derives gain, but the live tool writes each BGM overlay independently and emits no audible proof or canonical receipt.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'No shared manual/agent mix owner or receipt exists.', entrypoints: [code(paths.audio, 'applyAudioDucking', 'ENTRYPOINT')], decisionOwner: code(paths.audio, 'applyAudioDuckingToProject', 'DECISION_OWNER'), formOwner: code(paths.audio, 'applyAudioDuckingToProject', 'FORM_OWNER'), mutationOwner: code(paths.audio, 'applyAudioDucking update loop', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, proofOwner: code('components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx', 'SoundLayerContent', 'PROOF_OWNER'), finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx', 'SoundLayerContent', 'CONSUMER')],
    input: { enabled: 'boolean', duckLevel: 'number', rampDownMs: 'integer', rampUpMs: 'integer', lookAheadMs: 'integer' }, requiredInput: [], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'AUDIO_SAMPLE'], resolverOwner: code(paths.audio, 'applyAudioDuckingToProject', 'FORM_OWNER'), reads: [ref('PROJECT_PATH', 'sound/video overlays and speech evidence', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'BGM overlays[].styles.duckingConfig', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'ducking plan', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'rendered audio mix proof', 'AUDIO_SAMPLE')], stateEffects: ['Stores duckingConfig and optional default BGM volume; rendered gain is derived dynamically rather than stored as gain keyframes.'],
    mutationPath: [code(paths.audio, 'applyAudioDuckingToProject', 'MUTATION_OWNER'), code(paths.audio, 'applyAudioDucking update loop', 'MUTATION_OWNER'), updateOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'SUPPORTED', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'UNVERIFIABLE'], validators: [code(paths.audio, 'applyAudioDuckingToProject', 'VALIDATOR')], proofKinds: ['state', 'reload', 'audio', 'render'], thresholds: ['Only BGM may change; dialogue remains intelligible; output must not clip; gain restores outside speech.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['BGM ids, voice/speech ranges, config and renderer version'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { bgmWrites: 'one per changed BGM overlay', audibleProof: 'not emitted by live tool' },
  },
  {
    selectableOperatorId: 'add_transition', family: 'transition mutation', kind: 'MUTATE', implementationStatus: 'PARTIAL', plannerEligibility: 'EXCLUDED', aliases: ['insert transition between clips'], reason: 'Manual/direct, Director and EDL paths retain divergent owners; the compatibility tool mutates two clips plus a legacy transition tile through separate writes.',
    surfaces: { manualUi: true, chat: false, director: true, worker: false, api: true }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'The direct compatibility writer does not persist the EDL atomicTransitionForm.', ownerDisposition: 'DUPLICATED_UNRESOLVED', entrypoints: [code(paths.tools, 'addTransitionTool', 'ENTRYPOINT'), code('app/api/services/editron/chat/tool-call/route.ts', "toolName: 'add_transition'", 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'addTransitionTool', 'DECISION_OWNER'), formOwner: code('lib/editron/data/transition-system.ts', 'calculateTransition', 'FORM_OWNER'), mutationOwner: code(paths.tools, 'applyBetween', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, proofOwner: code('components/editron/editor/version-7.0.0/components/overlays/transitions/transition-layer-content.tsx', 'TransitionLayerContent', 'PROOF_OWNER'), finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/transitions/transition-layer-content.tsx', 'TransitionLayerContent', 'CONSUMER')],
    input: { afterOverlayId: 'integer', type: 'string', durationMs: 'number', applyToAll: 'boolean' }, requiredInput: [], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE'], resolverDisposition: 'DIVERGENT', resolverOwner: code('lib/editron/data/transition-system.ts', 'calculateTransition', 'FORM_OWNER'), resolverInputBinding: 'Compatibility input selects a catalog type and clip boundary; Director/EDL resolve transition intent separately.', resolverOutputBinding: 'calculateTransition returns clip updates, but the compatibility writer creates a legacy transition tile rather than the canonical EDL form.', reads: [ref('PROJECT_PATH', 'adjacent video overlays and transition tiles', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'outgoing clip, incoming clip and transition overlay', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'transition count summary', 'NONE')], invalidates: [ref('PROOF', 'boundary render and source-handle proof', 'PROJECT_TIMEBASE')], stateEffects: ['May delete an existing transition, retime/keyframe two clips and add one transition tile per boundary.'],
    mutationPath: [code(paths.tools, 'applyBetween', 'MUTATION_OWNER'), updateOverlay, addOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'NEVER_RETRY'], validators: [code('lib/editron/data/transition-system.ts', 'calculateTransition', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'visual'], thresholds: ['Both source handles, exact overlap, continuity and rendered boundary must pass under one owner.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['clip pair, transition definition version, overlap and starting revision'], ...localNoEgress, latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { applyToAllBoundaries: 'unbounded today', writesPerBoundary: 3 },
  },
  {
    selectableOperatorId: 'reframe_project', family: 'subject-aware reframing', kind: 'MUTATE', implementationStatus: 'PARTIAL', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['reframe aspect ratio around subject'], reason: 'A pure subject-aware plan exists, but execution writes whole project state and audit metadata separately with no caller-supplied expected revision.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'This subject-aware project operation is not shared with the manual canvas-size path.', entrypoints: [code(paths.visual, 'reframeProject', 'ENTRYPOINT')], decisionOwner: code('lib/editron/services/subject-reframe-plan.ts', 'buildSubjectAwareReframePlan', 'DECISION_OWNER'), formOwner: code('lib/editron/services/subject-reframe-plan.ts', 'buildSubjectAwareReframePlan', 'FORM_OWNER'), mutationOwner: code(paths.visual, 'applySubjectReframeMutation', 'MUTATION_OWNER'), persistenceOwner: saveProject, finalConsumers: [layerConsumer], input: { targetAspectRatio: 'string' }, requiredInput: ['targetAspectRatio'], output: { status: 'string', data: 'object', message: 'string' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'SOURCE_PTS'], resolverOwner: code('lib/editron/services/subject-reframe-plan.ts', 'buildSubjectAwareReframePlan', 'FORM_OWNER'),
    reads: [ref('PROJECT_PATH', 'canvas and visual overlays', 'PROJECT_TIMEBASE'), ref('EVIDENCE', 'project asset subject analyses', 'SOURCE_PTS')], writes: [ref('PROJECT_PATH', 'canvas, overlays and intelligence.lastSubjectReframe', 'PROJECT_TIMEBASE')], produces: [ref('EVIDENCE', 'subject reframe plan and audit metadata', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'all layout/collision/render proofs', 'PROJECT_TIMEBASE')], stateEffects: ['Changes project aspect ratio/dimensions and multiple overlay transforms, then writes audit metadata separately.'], mutationPath: [code('lib/editron/services/subject-reframe-plan.ts', 'buildSubjectAwareReframePlan', 'MUTATION_OWNER'), code(paths.visual, 'applySubjectReframeMutation', 'MUTATION_OWNER'), saveProject, code(paths.project, 'updateProject', 'PERSISTENCE_OWNER')], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['CONFLICT', 'REJECTED', 'UNVERIFIABLE'], validators: [code('lib/editron/services/subject-reframe-plan.ts', 'buildSubjectAwareReframePlan', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'visual', 'semantic'], thresholds: ['Subject visibility, authored layout preservation, safe zones and exact target canvas must pass.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['asset-analysis versions, target aspect ratio, project snapshot and planner version'], ...localNoEgress, latencyClass: 'BACKGROUND', computeClass: 'SERVER_CPU', limits: { wholeProjectWrite: 1, auditWrite: 1, supportedRatios: 4 },
  },
  {
    selectableOperatorId: 'use_matching_footage', family: 'asset replacement', kind: 'MUTATE', implementationStatus: 'LIVE', plannerEligibility: 'ISOLATED_PROPOSAL_ONLY', aliases: ['replace clip with uploaded footage'], reason: 'The tool resolves one exact accessible video asset and one target overlay, but it does not validate source handles, semantic fit, rational source rate or rendered continuity.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'No shared manual/chat replacement receipt and proof contract exists.', entrypoints: [code(paths.tools, 'useMatchingFootage', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'useMatchingFootage', 'DECISION_OWNER'), mutationOwner: code(paths.tools, 'useMatchingFootage', 'MUTATION_OWNER'), persistenceOwner: updateOverlay, finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content.tsx', 'VideoLayerContent', 'CONSUMER')],
    input: { overlayId: 'string', sceneIndex: 'integer', assetId: 'string', sourceStartFrame: 'integer' }, requiredInput: ['assetId'], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'SOURCE_FRAME'], reads: [ref('PROJECT_PATH', 'target video overlay', 'PROJECT_TIMEBASE'), ref('PROJECT_PATH', 'media-assets[assetId]', 'SOURCE_FRAME')], writes: [ref('PROJECT_PATH', 'target overlay source binding', 'PROJECT_TIMEBASE')], requires: [ref('POLICY', 'source-rights-and-egress', 'NONE')], produces: [ref('EVIDENCE', 'replacement summary', 'PROJECT_TIMEBASE')], invalidates: [ref('PROOF', 'source continuity and affected-range render proof', 'PROJECT_TIMEBASE')], stateEffects: ['Rebinds one video overlay to a user asset and resets its source offset to the selected sourceStartFrame.'],
    mutationPath: [code(paths.tools, 'useMatchingFootage', 'MUTATION_OWNER'), updateOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'SUPPORTED', failClosed: true, failureDispositions: ['CONFLICT', 'REJECTED', 'ASK_USER', 'UNVERIFIABLE'], validators: [code(paths.tools, 'useMatchingFootage target and asset checks', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'semantic'], thresholds: ['Exact target, accessible video asset, source handles, semantic fit and rendered continuity must pass.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['old/new asset ids, overlay id, source offset and starting revision'], rights: 'The selected asset must be user-accessible and cleared for the project.', egress: 'Asset URL resolution only; no new model egress.', network: 'AssetResolver and ProjectService only.', latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { targetOverlays: 1, mixedRateConform: 'unavailable' },
  },
  {
    selectableOperatorId: 'add_sfx', family: 'SFX acquisition and placement', kind: 'GENERATE', implementationStatus: 'PARTIAL', plannerEligibility: 'EXCLUDED', aliases: ['find or generate and place sound effect'], reason: 'One callable combines library search, two generated-provider fallbacks, upload, asset persistence and timeline insertion; it is not an atomic or transaction-safe production operation.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'The chat workflow has no shared catalog/resolver/mutation transaction with the reviewer/calibration path.', entrypoints: [code(paths.tools, 'addSFX', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'addSFX provider fallback workflow', 'DECISION_OWNER'), formOwner: code('lib/editron/services/sfx-form.ts', 'resolveAtomicSfxForm', 'FORM_OWNER'), mutationOwner: code(paths.tools, 'addSFX asset and overlay persistence', 'MUTATION_OWNER'), persistenceOwner: addOverlay, proofOwner: code('components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx', 'SoundLayerContent', 'PROOF_OWNER'), finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx', 'SoundLayerContent', 'CONSUMER')],
    input: { query: 'string', sceneIndex: 'integer', startFrame: 'integer', durationSeconds: 'number' }, requiredInput: ['query'], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'AUDIO_SAMPLE'], resolverOwner: code('lib/editron/services/sfx-form.ts', 'resolveAtomicSfxForm', 'FORM_OWNER'), reads: [ref('PROJECT_PATH', 'target scene and video overlay', 'PROJECT_TIMEBASE'), ref('EVIDENCE', 'SFX library/provider results', 'AUDIO_SAMPLE')], writes: [ref('PROJECT_PATH', 'media asset and SFX sound overlay', 'PROJECT_TIMEBASE')], requires: [ref('POLICY', 'audio-rights-and-provider-egress', 'NONE')], produces: [ref('ARTIFACT', 'rights-bound SFX asset', 'AUDIO_SAMPLE')], invalidates: [ref('PROOF', 'rendered audio mix proof', 'AUDIO_SAMPLE')], stateEffects: ['May create a media asset in storage/Mongo and then add a sound overlay in a separate project write.'],
    mutationPath: [code(paths.tools, 'addSFX provider fallback workflow', 'MUTATION_OWNER'), code('lib/editron/services/upload-service.ts', 'uploadMedia', 'PERSISTENCE_OWNER'), code(paths.tools, 'MEDIA_ASSETS updateOne', 'PERSISTENCE_OWNER'), addOverlay], revisionSemantics: 'EXTERNAL_JOB', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['RETRY_SAME_COMMAND', 'REJECTED', 'UNVERIFIABLE', 'BUDGET_EXHAUSTED'], validators: [code('lib/editron/services/sfx-form.ts', 'resolveAtomicSfxForm', 'VALIDATOR')], proofKinds: ['state', 'reload', 'audio', 'render', 'semantic'], thresholds: ['Rights receipt, semantic event fit, audible placement, dialogue protection and no clipping must all pass.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['query, provider branch/model, asset hash/rights, atomic form and project revision'], rights: 'A structured audioRights contract is mandatory; library license or generated-provider terms must bind the asset.', egress: 'May send prompt and target video to Freesound/fal/Mirelo/CassetteAI and upload returned audio.', network: 'Only declared SFX providers and storage paths may be used under project policy.', latencyClass: 'BACKGROUND', computeClass: 'EXTERNAL', limits: { mireloSeconds: 10, cassetteSeconds: 30, transactionAcrossAssetAndProject: 'unavailable' },
  },
  {
    selectableOperatorId: 'search_stock_footage', family: 'external stock retrieval', kind: 'READ', implementationStatus: 'PARTIAL', plannerEligibility: 'READ_ONLY', aliases: ['search stock video or image'], reason: 'Pixabay search works as an external read, but returned candidates carry no canonical rights receipt, provenance binding or injection-safe evidence record.',
    surfaces: { manualUi: false, chat: true, director: false, worker: false, api: false }, parityStatus: 'AGENT_ONLY', parityReason: 'Only the chat tool exposes this result shape.', entrypoints: [code(paths.tools, 'searchStockFootage', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'searchStockFootage', 'DECISION_OWNER'), finalConsumers: [code(paths.tools, 'search_stock_footage tool result', 'CONSUMER')],
    input: { query: 'string', type: 'string', minDuration: 'number', maxDuration: 'number', limit: 'integer' }, requiredInput: ['query'], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['NONE'], reads: [ref('EVIDENCE', 'Pixabay search results', 'NONE')], writes: [], requires: [ref('POLICY', 'stock-search-rights-and-egress', 'NONE')], produces: [ref('EVIDENCE', 'unbound stock candidate list', 'NONE')], invalidates: [], stateEffects: [], revisionSemantics: 'EXTERNAL_JOB', concurrencySemantics: 'READ_ONLY', idempotencySemantics: 'SUPPORTED', failClosed: true, failureDispositions: ['RETRY_SAME_COMMAND', 'ASK_USER', 'UNVERIFIABLE'], proofKinds: ['semantic'], thresholds: ['Candidates remain suggestions until exact asset/version/license provenance is independently bound.'], undo: 'NOT_APPLICABLE', redo: 'NOT_APPLICABLE', replay: 'SUPPORTED', reproducibilityBindings: ['query, filters, provider response and retrieval timestamp'], rights: 'Do not treat provider marketing text as a license receipt; selected assets require captured license/provenance.', egress: 'Sends search terms to Pixabay.', network: 'Pixabay only through pipeline/pixabay-service.', latencyClass: 'BACKGROUND', computeClass: 'EXTERNAL', limits: { advertisedResultLimit: '1-10 but schema currently does not enforce bounds' },
  },
  {
    selectableOperatorId: 'generate_html_scene', family: 'legacy generated HTML scene', kind: 'GENERATE', implementationStatus: 'PARTIAL', plannerEligibility: 'EXCLUDED', aliases: ['generate animated html scene'], reason: 'The tool asks an LLM for HTML/CSS/JS, sanitizes a fragment and stores it directly as an overlay, but has no isolated compile/runtime sandbox, deterministic program contract or rendered acceptance proof.',
    surfaces: { manualUi: false, chat: false, director: true, worker: false, api: false }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'Live chat filters this shadow writer while legacy Director paths can still reference it.', ownerDisposition: 'DUPLICATED_UNRESOLVED', entrypoints: [code(paths.tools, 'generateHtmlScene', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'generateHtmlScene LLM prompt', 'DECISION_OWNER'), formOwner: code(paths.tools, 'generated HTML fragment', 'FORM_OWNER'), mutationOwner: code(paths.tools, 'generateHtmlScene', 'MUTATION_OWNER'), persistenceOwner: addOverlay, proofOwner: code('components/editron/editor/version-7.0.0/components/overlays/html/html-scene-layer-content.tsx', 'HtmlSceneLayerContent', 'PROOF_OWNER'), finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/html/html-scene-layer-content.tsx', 'HtmlSceneLayerContent', 'CONSUMER')],
    input: { start: 'integer', duration: 'integer', row: 'integer', description: 'string', x: 'number', y: 'number', width: 'number', height: 'number', rotation: 'number' }, requiredInput: ['start', 'duration', 'description'], output: { status: 'string', id: 'integer', metadata: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE'], resolverDisposition: 'MISSING', resolverInputBinding: 'No certified GeneratedCompositionProgram resolver owns this legacy prompt.', resolverOutputBinding: 'Generated markup is stored directly rather than returned as a versioned, sandbox-verifiable program.', reads: [ref('PROJECT_PATH', 'canvas, aspect ratio and overlay occupancy', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'html-scene overlay', 'PROJECT_TIMEBASE')], requires: [ref('POLICY', 'generated-code-and-font-egress', 'NONE')], produces: [ref('ARTIFACT', 'sanitized HTML fragment', 'COMPOSITION_LOCAL')], invalidates: [ref('PROOF', 'affected-range security and render proof', 'PROJECT_TIMEBASE')], stateEffects: ['Generates markup with an external model and stores the wrapped fragment as an html-scene overlay.'],
    mutationPath: [code(paths.tools, 'generateHtmlScene', 'MUTATION_OWNER'), code('lib/editron/utils/html-generator-utils.ts', 'sanitizeHtml', 'VALIDATOR'), addOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: false, failureDispositions: ['REJECTED', 'CAPABILITY_GAP', 'NEVER_RETRY'], validators: [code('lib/editron/utils/html-generator-utils.ts', 'sanitizeHtml', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'visual'], thresholds: ['Sandbox isolation, dependency allowlist, deterministic compile, bounded resources and rendered proof are all currently missing.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['model id, prompt, raw response hash, sanitizer/wrapper versions and project revision'], rights: 'Generated fonts, images, icons and CDN dependencies require explicit license/provenance checks.', privacy: 'Project description and canvas context must not leave the tenant without explicit model-egress permission.', egress: 'Sends the creative description to an LLM; generated markup may reference allowlisted public CDNs at render time.', promptInjection: 'The description and generated markup are untrusted; sanitization alone is not a production sandbox.', network: 'External LLM plus generated CDN requests are present in the legacy path.', latencyClass: 'BACKGROUND', computeClass: 'EXTERNAL', limits: { codeSize: 'unbounded today', repairBudget: 'none', runtimeSandbox: 'unavailable' },
  },
  {
    selectableOperatorId: 'add_motion_graphic', family: 'legacy motion graphics mutation', kind: 'MUTATE', implementationStatus: 'PARTIAL', plannerEligibility: 'EXCLUDED', aliases: ['add composed motion graphic'], reason: 'The legacy tool is disabled unless MG_CODEGEN_ENABLED is forced, and its composition engine overlaps with newer semantic/editorial and generated-program owners.',
    surfaces: { manualUi: false, chat: false, director: true, worker: false, api: false }, parityStatus: 'SEMANTICALLY_DIVERGENT', parityReason: 'Live chat explicitly filters this legacy writer; Director and compatibility paths remain.', ownerDisposition: 'DUPLICATED_UNRESOLVED', entrypoints: [code(paths.tools, 'addMotionGraphic', 'ENTRYPOINT')], decisionOwner: code(paths.tools, 'addMotionGraphic', 'DECISION_OWNER'), formOwner: code('lib/editron/motion-graphics/engine/composition-planner.ts', 'planComposition', 'FORM_OWNER'), mutationOwner: code(paths.tools, 'addMotionGraphic', 'MUTATION_OWNER'), persistenceOwner: addOverlay, proofOwner: code('components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx', 'MotionGraphicLayerContent', 'PROOF_OWNER'), finalConsumers: [code('components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx', 'MotionGraphicLayerContent', 'CONSUMER')],
    input: { start: 'integer', duration: 'integer', description: 'string', graphicType: 'string', name: 'string', title: 'string', value: 'string', label: 'string', quote: 'string', author: 'string', text: 'string', body: 'string', row: 'integer', x: 'number', y: 'number', width: 'number', height: 'number' }, requiredInput: ['start', 'description'], output: { status: 'string', data: 'object' }, requiredOutput: ['status'], coordinateDomains: ['PROJECT_TIMEBASE', 'COMPOSITION_LOCAL'], resolverDisposition: 'DIVERGENT', resolverOwner: code('lib/editron/motion-graphics/engine/composition-planner.ts', 'planComposition', 'FORM_OWNER'), resolverInputBinding: 'Legacy structured fields or regex parsing feed the retired composition planner.', resolverOutputBinding: 'The recipe is persisted as a legacy motion-graphic overlay, not a GeneratedCompositionProgram island.', reads: [ref('PROJECT_PATH', 'brand, canvas and timeline signals', 'PROJECT_TIMEBASE')], writes: [ref('PROJECT_PATH', 'motion-graphic overlay', 'PROJECT_TIMEBASE')], produces: [ref('ARTIFACT', 'legacy motion-graphic recipe', 'COMPOSITION_LOCAL')], invalidates: [ref('PROOF', 'affected-range render and layout proof', 'PROJECT_TIMEBASE')], stateEffects: ['When force-enabled, creates a motion-graphic overlay containing recipe, tokens, signals and content.'],
    mutationPath: [code(paths.tools, 'addMotionGraphic', 'MUTATION_OWNER'), code('lib/editron/motion-graphics/engine/composition-planner.ts', 'planComposition', 'FORM_OWNER'), addOverlay], revisionSemantics: 'UNSAFE_NONE', concurrencySemantics: 'SERIAL_PROJECT', idempotencySemantics: 'UNAVAILABLE', failClosed: true, failureDispositions: ['CAPABILITY_GAP', 'REJECTED', 'NEVER_RETRY'], validators: [code(paths.tools, 'MG_CODEGEN_ENABLED gate', 'VALIDATOR')], proofKinds: ['state', 'reload', 'render', 'visual'], thresholds: ['The disabled legacy path cannot satisfy a production request; use a certified GeneratedCompositionProgram owner when available.'], undo: 'UNAVAILABLE', redo: 'UNAVAILABLE', replay: 'UNSAFE', reproducibilityBindings: ['brand resolution, tokens, recipe, input fields, flag and project revision'], rights: 'Brand fonts/assets and all generated-program inputs require explicit provenance.', egress: 'Brand resolution may access configured services; this tool itself performs no creative-model call.', network: 'Only existing brand resolution and ProjectService dependencies are allowed.', latencyClass: 'INTERACTIVE', computeClass: 'SERVER_CPU', limits: { productionFlagDefault: 'disabled', perTypeCaps: '2-5 depending on legacy type' },
  },
];

const rows = definitions.map((definition): Cap2aPlannerSupplementRowV2R => {
  const dossier = buildOperation(definition);
  return { selectableOperatorId: definition.selectableOperatorId, supplementRecordId: dossier.operatorId, sourceCommit: CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R, dossier };
});

const supplementMaterial = {
  version: CAP2A_PLANNER_SUPPLEMENT_VERSION_V2R,
  authority: 'RESEARCH_ONLY_CODE_GROUNDED_SUPPLEMENT_NOT_CAP2A_CENSUS' as const,
  sourceCommit: CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R,
  rows,
};

export const CAP2A_PLANNER_SUPPLEMENT_V2R = deepFreezeV1({ ...supplementMaterial, supplementSha256: hashCanonicalJsonV1(supplementMaterial) });
const supplementBySelectableId = new Map(CAP2A_PLANNER_SUPPLEMENT_V2R.rows.map((row) => [row.selectableOperatorId, row]));

export function cap2aPlannerSupplementForOperatorV2R(selectableOperatorId: string): Readonly<Cap2aPlannerSupplementRowV2R> | null {
  return supplementBySelectableId.get(selectableOperatorId) ?? null;
}
