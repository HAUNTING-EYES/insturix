import { z } from 'zod';

import { hashJsonArtifact } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { SHOOT_KIT_ASPECT_RATIOS } from './build-script-shot-plan';
import { ProductionCapabilityProfileSchema } from './production-capability-profile';
import { ShotPlanSchema } from './shot-plan';

export const SHOOT_KIT_SNAPSHOT_VERSION = 1 as const;
export const APPROVED_SHOOT_KIT_SNAPSHOT_METADATA_KEY = 'approvedShootKitSnapshot' as const;

export const ShootKitSettingsSchema = z.object({
  aspectRatio: z.enum(SHOOT_KIT_ASPECT_RATIOS),
  tier: z.enum(['no-spend', 'minimum-upgrade', 'enhanced']),
}).strict();

const ArtifactHashSchema = z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a SHA-256 artifact hash.');

const ApprovedShootKitSnapshotBodySchema = z.object({
  version: z.number().int().default(SHOOT_KIT_SNAPSHOT_VERSION),
  status: z.literal('approved'),
  sessionId: z.string().min(1),
  scriptId: z.string().min(1),
  sourceDocument: z.object({
    version: z.number().int().positive(),
    contentHash: ArtifactHashSchema,
    sidecarHash: ArtifactHashSchema,
  }).strict(),
  profile: ProductionCapabilityProfileSchema,
  settings: ShootKitSettingsSchema,
  plan: ShotPlanSchema,
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((snapshot, ctx) => {
  if (snapshot.version !== SHOOT_KIT_SNAPSHOT_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `Unsupported Shoot Kit snapshot version: ${snapshot.version}.`,
    });
  }
});

export const ApprovedShootKitSnapshotSchema = ApprovedShootKitSnapshotBodySchema.safeExtend({
  snapshotHash: ArtifactHashSchema,
}).strict();

export type ShootKitSettings = z.infer<typeof ShootKitSettingsSchema>;
export type ApprovedShootKitSnapshot = z.infer<typeof ApprovedShootKitSnapshotSchema>;

export type ApprovedShootKitSnapshotVerification =
  | { current: true; snapshot: ApprovedShootKitSnapshot }
  | {
      current: false;
      reason:
        | 'snapshot_missing'
        | 'snapshot_invalid'
        | 'snapshot_hash_mismatch'
        | 'session_mismatch'
        | 'script_mismatch'
        | 'document_version_mismatch'
        | 'document_hash_mismatch'
        | 'sidecar_hash_mismatch';
    snapshot?: ApprovedShootKitSnapshot;
  };

function snapshotBody(snapshot: ApprovedShootKitSnapshot): Omit<ApprovedShootKitSnapshot, 'snapshotHash'> {
  const { snapshotHash: _snapshotHash, ...body } = snapshot;
  return body;
}

export function createApprovedShootKitSnapshot(input: {
  sessionId: string;
  scriptId: string;
  sourceDocument: ApprovedShootKitSnapshot['sourceDocument'];
  profile: unknown;
  settings: unknown;
  plan: unknown;
  approvedBy: string;
  approvedAt?: Date;
}): ApprovedShootKitSnapshot {
  const body = ApprovedShootKitSnapshotBodySchema.parse({
    version: SHOOT_KIT_SNAPSHOT_VERSION,
    status: 'approved',
    sessionId: input.sessionId,
    scriptId: input.scriptId,
    sourceDocument: input.sourceDocument,
    profile: input.profile,
    settings: input.settings,
    plan: input.plan,
    approvedBy: input.approvedBy,
    approvedAt: (input.approvedAt ?? new Date()).toISOString(),
  });
  return ApprovedShootKitSnapshotSchema.parse({
    ...body,
    snapshotHash: hashJsonArtifact(body),
  });
}

export function verifyApprovedShootKitSnapshot(input: {
  snapshot: unknown;
  sessionId: string;
  scriptId: string;
  documentVersion: number;
  documentHash: string;
  sidecarHash: string;
}): ApprovedShootKitSnapshotVerification {
  if (input.snapshot === undefined || input.snapshot === null) {
    return { current: false, reason: 'snapshot_missing' };
  }
  const parsed = ApprovedShootKitSnapshotSchema.safeParse(input.snapshot);
  if (!parsed.success) return { current: false, reason: 'snapshot_invalid' };
  const snapshot = parsed.data;
  if (hashJsonArtifact(snapshotBody(snapshot)) !== snapshot.snapshotHash) {
    return { current: false, reason: 'snapshot_hash_mismatch', snapshot };
  }
  if (snapshot.sessionId !== input.sessionId) {
    return { current: false, reason: 'session_mismatch', snapshot };
  }
  if (snapshot.scriptId !== input.scriptId) {
    return { current: false, reason: 'script_mismatch', snapshot };
  }
  if (snapshot.sourceDocument.version !== input.documentVersion) {
    return { current: false, reason: 'document_version_mismatch', snapshot };
  }
  if (snapshot.sourceDocument.contentHash !== input.documentHash) {
    return { current: false, reason: 'document_hash_mismatch', snapshot };
  }
  if (snapshot.sourceDocument.sidecarHash !== input.sidecarHash) {
    return { current: false, reason: 'sidecar_hash_mismatch', snapshot };
  }
  return { current: true, snapshot };
}
