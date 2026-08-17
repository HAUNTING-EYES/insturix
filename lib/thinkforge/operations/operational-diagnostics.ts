import { MongoClient, type Db, type Document } from 'mongodb';
import { THINKFORGE_OBSERVER_JOB_COLLECTION } from '../events/observer-job';
import { THINKFORGE_POST_MORTEM_JOB_COLLECTION } from '../post-mortem/post-mortem-job-contract';
import {
  ThinkForgeDocumentGenerationTraceV1Schema,
  hashThinkForgeTraceValue,
} from '../provenance/generation-trace';
import { THINKFORGE_REFINERY_JOB_COLLECTION } from '../refinery/refinery-job';
import {
  THINKFORGE_GENERATION_RECEIPT_COLLECTION,
  verifyThinkForgeGenerationReceipt,
} from '../provenance/generation-receipt';

const THINKFORGE_SESSION_COLLECTION = 'thinkforge_sessions';
const THINKFORGE_SCRIPT_COLLECTION = 'thinkforge_scripts';
const THINKFORGE_DATABANK_COLLECTION = 'thinkforge_databank';
const ACTIONABLE_JOB_STATUSES = ['queued', 'running'] as const;
const TERMINAL_FAILURE_STATUSES = ['failed', 'dead_letter'] as const;

type StatusCounts = Record<string, number>;
type ThinkForgeStringIdDocument = Document & {
  _id: string;
  sessionId?: string;
  scriptId?: string;
};

export interface ThinkForgeJobDiagnostics {
  statusCounts: StatusCounts;
  oldestActionableUpdatedAt: string | null;
  terminalFailures: Array<{
    id: string;
    status: string;
    attemptCount: number | null;
    maxAttempts: number | null;
    errorCode: string | null;
    updatedAt: string | null;
  }>;
}

export interface ThinkForgeDocumentDiagnostics {
  sessionId: string;
  scriptId: string;
  documentVersion: number | null;
  documentType: string | null;
  outputKind: string | null;
  sessionBrandBinding: Record<string, unknown> | null;
  authoringContext: {
    version: number | null;
    resolvedAt: string | null;
    scope: Record<string, unknown> | null;
    brand: Record<string, unknown> | null;
    writingKnowledgeVersion: string | null;
    projectFactIds: string[];
    globalFactIds: string[];
    interactionPatternTypes: string[];
    retrievalDiagnostics: Record<string, unknown> | null;
  } | null;
  generation: {
    id: string | null;
    type: string | null;
    status: string | null;
    updatedAt: string | null;
    billingStatus: string | null;
  } | null;
  writer: {
    provider: string | null;
    model: string | null;
    cacheStatus: string | null;
    repairApplied: boolean | null;
    repairFailureCodes: string[];
    generatedAt: string | null;
  } | null;
  generationReceipt: {
    id: string | null;
    persistedAt: string | null;
    valid: boolean;
    codes: string[];
  } | null;
  traceIntegrity: {
    valid: boolean;
    codes: string[];
  };
}

export interface ThinkForgeOperationalDiagnostics {
  version: 1;
  generatedAt: string;
  configuration: {
    mongo: boolean;
    qstash: boolean;
    cronAuthentication: boolean;
    vectorStore: boolean;
    privateWriterProvider: boolean;
  };
  jobs: {
    observer: ThinkForgeJobDiagnostics;
    refinery: ThinkForgeJobDiagnostics;
    postMortem: ThinkForgeJobDiagnostics;
  };
  migrations: {
    authoringRequests: StatusCounts;
    documentContracts: StatusCounts;
    dataBankAuthority: StatusCounts;
  };
  alerts: Array<{
    code: string;
    severity: 'warning' | 'critical';
    count: number;
  }>;
  document?: ThinkForgeDocumentDiagnostics;
}

let cachedClient: Promise<MongoClient> | null = null;

async function getOperationalDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
  if (!uri) throw new Error('ThinkForge operational diagnostics require MONGODB_URI.');
  cachedClient ??= new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  }).connect();
  return (await cachedClient).db(databaseName);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = toRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = toStringOrNull(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const text = toStringOrNull(item);
    return text ? [text] : [];
  }))].sort();
}

