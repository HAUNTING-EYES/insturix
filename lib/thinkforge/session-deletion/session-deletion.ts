import type { mongo } from 'mongoose';
import {
  buildDataBankVectorDeletionTombstoneUpdate,
  getThinkForgeDatabaseConnection,
} from '../services/db';

const COLLECTIONS = {
  sessions: 'thinkforge_sessions',
  scripts: 'thinkforge_scripts',
  chat: 'thinkforge_chat',
  rateUsage: 'thinkforge_rate_usage',
  projects: 'thinkforge_projects',
  artifacts: 'thinkforge_artifacts',
  versions: 'thinkforge_versions',
  contentBlocks: 'thinkforge_content_blocks',
  versionEdges: 'thinkforge_version_edges',
  events: 'thinkforge_events',
  dataBank: 'thinkforge_databank',
  receipts: 'thinkforge_generation_receipts',
  observerJobs: 'thinkforge_observer_jobs',
  refineryJobs: 'thinkforge_refinery_jobs',
  postMortemJobs: 'thinkforge_post_mortem_jobs',
} as const;

const SCRUBBED_JOB_TTL_MS = 24 * 60 * 60_000;
const ACTIVE_STATUSES = ['queued', 'running'] as const;
type StringIdDocument = mongo.Document & { _id: string };

export interface ThinkForgeSessionDeletionInput {
  sessionId: string;
  userId: string;
  orgId: string | null;
  deletionJobId: string;
  deletionJobLeaseToken: string;
}

export interface ThinkForgeSessionDeletionResult {
  sessionDeleted: boolean;
  scriptsDeleted: number;
  chatMessagesDeleted: number;
  eventsDeleted: number;
  receiptsDeleted: number;
  projectMemoriesTombstoned: number;
  approvedMemoriesDetached: number;
  observerJobsCancelled: number;
  refineryJobsCancelled: number;
  postMortemJobsCancelled: number;
  artifactsDeleted: number;
  versionsDeleted: number;
  orphanBlocksDeleted: number;
  projectLinkReferencesDetached: number;
}

