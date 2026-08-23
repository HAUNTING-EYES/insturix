import { z } from 'zod';

export const VIDEO_TREATMENT_VERSION = 1 as const;
export const CREATIVE_REFERENCE_SET_VERSION = 1 as const;
export const VIDEO_TREATMENT_SIDECAR_TARGET_VERSION = 3 as const;

const IdentifierSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
const NonEmptyTextSchema = z.string().min(1);
const NonEmptyTextListSchema = z.array(NonEmptyTextSchema).default([]);

// Persisted treatments remain permissive enough to read historical records.
// The model-facing schema below is bounded so planning cannot exhaust its
// response budget by restating input context instead of finishing the treatment.
const ModelTreatmentSummarySchema = NonEmptyTextSchema.max(1_200);
const ModelTreatmentDetailSchema = NonEmptyTextSchema.max(1_800);

function boundedModelTextList(maxItems: number, maxItemChars = 720) {
  return z.array(NonEmptyTextSchema.max(maxItemChars)).max(maxItems).default([]);
}

function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function validateUniqueIds(
  ctx: z.RefinementCtx,
  values: Array<{ id: string }>,
  path: string,
  label: string,
): void {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      addIssue(ctx, [path, index, 'id'], `Duplicate ${label} id "${value.id}".`);
    }
    ids.add(value.id);
  });
}

function validateDeclaredReferences(
  ctx: z.RefinementCtx,
  values: string[],
  knownIds: Set<string>,
  path: Array<string | number>,
  label: string,
): void {
  values.forEach((id, index) => {
    if (!knownIds.has(id)) {
      addIssue(ctx, [...path, index], `${label} "${id}" is not declared by the creative reference set.`);
    }
  });
}

export const CreativeReferenceKindSchema = z.enum([
  'image',
  'video',
  'link',
  'project-asset',
  'document',
]);

export const CreativeReferenceAnalysisStatusSchema = z.enum([
  'available',
  'pending',
  'unavailable',
]);

export const CreativeReferenceEvidenceSchema = z.object({
  id: IdentifierSchema,
  observation: NonEmptyTextSchema,
  startSeconds: z.number().finite().nonnegative().optional(),
  endSeconds: z.number().finite().positive().optional(),
  frameLabel: NonEmptyTextSchema.optional(),
}).strict().superRefine((evidence, ctx) => {
  if (evidence.startSeconds !== undefined && evidence.endSeconds !== undefined
    && evidence.endSeconds <= evidence.startSeconds) {
    addIssue(ctx, ['endSeconds'], 'Reference evidence endSeconds must be after startSeconds.');
  }
});

export const CreativeReferenceAnalysisSchema = z.object({
  visualRhythm: NonEmptyTextSchema.optional(),
  informationHierarchy: NonEmptyTextSchema.optional(),
  visualVerbalRelationship: NonEmptyTextSchema.optional(),
  composition: NonEmptyTextSchema.optional(),
  textBehavior: NonEmptyTextSchema.optional(),
  graphicFootageRelationship: NonEmptyTextSchema.optional(),
  audioEnergy: NonEmptyTextSchema.optional(),
  recurringMotifs: NonEmptyTextListSchema,
  evidence: z.array(CreativeReferenceEvidenceSchema).default([]),
  nonCopyConstraints: NonEmptyTextListSchema,
}).strict();

export const CreativeReferenceSchema = z.object({
  id: IdentifierSchema,
  kind: CreativeReferenceKindSchema,
  title: NonEmptyTextSchema,
  sourceId: IdentifierSchema.optional(),
  sourceUrl: z.string().url().optional(),
  rightsStatus: z.enum(['user-provided', 'project-approved', 'unknown']),
  analysisStatus: CreativeReferenceAnalysisStatusSchema,
  analysis: CreativeReferenceAnalysisSchema.optional(),
}).strict().superRefine((reference, ctx) => {
  if (reference.analysisStatus === 'available' && !reference.analysis) {
    addIssue(ctx, ['analysis'], 'An available creative reference analysis must include its resolved analysis.');
  }
  if (reference.analysisStatus !== 'available' && reference.analysis) {
    addIssue(ctx, ['analysis'], 'Only an available creative reference analysis may carry resolved analysis details.');
  }
});

const CreativeReferenceSetObjectSchema = z.object({
  // Default rather than numeric literal: this schema will eventually be safe to use with structured generation.
  version: z.number().int().default(CREATIVE_REFERENCE_SET_VERSION),
  referenceSetId: IdentifierSchema,
  references: z.array(CreativeReferenceSchema).default([]),
}).strict();