async function readStatusCounts(db: Db, collectionName: string, statusPath: string): Promise<StatusCounts> {
  const rows = await db.collection(collectionName).aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: { $ifNull: [`$${statusPath}`, 'unmigrated'] }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return Object.fromEntries(rows.map((row) => [toStringOrNull(row._id) || 'unknown', row.count]));
}

async function readJobDiagnostics(db: Db, collectionName: string): Promise<ThinkForgeJobDiagnostics> {
  const collection = db.collection(collectionName);
  const [statusCounts, oldest, failures] = await Promise.all([
    readStatusCounts(db, collectionName, 'status'),
    collection.find(
      { status: { $in: [...ACTIONABLE_JOB_STATUSES] } },
      { projection: { _id: 0, updatedAt: 1 } },
    ).sort({ updatedAt: 1 }).limit(1).next(),
    collection.find(
      { status: { $in: [...TERMINAL_FAILURE_STATUSES] } },
      {
        projection: {
          _id: 0,
          id: 1,
          status: 1,
          attemptCount: 1,
          maxAttempts: 1,
          'error.code': 1,
          updatedAt: 1,
        },
      },
    ).sort({ updatedAt: -1 }).limit(10).toArray(),
  ]);

  return {
    statusCounts,
    oldestActionableUpdatedAt: toIsoStringOrNull(oldest?.updatedAt),
    terminalFailures: failures.map((failure) => ({
      id: toStringOrNull(failure.id) || 'unknown',
      status: toStringOrNull(failure.status) || 'unknown',
      attemptCount: toNumberOrNull(failure.attemptCount),
      maxAttempts: toNumberOrNull(failure.maxAttempts),
      errorCode: toStringOrNull(readPath(failure, ['error', 'code'])),
      updatedAt: toIsoStringOrNull(failure.updatedAt),
    })),
  };
}

function pushHashDiagnostic(
  codes: string[],
  code: string,
  expectedHash: string,
  evidence: unknown,
): void {
  if (evidence === undefined || evidence === null) {
    codes.push(`${code}_evidence_missing`);
    return;
  }
  if (hashThinkForgeTraceValue(evidence) !== expectedHash) codes.push(`${code}_hash_mismatch`);
}

