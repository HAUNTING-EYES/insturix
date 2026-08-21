import { z } from 'zod';

import { hashJsonArtifact } from '../persistence/script-sidecar-binding';
import {
  CaptureRequirementCapabilitySchema,
  VideoTreatmentSidecarBindingSchema,
  type VideoTreatment,
} from '../schemas/video-treatment';

export const CAPTURE_ACQUISITION_DECISIONS_VERSION = 1 as const;
export const CAPTURE_ACQUISITION_DECISIONS_METADATA_KEY = 'captureAcquisitionDecisions' as const;

const IdentifierSchema = z.string().min(1);
const ArtifactHashSchema = z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a SHA-256 artifact hash.');

export const CaptureAcquisitionSourceDocumentSchema = z.object({
  version: z.number().int().positive(),
  contentHash: ArtifactHashSchema,
  sidecarHash: ArtifactHashSchema,
}).strict();

export const CaptureAcquisitionKindSchema = z.enum([
  'physical-camera',
  'screen-recording',
  'source-asset',
]);

export const CaptureAcquisitionDecisionInputSchema = z.object({
  requirementId: IdentifierSchema,
  acquisitionKind: CaptureAcquisitionKindSchema,
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).default([]),
}).strict().superRefine((decision, ctx) => {
  if (new Set(decision.requiredCapabilities).size !== decision.requiredCapabilities.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredCapabilities'],
      message: 'Capture acquisition capabilities must be unique.',
    });
  }
  if (decision.acquisitionKind === 'physical-camera' && !decision.requiredCapabilities.includes('camera')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredCapabilities'],
      message: 'A physical-camera acquisition decision must explicitly require a camera.',
    });
  }
  if (decision.acquisitionKind !== 'physical-camera' && decision.requiredCapabilities.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredCapabilities'],
      message: 'Only physical-camera acquisition decisions may declare production capabilities.',
    });
  }
});

export const CaptureAcquisitionDecisionInputsSchema = z.array(CaptureAcquisitionDecisionInputSchema)
  .min(1)
  .superRefine((decisions, ctx) => {
    const seen = new Set<string>();
    decisions.forEach((decision, index) => {
      if (!seen.has(decision.requirementId)) {
        seen.add(decision.requirementId);
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'requirementId'],
        message: `Duplicate capture acquisition decision for "${decision.requirementId}".`,
      });
    });
  });

const CaptureAcquisitionDecisionSetBodySchema = z.object({
  version: z.number().int().default(CAPTURE_ACQUISITION_DECISIONS_VERSION),
  treatment: VideoTreatmentSidecarBindingSchema,
  sourceDocument: CaptureAcquisitionSourceDocumentSchema,
  decisions: CaptureAcquisitionDecisionInputsSchema,
  decidedBy: IdentifierSchema,
  decidedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((decisionSet, ctx) => {
  if (decisionSet.version !== CAPTURE_ACQUISITION_DECISIONS_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `Unsupported capture acquisition decision version: ${decisionSet.version}.`,
    });
  }
});

export const CaptureAcquisitionDecisionSetSchema = CaptureAcquisitionDecisionSetBodySchema.safeExtend({
  decisionSetHash: ArtifactHashSchema,
}).strict();

export type CaptureAcquisitionSourceDocument = z.infer<typeof CaptureAcquisitionSourceDocumentSchema>;
export type CaptureAcquisitionDecisionInput = z.infer<typeof CaptureAcquisitionDecisionInputSchema>;
export type CaptureAcquisitionDecisionSet = z.infer<typeof CaptureAcquisitionDecisionSetSchema>;

export type CaptureAcquisitionDecisionVerification =
  | { current: true; decisionSet: CaptureAcquisitionDecisionSet }
  | {
      current: false;
      reason:
        | 'decision_set_missing'
        | 'decision_set_invalid'
        | 'decision_set_hash_mismatch'
        | 'source_document_invalid'
        | 'treatment_binding_mismatch'
        | 'document_version_mismatch'
        | 'document_hash_mismatch'
        | 'sidecar_hash_mismatch'
        | 'decision_target_mismatch';
      decisionSet?: CaptureAcquisitionDecisionSet;
    };

export class CaptureAcquisitionDecisionError extends Error {
  constructor(
    readonly code: Exclude<CaptureAcquisitionDecisionVerification, { current: true }>['reason'],
    message: string,
  ) {
    super(message);
    this.name = 'CaptureAcquisitionDecisionError';
  }
}

function decisionSetBody(
  decisionSet: CaptureAcquisitionDecisionSet,
): Omit<CaptureAcquisitionDecisionSet, 'decisionSetHash'> {
  const { decisionSetHash: _decisionSetHash, ...body } = decisionSet;
  return body;
}

function treatmentBinding(treatment: VideoTreatment) {
  return {
    treatmentId: treatment.treatmentId,
    treatmentVersion: treatment.version,
    inputFingerprint: treatment.decisionTrace.inputFingerprint,
  };
}

function sameSourceDocument(
  left: CaptureAcquisitionSourceDocument,
  right: CaptureAcquisitionSourceDocument,
): CaptureAcquisitionDecisionVerification | null {
  if (left.version !== right.version) return { current: false, reason: 'document_version_mismatch' };
  if (left.contentHash !== right.contentHash) return { current: false, reason: 'document_hash_mismatch' };
  if (left.sidecarHash !== right.sidecarHash) return { current: false, reason: 'sidecar_hash_mismatch' };
  return null;
}

