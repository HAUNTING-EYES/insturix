import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ThinkForgeModelProvider } from '../agents/model-factory';
import { getWritingKnowledgeIdentity } from '../data/writing-graph-query';
import writingKnowledgeJson from '../data/writing-knowledge.json';
import type { SourceLedger } from './source-ledger';

export const THINKFORGE_WRITER_INVOCATION_TRACE_VERSION = 1;
export const THINKFORGE_DOCUMENT_GENERATION_TRACE_VERSION = 1;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CacheStatusSchema = z.enum(['hit', 'created', 'inline']);
const ExactIdentifierSchema = z.string().min(1).refine(
  (value) => value === value.trim(),
  'identifier must not contain surrounding whitespace',
);

const EditorialTechniqueEvidenceSchema = z.object({
  id: z.string().min(1),
  sourceLines: z.tuple([z.number().int().positive(), z.number().int().positive()]),
}).superRefine((evidence, ctx) => {
  if (evidence.sourceLines[0] > evidence.sourceLines[1]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceLines'],
      message: 'technique source line range is reversed',
    });
  }
});

export const ThinkForgeWriterInvocationTraceV1Schema = z.object({
  version: z.number().int(),
  writerType: z.enum(['post', 'script']),
  generatedAt: z.string().datetime(),
  editorialPlan: z.record(z.string(), z.unknown()),
  editorialPlanHash: Sha256Schema,
  selectedTechniqueIds: z.array(z.string().min(1)),
  techniqueEvidence: z.array(EditorialTechniqueEvidenceSchema),
  writingKnowledge: z.object({
    version: z.string().min(1),
    source: z.string().min(1),
    contentHash: Sha256Schema,
  }),
  promptTemplateHash: Sha256Schema,
  sourceLedgerHash: Sha256Schema.optional(),
  provider: z.object({
    provider: z.enum(['gemini', 'openrouter']),
    model: z.string().min(1),
    cacheStatus: CacheStatusSchema,
  }),
  repair: z.object({
    applied: z.boolean(),
    failureCodes: z.array(z.string().min(1)),
    cacheStatus: CacheStatusSchema.optional(),
  }),
}).superRefine((trace, ctx) => {
  if (trace.version !== THINKFORGE_WRITER_INVOCATION_TRACE_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported writer invocation trace version',
    });
  }
  if (trace.repair.applied !== (trace.repair.failureCodes.length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['repair'],
      message: 'repair state and failure evidence disagree',
    });
  }
});

export type ThinkForgeWriterInvocationTraceV1 = z.infer<
  typeof ThinkForgeWriterInvocationTraceV1Schema
>;

export const ThinkForgeDocumentGenerationTraceV1Schema = z.object({
  version: z.number().int(),
  operation: z.object({
    kind: z.enum(['create', 'edit']),
    id: ExactIdentifierSchema,
  }).strict(),
  document: z.object({
    sessionId: ExactIdentifierSchema,
    scriptId: ExactIdentifierSchema,
    expectedVersion: z.number().int().positive(),
    writerType: z.enum(['post', 'script']),
  }).strict(),
  writer: ThinkForgeWriterInvocationTraceV1Schema,
  authoringContextSnapshotHash: Sha256Schema,
  signalTraceHash: Sha256Schema,
  productionBriefHash: Sha256Schema,
  sourceLedgerHash: Sha256Schema,
  outputHash: Sha256Schema,
  qualityGate: z.object({
    status: z.literal('passed'),
    evidenceHash: Sha256Schema,
  }).strict(),
}).strict().superRefine((trace, ctx) => {
  if (trace.version !== THINKFORGE_DOCUMENT_GENERATION_TRACE_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported document generation trace version',
    });
  }
  if (trace.writer.writerType !== trace.document.writerType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document', 'writerType'],
      message: 'document writer type does not match writer invocation trace',
    });
  }
  if (trace.writer.sourceLedgerHash !== trace.sourceLedgerHash) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceLedgerHash'],
      message: 'document source ledger does not match writer invocation trace',
    });
  }
});

export type ThinkForgeDocumentGenerationTraceV1 = z.infer<
  typeof ThinkForgeDocumentGenerationTraceV1Schema
>;

export interface ThinkForgeEditorialTechniqueEvidence {
  id: string;
  sourceLines: [number, number];
}

type WritingCacheStatus = 'hit' | 'created' | 'inline';

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '"[undefined]"';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function hashThinkForgeTraceValue(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value).normalize('NFC')).digest('hex');
}

