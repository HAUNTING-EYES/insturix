import { z } from 'zod';

import { hashJsonArtifact } from '../persistence/script-sidecar-binding';
import {
  CaptureAcquisitionDecisionSetSchema,
  CaptureAcquisitionSourceDocumentSchema,
  resolveCaptureAcquisitionDecisions,
} from '../production/capture-acquisition-decisions';
import {
  CaptureRequirementCapabilitySchema,
  parseVideoTreatment,
  VideoTreatmentSidecarBindingSchema,
  type VideoTreatment,
} from './video-treatment';

export const PHYSICAL_CAPTURE_DESIGN_VERSION = 1 as const;
export const PHYSICAL_CAPTURE_DESIGN_METADATA_KEY = 'physicalCaptureDesign' as const;

const IdentifierSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/u);
const TextSchema = z.string().trim().min(1).max(1_200);
const CompactTextSchema = z.string().trim().min(1).max(320);
const TextListSchema = z.array(TextSchema).max(24).default([]);
const IdentifierListSchema = z.array(IdentifierSchema).max(64).default([]);
const KnowledgeRefListSchema = z.array(z.string().trim().min(1).max(240)).max(64).default([]);
const ArtifactHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const PhysicalCaptureKnowledgeBindingSchema = z.object({
  adapterVersion: z.number().int().positive(),
  graphVersion: z.string().trim().min(1).max(160),
  evidenceIds: KnowledgeRefListSchema,
}).strict();

const PhysicalCaptureIntentFields = {
  requirementId: IdentifierSchema,
  linkedEventIds: z.array(IdentifierSchema).min(1).max(24),
  narrativeObjective: TextSchema,
  subjectDescription: TextSchema,
  subjectAction: TextSchema,
  compositionPurpose: TextSchema,
  viewpointPurpose: TextSchema,
  cameraBehaviorPurpose: TextSchema,
  focusPriority: TextSchema,
  lightingPurpose: TextSchema,
  soundPurpose: TextSchema,
  performancePurpose: TextSchema.optional(),
  continuityConstraints: TextListSchema,
  safetyConstraints: TextListSchema,
  sourceRefs: IdentifierListSchema,
  creativeReferenceIds: IdentifierListSchema,
} as const;

/**
 * Model output owns semantic coverage only. It cannot author equipment,
 * coordinates, focal lengths, layouts, render form, or persisted identity.
 */
export const PhysicalCaptureDesignModelOutputSchema = z.object({
  globalCaptureStrategy: TextSchema,
  coverageIntents: z.array(z.object(PhysicalCaptureIntentFields).strict()).min(1).max(64),
  continuityConstraints: TextListSchema,
  unresolvedQuestions: z.array(CompactTextSchema).max(24).default([]),
  knowledgeRefs: KnowledgeRefListSchema,
}).strict();

const PhysicalCaptureIntentSchema = z.object({
  id: IdentifierSchema,
  ...PhysicalCaptureIntentFields,
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).min(1).max(5),
}).strict();

const PhysicalCaptureDesignBodySchema = z.object({
  version: z.number().int().default(PHYSICAL_CAPTURE_DESIGN_VERSION),
  kind: z.literal('physical-capture-design'),
  designId: IdentifierSchema,
  treatment: VideoTreatmentSidecarBindingSchema,
  sourceDocument: CaptureAcquisitionSourceDocumentSchema,
  acquisitionDecisionSetHash: ArtifactHashSchema.optional(),
  knowledge: PhysicalCaptureKnowledgeBindingSchema,
  globalCaptureStrategy: TextSchema,
  coverageIntents: z.array(PhysicalCaptureIntentSchema).min(1).max(64),
  continuityConstraints: TextListSchema,
  unresolvedQuestions: z.array(CompactTextSchema).max(24).default([]),
  knowledgeRefs: KnowledgeRefListSchema,
}).strict().superRefine((design, ctx) => {
  if (design.version !== PHYSICAL_CAPTURE_DESIGN_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `Unsupported physical capture design version: ${design.version}.`,
    });
  }
  const ids = design.coverageIntents.map((intent) => intent.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageIntents'],
      message: 'Physical capture coverage intent IDs must be unique.',
    });
  }
});

export const PhysicalCaptureDesignSchema = PhysicalCaptureDesignBodySchema.safeExtend({
  designHash: ArtifactHashSchema,
}).strict();

