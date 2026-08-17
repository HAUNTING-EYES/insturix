import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const CAP2_RECONCILIATION_SURFACES_V1 = [
  'MANUAL_UI',
  'CHAT',
  'API',
  'PROJECT_SERVICE',
  'CHECKPOINT_SERVICE',
  'RENDERER',
] as const;

export const CAP2_RECONCILIATION_DOMAINS_V1 = [
  'CORE_PROJECT_TIMELINE_CHECKPOINT',
  'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER',
  'MEDIA_AUDIO_MUSIC_SFX',
  'DIRECTOR_GENERATED_ANALYSIS_JOBS',
  'RENDER_PROOF_DELIVERY_API_WORKERS',
] as const;

const codeRefSchema = z.object({
  path: nonEmptyString,
  symbol: nonEmptyString,
}).strict();

const findingSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'INFO']),
  code: stableId,
  statement: nonEmptyString,
  evidenceRefs: z.array(codeRefSchema).min(1),
}).strict();

export const cap2OwnerReconciliationCandidateSchemaV1 = z.object({
  candidateId: stableId,
  family: nonEmptyString,
  kind: z.enum([
    'READ',
    'MUTATE',
    'WORKFLOW',
    'UI_CONTROL',
    'PERSISTENCE_ENTRYPOINT',
    'METADATA_PROJECTION',
    'MISSING',
  ]),
  implementationStatus: z.enum(['LIVE', 'PARTIAL', 'MISSING']),
  atomicity: z.enum([
    'ATOMIC',
    'COMPOUND_MULTIWRITE',
    'WHOLE_STATE_REPLACEMENT',
    'LOCAL_STATE_ONLY',
    'NON_CAPABILITY',
    'MISSING',
  ]),
  catalogDisposition: z.enum([
    'ATOMIC_CANDIDATE',
    'WRAPPER_ONLY',
    'EXCLUDED_UNSAFE',
    'EXCLUDED_NON_CAPABILITY',
    'MISSING',
  ]),
  sourceObservationIds: z.array(stableId).min(1),
  surfaces: z.array(z.enum(CAP2_RECONCILIATION_SURFACES_V1)).min(1),
  parityStatus: z.enum([
    'SHARED_PERSISTENCE_DIVERGENT_EXECUTION',
    'SHARED_OWNER_DIFFERENT_PROJECTION',
    'SEMANTICALLY_DIVERGENT',
    'MANUAL_ONLY',
    'AGENT_ONLY',
    'NOT_APPLICABLE',
  ]),
  chain: z.object({
    callers: z.array(codeRefSchema).min(1),
    decisionOwner: codeRefSchema.optional(),
    formOwner: codeRefSchema.optional(),
    mutationOwners: z.array(codeRefSchema),
    persistenceOwner: codeRefSchema.optional(),
    storedState: z.array(nonEmptyString),
    finalConsumers: z.array(codeRefSchema),
    proofOwners: z.array(codeRefSchema),
  }).strict(),
  revisionSafety: z.object({
    status: z.enum([
      'READ_CURRENT_UNPINNED',
      'LOCAL_ONLY',
      'PROJECT_CAS',
      'INTERNAL_READ_THEN_CAS',
      'MULTIWRITE_NON_ATOMIC',
      'WHOLE_STATE_STALE_SNAPSHOT_RISK',
      'NO_CAS',
      'MISSING',
      'NOT_APPLICABLE',
    ]),
    writerReceipt: z.enum([
      'PROJECT_MUTATION_RECEIPT',
      'OVERLAY_METADATA_RECEIPT_ONLY',
      'MIXED',
      'NONE',
    ]),
    detail: nonEmptyString,
  }).strict(),
  recovery: z.object({
    undo: z.enum(['SUPPORTED', 'PARTIAL', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    redo: z.enum(['SUPPORTED', 'PARTIAL', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    replay: z.enum(['SUPPORTED', 'PARTIAL', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    detail: nonEmptyString,
  }).strict(),
  findings: z.array(findingSchema).min(1),
  unresolvedDependencies: z.array(nonEmptyString),
  evidenceRefs: z.array(codeRefSchema).min(1),
}).strict().superRefine((candidate, context) => {
  if (candidate.candidateId !== candidate.candidateId.toLowerCase()) {
    context.addIssue({ code: 'custom', path: ['candidateId'], message: 'candidateId must be lowercase' });
  }
  if (new Set(candidate.surfaces).size !== candidate.surfaces.length) {
    context.addIssue({ code: 'custom', path: ['surfaces'], message: 'surfaces must be unique' });
  }
  if (candidate.implementationStatus === 'MISSING') {
    if (candidate.atomicity !== 'MISSING' || candidate.catalogDisposition !== 'MISSING') {
      context.addIssue({ code: 'custom', message: 'missing candidates must retain missing atomicity and disposition' });
    }
  }
  if (candidate.atomicity === 'NON_CAPABILITY'
    && candidate.catalogDisposition !== 'EXCLUDED_NON_CAPABILITY') {
    context.addIssue({ code: 'custom', message: 'non-capabilities must remain excluded' });
  }
  if (candidate.catalogDisposition === 'ATOMIC_CANDIDATE'
    && candidate.atomicity !== 'ATOMIC') {
    context.addIssue({ code: 'custom', message: 'only atomic rows can enter catalog population' });
  }
  if (candidate.kind === 'MUTATE' && candidate.implementationStatus !== 'MISSING'
    && (candidate.chain.mutationOwners.length === 0 || !candidate.chain.persistenceOwner)) {
    context.addIssue({ code: 'custom', path: ['chain'], message: 'implemented mutations require mutation and persistence owners' });
  }
});

export const cap2OwnerReconciliationArtifactSchemaV1 = z.object({
  artifactType: z.literal('EditronCapabilityOwnerReconciliationV1'),
  schemaVersion: z.literal(1),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  status: z.literal('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED'),
  sourceBinding: z.object({
    worktree: nonEmptyString,
    branch: nonEmptyString,
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    workingTreeDirty: z.literal(true),
    generatedAt: z.string().datetime({ offset: true }),
    sourceSurfaceSnapshotHash: sha256,
    snapshotAlgorithm: z.literal('sha256(sorted(path + NUL + sha256(rawFileBytes)).join(LF))'),
    evidenceSnapshotHash: sha256,
    evidencePaths: z.array(nonEmptyString).min(1),
  }).strict(),
  candidateCount: z.number().int().positive(),
  candidates: z.array(cap2OwnerReconciliationCandidateSchemaV1).min(1),
  domainConclusions: z.array(findingSchema).min(1),
  unresolvedSourceObservationIds: z.array(stableId).min(1),
}).strict().superRefine((artifact, context) => {
  if (artifact.candidateCount !== artifact.candidates.length) {
    context.addIssue({ code: 'custom', path: ['candidateCount'], message: 'candidateCount must equal candidates.length' });
  }
  const ids = artifact.candidates.map(({ candidateId }) => candidateId);
  if (new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && ids[index - 1] >= id)) {
    context.addIssue({ code: 'custom', path: ['candidates'], message: 'candidates must be sorted by unique candidateId' });
  }
  const evidencePaths = [...new Set(artifact.candidates.flatMap(({ evidenceRefs }) => (
    evidenceRefs.map(({ path }) => path)
  )).concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => (
    evidenceRefs.map(({ path }) => path)
  ))))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (JSON.stringify(evidencePaths) !== JSON.stringify(artifact.sourceBinding.evidencePaths)) {
    context.addIssue({ code: 'custom', path: ['sourceBinding', 'evidencePaths'], message: 'evidencePaths must equal the sorted evidence-reference union' });
  }
});

export type Cap2OwnerReconciliationArtifactV1 = z.infer<
  typeof cap2OwnerReconciliationArtifactSchemaV1
>;

export function parseCap2OwnerReconciliationArtifactV1(
  value: unknown,
): Cap2OwnerReconciliationArtifactV1 {
  return cap2OwnerReconciliationArtifactSchemaV1.parse(value);
}
