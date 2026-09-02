import { z } from 'zod';

import { hashJsonArtifact } from '../persistence/script-sidecar-binding';
import {
  CaptureRequirementCapabilitySchema,
  VideoTreatmentSidecarBindingSchema,
  type VideoTreatment,
} from '../schemas/video-treatment';
import {
  parseSourceLedger,
  type SourceLedger,
  type SourceLedgerEntry,
} from '../provenance/source-ledger';

export const CAPTURE_ACQUISITION_DECISIONS_VERSION = 2 as const;
export const CAPTURE_ACQUISITION_DECISIONS_METADATA_KEY = 'captureAcquisitionDecisions' as const;

const IdentifierSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().trim().min(1);
const ArtifactHashSchema = z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a SHA-256 artifact hash.');

export const CaptureAcquisitionSourceDocumentSchema = z.object({
  version: z.number().int().positive(),
  contentHash: ArtifactHashSchema,
  sidecarHash: ArtifactHashSchema,
  sourceLedgerHash: ArtifactHashSchema,
}).strict();

export const CaptureAcquisitionKindSchema = z.enum([
  'physical-camera',
  'screen-recording',
  'source-asset',
]);

const EmptyCapabilitiesSchema = z.array(CaptureRequirementCapabilitySchema).max(0).default([]);

const PhysicalCaptureAcquisitionDecisionInputSchema = z.object({
  requirementId: IdentifierSchema,
  acquisitionKind: z.literal('physical-camera'),
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).min(1),
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
});

export const CaptureScreenTargetSchema = z.object({
  label: NonEmptyTextSchema.max(240),
  captureScope: NonEmptyTextSchema.max(2_000),
  sourceUrl: z.string().url().optional(),
  authorizationConfirmed: z.literal(true),
}).strict();

export const CaptureSourceSelectionSchema = z.object({
  referenceId: IdentifierSchema,
  rightsBasis: z.enum(['user-provided', 'project-approved']),
}).strict();

const ScreenCaptureAcquisitionDecisionInputSchema = z.object({
  requirementId: IdentifierSchema,
  acquisitionKind: z.literal('screen-recording'),
  requiredCapabilities: EmptyCapabilitiesSchema,
  screenTarget: CaptureScreenTargetSchema,
}).strict();

const SourceAssetAcquisitionDecisionInputSchema = z.object({
  requirementId: IdentifierSchema,
  acquisitionKind: z.literal('source-asset'),
  requiredCapabilities: EmptyCapabilitiesSchema,
  sourceSelections: z.array(CaptureSourceSelectionSchema).min(1).max(12),
}).strict().superRefine((decision, ctx) => {
  const ids = decision.sourceSelections.map((selection) => selection.referenceId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceSelections'],
      message: 'Source material selections must be unique.',
    });
  }
});

export const CaptureAcquisitionDecisionInputSchema = z.discriminatedUnion('acquisitionKind', [
  PhysicalCaptureAcquisitionDecisionInputSchema,
  ScreenCaptureAcquisitionDecisionInputSchema,
  SourceAssetAcquisitionDecisionInputSchema,
]);

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

export const CaptureSourceBindingSchema = z.object({
  referenceId: IdentifierSchema,
  title: NonEmptyTextSchema,
  ledgerKind: z.enum(['upload', 'research_source']),
  sourceId: NonEmptyTextSchema.optional(),
  sourceUrl: z.string().url().optional(),
  provenanceOrigin: NonEmptyTextSchema,
  rightsBasis: z.enum(['user-provided', 'project-approved']),
}).strict().superRefine((binding, ctx) => {
  if (!binding.sourceId && !binding.sourceUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceId'],
      message: 'Bound source material must have a persisted source ID or URL.',
    });
  }
});

const PhysicalCaptureAcquisitionDecisionSchema = PhysicalCaptureAcquisitionDecisionInputSchema;
const ScreenCaptureAcquisitionDecisionSchema = ScreenCaptureAcquisitionDecisionInputSchema;
const SourceAssetAcquisitionDecisionSchema = z.object({
  requirementId: IdentifierSchema,
  acquisitionKind: z.literal('source-asset'),
  requiredCapabilities: EmptyCapabilitiesSchema,
  sourceBindings: z.array(CaptureSourceBindingSchema).min(1).max(12),
}).strict();

export const CaptureAcquisitionDecisionSchema = z.discriminatedUnion('acquisitionKind', [
  PhysicalCaptureAcquisitionDecisionSchema,
  ScreenCaptureAcquisitionDecisionSchema,
  SourceAssetAcquisitionDecisionSchema,
]);

