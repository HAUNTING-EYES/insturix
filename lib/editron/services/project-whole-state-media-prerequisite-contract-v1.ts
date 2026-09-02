import { z } from 'zod';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_KIND_V1 =
  'EDITRON_PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_V1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().trim().min(1).max(500);
const overlayIdentifier = z.union([
  z.number().int().nonnegative(),
  identifier,
]);
const revision = z.object({
  schemaVersion: z.literal(1),
  value: z.number().int().nonnegative(),
  compatibilityUpdatedAt: z.string().datetime(),
}).strict();
const predecessor = z.object({
  disposition: z.enum([
    'ORIGINAL_SOURCE',
    'GENERATED_VIDEO_RECEIPT',
    'GENERATED_MG_SEQUENCE_RECEIPT',
    'DERIVED_MEDIA_RECEIPT',
  ]),
  receiptSha256: sha256.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.disposition === 'ORIGINAL_SOURCE') !== (value.receiptSha256 === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Predecessor evidence mismatch.' });
  }
});
const entry = z.object({
  overlayId: overlayIdentifier,
  overlayType: z.enum(['video', 'image', 'sound', 'mg-sequence']),
  assetId: identifier,
  overlayFingerprintSha256: sha256,
  source: z.discriminatedUnion('disposition', [
    z.object({
      disposition: z.literal('QUALIFIED_MEDIA_SOURCE_VERSION'),
      sourceVersionSha256: sha256,
      storageVersionSha256: sha256,
    }).strict(),
    z.object({
      disposition: z.literal('PROJECT_GENERATED_SEQUENCE'),
      sourceIdentitySha256: sha256,
    }).strict(),
  ]),
  rights: z.discriminatedUnion('disposition', [
    z.object({
      disposition: z.literal('PROJECT_SOURCE_AUTHORIZED'),
      receiptSha256: sha256,
      sourceMediaRightsStateSha256V1: sha256,
      sourceMediaRightsRecordSha256: sha256,
      evaluatedAt: z.string().datetime(),
    }).strict(),
    z.object({
      disposition: z.literal('INTERNAL_GENERATED_ARTIFACT'),
      receiptSha256: z.null(),
    }).strict(),
  ]),
  audio: z.discriminatedUnion('disposition', [
    z.object({ disposition: z.literal('NOT_APPLICABLE'), evidenceSha256: z.null() }).strict(),
    z.object({ disposition: z.literal('VERIFIED'), evidenceSha256: sha256 }).strict(),
  ]),
  predecessor,
}).strict();
const materialSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal(PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_KIND_V1),
  operation: z.enum([
    'REPLACE_EDITOR_STATE',
    'CAPTURE_CHECKPOINT_STATE',
    'RESTORE_CHECKPOINT_STATE',
    'ADD_OVERLAY',
    'UPDATE_OVERLAY',
    'CUT_TIMELINE_RANGE',
  ]),
  projectId: identifier,
  userId: identifier,
  projectOwnerId: identifier,
  orgId: identifier.nullable(),
  projectRevision: revision,
  mediaEntries: z.array(entry).max(100_000),
  candidateMediaSetSha256: sha256,
  candidateMediaContentSha256: sha256,
  issuedAt: z.string().datetime(),
}).strict();
const receiptSchema = materialSchema.extend({ receiptSha256: sha256 }).strict();

export type ProjectWholeStateMediaPrerequisiteEntryV1 = z.infer<typeof entry>;
export type ProjectWholeStateMediaPrerequisiteReceiptV1 = z.infer<typeof receiptSchema>;
export type ProjectWholeStateMediaPrerequisiteMaterialV1 = z.infer<typeof materialSchema>;

export function createProjectWholeStateMediaPrerequisiteReceiptV1(
  input: Omit<
    ProjectWholeStateMediaPrerequisiteMaterialV1,
    'schemaVersion' | 'kind' | 'candidateMediaSetSha256' | 'candidateMediaContentSha256'
  >,
): ProjectWholeStateMediaPrerequisiteReceiptV1 {
  const mediaEntries = [...input.mediaEntries].sort((left, right) => (
    overlayIdentity(left.overlayId).localeCompare(overlayIdentity(right.overlayId))
  ));
  if (new Set(mediaEntries.map(({ overlayId }) => overlayIdentity(overlayId))).size
    !== mediaEntries.length) {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_OVERLAY_ID_DUPLICATE');
  }
  const material = materialSchema.parse({
    schemaVersion: 1,
    kind: PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_KIND_V1,
    ...input,
    mediaEntries,
    candidateMediaSetSha256: hashEditronCanonicalJsonV1(mediaEntries),
    candidateMediaContentSha256: hashEditronCanonicalJsonV1(
      mediaEntries.map(mediaContentIdentity),
    ),
  });
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProjectWholeStateMediaPrerequisiteReceiptV1(
  input: unknown,
): ProjectWholeStateMediaPrerequisiteReceiptV1 {
  const receipt = receiptSchema.parse(input);
  const { receiptSha256, ...material } = receipt;
  if (hashEditronCanonicalJsonV1(receipt.mediaEntries) !== receipt.candidateMediaSetSha256
    || hashEditronCanonicalJsonV1(receipt.mediaEntries.map(mediaContentIdentity))
      !== receipt.candidateMediaContentSha256
    || hashEditronCanonicalJsonV1(material) !== receiptSha256) {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_HASH_MISMATCH');
  }
  if (receipt.mediaEntries.some((value, index) => (
    index > 0 && overlayIdentity(receipt.mediaEntries[index - 1]!.overlayId)
      >= overlayIdentity(value.overlayId)
  ))) throw new Error('PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_ORDER_INVALID');
  return deepFreezeEditronJsonV1(receipt);
}

function overlayIdentity(value: string | number): string {
  return String(value);
}

function mediaContentIdentity(value: ProjectWholeStateMediaPrerequisiteEntryV1) {
  const { rights, ...content } = value;
  return { ...content, rightsDisposition: rights.disposition };
}