export function diagnoseThinkForgeDocumentEvidence(input: {
  sessionId: string;
  scriptId: string;
  session: Document | null;
  script: Document | null;
  generationReceipt?: Document | null;
}): ThinkForgeDocumentDiagnostics {
  const { sessionId, scriptId, session, script } = input;
  const codes: string[] = [];
  const projectMeta = toRecord(session?.projectMeta);
  const sessionBrandBinding = toRecord(projectMeta?.brandBinding);
  const metadata = toRecord(script?.metadata);
  const writerOutput = toRecord(metadata?.writerOutput);
  const snapshot = toRecord(metadata?.authoringContextSnapshot);
  const rawTrace = writerOutput?.generationTrace;
  const parsedTrace = ThinkForgeDocumentGenerationTraceV1Schema.safeParse(rawTrace);
  const receiptCodes: string[] = [];
  let verifiedReceipt: ReturnType<typeof verifyThinkForgeGenerationReceipt> | null = null;

  if (input.generationReceipt) {
    try {
      verifiedReceipt = verifyThinkForgeGenerationReceipt(input.generationReceipt);
    } catch {
      receiptCodes.push('generation_receipt_invalid');
    }
  }

  if (!session) codes.push('session_missing');
  if (!script) codes.push('document_missing');
  if (!sessionBrandBinding) codes.push('session_brand_binding_missing');
  if (!snapshot) codes.push('authoring_context_snapshot_missing');
  if (!parsedTrace.success) {
    codes.push('generation_trace_invalid');
  } else {
    pushHashDiagnostic(codes, 'authoring_context', parsedTrace.data.authoringContextSnapshotHash, snapshot);
    pushHashDiagnostic(codes, 'signal_trace', parsedTrace.data.signalTraceHash, metadata?.signalTrace);
    pushHashDiagnostic(codes, 'production_brief', parsedTrace.data.productionBriefHash, metadata?.briefSnapshot);
    pushHashDiagnostic(codes, 'source_ledger', parsedTrace.data.sourceLedgerHash, writerOutput?.sourceLedger);
    pushHashDiagnostic(codes, 'quality_gate', parsedTrace.data.qualityGate.evidenceHash, writerOutput?.profileCompliance);
    pushHashDiagnostic(codes, 'output', parsedTrace.data.outputHash, script?.content);
    if (parsedTrace.data.document.expectedVersion !== toNumberOrNull(script?.version)) {
      codes.push('document_version_trace_mismatch');
    }
    if (!input.generationReceipt) {
      receiptCodes.push('generation_receipt_missing');
    } else if (verifiedReceipt && (
      verifiedReceipt.document.sessionId !== sessionId
      || verifiedReceipt.document.scriptId !== scriptId
      || verifiedReceipt.document.version !== toNumberOrNull(script?.version)
      || verifiedReceipt.generationTraceHash !== hashThinkForgeTraceValue(parsedTrace.data)
    )) {
      receiptCodes.push('generation_receipt_document_mismatch');
    }
  }
  codes.push(...receiptCodes);

  const boundBrandId = toStringOrNull(sessionBrandBinding?.brandId);
  const snapshotBrandId = toStringOrNull(readPath(snapshot, ['brand', 'brandId']));
  if (boundBrandId && snapshotBrandId && boundBrandId !== snapshotBrandId) {
    codes.push('brand_binding_snapshot_mismatch');
  }

  const generation = toRecord(session?.activeGeneration);
  const trace = parsedTrace.success ? parsedTrace.data : null;

  return {
    sessionId,
    scriptId,
    documentVersion: toNumberOrNull(script?.version),
    documentType: toStringOrNull(script?.documentType),
    outputKind: toStringOrNull(readPath(script, ['contentContract', 'outputKind'])),
    sessionBrandBinding,
    authoringContext: snapshot
      ? {
          version: toNumberOrNull(snapshot.version),
          resolvedAt: toIsoStringOrNull(snapshot.resolvedAt),
          scope: toRecord(snapshot.scope),
          brand: toRecord(snapshot.brand),
          writingKnowledgeVersion: toStringOrNull(snapshot.writingKnowledgeVersion),
          projectFactIds: toStringArray(readPath(snapshot, ['retrieval', 'projectFactIds'])),
          globalFactIds: toStringArray(readPath(snapshot, ['retrieval', 'globalFactIds'])),
          interactionPatternTypes: toStringArray(readPath(snapshot, ['retrieval', 'interactionPatternTypes'])),
          retrievalDiagnostics: toRecord(readPath(snapshot, ['retrieval', 'diagnostics'])),
        }
      : null,
    generation: generation
      ? {
          id: toStringOrNull(generation.id),
          type: toStringOrNull(generation.type),
          status: toStringOrNull(generation.status),
          updatedAt: toIsoStringOrNull(generation.updatedAt),
          billingStatus: toStringOrNull(readPath(generation, ['billing', 'status'])),
        }
      : null,
    writer: trace
      ? {
          provider: trace.writer.provider.provider,
          model: trace.writer.provider.model,
          cacheStatus: trace.writer.provider.cacheStatus,
          repairApplied: trace.writer.repair.applied,
          repairFailureCodes: [...trace.writer.repair.failureCodes],
          generatedAt: trace.writer.generatedAt,
        }
      : null,
    generationReceipt: input.generationReceipt
      ? {
          id: verifiedReceipt?.id ?? toStringOrNull(input.generationReceipt.id),
          persistedAt: verifiedReceipt?.persistedAt
            ?? toIsoStringOrNull(input.generationReceipt.persistedAt),
          valid: receiptCodes.length === 0,
          codes: [...new Set(receiptCodes)].sort(),
        }
      : null,
    traceIntegrity: {
      valid: codes.length === 0,
      codes: [...new Set(codes)].sort(),
    },
  };
}

function countTerminalFailures(job: ThinkForgeJobDiagnostics): number {
  return TERMINAL_FAILURE_STATUSES.reduce(
    (total, status) => total + (job.statusCounts[status] ?? 0),
    0,
  );
}