export function requireThinkForgeWriterInvocationTrace(
  value: unknown,
): ThinkForgeWriterInvocationTraceV1 {
  const parsed = ThinkForgeWriterInvocationTraceV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new Error('ThinkForge writer invocation trace is required and must be valid');
  }
  return parsed.data;
}

function cloneEditorialPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ThinkForge writer trace requires an editorial plan object');
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function requireObjectEvidence(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ThinkForge generation trace requires ${label}`);
  }
  return value as Record<string, unknown>;
}

export function buildThinkForgeWriterInvocationTrace(input: {
  writerType: 'post' | 'script';
  editorialPlan: unknown;
  selectedTechniques: readonly ThinkForgeEditorialTechniqueEvidence[];
  promptTemplate: string;
  sourceLedger?: SourceLedger | null;
  provider: ThinkForgeModelProvider;
  model: string;
  cacheStatus: WritingCacheStatus;
  repairFailureCodes?: readonly string[];
  repairCacheStatus?: WritingCacheStatus;
  generatedAt?: string;
}): ThinkForgeWriterInvocationTraceV1 {
  const editorialPlan = cloneEditorialPlan(input.editorialPlan);
  const techniqueById = new Map<string, ThinkForgeEditorialTechniqueEvidence>();
  input.selectedTechniques.forEach((technique) => {
    techniqueById.set(technique.id, {
      id: technique.id,
      sourceLines: [...technique.sourceLines] as [number, number],
    });
  });
  const techniqueEvidence = [...techniqueById.values()];
  const repairFailureCodes = [...new Set(input.repairFailureCodes ?? [])];
  const writingKnowledge = getWritingKnowledgeIdentity();

  return ThinkForgeWriterInvocationTraceV1Schema.parse({
    version: THINKFORGE_WRITER_INVOCATION_TRACE_VERSION,
    writerType: input.writerType,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    editorialPlan,
    editorialPlanHash: hashThinkForgeTraceValue(editorialPlan),
    selectedTechniqueIds: techniqueEvidence.map((technique) => technique.id),
    techniqueEvidence,
    writingKnowledge: {
      ...writingKnowledge,
      contentHash: hashThinkForgeTraceValue(writingKnowledgeJson),
    },
    promptTemplateHash: hashThinkForgeTraceValue(input.promptTemplate),
    ...(input.sourceLedger
      ? { sourceLedgerHash: hashThinkForgeTraceValue(input.sourceLedger) }
      : {}),
    provider: {
      provider: input.provider,
      model: input.model,
      cacheStatus: input.cacheStatus,
    },
    repair: {
      applied: repairFailureCodes.length > 0,
      failureCodes: repairFailureCodes,
      ...(input.repairCacheStatus ? { cacheStatus: input.repairCacheStatus } : {}),
    },
  });
}

export function buildThinkForgeDocumentGenerationTrace(input: {
  operation: { kind: 'create' | 'edit'; id: string };
  document: {
    sessionId: string;
    scriptId: string;
    expectedVersion: number;
    writerType: 'post' | 'script';
  };
  writerTrace: unknown;
  authoringContextSnapshot: unknown;
  signalTrace: unknown;
  productionBrief: unknown;
  sourceLedger: SourceLedger;
  outputContent: string;
  qualityGateEvidence: unknown;
}): ThinkForgeDocumentGenerationTraceV1 {
  if (!input.outputContent.trim()) {
    throw new Error('ThinkForge generation trace requires non-empty output content');
  }
  const writer = requireThinkForgeWriterInvocationTrace(input.writerTrace);
  const authoringContextSnapshot = requireObjectEvidence(
    input.authoringContextSnapshot,
    'an authoring context snapshot',
  );
  const signalTrace = requireObjectEvidence(input.signalTrace, 'a signal trace');
  const productionBrief = requireObjectEvidence(input.productionBrief, 'a production brief');
  const qualityGateEvidence = requireObjectEvidence(
    input.qualityGateEvidence,
    'quality gate evidence',
  );

  return ThinkForgeDocumentGenerationTraceV1Schema.parse({
    version: THINKFORGE_DOCUMENT_GENERATION_TRACE_VERSION,
    operation: input.operation,
    document: input.document,
    writer,
    authoringContextSnapshotHash: hashThinkForgeTraceValue(authoringContextSnapshot),
    signalTraceHash: hashThinkForgeTraceValue(signalTrace),
    productionBriefHash: hashThinkForgeTraceValue(productionBrief),
    sourceLedgerHash: hashThinkForgeTraceValue(input.sourceLedger),
    outputHash: hashThinkForgeTraceValue(input.outputContent),
    qualityGate: {
      status: 'passed',
      evidenceHash: hashThinkForgeTraceValue(qualityGateEvidence),
    },
  });
}