export type PhysicalCaptureDesignModelOutput = z.infer<typeof PhysicalCaptureDesignModelOutputSchema>;
export type PhysicalCaptureDesign = z.infer<typeof PhysicalCaptureDesignSchema>;

export class PhysicalCaptureDesignError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Physical capture design failed validation: ${issues.join(', ')}`);
    this.name = 'PhysicalCaptureDesignError';
  }
}

function treatmentBinding(treatment: VideoTreatment) {
  return {
    treatmentId: treatment.treatmentId,
    treatmentVersion: treatment.version,
    inputFingerprint: treatment.decisionTrace.inputFingerprint,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function designBody(design: PhysicalCaptureDesign): Omit<PhysicalCaptureDesign, 'designHash'> {
  const { designHash: _designHash, ...body } = design;
  return body;
}

function effectivePhysicalRequirements(input: {
  treatment: VideoTreatment;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
}) {
  const decisions = resolveCaptureAcquisitionDecisions({
    decisionSet: input.acquisitionDecisions,
    treatment: input.treatment,
    sourceDocument: input.sourceDocument,
  });
  return input.treatment.captureRequirements.flatMap((declaredRequirement) => {
    const decision = decisions.get(declaredRequirement.id);
    const requirement = decision
      ? {
          ...declaredRequirement,
          captureKind: decision.acquisitionKind,
          requiredCapabilities: decision.requiredCapabilities,
          unresolvedCapabilityQuestions: [],
        }
      : declaredRequirement;
    return requirement.captureKind === 'physical-camera' ? [requirement] : [];
  });
}

function acquisitionDecisionSetHash(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  return CaptureAcquisitionDecisionSetSchema.parse(input).decisionSetHash;
}

export function resolveEffectivePhysicalCaptureRequirements(input: {
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
}) {
  const treatment = parseVideoTreatment(input.treatment);
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.parse(input.sourceDocument);
  return effectivePhysicalRequirements({
    treatment,
    sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
  });
}

export function materializePhysicalCaptureDesign(input: {
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
  modelOutput: unknown;
  knowledge: z.input<typeof PhysicalCaptureKnowledgeBindingSchema>;
}): PhysicalCaptureDesign {
  const treatment = parseVideoTreatment(input.treatment);
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.parse(input.sourceDocument);
  const modelOutput = PhysicalCaptureDesignModelOutputSchema.parse(input.modelOutput);
  const physicalRequirements = effectivePhysicalRequirements({
    treatment,
    sourceDocument,
    acquisitionDecisions: input.acquisitionDecisions,
  });
  if (physicalRequirements.length === 0) {
    throw new PhysicalCaptureDesignError(['physical_capture_requirement_missing']);
  }

  const requirementsById = new Map(physicalRequirements.map((requirement) => [requirement.id, requirement]));
  const eventsById = new Map(treatment.visualEvents.map((event) => [event.id, event]));
  const knowledge = PhysicalCaptureKnowledgeBindingSchema.parse(input.knowledge);
  const allowedKnowledgeRefs = new Set(knowledge.evidenceIds);
  const usedRequirements = new Set<string>();
  const coveredRequirementEvents = new Set<string>();
  const issues: string[] = [];

  modelOutput.coverageIntents.forEach((intent, intentIndex) => {
    const requirement = requirementsById.get(intent.requirementId);
    if (!requirement) {
      issues.push(`unknown_physical_requirement:${intent.requirementId}`);
      return;
    }
    usedRequirements.add(requirement.id);
    const allowedEventIds = new Set(treatment.visualEvents
      .filter((event) => event.captureRequirementIds.includes(requirement.id))
      .map((event) => event.id));
    intent.linkedEventIds.forEach((eventId) => {
      if (!eventsById.has(eventId)) issues.push(`unknown_visual_event:${intentIndex}:${eventId}`);
      else if (!allowedEventIds.has(eventId)) issues.push(`event_requirement_mismatch:${intent.requirementId}:${eventId}`);
      else coveredRequirementEvents.add(`${intent.requirementId}:${eventId}`);
    });
    const allowedSourceRefs = new Set([
      ...requirement.sourceRefs,
      ...intent.linkedEventIds.flatMap((eventId) => eventsById.get(eventId)?.sourceRefs ?? []),
    ]);
    intent.sourceRefs.forEach((sourceRef) => {
      if (!allowedSourceRefs.has(sourceRef)) issues.push(`undeclared_source_ref:${intentIndex}:${sourceRef}`);
    });
    const allowedCreativeReferenceIds = new Set([
      ...requirement.creativeReferenceIds,
      ...intent.linkedEventIds.flatMap(
        (eventId) => eventsById.get(eventId)?.creativeReferenceIds ?? [],
      ),
    ]);
    intent.creativeReferenceIds.forEach((referenceId) => {
      if (!allowedCreativeReferenceIds.has(referenceId)) {
        issues.push(`undeclared_creative_reference:${intentIndex}:${referenceId}`);
      }
    });
  });

  physicalRequirements.forEach((requirement) => {
    if (!usedRequirements.has(requirement.id)) issues.push(`unplanned_requirement:${requirement.id}`);
    treatment.visualEvents
      .filter((event) => event.captureRequirementIds.includes(requirement.id))
      .forEach((event) => {
        if (!coveredRequirementEvents.has(`${requirement.id}:${event.id}`)) {
          issues.push(`uncovered_requirement_event:${requirement.id}:${event.id}`);
        }
      });
  });
  modelOutput.knowledgeRefs.forEach((knowledgeRef) => {
    if (!allowedKnowledgeRefs.has(knowledgeRef)) issues.push(`undeclared_knowledge_ref:${knowledgeRef}`);
  });
  if (issues.length > 0) throw new PhysicalCaptureDesignError(unique(issues));

  const stableIdentity = hashJsonArtifact({
    treatment: treatmentBinding(treatment),
    sourceDocument,
    acquisitionDecisionSetHash: acquisitionDecisionSetHash(input.acquisitionDecisions),
    knowledge,
    modelOutput,
  });
  const body = PhysicalCaptureDesignBodySchema.parse({
    version: PHYSICAL_CAPTURE_DESIGN_VERSION,
    kind: 'physical-capture-design',
    designId: `capture_design_${stableIdentity.slice(0, 20)}`,
    treatment: treatmentBinding(treatment),
    sourceDocument,
    acquisitionDecisionSetHash: acquisitionDecisionSetHash(input.acquisitionDecisions),
    knowledge,
    globalCaptureStrategy: modelOutput.globalCaptureStrategy,
    coverageIntents: modelOutput.coverageIntents.map((intent, index) => ({
      id: `coverage_${index + 1}`,
      ...intent,
      requiredCapabilities: requirementsById.get(intent.requirementId)?.requiredCapabilities,
      sourceRefs: unique(intent.sourceRefs),
      creativeReferenceIds: unique(intent.creativeReferenceIds),
    })),
    continuityConstraints: unique(modelOutput.continuityConstraints),
    unresolvedQuestions: unique(modelOutput.unresolvedQuestions),
    knowledgeRefs: unique(modelOutput.knowledgeRefs),
  });
  return PhysicalCaptureDesignSchema.parse({
    ...body,
    designHash: hashJsonArtifact(body),
  });
}

export function verifyPhysicalCaptureDesign(input: {
  design: unknown;
  treatment: unknown;
  sourceDocument: unknown;
  acquisitionDecisions?: unknown;
}): { current: true; design: PhysicalCaptureDesign } | { current: false; reason: string } {
  const parsed = PhysicalCaptureDesignSchema.safeParse(input.design);
  if (!parsed.success) return { current: false, reason: 'design_invalid' };
  const treatment = parseVideoTreatment(input.treatment);
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.safeParse(input.sourceDocument);
  if (!sourceDocument.success) return { current: false, reason: 'source_document_invalid' };
  if (hashJsonArtifact(designBody(parsed.data)) !== parsed.data.designHash) {
    return { current: false, reason: 'design_hash_mismatch' };
  }
  if (JSON.stringify(parsed.data.treatment) !== JSON.stringify(treatmentBinding(treatment))) {
    return { current: false, reason: 'treatment_binding_mismatch' };
  }
  if (JSON.stringify(parsed.data.sourceDocument) !== JSON.stringify(sourceDocument.data)) {
    return { current: false, reason: 'source_document_mismatch' };
  }
  try {
    resolveCaptureAcquisitionDecisions({
      decisionSet: input.acquisitionDecisions,
      treatment,
      sourceDocument: sourceDocument.data,
    });
  } catch {
    return { current: false, reason: 'acquisition_decision_mismatch' };
  }
  if (parsed.data.acquisitionDecisionSetHash !== acquisitionDecisionSetHash(input.acquisitionDecisions)) {
    return { current: false, reason: 'acquisition_decision_mismatch' };
  }
  return { current: true, design: parsed.data };
}