export async function purgeThinkForgeSession(
  rawInput: ThinkForgeSessionDeletionInput,
): Promise<ThinkForgeSessionDeletionResult> {
  const input = normalizeInput(rawInput);
  const connection = await getThinkForgeDatabaseConnection();
  const database = connection.db;
  if (!database) throw new Error('ThinkForge session deletion requires an active database.');

  const session = await connection.startSession();
  let result: ThinkForgeSessionDeletionResult | undefined;
  try {
    await session.withTransaction(async () => {
      result = await purgeThinkForgeSessionRecords(database, session, input);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
  if (!result) throw new Error('ThinkForge session deletion transaction did not commit.');
  const { detachThinkForgeSessionFromLinks } = await import('@/lib/shared/project-links');
  const detachedLinks = await detachThinkForgeSessionFromLinks(input.userId, input.sessionId);
  return {
    ...result,
    projectLinkReferencesDetached:
      detachedLinks.topLevelLinksModified
      + detachedLinks.thumbnailCollectionsModified
      + detachedLinks.lastThumbnailLinksModified,
  };
}

export async function purgeThinkForgeSessionRecords(
  database: mongo.Db,
  mongoSession: mongo.ClientSession,
  rawInput: ThinkForgeSessionDeletionInput,
  now = new Date(),
): Promise<ThinkForgeSessionDeletionResult> {
  const input = normalizeInput(rawInput);
  const operation = { session: mongoSession };
  const expiresAt = new Date(now.getTime() + SCRUBBED_JOB_TTL_MS);
  const collection = (name: string) => database.collection<StringIdDocument>(name);

  const deletionJob = await collection(COLLECTIONS.postMortemJobs).findOne({
    _id: input.deletionJobId,
    userId: input.userId,
    orgId: input.orgId,
    status: 'running',
    leaseToken: input.deletionJobLeaseToken,
    'input.sessionId': input.sessionId,
    'input.deleteSessionOnCompletion': true,
  }, operation);
  if (!deletionJob) throw new Error('Session deletion requires the active durable deletion-job lease.');

  const storedSession = await collection(COLLECTIONS.sessions).findOne(
    { _id: input.sessionId },
    operation,
  );
  if (storedSession && !sessionBelongsToActor(storedSession, input)) {
    throw new Error('Session deletion authority no longer matches the stored session.');
  }

  const artifactDocs = await collection(COLLECTIONS.artifacts)
    .find({ projectId: input.sessionId }, { ...operation, projection: { _id: 1 } })
    .toArray();
  const artifactIds = artifactDocs.map((artifact) => artifact._id);
  const versionDocs = artifactIds.length > 0
    ? await collection(COLLECTIONS.versions)
      .find({ artifactId: { $in: artifactIds } }, {
        ...operation,
        projection: { _id: 1, contentBlockRefs: 1 },
      })
      .toArray()
    : [];
  const versionIds = versionDocs.map((version) => version._id);
  const candidateBlockIds = uniqueValues(versionDocs.flatMap((version) => (
    Array.isArray(version.contentBlockRefs) ? version.contentBlockRefs : []
  )));

  const projectMemory = await collection(COLLECTIONS.dataBank).updateMany({
    scope: 'project',
    $or: [{ sessionId: input.sessionId }, { projectId: input.sessionId }],
  }, buildDataBankVectorDeletionTombstoneUpdate(now) as mongo.UpdateFilter<StringIdDocument>, operation);
  const approvedMemory = await collection(COLLECTIONS.dataBank).updateMany({
    scope: 'global',
    $or: [{ sessionId: input.sessionId }, { projectId: input.sessionId }],
  }, {
    $unset: { sessionId: '', projectId: '' },
    $set: { updatedAt: now },
  }, operation);

  const observerMatch = { 'input.sessionId': input.sessionId };
  const observerActive = await collection(COLLECTIONS.observerJobs).updateMany({
    ...observerMatch,
    status: { $in: ACTIVE_STATUSES },
  }, {
    $set: {
      status: 'dead_letter',
      error: { code: 'session_deleted', message: 'Session was deleted.', retryable: false },
      leaseExpiresAt: null,
      updatedAt: now,
      expiresAt,
    },
    $unset: { activeDedupeKey: '', leaseToken: '' },
  }, operation);
  await collection(COLLECTIONS.observerJobs).updateMany(observerMatch, {
    $set: {
      'input.text': '', checkpoint: null, checkpointHash: null, result: null, resultHash: null,
      updatedAt: now, expiresAt,
    },
  }, operation);

  const refinery = collection(COLLECTIONS.refineryJobs);
  const refineryMatch = { sessionId: input.sessionId };
  const refineryActiveMatch = { ...refineryMatch, status: { $in: ACTIVE_STATUSES } };
  await refinery.updateMany({ ...refineryActiveMatch, 'charge.status': 'pending' }, {
    $set: { 'charge.status': 'refunded' },
  }, operation);
  await refinery.updateMany({
    ...refineryActiveMatch,
    'charge.status': 'charged',
    $or: [{ 'charge.amount': 0 }, { 'charge.transactionId': 'no_charge' }],
  }, { $set: { 'charge.status': 'refunded' } }, operation);
  await refinery.updateMany({
    ...refineryActiveMatch,
    'charge.status': 'charged',
    'charge.amount': { $gt: 0 },
    'charge.transactionId': { $ne: 'no_charge' },
  }, { $set: { 'charge.status': 'refund_pending' } }, operation);
  const refineryActive = await refinery.updateMany(refineryActiveMatch, {
    $set: {
      status: 'dead_letter',
      error: { code: 'session_deleted', message: 'Session was deleted.', retryable: false },
      deadLetteredAt: now.toISOString(), leaseToken: null, leaseExpiresAt: null, updatedAt: now.toISOString(),
      expiresAt,
    },
    $unset: { activeDedupeKey: '' },
  }, operation);
  await refinery.updateMany(refineryMatch, {
    $set: { urls: [], result: null, updatedAt: now.toISOString(), expiresAt },
  }, operation);

  const otherPostMortemMatch = {
    _id: { $ne: input.deletionJobId },
    'input.sessionId': input.sessionId,
  };
  const postMortemActive = await collection(COLLECTIONS.postMortemJobs).updateMany({
    ...otherPostMortemMatch,
    status: { $in: ACTIVE_STATUSES },
  }, {
    $set: {
      status: 'dead_letter',
      error: { code: 'session_deleted', message: 'Session was deleted.', retryable: false },
      leaseExpiresAt: null, updatedAt: now, expiresAt,
    },
    $unset: { activeDedupeKey: '', leaseToken: '' },
  }, operation);
  await collection(COLLECTIONS.postMortemJobs).updateMany(otherPostMortemMatch, {
    $set: { checkpoint: null, checkpointHash: null, result: null, resultHash: null, updatedAt: now, expiresAt },
  }, operation);

  const events = await collection(COLLECTIONS.events).deleteMany({
    $or: [{ projectId: input.sessionId }, { sessionId: input.sessionId }],
  }, operation);
  const receipts = await collection(COLLECTIONS.receipts).deleteMany({
    'document.sessionId': input.sessionId,
  }, operation);
  const scripts = await collection(COLLECTIONS.scripts).deleteMany({ sessionId: input.sessionId }, operation);
  const chat = await collection(COLLECTIONS.chat).deleteMany({ sessionId: input.sessionId }, operation);
  await collection(COLLECTIONS.rateUsage).deleteMany({ sessionId: input.sessionId }, operation);

  if (versionIds.length > 0) {
    await collection(COLLECTIONS.versionEdges).deleteMany({
      $or: [{ fromVersionId: { $in: versionIds } }, { toVersionId: { $in: versionIds } }],
    }, operation);
    await collection(COLLECTIONS.versions).deleteMany({ _id: { $in: versionIds } }, operation);
  }
  const artifacts = artifactIds.length > 0
    ? await collection(COLLECTIONS.artifacts).deleteMany({ _id: { $in: artifactIds } }, operation)
    : { deletedCount: 0 };
  await collection(COLLECTIONS.projects).deleteOne({ _id: input.sessionId }, operation);

  let orphanBlocksDeleted = 0;
  if (candidateBlockIds.length > 0) {
    const stillReferencedDocs = await collection(COLLECTIONS.versions).find({
      contentBlockRefs: { $in: candidateBlockIds },
    }, { ...operation, projection: { contentBlockRefs: 1 } }).toArray();
    const stillReferenced = new Set(uniqueValues(stillReferencedDocs.flatMap((version) => (
      Array.isArray(version.contentBlockRefs) ? version.contentBlockRefs : []
    ))).map(String));
    const orphanBlockIds = candidateBlockIds.filter((id) => !stillReferenced.has(String(id)));
    if (orphanBlockIds.length > 0) {
      orphanBlocksDeleted = (await collection(COLLECTIONS.contentBlocks).deleteMany({
        _id: { $in: orphanBlockIds },
      }, operation)).deletedCount;
    }
  }

  const sessionDeletion = await collection(COLLECTIONS.sessions).deleteOne(
    { _id: input.sessionId },
    operation,
  );
  return {
    sessionDeleted: sessionDeletion.deletedCount > 0,
    scriptsDeleted: scripts.deletedCount,
    chatMessagesDeleted: chat.deletedCount,
    eventsDeleted: events.deletedCount,
    receiptsDeleted: receipts.deletedCount,
    projectMemoriesTombstoned: projectMemory.modifiedCount,
    approvedMemoriesDetached: approvedMemory.modifiedCount,
    observerJobsCancelled: observerActive.modifiedCount,
    refineryJobsCancelled: refineryActive.modifiedCount,
    postMortemJobsCancelled: postMortemActive.modifiedCount,
    artifactsDeleted: artifacts.deletedCount,
    versionsDeleted: versionIds.length,
    orphanBlocksDeleted,
    projectLinkReferencesDetached: 0,
  };
}

function normalizeInput(input: ThinkForgeSessionDeletionInput): ThinkForgeSessionDeletionInput {
  const normalized = {
    sessionId: input.sessionId?.trim(),
    userId: input.userId?.trim(),
    orgId: input.orgId?.trim() || null,
    deletionJobId: input.deletionJobId?.trim(),
    deletionJobLeaseToken: input.deletionJobLeaseToken?.trim(),
  };
  if (!normalized.sessionId || !normalized.userId || !normalized.deletionJobId || !normalized.deletionJobLeaseToken) {
    throw new Error('Session deletion requires exact session, actor, job, and lease identifiers.');
  }
  return normalized;
}

function sessionBelongsToActor(
  session: StringIdDocument,
  input: ThinkForgeSessionDeletionInput,
): boolean {
  const storedOrgId = typeof session.orgId === 'string' && session.orgId.trim() ? session.orgId.trim() : null;
  return session.userId === input.userId && storedOrgId === input.orgId;
}

function uniqueValues(values: unknown[]): string[] {
  return [...new Set(values.filter((value) => value !== undefined && value !== null).map(String))];
}
