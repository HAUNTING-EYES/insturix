import { z } from 'zod';
import {
  ThinkForgeDocumentGenerationTraceV1Schema,
  hashThinkForgeTraceValue,
  type ThinkForgeDocumentGenerationTraceV1,
} from './generation-trace';

export const THINKFORGE_GENERATION_RECEIPT_VERSION = 1;
export const THINKFORGE_GENERATION_RECEIPT_COLLECTION = 'thinkforge_generation_receipts';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const ExactIdentifierSchema = z.string().min(1).refine(
  (value) => value === value.trim(),
  'identifier must not contain surrounding whitespace',
);

export const ThinkForgeGenerationReceiptV1Schema = z.object({
  version: z.number().int(),
  id: z.string().regex(/^tfgr_[a-f0-9]{48}$/u),
  actor: z.object({
    userId: ExactIdentifierSchema,
    orgId: ExactIdentifierSchema.nullable(),
  }).strict(),
  document: z.object({
    sessionId: ExactIdentifierSchema,
    scriptId: ExactIdentifierSchema,
    version: z.number().int().positive(),
  }).strict(),
  operation: z.object({
    kind: z.enum(['create', 'edit']),
    id: ExactIdentifierSchema,
  }).strict(),
  authoringContextSnapshot: z.record(z.string(), z.unknown()),
  generationTrace: ThinkForgeDocumentGenerationTraceV1Schema,
  generationTraceHash: Sha256Schema,
  persistedAt: z.string().datetime(),
  receiptHash: Sha256Schema,
}).strict().superRefine((receipt, ctx) => {
  if (receipt.version !== THINKFORGE_GENERATION_RECEIPT_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported ThinkForge generation receipt version',
    });
  }
  if (receipt.generationTrace.document.sessionId !== receipt.document.sessionId
    || receipt.generationTrace.document.scriptId !== receipt.document.scriptId
    || receipt.generationTrace.document.expectedVersion !== receipt.document.version) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document'],
      message: 'receipt document identity does not match generation trace',
    });
  }
  if (receipt.generationTrace.operation.kind !== receipt.operation.kind
    || receipt.generationTrace.operation.id !== receipt.operation.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operation'],
      message: 'receipt operation does not match generation trace',
    });
  }
});

export type ThinkForgeGenerationReceiptV1 = z.infer<typeof ThinkForgeGenerationReceiptV1Schema>;

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readGenerationTrace(metadata: unknown): unknown {
  const metadataRecord = toRecord(metadata);
  const writerOutput = toRecord(metadataRecord?.writerOutput);
  return writerOutput?.generationTrace;
}

function readAuthoringContextSnapshot(metadata: unknown): Record<string, unknown> | null {
  return toRecord(toRecord(metadata)?.authoringContextSnapshot);
}

function unsignedReceipt(receipt: Omit<ThinkForgeGenerationReceiptV1, 'receiptHash'>): Omit<
  ThinkForgeGenerationReceiptV1,
  'receiptHash'
> {
  return receipt;
}

export function verifyThinkForgeGenerationReceipt(
  value: unknown,
): ThinkForgeGenerationReceiptV1 {
  const receipt = ThinkForgeGenerationReceiptV1Schema.parse(value);
  if (hashThinkForgeTraceValue(receipt.generationTrace) !== receipt.generationTraceHash) {
    throw new Error('ThinkForge generation receipt trace hash is invalid.');
  }
  if (hashThinkForgeTraceValue(receipt.authoringContextSnapshot)
    !== receipt.generationTrace.authoringContextSnapshotHash) {
    throw new Error('ThinkForge generation receipt authoring context hash is invalid.');
  }
  const { receiptHash, ...unsigned } = receipt;
  if (hashThinkForgeTraceValue(unsignedReceipt(unsigned)) !== receiptHash) {
    throw new Error('ThinkForge generation receipt hash is invalid.');
  }
  return receipt;
}

export function buildThinkForgeGenerationReceipt(input: {
  userId: string;
  orgId?: string | null;
  sessionId: string;
  scriptId: string;
  documentVersion: number;
  outputContent: string;
  metadata: unknown;
  persistedAt?: Date;
}): ThinkForgeGenerationReceiptV1 | null {
  const rawTrace = readGenerationTrace(input.metadata);
  if (rawTrace === undefined || rawTrace === null) return null;

  const generationTrace: ThinkForgeDocumentGenerationTraceV1 =
    ThinkForgeDocumentGenerationTraceV1Schema.parse(rawTrace);
  const authoringContextSnapshot = readAuthoringContextSnapshot(input.metadata);
  if (!authoringContextSnapshot) {
    throw new Error('A traced ThinkForge generation requires its authoring context snapshot.');
  }
  if (generationTrace.document.sessionId !== input.sessionId
    || generationTrace.document.scriptId !== input.scriptId
    || generationTrace.document.expectedVersion !== input.documentVersion) {
    throw new Error('ThinkForge generation trace conflicts with its persistence target.');
  }
  if (generationTrace.outputHash !== hashThinkForgeTraceValue(input.outputContent)) {
    throw new Error('ThinkForge generation trace conflicts with the persisted output.');
  }
  if (generationTrace.authoringContextSnapshotHash
    !== hashThinkForgeTraceValue(authoringContextSnapshot)) {
    throw new Error('ThinkForge generation trace conflicts with its authoring context snapshot.');
  }

  const generationTraceHash = hashThinkForgeTraceValue(generationTrace);
  const idDigest = hashThinkForgeTraceValue({
    version: THINKFORGE_GENERATION_RECEIPT_VERSION,
    sessionId: input.sessionId,
    scriptId: input.scriptId,
    documentVersion: input.documentVersion,
    generationTraceHash,
  });
  const withoutHash: Omit<ThinkForgeGenerationReceiptV1, 'receiptHash'> = {
    version: THINKFORGE_GENERATION_RECEIPT_VERSION,
    id: `tfgr_${idDigest.slice(0, 48)}`,
    actor: {
      userId: input.userId,
      orgId: input.orgId?.trim() || null,
    },
    document: {
      sessionId: input.sessionId,
      scriptId: input.scriptId,
      version: input.documentVersion,
    },
    operation: generationTrace.operation,
    authoringContextSnapshot: structuredClone(authoringContextSnapshot),
    generationTrace: structuredClone(generationTrace),
    generationTraceHash,
    persistedAt: (input.persistedAt ?? new Date()).toISOString(),
  };
  return verifyThinkForgeGenerationReceipt({
    ...withoutHash,
    receiptHash: hashThinkForgeTraceValue(unsignedReceipt(withoutHash)),
  });
}
