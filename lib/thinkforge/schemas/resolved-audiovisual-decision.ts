import { z } from 'zod';

import type { ThinkForgeAudiovisualIntent } from './audiovisual-intent';

export const RESOLVED_AUDIOVISUAL_DECISION_VERSION = 1 as const;

const NonEmptyTextSchema = z.string().min(1);
const EvidenceIdsSchema = z.array(NonEmptyTextSchema.max(200)).max(32).default([]);
const RequiredEvidenceIdsSchema = z.array(NonEmptyTextSchema.max(200)).min(1).max(32);
const RationaleSchema = NonEmptyTextSchema.max(1_200);

export const ResolvedSpeechPresenceSchema = z.enum([
  'absent',
  'sparse',
  'present',
  'mixed',
  'unresolved',
]);

export const ResolvedSpeechSourceSchema = z.enum([
  'voice-over',
  'synchronous-dialogue',
  'diegetic-speech',
]);

export const ResolvedPresenceSchema = z.enum(['absent', 'present', 'unresolved']);
export const ResolvedPhysicalCaptureSchema = z.enum(['absent', 'required', 'unresolved']);
export const ResolvedMaterialNeedSchema = z.enum([
  'absent',
  'preferred',
  'required',
  'unresolved',
]);

const DecisionEvidenceSchema = z.object({
  rationale: RationaleSchema,
  evidenceIds: EvidenceIdsSchema,
}).strict();

const ModelDecisionEvidenceSchema = DecisionEvidenceSchema.extend({
  evidenceIds: RequiredEvidenceIdsSchema,
});

const AudibleSpeechDecisionSchema = DecisionEvidenceSchema.extend({
  presence: ResolvedSpeechPresenceSchema,
  sources: z.array(ResolvedSpeechSourceSchema).max(3).default([]),
});

const ModelAudibleSpeechDecisionSchema = ModelDecisionEvidenceSchema.extend({
  presence: ResolvedSpeechPresenceSchema,
  sources: z.array(ResolvedSpeechSourceSchema).max(3),
});

const PresenceDecisionSchema = DecisionEvidenceSchema.extend({
  presence: ResolvedPresenceSchema,
});

const ModelPresenceDecisionSchema = ModelDecisionEvidenceSchema.extend({
  presence: ResolvedPresenceSchema,
});

const PhysicalCaptureDecisionSchema = DecisionEvidenceSchema.extend({
  need: ResolvedPhysicalCaptureSchema,
});

const ModelPhysicalCaptureDecisionSchema = ModelDecisionEvidenceSchema.extend({
  need: ResolvedPhysicalCaptureSchema,
});

const MaterialDecisionSchema = DecisionEvidenceSchema.extend({
  graphics: ResolvedMaterialNeedSchema,
  generatedImagery: ResolvedMaterialNeedSchema,
  suppliedFootage: ResolvedMaterialNeedSchema,
  screenMaterial: ResolvedMaterialNeedSchema,
  sourceMaterial: ResolvedMaterialNeedSchema,
});

const ModelMaterialDecisionSchema = ModelDecisionEvidenceSchema.extend({
  graphics: ResolvedMaterialNeedSchema,
  generatedImagery: ResolvedMaterialNeedSchema,
  suppliedFootage: ResolvedMaterialNeedSchema,
  screenMaterial: ResolvedMaterialNeedSchema,
  sourceMaterial: ResolvedMaterialNeedSchema,
});

const ResolvedAudiovisualDecisionObjectSchema = z.object({
  // Server-owned default avoids a numeric literal in Gemini response schemas.
  version: z.number().int().default(RESOLVED_AUDIOVISUAL_DECISION_VERSION),
  origin: z.enum(['model', 'legacy-unresolved']).default('legacy-unresolved'),
  audibleSpeech: AudibleSpeechDecisionSchema,
  onCameraSpeech: PresenceDecisionSchema,
  visiblePeople: PresenceDecisionSchema,
  physicalCapture: PhysicalCaptureDecisionSchema,
  materials: MaterialDecisionSchema,
  unresolvedQuestions: z.array(NonEmptyTextSchema.max(720)).max(16).default([]),
}).strict();

const ResolvedAudiovisualDecisionModelObjectSchema = z.object({
  version: z.number().int().default(RESOLVED_AUDIOVISUAL_DECISION_VERSION),
  audibleSpeech: ModelAudibleSpeechDecisionSchema,
  onCameraSpeech: ModelPresenceDecisionSchema,
  visiblePeople: ModelPresenceDecisionSchema,
  physicalCapture: ModelPhysicalCaptureDecisionSchema,
  materials: ModelMaterialDecisionSchema,
  unresolvedQuestions: z.array(NonEmptyTextSchema.max(720)).max(16),
}).strict();

type ResolvedAudiovisualDecisionObject =
  | z.infer<typeof ResolvedAudiovisualDecisionObjectSchema>
  | z.infer<typeof ResolvedAudiovisualDecisionModelObjectSchema>;