function validateDecisionTargets(
  treatment: VideoTreatment,
  decisions: readonly CaptureAcquisitionDecisionInput[],
): void {
  const requirements = new Map(treatment.captureRequirements.map((requirement) => [requirement.id, requirement]));
  const issues: string[] = [];
  decisions.forEach((decision) => {
    const requirement = requirements.get(decision.requirementId);
    if (!requirement) {
      issues.push(`unknown_capture_requirement:${decision.requirementId}`);
      return;
    }
    if (requirement.captureKind !== 'unspecified') {
      issues.push(`capture_requirement_already_classified:${decision.requirementId}`);
    }
  });
  if (issues.length > 0) {
    throw new CaptureAcquisitionDecisionError(
      'decision_target_mismatch',
      `Capture acquisition decisions do not match this treatment: ${issues.join(', ')}.`,
    );
  }
}

function mismatchMessage(reason: Exclude<CaptureAcquisitionDecisionVerification, { current: true }>['reason']): string {
  const messages: Record<Exclude<CaptureAcquisitionDecisionVerification, { current: true }>['reason'], string> = {
    decision_set_missing: 'No capture acquisition decisions are saved for this script.',
    decision_set_invalid: 'The saved capture acquisition decisions are invalid and must be reviewed again.',
    decision_set_hash_mismatch: 'The saved capture acquisition decisions were changed outside ThinkForge and must be reviewed again.',
    source_document_invalid: 'The current script document identity is invalid for capture acquisition decisions.',
    treatment_binding_mismatch: 'The saved capture acquisition decisions belong to a different treatment.',
    document_version_mismatch: 'The saved capture acquisition decisions belong to an older script revision.',
    document_hash_mismatch: 'The saved capture acquisition decisions no longer match this script content.',
    sidecar_hash_mismatch: 'The saved capture acquisition decisions no longer match this script production contract.',
    decision_target_mismatch: 'The saved capture acquisition decisions no longer match the treatment requirements.',
  };
  return messages[reason];
}

export function createCaptureAcquisitionDecisionSet(input: {
  treatment: VideoTreatment;
  sourceDocument: unknown;
  decisions: unknown;
  decidedBy: string;
  decidedAt?: Date;
}): CaptureAcquisitionDecisionSet {
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.parse(input.sourceDocument);
  const decisions = CaptureAcquisitionDecisionInputsSchema.parse(input.decisions);
  validateDecisionTargets(input.treatment, decisions);
  const body = CaptureAcquisitionDecisionSetBodySchema.parse({
    version: CAPTURE_ACQUISITION_DECISIONS_VERSION,
    treatment: treatmentBinding(input.treatment),
    sourceDocument,
    decisions,
    decidedBy: input.decidedBy,
    decidedAt: (input.decidedAt ?? new Date()).toISOString(),
  });
  return CaptureAcquisitionDecisionSetSchema.parse({
    ...body,
    decisionSetHash: hashJsonArtifact(body),
  });
}

export function verifyCaptureAcquisitionDecisionSet(input: {
  decisionSet: unknown;
  treatment: VideoTreatment;
  sourceDocument: unknown;
}): CaptureAcquisitionDecisionVerification {
  if (input.decisionSet === undefined || input.decisionSet === null) {
    return { current: false, reason: 'decision_set_missing' };
  }
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.safeParse(input.sourceDocument);
  if (!sourceDocument.success) return { current: false, reason: 'source_document_invalid' };
  const parsed = CaptureAcquisitionDecisionSetSchema.safeParse(input.decisionSet);
  if (!parsed.success) return { current: false, reason: 'decision_set_invalid' };
  const decisionSet = parsed.data;
  if (hashJsonArtifact(decisionSetBody(decisionSet)) !== decisionSet.decisionSetHash) {
    return { current: false, reason: 'decision_set_hash_mismatch', decisionSet };
  }
  const binding = treatmentBinding(input.treatment);
  if (
    decisionSet.treatment.treatmentId !== binding.treatmentId
    || decisionSet.treatment.treatmentVersion !== binding.treatmentVersion
    || decisionSet.treatment.inputFingerprint !== binding.inputFingerprint
  ) {
    return { current: false, reason: 'treatment_binding_mismatch', decisionSet };
  }
  const sourceMismatch = sameSourceDocument(decisionSet.sourceDocument, sourceDocument.data);
  if (sourceMismatch) return { ...sourceMismatch, decisionSet };
  try {
    validateDecisionTargets(input.treatment, decisionSet.decisions);
  } catch (error) {
    if (error instanceof CaptureAcquisitionDecisionError) {
      return { current: false, reason: error.code, decisionSet };
    }
    throw error;
  }
  return { current: true, decisionSet };
}

/**
 * Returns only a verified, document-bound user choice. An absent decision set
 * deliberately leaves the treatment requirement unresolved.
 */
export function resolveCaptureAcquisitionDecisions(input: {
  decisionSet?: unknown;
  treatment: VideoTreatment;
  sourceDocument?: unknown;
}): Map<string, CaptureAcquisitionDecisionInput> {
  if (input.decisionSet === undefined || input.decisionSet === null) return new Map();
  const verification = verifyCaptureAcquisitionDecisionSet({
    decisionSet: input.decisionSet,
    treatment: input.treatment,
    sourceDocument: input.sourceDocument,
  });
  if (!verification.current) {
    throw new CaptureAcquisitionDecisionError(verification.reason, mismatchMessage(verification.reason));
  }
  return new Map(verification.decisionSet.decisions.map((decision) => [decision.requirementId, decision]));
}