export const CreativeReferenceSetSchema = CreativeReferenceSetObjectSchema.superRefine((referenceSet, ctx) => {
  if (referenceSet.version !== CREATIVE_REFERENCE_SET_VERSION) {
    addIssue(ctx, ['version'], `Expected Creative Reference Set version ${CREATIVE_REFERENCE_SET_VERSION}.`);
  }
  validateUniqueIds(ctx, referenceSet.references, 'references', 'creative reference');
});

export const TreatmentDecisionSchema = z.object({
  id: IdentifierSchema,
  decision: NonEmptyTextSchema,
  rationale: NonEmptyTextSchema.max(1_000),
  evidenceIds: NonEmptyTextListSchema,
  confidence: z.number().finite().min(0).max(1),
}).strict();

const VideoTreatmentDecisionTraceObjectSchema = z.object({
  inputFingerprint: NonEmptyTextSchema,
  brand: z.object({
    brandId: IdentifierSchema,
    recordId: IdentifierSchema,
    profileFingerprint: NonEmptyTextSchema,
  }).strict().optional(),
  contentSignalProfileVersion: NonEmptyTextSchema.optional(),
  writingKnowledgeVersion: NonEmptyTextSchema.optional(),
  editronCreativeGraphVersion: NonEmptyTextSchema.optional(),
  sourceRefs: NonEmptyTextListSchema,
  creativeReferenceIds: NonEmptyTextListSchema,
  appliedConstraintIds: NonEmptyTextListSchema,
  unresolvedAssumptions: NonEmptyTextListSchema,
  decisions: z.array(TreatmentDecisionSchema).min(1),
}).strict();

export const VideoTreatmentDecisionTraceSchema = VideoTreatmentDecisionTraceObjectSchema.superRefine((trace, ctx) => {
  validateUniqueIds(ctx, trace.decisions, 'decisions', 'treatment decision');
});

/**
 * The planner never lets a model author identity or provenance version fields.
 * It supplies semantic decisions only; the server materializes the final trace.
 */
export const VideoTreatmentModelDecisionTraceSchema = VideoTreatmentDecisionTraceObjectSchema.omit({
  inputFingerprint: true,
  brand: true,
  contentSignalProfileVersion: true,
  writingKnowledgeVersion: true,
  editronCreativeGraphVersion: true,
});

const ModelTreatmentDecisionSchema = TreatmentDecisionSchema.extend({
  decision: ModelTreatmentSummarySchema,
  rationale: NonEmptyTextSchema.max(1_200),
  evidenceIds: boundedModelTextList(32, 160),
});

const BoundedVideoTreatmentModelDecisionTraceSchema = VideoTreatmentModelDecisionTraceSchema.extend({
  sourceRefs: boundedModelTextList(64, 160),
  creativeReferenceIds: boundedModelTextList(64, 160),
  appliedConstraintIds: boundedModelTextList(64, 200),
  unresolvedAssumptions: boundedModelTextList(16),
  decisions: z.array(ModelTreatmentDecisionSchema).min(1).max(32),
});

export const CaptureRequirementKindSchema = z.enum([
  'physical-camera',
  'screen-recording',
  'source-asset',
  'unspecified',
]);

/**
 * These are user-confirmable production capabilities, not a visual-form preset.
 * A treatment says what evidence must be captured; a later technical planner
 * decides any actual camera, lighting, or layout form.
 */
export const CaptureRequirementCapabilitySchema = z.enum([
  'performer',
  'camera',
  'space',
  'audio',
  'lighting',
]);

export const CaptureRequirementSchema = z.object({
  id: IdentifierSchema,
  objective: NonEmptyTextSchema,
  whyRequired: NonEmptyTextSchema,
  subjectOrEvidence: NonEmptyTextSchema.optional(),
  // Older cached treatments are intentionally unclassified until reviewed.
  // They must never be treated as implicit camera work.
  captureKind: CaptureRequirementKindSchema.default('unspecified'),
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).default([]),
  sourceRefs: NonEmptyTextListSchema,
  creativeReferenceIds: NonEmptyTextListSchema,
  constraints: NonEmptyTextListSchema,
  unresolvedCapabilityQuestions: NonEmptyTextListSchema,
}).strict().superRefine((requirement, ctx) => {
  if (new Set(requirement.requiredCapabilities).size !== requirement.requiredCapabilities.length) {
    addIssue(ctx, ['requiredCapabilities'], 'Capture requirement capabilities must be unique.');
  }
  if (requirement.captureKind === 'physical-camera' && requirement.requiredCapabilities.length === 0) {
    addIssue(
      ctx,
      ['requiredCapabilities'],
      'A physical-camera requirement must declare the user-confirmable capabilities it needs.',
    );
  }
  if (requirement.captureKind !== 'physical-camera' && requirement.requiredCapabilities.length > 0) {
    addIssue(
      ctx,
      ['requiredCapabilities'],
      'Only physical-camera requirements may declare physical production capabilities.',
    );
  }
});

