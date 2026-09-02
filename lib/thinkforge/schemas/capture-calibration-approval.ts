import { z } from 'zod';

import { hashJsonArtifact } from '../persistence/script-sidecar-binding';
import {
  CaptureCalibrationCategorySchema,
  TechnicalCapturePlanSchema,
  verifyTechnicalCapturePlanIntegrity,
} from './technical-capture-plan';

export const CAPTURE_CALIBRATION_APPROVAL_VERSION = 1 as const;
export const APPROVED_TECHNICAL_CAPTURE_SNAPSHOT_METADATA_KEY = 'approvedTechnicalCaptureSnapshot' as const;

const IdSchema = z.string().trim().min(1).max(240);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const CaptureCalibrationConfirmationSchema = z.object({
  setupId: IdSchema,
  checkId: IdSchema,
  category: CaptureCalibrationCategorySchema,
  status: z.literal('passed'),
  method: z.enum(['live-preview', 'test-recording', 'measured', 'reference-frame']),
  note: z.string().trim().min(1).max(1_200).optional(),
  evidenceAssetId: IdSchema.optional(),
}).strict();

export const CaptureCalibrationConfirmationsSchema = z.array(
  CaptureCalibrationConfirmationSchema,
).min(1).max(768);

const SourceDocumentSchema = z.object({
  version: z.number().int().positive(),
  contentHash: HashSchema,
  sidecarHash: HashSchema,
  sourceLedgerHash: HashSchema,
}).strict();

const ApprovedTechnicalCaptureSnapshotBodySchema = z.object({
  version: z.literal(CAPTURE_CALIBRATION_APPROVAL_VERSION).default(CAPTURE_CALIBRATION_APPROVAL_VERSION),
  status: z.literal('approved'),
  sessionId: IdSchema,
  scriptId: IdSchema,
  sourceDocument: SourceDocumentSchema,
  plan: TechnicalCapturePlanSchema,
  confirmations: CaptureCalibrationConfirmationsSchema,
  approvedBy: IdSchema,
  approvedAt: z.string().datetime({ offset: true }),
}).strict();

export const ApprovedTechnicalCaptureSnapshotSchema = ApprovedTechnicalCaptureSnapshotBodySchema.safeExtend({
  snapshotHash: HashSchema,
}).strict();

export type ApprovedTechnicalCaptureSnapshot = z.infer<typeof ApprovedTechnicalCaptureSnapshotSchema>;

export class CaptureCalibrationApprovalError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Capture calibration approval failed: ${issues.join(', ')}`);
    this.name = 'CaptureCalibrationApprovalError';
  }
}

export function createApprovedTechnicalCaptureSnapshot(input: {
  sessionId: string;
  scriptId: string;
  sourceDocument: unknown;
  plan: unknown;
  confirmations: unknown;
  approvedBy: string;
  approvedAt?: Date;
}): ApprovedTechnicalCaptureSnapshot {
  const sourceDocument = SourceDocumentSchema.parse(input.sourceDocument);
  const integrity = verifyTechnicalCapturePlanIntegrity(input.plan);
  if (!integrity.valid) throw new CaptureCalibrationApprovalError([integrity.reason]);
  const plan = integrity.plan;
  const confirmations = CaptureCalibrationConfirmationsSchema.parse(input.confirmations);
  const issues = calibrationApprovalIssues(plan, confirmations);
  if (JSON.stringify(plan.sourceDocument) !== JSON.stringify(sourceDocument)) issues.push('source_document_mismatch');
  if (issues.length > 0) throw new CaptureCalibrationApprovalError([...new Set(issues)]);

  const body = ApprovedTechnicalCaptureSnapshotBodySchema.parse({
    version: CAPTURE_CALIBRATION_APPROVAL_VERSION,
    status: 'approved',
    sessionId: input.sessionId,
    scriptId: input.scriptId,
    sourceDocument,
    plan,
    confirmations,
    approvedBy: input.approvedBy,
    approvedAt: (input.approvedAt ?? new Date()).toISOString(),
  });
  return ApprovedTechnicalCaptureSnapshotSchema.parse({
    ...body,
    snapshotHash: hashJsonArtifact(body),
  });
}

function calibrationApprovalIssues(
  plan: z.infer<typeof TechnicalCapturePlanSchema>,
  confirmations: z.infer<typeof CaptureCalibrationConfirmationsSchema>,
): string[] {
  const issues: string[] = [];
  if (plan.unresolvedQuestions.length > 0) issues.push('unresolved_questions_remain');
  const expectedChecks = new Map<string, { category: z.infer<typeof CaptureCalibrationCategorySchema> }>(
    plan.setups.flatMap((setup) => setup.calibrationChecks.map(
      (check) => [`${setup.id}:${check.id}`, { category: check.category }],
    )),
  );
  const observed = new Set<string>();
  confirmations.forEach((confirmation) => {
    const key = `${confirmation.setupId}:${confirmation.checkId}`;
    const expected = expectedChecks.get(key);
    if (!expected) issues.push(`unknown_confirmation:${key}`);
    else if (expected.category !== confirmation.category) issues.push(`confirmation_category_mismatch:${key}`);
    if (observed.has(key)) issues.push(`duplicate_confirmation:${key}`);
    observed.add(key);
    if (expected?.category === 'sound' && confirmation.method !== 'test-recording') {
      issues.push(`sound_requires_test_recording:${key}`);
    }
  });
  expectedChecks.forEach((_check, key) => {
    if (!observed.has(key)) issues.push(`missing_confirmation:${key}`);
  });
  return issues;
}

export function verifyApprovedTechnicalCaptureSnapshot(input: {
  snapshot: unknown;
  sessionId: string;
  scriptId: string;
  sourceDocument: unknown;
  plan: unknown;
}): { current: true; snapshot: ApprovedTechnicalCaptureSnapshot } | {
  current: false;
  reason: 'snapshot_invalid' | 'snapshot_hash_mismatch' | 'session_mismatch' | 'script_mismatch' | 'source_document_mismatch' | 'plan_mismatch' | 'approval_invalid';
} {
  const snapshot = ApprovedTechnicalCaptureSnapshotSchema.safeParse(input.snapshot);
  if (!snapshot.success) return { current: false, reason: 'snapshot_invalid' };
  const sourceDocument = SourceDocumentSchema.safeParse(input.sourceDocument);
  if (!sourceDocument.success) return { current: false, reason: 'source_document_mismatch' };
  const { snapshotHash, ...body } = snapshot.data;
  if (hashJsonArtifact(body) !== snapshotHash) return { current: false, reason: 'snapshot_hash_mismatch' };
  if (snapshot.data.sessionId !== input.sessionId) return { current: false, reason: 'session_mismatch' };
  if (snapshot.data.scriptId !== input.scriptId) return { current: false, reason: 'script_mismatch' };
  if (JSON.stringify(snapshot.data.sourceDocument) !== JSON.stringify(sourceDocument.data)) {
    return { current: false, reason: 'source_document_mismatch' };
  }
  const currentPlan = verifyTechnicalCapturePlanIntegrity(input.plan);
  if (!currentPlan.valid || currentPlan.plan.planHash !== snapshot.data.plan.planHash) {
    return { current: false, reason: 'plan_mismatch' };
  }
  if (calibrationApprovalIssues(snapshot.data.plan, snapshot.data.confirmations).length > 0) {
    return { current: false, reason: 'approval_invalid' };
  }
  return { current: true, snapshot: snapshot.data };
}
