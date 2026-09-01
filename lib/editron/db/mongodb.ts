/**
 * MongoDB Connection Utility
 * 
 * Provides singleton MongoDB client for server-side operations
 */

import { MongoClient, Db } from 'mongodb';
import { DURABLE_WORKFLOW_JOB_COLLECTION_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { EDITORIAL_PLAN_EXECUTION_DEFINITION_COLLECTION_V1 }
  from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import { EDITORIAL_PLAN_REVISION_COLLECTION_V1 }
  from '@/lib/editron/services/editorial-plan-v1';
import { PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1 }
  from '@/lib/editron/services/project-render-source-cleanup-v1';
import { PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1 }
  from '@/lib/editron/services/chapter-concat-cleanup-v1';
import { CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1 }
  from '@/lib/editron/services/chapter-render-dispatch-v1';
import { CHAPTER_RENDER_RETENTION_RECEIPTS_COLLECTION_V1 }
  from '@/lib/editron/services/render-chapter-retention';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable');
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create new connection with pool sizing for Vercel serverless.
  // Each serverless instance gets its own connection pool.
  // maxPoolSize=10: enough for concurrent requests on one instance
  // minPoolSize=2: keep warm connections to avoid cold-start latency
  // maxIdleTimeMS=30000: close idle connections after 30s (Vercel instances are short-lived)
  // serverSelectionTimeoutMS=5000: fail fast if Atlas is unreachable
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db(dbName);

  // Cache the connection
  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

/**
 * Get MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

/**
 * Collection names
 */
export const COLLECTIONS = {
  PROJECTS: 'projects',
  CHECKPOINTS: 'checkpoints',
  CHAT_SESSIONS: 'chatSessions',
  CHAT_REFERENCE_ATTACHMENTS: 'editron_chat_reference_attachments',
  MEDIA_ASSETS: 'mediaAssets',
  MEDIA_UPLOADS: 'mediaUploads',
  MEDIA_UPLOAD_BATCHES: 'mediaUploadBatches',
  PROJECT_ASSET_ANALYSES: 'editron_asset_analyses',
  PROJECT_RENDER_JOBS: 'editron_render_jobs',
  CHAPTER_RENDER_CHAPTERS: CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1,
  CHAPTER_RENDER_RETENTION_RECEIPTS: CHAPTER_RENDER_RETENTION_RECEIPTS_COLLECTION_V1,
  PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX: PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX: PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  STYLE_PROFILES: 'styleProfiles',
  PROJECT_LINKS: 'project_links',
  MG_RENDER_JOBS: 'editron_mg_render_jobs',
  CHAT_REFERENCE_STYLE_JOBS: 'editron_chat_reference_style_jobs',
  CHAT_EDITORIAL_INTENT_JOBS: 'editron_chat_editorial_intent_jobs',
  CHAT_DEEP_ANALYSIS_JOBS: 'editron_chat_deep_analysis_jobs',
  CHAT_DUBBING_JOBS: 'editron_chat_dubbing_jobs',
  DURABLE_WORKFLOW_JOBS: DURABLE_WORKFLOW_JOB_COLLECTION_V1,
  EDITORIAL_PLAN_REVISIONS: EDITORIAL_PLAN_REVISION_COLLECTION_V1,
  EDITORIAL_PLAN_EXECUTION_DEFINITIONS: EDITORIAL_PLAN_EXECUTION_DEFINITION_COLLECTION_V1,
  LEDGER: 'ledger',
  TREND_REQUESTS: 'trend_requests',
  TRENDS: 'trends',
} as const;

/**
 * Initialize database indexes
 * Call this once during deployment/setup
 */
export async function initializeIndexes(): Promise<void> {
  const db = await getDatabase();

  // Projects indexes
  await db.collection(COLLECTIONS.PROJECTS).createIndexes([
    { key: { projectId: 1 }, name: 'projectId_unique', unique: true },
    { key: { userId: 1, createdAt: -1 }, name: 'userId_createdAt' },
    { key: { userId: 1, updatedAt: -1 }, name: 'userId_updatedAt' },
    { key: { userId: 1, name: 1 }, name: 'userId_name' },
    { key: { orgId: 1, visibility: 1, createdAt: -1 }, name: 'org_visibility_createdAt' },
    { key: { orgId: 1, visibility: 1, updatedAt: -1 }, name: 'org_visibility_updatedAt' },
    { key: { orgId: 1, visibility: 1, name: 1 }, name: 'org_visibility_name' },
    { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
    { key: { brandId: 1, status: 1 }, name: 'brandId_status' },
  ]);

  // Checkpoints indexes with TTL
  await db.collection(COLLECTIONS.CHECKPOINTS).createIndexes([
    { key: { sessionId: 1, timestamp: 1 }, name: 'sessionId_timestamp' },
    { key: { projectId: 1, timestamp: -1 }, name: 'projectId_timestamp' },
    { 
      key: { createdAt: 1 }, 
      name: 'ttl_index',
      expireAfterSeconds: 2592000 // 30 days
    },
  ]);

  // Chat sessions indexes
  await db.collection(COLLECTIONS.CHAT_SESSIONS).createIndexes([
    { key: { sessionId: 1, userId: 1 }, name: 'sessionId_userId', unique: true },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
  ]);

  // Media assets indexes
  await db.collection(COLLECTIONS.MEDIA_ASSETS).createIndexes([
    { key: { userId: 1, uploadedAt: -1, assetId: -1 }, name: 'userId_uploadedAt_assetId' },
    { key: { projectId: 1 }, name: 'projectId' },
    { key: { assetId: 1, userId: 1 }, name: 'assetId_userId', unique: true },
    // LRU eviction candidate queries (ownerAssetFilter + sort by lastUsedAt asc).
    { key: { orgId: 1, lastUsedAt: 1 }, name: 'orgId_lastUsedAt' },
    { key: { userId: 1, lastUsedAt: 1 }, name: 'userId_lastUsedAt' },
  ]);

  // Media uploads tracking (multipart) — TTL on lastActivityAt so active slow uploads survive
  await db.collection(COLLECTIONS.MEDIA_UPLOADS).createIndexes([
    { key: { assetId: 1, userId: 1 }, name: 'assetId_userId', unique: true },
    {
      key: { lastActivityAt: 1 },
      name: 'ttl_lastActivity',
      expireAfterSeconds: 604800, // 7 days
    },
  ]);

  // Media upload batch manifests (one row per user-visible multi-select upload batch)
  await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).createIndexes([
    { key: { uploadBatchId: 1, userId: 1 }, name: 'uploadBatchId_userId_unique', unique: true },
    { key: { userId: 1, updatedAt: -1 }, name: 'userId_updatedAt' },
    { key: { assetIds: 1 }, name: 'assetIds' },
  ]);

  // Per-project asset analysis documents (keeps large multi-upload analyses off project docs)
  await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).createIndexes([
    { key: { projectId: 1, assetId: 1 }, name: 'projectId_assetId_unique', unique: true },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
  ]);

  // Project links indexes (cross-service content lineage)
  await db.collection(COLLECTIONS.PROJECT_LINKS).createIndexes([
    { key: { universalId: 1 }, name: 'universalId_unique', unique: true },
    { key: { userId: 1, brandId: 1 }, name: 'userId_brandId' },
    { key: { userId: 1, sessionId: 1 }, name: 'userId_sessionId' },
    { key: { userId: 1, storyboardIds: 1 }, name: 'userId_storyboardIds' },
    { key: { userId: 1, projectIds: 1 }, name: 'userId_projectIds' },
    { key: { userId: 1, videoIds: 1 }, name: 'userId_videoIds' },
    { key: { userId: 1, referenceIds: 1 }, name: 'userId_referenceIds' },
    { key: { userId: 1, briefId: 1 }, name: 'userId_briefId' },
  ]);

  // Isolated MG renderer jobs. `_id` is a deterministic request hash, so retries and duplicate
  // Director deliveries converge on one job instead of charging/rendering twice.
  await db.collection(COLLECTIONS.MG_RENDER_JOBS).createIndexes([
    { key: { idempotencyKey: 1 }, name: 'idempotencyKey_unique', unique: true },
    { key: { status: 1, nextAttemptAt: 1, createdAt: 1 }, name: 'status_nextAttempt_createdAt' },
    { key: { status: 1, leaseExpiresAt: 1 }, name: 'status_leaseExpiresAt' },
    { key: { userId: 1, projectId: 1, createdAt: -1 }, name: 'userId_projectId_createdAt' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  // Provider render outputs that became stale after dispatch are deleted by a
  // leased, idempotent cleanup consumer. Each query branch has its own index.
  await db.collection(COLLECTIONS.PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX).createIndexes([
    { key: { status: 1, availableAt: 1, createdAt: 1 }, name: 'status_available_createdAt' },
    { key: { status: 1, 'lease.leaseExpiresAt': 1 }, name: 'status_leaseExpiresAt' },
  ]);

  // Strict render admissions whose provider response was ambiguous are
  // reconciled in bounded attempt order without rerendering or refunding.
  await db.collection(COLLECTIONS.PROJECT_RENDER_JOBS).createIndexes([
    {
      key: {
        artifactState: 1,
        'projectRenderSnapshotBinding.scope': 1,
        'dispatch.version': 1,
        'dispatch.phase': 1,
        status: 1,
        'dispatch.attemptStartedAt': 1,
        _id: 1,
      },
      name: 'dispatch_recovery_attempt_job',
    },
    {
      key: {
        artifactState: 1,
        'projectRenderSnapshotBinding.scope': 1,
        'dispatch.version': 1,
        'dispatch.phase': 1,
        'dispatch.billingState': 1,
        status: 1,
        'dispatch.billingUnknownAt': 1,
        _id: 1,
      },
      name: 'billing_recovery_unknown_job_v1',
    },
  ]);

  // Strict chapter children retain their own provider-call evidence inside the
  // chapter aggregate. These indexes let the later recovery owner find
  // uncertain attempts without treating a parent aggregate row as a provider
  // child receipt.
  await db.collection(COLLECTIONS.CHAPTER_RENDER_CHAPTERS).createIndexes([
    {
      key: {
        'projectRenderSnapshotBinding.scope': 1,
        'projectRenderSnapshotBinding.bindingHash': 1,
        'chapters.dispatch.version': 1,
        'chapters.dispatch.phase': 1,
        'chapters.dispatch.childIndex': 1,
        'chapters.dispatch.attemptStartedAt': 1,
        _id: 1,
      },
      name: 'chapter_child_dispatch_recovery_attempt_v1',
    },
    {
      key: {
        'projectRenderSnapshotBinding.scope': 1,
        'projectRenderSnapshotBinding.bindingHash': 1,
        'chapters.dispatch.version': 1,
        'chapters.dispatch.phase': 1,
        'chapters.dispatch.childIndex': 1,
        'chapters.dispatch.providerRenderId': 1,
        'chapters.dispatch.providerBucketName': 1,
        'chapters.dispatch.providerRegion': 1,
        _id: 1,
      },
      name: 'chapter_child_dispatch_recovery_provider_v1',
    },
    {
      key: {
        artifactLifecycleVersion: 1,
        artifactState: 1,
        retentionState: 1,
        expiresAt: 1,
        _id: 1,
      },
      name: 'chapter_retention_due_v1',
    },
  ]);

  // Audit tombstones survive deletion of the transient chapter aggregate. The
  // retention owner writes one in the same transaction as the exact row delete.
  await db.collection(COLLECTIONS.CHAPTER_RENDER_RETENTION_RECEIPTS).createIndexes([
    { key: { chapterJobId: 1 }, name: 'chapter_job_id_unique_v1', unique: true },
    { key: { deletedAt: 1, _id: 1 }, name: 'chapter_deleted_at_v1' },
  ]);

  // Concat output is a separate S3 object and has its own leased cleanup owner.
  // Each claim branch has a matching index so expired leases cannot strand work.
  await db.collection(COLLECTIONS.PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX).createIndexes([
    { key: { status: 1, availableAt: 1, createdAt: 1 }, name: 'chapter_concat_status_available_createdAt' },
    { key: { status: 1, 'lease.leaseExpiresAt': 1 }, name: 'chapter_concat_status_leaseExpiresAt' },
  ]);

  // Project-scoped documents and public URLs attached to AI chat. The extracted content is persisted
  // once so later turns never need to trust a caller URL or re-parse an upload.
  await db.collection(COLLECTIONS.CHAT_REFERENCE_ATTACHMENTS).createIndexes([
    { key: { referenceId: 1 }, name: 'referenceId_unique', unique: true },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
    { key: { projectId: 1, status: 1, leaseExpiresAt: 1 }, name: 'project_status_lease' },
  ]);

  // Durable chat reference-style workflows. A deterministic idempotency key prevents
  // retries or duplicate model calls from extracting/applying the same reference twice.
  await db.collection(COLLECTIONS.CHAT_REFERENCE_STYLE_JOBS).createIndexes([
    { key: { idempotencyKey: 1 }, name: 'idempotencyKey_unique', unique: true },
    { key: { status: 1, leaseExpiresAt: 1, createdAt: 1 }, name: 'status_lease_createdAt' },
    { key: { status: 1, nextAttemptAt: 1, updatedAt: 1 }, name: 'status_nextAttempt_updatedAt' },
    { key: { userId: 1, projectId: 1, createdAt: -1 }, name: 'userId_projectId_createdAt' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  // Project-wide chat intent execution can outlive an HTTP/SSE turn. Dedicated leased jobs keep
  // Director retries idempotent and preserve terminal receipts without bloating the project doc.
  await db.collection(COLLECTIONS.CHAT_EDITORIAL_INTENT_JOBS).createIndexes([
    { key: { idempotencyKey: 1 }, name: 'idempotencyKey_unique', unique: true },
    { key: { status: 1, leaseExpiresAt: 1, createdAt: 1 }, name: 'status_lease_createdAt' },
    {
      key: { status: 1, pendingChildJobIds: 1, projectId: 1, userId: 1 },
      name: 'status_pendingChild_project_user',
    },
    { key: { userId: 1, projectId: 1, createdAt: -1 }, name: 'userId_projectId_createdAt' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  // Chat subclip analysis is resolved against an immutable project revision, then executed by a
  // leased worker. TTL cleanup keeps completed and abandoned read-only jobs bounded.
  await db.collection(COLLECTIONS.CHAT_DEEP_ANALYSIS_JOBS).createIndexes([
    { key: { status: 1, leaseExpiresAt: 1 }, name: 'status_leaseExpiresAt' },
    { key: { userId: 1, projectId: 1, createdAt: -1 }, name: 'userId_projectId_createdAt' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  // Dialogue dubbing can span translation, source separation and multiple TTS requests.
  // Leases plus TTL make every stage resumable without keeping a Vercel request open.
  await db.collection(COLLECTIONS.CHAT_DUBBING_JOBS).createIndexes([
    { key: { idempotencyKey: 1 }, name: 'idempotencyKey_unique', unique: true },
    { key: { status: 1, leaseExpiresAt: 1 }, name: 'status_leaseExpiresAt' },
    { key: { userId: 1, projectId: 1, createdAt: -1 }, name: 'userId_projectId_createdAt' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  // Shared durable operation record. Queue transports deliver work but never
  // own job identity, leases, retry/cancellation state or terminal receipts.
  await db.collection(COLLECTIONS.DURABLE_WORKFLOW_JOBS).createIndexes([
    { key: { tenantId: 1, idempotencyKey: 1 }, name: 'tenant_idempotency_unique', unique: true },
    { key: { status: 1, nextAttemptAt: 1, updatedAt: 1 }, name: 'status_retry_updated' },
    { key: { status: 1, leaseExpiresAt: 1 }, name: 'status_lease_expires' },
    {
      key: { tenantId: 1, userId: 1, projectId: 1, createdAt: -1 },
      name: 'tenant_user_project_created',
    },
    { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
  ]);

  // PlanService owns immutable accepted plan revisions and their bounded
  // execution definitions. Workflow transports reference these records; they
  // never become another project/timeline authority.
  await db.collection(COLLECTIONS.EDITORIAL_PLAN_REVISIONS).createIndexes([
    {
      key: { 'plan.tenantId': 1, 'plan.projectId': 1, 'plan.planId': 1, 'plan.planRevision': 1 },
      name: 'tenant_project_plan_revision_unique', unique: true,
    },
    {
      key: { 'plan.tenantId': 1, 'plan.userId': 1, 'plan.projectId': 1, 'plan.planId': 1, 'plan.planRevision': -1 },
      name: 'tenant_user_project_plan_latest',
    },
  ]);
  await db.collection(COLLECTIONS.EDITORIAL_PLAN_EXECUTION_DEFINITIONS).createIndexes([
    {
      key: { 'definition.tenantId': 1, 'definition.projectId': 1, 'definition.definitionId': 1 },
      name: 'tenant_project_definition_unique', unique: true,
    },
    {
      key: { 'definition.tenantId': 1, 'definition.projectId': 1, 'definition.sourcePlanBinding.planId': 1, 'definition.sourcePlanBinding.planRevision': 1 },
      name: 'tenant_project_source_plan_revision',
    },
  ]);

  // Source Ledger — analyze-once store keyed by referenceId, deduped by platform URL/ID +
  // chromaprint, scoped to the owner (org for agencies, else the individual user).
  await db.collection(COLLECTIONS.LEDGER).createIndexes([
    { key: { referenceId: 1 }, name: 'referenceId_unique', unique: true },
    { key: { 'owner.userId': 1, dedupeKeys: 1 }, name: 'ownerUser_dedupeKeys' },
    { key: { 'owner.orgId': 1, dedupeKeys: 1 }, name: 'ownerOrg_dedupeKeys' },
    { key: { 'owner.userId': 1, analyzedAt: -1 }, name: 'ownerUser_analyzedAt' },
  ]);

  // Insturix Trends demand signal — one row per (trend, user). The unique index makes
  // countDocuments({trendKey}) a DISTINCT-user count (a repeat request can't inflate demand).
  await db.collection(COLLECTIONS.TREND_REQUESTS).createIndexes([
    { key: { trendKey: 1, userId: 1 }, name: 'trendKey_userId_unique', unique: true },
  ]);

  // Insturix Trends — the ranked trend list the cron persists for the UI (one row per trend).
  await db.collection(COLLECTIONS.TRENDS).createIndexes([
    { key: { trendKey: 1 }, name: 'trendKey_unique', unique: true },
    { key: { rankScore: -1 }, name: 'rankScore' },
  ]);

  console.log('Database indexes initialized successfully');
}