export const VisualEventSchema = z.object({
  id: IdentifierSchema,
  // This is a semantic story moment, not a shot or final render segment ID.
  momentId: IdentifierSchema,
  audienceJob: NonEmptyTextSchema,
  visualThesis: NonEmptyTextSchema,
  audioRelationship: z.enum(['anchor', 'complement', 'counterpoint', 'replace']),
  timingNote: NonEmptyTextSchema,
  continuityNotes: NonEmptyTextListSchema,
  sourceRefs: NonEmptyTextListSchema,
  creativeReferenceIds: NonEmptyTextListSchema,
  brandConstraints: NonEmptyTextListSchema,
  accessibilityRequirements: NonEmptyTextListSchema,
  captureRequirementIds: NonEmptyTextListSchema,
}).strict();

const ModelCaptureRequirementSchema = z.object({
  id: IdentifierSchema,
  objective: ModelTreatmentSummarySchema,
  whyRequired: ModelTreatmentDetailSchema,
  subjectOrEvidence: ModelTreatmentSummarySchema.optional(),
  captureKind: CaptureRequirementKindSchema.default('unspecified'),
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).max(5).default([]),
  sourceRefs: boundedModelTextList(32, 160),
  creativeReferenceIds: boundedModelTextList(32, 160),
  constraints: boundedModelTextList(12),
  unresolvedCapabilityQuestions: boundedModelTextList(12),
}).strict();

const ModelVisualEventSchema = VisualEventSchema.extend({
  audienceJob: ModelTreatmentSummarySchema,
  visualThesis: ModelTreatmentDetailSchema,
  timingNote: ModelTreatmentSummarySchema,
  continuityNotes: boundedModelTextList(12),
  sourceRefs: boundedModelTextList(32, 160),
  creativeReferenceIds: boundedModelTextList(32, 160),
  brandConstraints: boundedModelTextList(12),
  accessibilityRequirements: boundedModelTextList(12),
  captureRequirementIds: boundedModelTextList(16, 160),
});

const VideoTreatmentObjectSchema = z.object({
  // Server-owned version values use defaults to avoid Gemini numeric enum incompatibility later.
  version: z.number().int().default(VIDEO_TREATMENT_VERSION),
  treatmentId: IdentifierSchema,
  audienceOutcome: NonEmptyTextSchema,
  viewerPromise: NonEmptyTextSchema,
  narrativeArc: NonEmptyTextSchema,
  visualVerbalRelationship: z.enum(['anchor', 'complement', 'counterpoint', 'minimal']),
  visualRhythm: NonEmptyTextSchema,
  informationHierarchy: NonEmptyTextListSchema,
  brandBoundaries: NonEmptyTextListSchema,
  referenceSynthesis: NonEmptyTextListSchema,
  continuityStrategy: NonEmptyTextSchema,
  audioVoiceStrategy: NonEmptyTextSchema,
  userConstraints: NonEmptyTextListSchema,
  visualEvents: z.array(VisualEventSchema).min(1),
  captureRequirements: z.array(CaptureRequirementSchema).default([]),
  decisionTrace: VideoTreatmentDecisionTraceSchema,
}).strict();

export const VideoTreatmentSchema = VideoTreatmentObjectSchema.superRefine((treatment, ctx) => {
  if (treatment.version !== VIDEO_TREATMENT_VERSION) {
    addIssue(ctx, ['version'], `Expected Video Treatment version ${VIDEO_TREATMENT_VERSION}.`);
  }

  validateUniqueIds(ctx, treatment.visualEvents, 'visualEvents', 'visual event');
  validateUniqueIds(ctx, treatment.captureRequirements, 'captureRequirements', 'capture requirement');

  const captureRequirementIds = new Set(treatment.captureRequirements.map((requirement) => requirement.id));
  const creativeReferenceIds = new Set(treatment.decisionTrace.creativeReferenceIds);

  treatment.visualEvents.forEach((event, index) => {
    event.captureRequirementIds.forEach((captureRequirementId, requirementIndex) => {
      if (!captureRequirementIds.has(captureRequirementId)) {
        addIssue(
          ctx,
          ['visualEvents', index, 'captureRequirementIds', requirementIndex],
          `Visual event captureRequirementId "${captureRequirementId}" is not declared by captureRequirements.`,
        );
      }
    });
    validateDeclaredReferences(
      ctx,
      event.creativeReferenceIds,
      creativeReferenceIds,
      ['visualEvents', index, 'creativeReferenceIds'],
      'Visual event creativeReferenceId',
    );
  });

  treatment.captureRequirements.forEach((requirement, index) => {
    validateDeclaredReferences(
      ctx,
      requirement.creativeReferenceIds,
      creativeReferenceIds,
      ['captureRequirements', index, 'creativeReferenceIds'],
      'Capture requirement creativeReferenceId',
    );
  });
});