export async function getThinkForgeOperationalDiagnostics(input: {
  sessionId?: string;
  scriptId?: string;
  database?: Db;
} = {}): Promise<ThinkForgeOperationalDiagnostics> {
  const database = input.database ?? await getOperationalDatabase();
  const [observer, refinery, postMortem, authoringRequests, documentContracts, dataBankAuthority] = await Promise.all([
    readJobDiagnostics(database, THINKFORGE_OBSERVER_JOB_COLLECTION),
    readJobDiagnostics(database, THINKFORGE_REFINERY_JOB_COLLECTION),
    readJobDiagnostics(database, THINKFORGE_POST_MORTEM_JOB_COLLECTION),
    readStatusCounts(database, THINKFORGE_SESSION_COLLECTION, 'projectMeta.authoringRequestMigration.status'),
    readStatusCounts(database, THINKFORGE_SCRIPT_COLLECTION, 'documentContractMigration.status'),
    readStatusCounts(database, THINKFORGE_DATABANK_COLLECTION, 'dataBankAuthorityMigration.status'),
  ]);
  const alerts: ThinkForgeOperationalDiagnostics['alerts'] = [];

  for (const [name, job] of Object.entries({ observer, refinery, post_mortem: postMortem })) {
    const count = countTerminalFailures(job);
    if (count > 0) alerts.push({ code: `${name}_terminal_failures`, severity: 'critical', count });
  }
  const quarantineCount = (authoringRequests.quarantined ?? 0)
    + (documentContracts.quarantined ?? 0)
    + (dataBankAuthority.quarantined ?? 0);
  if (quarantineCount > 0) {
    alerts.push({ code: 'migration_quarantine_pending', severity: 'warning', count: quarantineCount });
  }

  let document: ThinkForgeDocumentDiagnostics | undefined;
  if (input.sessionId && input.scriptId) {
    const [session, script] = await Promise.all([
      database.collection<ThinkForgeStringIdDocument>(THINKFORGE_SESSION_COLLECTION).findOne(
        { _id: input.sessionId },
        { projection: { _id: 1, projectMeta: 1, activeGeneration: 1 } },
      ),
      database.collection<ThinkForgeStringIdDocument>(THINKFORGE_SCRIPT_COLLECTION).findOne(
        { sessionId: input.sessionId, scriptId: input.scriptId },
        {
          projection: {
            _id: 1,
            sessionId: 1,
            scriptId: 1,
            version: 1,
            documentType: 1,
            contentContract: 1,
            content: 1,
            metadata: 1,
          },
        },
      ),
    ]);
    const documentVersion = toNumberOrNull(script?.version);
    const generationReceipt = documentVersion === null
      ? null
      : await database.collection(THINKFORGE_GENERATION_RECEIPT_COLLECTION).findOne({
          'document.sessionId': input.sessionId,
          'document.scriptId': input.scriptId,
          'document.version': documentVersion,
        });
    document = diagnoseThinkForgeDocumentEvidence({
      sessionId: input.sessionId,
      scriptId: input.scriptId,
      session,
      script,
      generationReceipt,
    });
    if (!document.traceIntegrity.valid) {
      alerts.push({
        code: 'document_trace_integrity_failed',
        severity: 'critical',
        count: document.traceIntegrity.codes.length,
      });
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    configuration: {
      mongo: Boolean(process.env.MONGODB_URI?.trim()),
      qstash: Boolean(process.env.QSTASH_TOKEN?.trim()
        && process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
        && process.env.QSTASH_NEXT_SIGNING_KEY?.trim()),
      cronAuthentication: Boolean(process.env.CRON_SECRET?.trim()),
      vectorStore: Boolean(process.env.UPSTASH_VECTOR_REST_URL?.trim()
        && process.env.UPSTASH_VECTOR_REST_TOKEN?.trim()),
      privateWriterProvider: Boolean(process.env.GOOGLE_API_KEY?.trim()
        || process.env.GEMINI_API_KEY?.trim()
        || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()),
    },
    jobs: { observer, refinery, postMortem },
    migrations: { authoringRequests, documentContracts, dataBankAuthority },
    alerts,
    ...(document ? { document } : {}),
  };
}