function validateInternalConsistency(
  decision: ResolvedAudiovisualDecisionObject,
  ctx: z.RefinementCtx,
): void {
  if (decision.version !== RESOLVED_AUDIOVISUAL_DECISION_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `Expected resolved audiovisual decision version ${RESOLVED_AUDIOVISUAL_DECISION_VERSION}.`,
    });
  }

  if (new Set(decision.audibleSpeech.sources).size !== decision.audibleSpeech.sources.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audibleSpeech', 'sources'],
      message: 'Speech sources must be unique.',
    });
  }

  const speechIsResolvedPresent = ['sparse', 'present', 'mixed'].includes(
    decision.audibleSpeech.presence,
  );
  if (speechIsResolvedPresent && decision.audibleSpeech.sources.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audibleSpeech', 'sources'],
      message: 'Resolved audible speech must declare at least one speech source.',
    });
  }
  if (!speechIsResolvedPresent && decision.audibleSpeech.sources.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audibleSpeech', 'sources'],
      message: 'Absent or unresolved audible speech cannot declare a speech source.',
    });
  }

  const hasSynchronousDialogue = decision.audibleSpeech.sources.includes('synchronous-dialogue');
  if (decision.onCameraSpeech.presence === 'present') {
    if (!speechIsResolvedPresent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['onCameraSpeech', 'presence'],
        message: 'On-camera speech requires resolved audible speech.',
      });
    }
    if (decision.visiblePeople.presence !== 'present') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visiblePeople', 'presence'],
        message: 'On-camera speech requires a visible person.',
      });
    }
    if (!hasSynchronousDialogue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audibleSpeech', 'sources'],
        message: 'On-camera speech must declare synchronous dialogue as a speech source.',
      });
    }
  } else if (hasSynchronousDialogue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audibleSpeech', 'sources'],
      message: 'Synchronous dialogue requires resolved on-camera speech.',
    });
  }

  const hasUnresolvedChoice = [
    decision.audibleSpeech.presence,
    decision.onCameraSpeech.presence,
    decision.visiblePeople.presence,
    decision.physicalCapture.need,
    decision.materials.graphics,
    decision.materials.generatedImagery,
    decision.materials.suppliedFootage,
    decision.materials.screenMaterial,
    decision.materials.sourceMaterial,
  ].includes('unresolved');
  if (hasUnresolvedChoice && decision.unresolvedQuestions.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unresolvedQuestions'],
      message: 'Every unresolved audiovisual decision must surface at least one question.',
    });
  }
}

export const ResolvedAudiovisualDecisionSchema = ResolvedAudiovisualDecisionObjectSchema
  .superRefine(validateInternalConsistency);

export const ResolvedAudiovisualDecisionModelOutputSchema =
  ResolvedAudiovisualDecisionModelObjectSchema.superRefine(validateInternalConsistency);

export type ResolvedAudiovisualDecision = z.infer<typeof ResolvedAudiovisualDecisionSchema>;

export type ResolvedAudiovisualDecisionIssue = {
  path: Array<string | number>;
  message: string;
};

export function collectAudiovisualIntentResolutionIssues(
  intent: ThinkForgeAudiovisualIntent,
  decision: ResolvedAudiovisualDecision,
): ResolvedAudiovisualDecisionIssue[] {
  const issues: ResolvedAudiovisualDecisionIssue[] = [];
  const enforce = (
    constraint: 'required' | 'forbidden' | 'unspecified',
    resolved: string,
    path: Array<string | number>,
    requiredValues: readonly string[],
    label: string,
  ) => {
    if (constraint === 'required' && !requiredValues.includes(resolved)) {
      issues.push({ path, message: `${label} is required by the user constraint but was not resolved as present.` });
    }
    if (constraint === 'forbidden' && resolved !== 'absent') {
      issues.push({ path, message: `${label} is forbidden by the user constraint but was not resolved as absent.` });
    }
  };

  enforce(
    intent.audibleSpeech,
    decision.audibleSpeech.presence,
    ['audibleSpeech', 'presence'],
    ['sparse', 'present', 'mixed'],
    'Audible speech',
  );
  enforce(
    intent.onCameraSpeech,
    decision.onCameraSpeech.presence,
    ['onCameraSpeech', 'presence'],
    ['present'],
    'On-camera speech',
  );
  enforce(
    intent.visiblePerson,
    decision.visiblePeople.presence,
    ['visiblePeople', 'presence'],
    ['present'],
    'A visible person',
  );
  enforce(
    intent.physicalCapture,
    decision.physicalCapture.need,
    ['physicalCapture', 'need'],
    ['required'],
    'Physical capture',
  );

  return issues;
}

export function createUnresolvedAudiovisualDecision(): ResolvedAudiovisualDecision {
  const unresolved = (label: string) => ({
    rationale: `Historical treatment did not record a resolved ${label} decision.`,
    evidenceIds: [],
  });
  return ResolvedAudiovisualDecisionSchema.parse({
    version: RESOLVED_AUDIOVISUAL_DECISION_VERSION,
    origin: 'legacy-unresolved',
    audibleSpeech: {
      presence: 'unresolved',
      sources: [],
      ...unresolved('audible speech'),
    },
    onCameraSpeech: { presence: 'unresolved', ...unresolved('on-camera speech') },
    visiblePeople: { presence: 'unresolved', ...unresolved('visible people') },
    physicalCapture: { need: 'unresolved', ...unresolved('physical capture') },
    materials: {
      graphics: 'unresolved',
      generatedImagery: 'unresolved',
      suppliedFootage: 'unresolved',
      screenMaterial: 'unresolved',
      sourceMaterial: 'unresolved',
      ...unresolved('material'),
    },
    unresolvedQuestions: ['Re-plan this treatment before using it for production decisions.'],
  });
}