/**
 * Structured provider output excludes all server-owned treatment identity and
 * trace provenance. This prevents a model from becoming an authority for IDs,
 * Brand Vault revisions, or cache identity.
 */
export const VideoTreatmentModelOutputSchema = VideoTreatmentObjectSchema
  .omit({
    version: true,
    treatmentId: true,
    decisionTrace: true,
  })
  .extend({
    audienceOutcome: ModelTreatmentSummarySchema,
    viewerPromise: ModelTreatmentSummarySchema,
    narrativeArc: ModelTreatmentDetailSchema,
    visualRhythm: ModelTreatmentSummarySchema,
    informationHierarchy: boundedModelTextList(16),
    brandBoundaries: boundedModelTextList(16),
    referenceSynthesis: boundedModelTextList(16),
    continuityStrategy: ModelTreatmentDetailSchema,
    audioVoiceStrategy: ModelTreatmentDetailSchema,
    userConstraints: boundedModelTextList(16),
    visualEvents: z.array(ModelVisualEventSchema).min(1).max(48),
    captureRequirements: z.array(ModelCaptureRequirementSchema).max(24).default([]),
    decisionTrace: BoundedVideoTreatmentModelDecisionTraceSchema,
  });

export const VideoTreatmentSidecarBindingSchema = z.object({
  treatmentId: IdentifierSchema,
  treatmentVersion: z.number().int().default(VIDEO_TREATMENT_VERSION),
  inputFingerprint: NonEmptyTextSchema,
}).strict().superRefine((binding, ctx) => {
  if (binding.treatmentVersion !== VIDEO_TREATMENT_VERSION) {
    addIssue(ctx, ['treatmentVersion'], `Expected Video Treatment version ${VIDEO_TREATMENT_VERSION}.`);
  }
});

export type CreativeReferenceSet = z.infer<typeof CreativeReferenceSetSchema>;
export type CreativeReference = z.infer<typeof CreativeReferenceSchema>;
export type VideoTreatment = z.infer<typeof VideoTreatmentSchema>;
export type VideoTreatmentModelOutput = z.infer<typeof VideoTreatmentModelOutputSchema>;
export type VideoTreatmentDecisionTrace = z.infer<typeof VideoTreatmentDecisionTraceSchema>;
export type TreatmentDecision = z.infer<typeof TreatmentDecisionSchema>;
export type CaptureRequirement = z.infer<typeof CaptureRequirementSchema>;
export type CaptureRequirementKind = z.infer<typeof CaptureRequirementKindSchema>;
export type CaptureRequirementCapability = z.infer<typeof CaptureRequirementCapabilitySchema>;
export type VisualEvent = z.infer<typeof VisualEventSchema>;
export type VideoTreatmentSidecarBinding = z.infer<typeof VideoTreatmentSidecarBindingSchema>;

export class VideoTreatmentReferenceError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Video treatment reference validation failed: ${issues.join(', ')}`);
    this.name = 'VideoTreatmentReferenceError';
  }
}

/**
 * Cross-artifact validation stays explicit because Source Ledger and creative
 * references are deliberately distinct provenance stores.
 */
export function assertVideoTreatmentReferences(
  treatment: VideoTreatment,
  referenceSet: CreativeReferenceSet,
): void {
  const referenceIds = new Set(referenceSet.references.map((reference) => reference.id));
  const issues: string[] = [];
  const check = (ids: string[], owner: string) => ids.forEach((id) => {
    if (!referenceIds.has(id)) issues.push(`${owner}:unknown_reference:${id}`);
  });

  check(treatment.decisionTrace.creativeReferenceIds, 'decisionTrace');
  treatment.visualEvents.forEach((event) => check(event.creativeReferenceIds, `visualEvent:${event.id}`));
  treatment.captureRequirements.forEach((requirement) => check(
    requirement.creativeReferenceIds,
    `captureRequirement:${requirement.id}`,
  ));

  if (issues.length > 0) throw new VideoTreatmentReferenceError(issues);
}

export function parseCreativeReferenceSet(input: unknown): CreativeReferenceSet {
  return CreativeReferenceSetSchema.parse(input);
}

export function parseVideoTreatment(input: unknown): VideoTreatment {
  return VideoTreatmentSchema.parse(input);
}