const CaptureAcquisitionDecisionsSchema = z.array(CaptureAcquisitionDecisionSchema)
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
  decisions: CaptureAcquisitionDecisionsSchema,
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
export type CaptureAcquisitionDecision = z.infer<typeof CaptureAcquisitionDecisionSchema>;
export type CaptureAcquisitionDecisionSet = z.infer<typeof CaptureAcquisitionDecisionSetSchema>;

export interface CaptureAcquisitionDecisionMergeResult {
  decisions: CaptureAcquisitionDecisionInput[];
  previousDecisionSetHash: string | null;
}

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
        | 'source_ledger_hash_mismatch'
        | 'evidence_binding_invalid'
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
  if (left.sourceLedgerHash !== right.sourceLedgerHash) {
    return { current: false, reason: 'source_ledger_hash_mismatch' };
  }
  return null;
}

function validateDecisionTargets(
  treatment: VideoTreatment,
  decisions: readonly CaptureAcquisitionDecision[],
): void {
  const requirements = new Map(treatment.captureRequirements.map((requirement) => [requirement.id, requirement]));
  const issues: string[] = [];
  decisions.forEach((decision) => {
    const requirement = requirements.get(decision.requirementId);
    if (!requirement) {
      issues.push(`unknown_capture_requirement:${decision.requirementId}`);
      return;
    }
    if (
      requirement.captureKind !== 'unspecified'
      && requirement.captureKind !== decision.acquisitionKind
    ) {
      issues.push(`capture_requirement_reclassification:${decision.requirementId}`);
    }
    if (requirement.captureKind === 'physical-camera') {
      issues.push(`physical_requirement_uses_capability_profile:${decision.requirementId}`);
    }
    if (
      decision.acquisitionKind === 'physical-camera'
      && treatment.audiovisualIntent.physicalCapture === 'forbidden'
    ) {
      issues.push(`physical_capture_forbidden:${decision.requirementId}`);
    }
    if (
      decision.acquisitionKind === 'physical-camera'
      && treatment.audiovisualIntent.visiblePerson === 'forbidden'
      && decision.requiredCapabilities.includes('performer')
    ) {
      issues.push(`performer_capture_forbidden:${decision.requirementId}`);
    }
    if (decision.acquisitionKind === 'source-asset') {
      const declaredSourceRefs = new Set(requirement.sourceRefs);
      decision.sourceBindings.forEach((binding) => {
        if (!declaredSourceRefs.has(binding.referenceId)) {
          issues.push(`source_not_declared_for_requirement:${decision.requirementId}:${binding.referenceId}`);
        }
      });
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
    source_ledger_hash_mismatch: 'The saved capture acquisition decisions no longer match this script evidence ledger.',
    evidence_binding_invalid: 'The saved acquisition path does not contain usable, authorized evidence.',
    decision_target_mismatch: 'The saved capture acquisition decisions no longer match the treatment requirements.',
  };
  return messages[reason];
}

export function createCaptureAcquisitionSourceDocument(input: {
  version: number;
  contentHash: string;
  sidecarHash: string;
  sourceLedger: unknown;
}): CaptureAcquisitionSourceDocument {
  const sourceLedger = parseSourceLedger(input.sourceLedger);
  return CaptureAcquisitionSourceDocumentSchema.parse({
    version: input.version,
    contentHash: input.contentHash,
    sidecarHash: input.sidecarHash,
    sourceLedgerHash: hashJsonArtifact(sourceLedger),
  });
}

function sourceBinding(
  entry: SourceLedgerEntry,
  rightsBasis: 'user-provided' | 'project-approved',
): z.infer<typeof CaptureSourceBindingSchema> {
  if (entry.kind !== 'upload' && entry.kind !== 'research_source') {
    throw new CaptureAcquisitionDecisionError(
      'evidence_binding_invalid',
      `Source "${entry.referenceId}" is factual context, not selectable production material. Upload or approve a usable source asset.`,
    );
  }
  if (!entry.sourceId && !entry.sourceUrl) {
    throw new CaptureAcquisitionDecisionError(
      'evidence_binding_invalid',
      `Source "${entry.referenceId}" has no persisted asset ID or URL.`,
    );
  }
  return CaptureSourceBindingSchema.parse({
    referenceId: entry.referenceId,
    title: entry.title,
    ledgerKind: entry.kind,
    ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
    ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
    provenanceOrigin: entry.provenance.origin,
    rightsBasis,
  });
}

function materializeDecisions(input: {
  treatment: VideoTreatment;
  decisions: readonly CaptureAcquisitionDecisionInput[];
  sourceLedger: SourceLedger;
}): CaptureAcquisitionDecision[] {
  const sourceEntries = new Map(
    input.sourceLedger.entries.map((entry) => [entry.referenceId, entry]),
  );
  const materialized = input.decisions.map((decision): CaptureAcquisitionDecision => {
    if (decision.acquisitionKind !== 'source-asset') {
      return CaptureAcquisitionDecisionSchema.parse(decision);
    }
    return CaptureAcquisitionDecisionSchema.parse({
      requirementId: decision.requirementId,
      acquisitionKind: decision.acquisitionKind,
      requiredCapabilities: decision.requiredCapabilities,
      sourceBindings: decision.sourceSelections.map((selection) => {
        const entry = sourceEntries.get(selection.referenceId);
        if (!entry) {
          throw new CaptureAcquisitionDecisionError(
            'evidence_binding_invalid',
            `Source "${selection.referenceId}" is not in this script's authorized Source Ledger.`,
          );
        }
        return sourceBinding(entry, selection.rightsBasis);
      }),
    });
  });
  validateDecisionTargets(input.treatment, materialized);
  return materialized;
}

export function createCaptureAcquisitionDecisionSet(input: {
  treatment: VideoTreatment;
  sourceDocument: unknown;
  decisions: unknown;
  sourceLedger: unknown;
  decidedBy: string;
  decidedAt?: Date;
}): CaptureAcquisitionDecisionSet {
  const sourceDocument = CaptureAcquisitionSourceDocumentSchema.parse(input.sourceDocument);
  const sourceLedger = parseSourceLedger(input.sourceLedger);
  if (sourceDocument.sourceLedgerHash !== hashJsonArtifact(sourceLedger)) {
    throw new CaptureAcquisitionDecisionError(
      'source_ledger_hash_mismatch',
      'The acquisition request does not match this script evidence ledger.',
    );
  }
  const decisions = materializeDecisions({
    treatment: input.treatment,
    decisions: CaptureAcquisitionDecisionInputsSchema.parse(input.decisions),
    sourceLedger,
  });
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

function decisionInputFromPersisted(
  decision: CaptureAcquisitionDecision,
): CaptureAcquisitionDecisionInput {
  if (decision.acquisitionKind !== 'source-asset') {
    return CaptureAcquisitionDecisionInputSchema.parse(decision);
  }
  return CaptureAcquisitionDecisionInputSchema.parse({
    requirementId: decision.requirementId,
    acquisitionKind: decision.acquisitionKind,
    requiredCapabilities: decision.requiredCapabilities,
    sourceSelections: decision.sourceBindings.map((binding) => ({
      referenceId: binding.referenceId,
      rightsBasis: binding.rightsBasis,
    })),
  });
}

/**
 * Merges an incremental user answer into the exact prior verified decision set.
 * The caller must compare `previousDecisionSetHash` with the revision the client
 * actually reviewed, then bind the same value into its persistence CAS.
 */
export function mergeCaptureAcquisitionDecisionInputs(input: {
  treatment: VideoTreatment;
  sourceDocument: unknown;
  previousDecisionSet?: unknown;
  decisions: unknown;
}): CaptureAcquisitionDecisionMergeResult {
  const incoming = CaptureAcquisitionDecisionInputsSchema.parse(input.decisions);
  let previousDecisionSetHash: string | null = null;
  let previous: CaptureAcquisitionDecisionInput[] = [];
  if (input.previousDecisionSet !== undefined && input.previousDecisionSet !== null) {
    const verification = verifyCaptureAcquisitionDecisionSet({
      decisionSet: input.previousDecisionSet,
      treatment: input.treatment,
      sourceDocument: input.sourceDocument,
    });
    if (!verification.current) {
      throw new CaptureAcquisitionDecisionError(
        verification.reason,
        mismatchMessage(verification.reason),
      );
    }
    previousDecisionSetHash = verification.decisionSet.decisionSetHash;
    previous = verification.decisionSet.decisions.map(decisionInputFromPersisted);
  }

  const decisionsByRequirement = new Map(
    previous.map((decision) => [decision.requirementId, decision]),
  );
  incoming.forEach((decision) => decisionsByRequirement.set(decision.requirementId, decision));
  const decisions = input.treatment.captureRequirements.flatMap((requirement) => {
    const decision = decisionsByRequirement.get(requirement.id);
    return decision ? [decision] : [];
  });
  return {
    decisions: CaptureAcquisitionDecisionInputsSchema.parse(decisions),
    previousDecisionSetHash,
  };
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
}): Map<string, CaptureAcquisitionDecision> {
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
