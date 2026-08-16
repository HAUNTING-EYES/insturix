import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ThinkForgeModelProvider } from '../agents/model-factory';
import { getWritingKnowledgeIdentity } from '../data/writing-graph-query';
import writingKnowledgeJson from '../data/writing-knowledge.json';
import type { SourceLedger } from './source-ledger';

export const THINKFORGE_WRITER_INVOCATION_TRACE_VERSION = 1;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CacheStatusSchema = z.enum(['hit', 'created', 'inline']);

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

function cloneEditorialPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ThinkForge writer trace requires an editorial plan object');
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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
