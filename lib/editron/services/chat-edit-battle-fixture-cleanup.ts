import type { Db } from 'mongodb';

export interface ChatBattleFixtureCleanupCollections {
  projects: string;
  analyses: string;
  chats: string;
  checkpoints: string;
  deepAnalysisJobs: string;
  dubbingJobs: string;
  mgRenderJobs: string;
  uploadBatches: string;
  mediaAssets: string;
}

export interface ChatBattleFixtureCleanupResult {
  projectId: string;
  skipped: boolean;
  deleted: {
    projects: number;
    analyses: number;
    chats: number;
    checkpoints: number;
    deepAnalysisJobs: number;
    dubbingJobs: number;
    mgRenderJobs: number;
    uploadBatches: number;
    assetAliases: number;
  };
}

const DISPOSABLE_FIXTURE_ID = /^proj_(?:chatbattle|cb)_[a-z0-9_-]+$/i;
const DISPOSABLE_FIXTURE_PREFIX = /^proj_(?:chatbattle|cb)_/i;

export async function cleanupDisposableChatBattleFixture(
  projectId: string,
): Promise<ChatBattleFixtureCleanupResult> {
  const { COLLECTIONS, connectToDatabase } = await import('@/lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  try {
    return await cleanupDisposableChatBattleFixtureInDatabase(db, projectId, {
      projects: COLLECTIONS.PROJECTS,
      analyses: COLLECTIONS.PROJECT_ASSET_ANALYSES,
      chats: COLLECTIONS.CHAT_SESSIONS,
      checkpoints: COLLECTIONS.CHECKPOINTS,
      deepAnalysisJobs: COLLECTIONS.CHAT_DEEP_ANALYSIS_JOBS,
      dubbingJobs: COLLECTIONS.CHAT_DUBBING_JOBS,
      mgRenderJobs: COLLECTIONS.MG_RENDER_JOBS,
      uploadBatches: COLLECTIONS.MEDIA_UPLOAD_BATCHES,
      mediaAssets: COLLECTIONS.MEDIA_ASSETS,
    });
  } finally {
    await client.close();
  }
}

export async function cleanupDisposableChatBattleFixtureInDatabase(
  db: Pick<Db, 'collection'>,
  projectId: string,
  collections: ChatBattleFixtureCleanupCollections,
): Promise<ChatBattleFixtureCleanupResult> {
  if (!DISPOSABLE_FIXTURE_ID.test(projectId)) {
    throw new Error('Refusing cleanup: project id is not a disposable chat-battle fixture.');
  }

  const projects = db.collection(collections.projects);
  const fixture = await projects.findOne(
    { projectId, 'metadata.battleTest.disposable': true },
    { projection: { _id: 1 } },
  );
  if (!fixture) return emptyCleanupResult(projectId, true);

  const [
    analyses,
    chats,
    checkpoints,
    deepAnalysisJobs,
    dubbingJobs,
    mgRenderJobs,
    uploadBatches,
  ] = await Promise.all([
    db.collection(collections.analyses).deleteMany({ projectId }),
    db.collection(collections.chats).deleteMany({ projectId }),
    db.collection(collections.checkpoints).deleteMany({ projectId }),
    db.collection(collections.deepAnalysisJobs).deleteMany({ projectId }),
    db.collection(collections.dubbingJobs).deleteMany({ projectId }),
    db.collection(collections.mgRenderJobs).deleteMany({ projectId }),
    db.collection(collections.uploadBatches).deleteMany({ projectId }),
  ]);
  const projectDelete = await projects.deleteOne({
    projectId,
    'metadata.battleTest.disposable': true,
  });
  const scopedAliasDelete = await db.collection(collections.mediaAssets).deleteMany({
    'metadata.battleFixtureAlias': true,
    'metadata.battleFixtureProjectId': projectId,
  });
  const remainingFixtures = await projects.countDocuments({
    projectId: { $regex: DISPOSABLE_FIXTURE_PREFIX },
    'metadata.battleTest.disposable': true,
  }, { limit: 1 });
  const legacyAliasDelete = remainingFixtures === 0
    ? await db.collection(collections.mediaAssets).deleteMany({
        'metadata.battleFixtureAlias': true,
        'metadata.battleFixtureProjectId': { $exists: false },
      })
    : { deletedCount: 0 };

  return {
    projectId,
    skipped: false,
    deleted: {
      projects: projectDelete.deletedCount,
      analyses: analyses.deletedCount,
      chats: chats.deletedCount,
      checkpoints: checkpoints.deletedCount,
      deepAnalysisJobs: deepAnalysisJobs.deletedCount,
      dubbingJobs: dubbingJobs.deletedCount,
      mgRenderJobs: mgRenderJobs.deletedCount,
      uploadBatches: uploadBatches.deletedCount,
      assetAliases: scopedAliasDelete.deletedCount + legacyAliasDelete.deletedCount,
    },
  };
}

function emptyCleanupResult(projectId: string, skipped: boolean): ChatBattleFixtureCleanupResult {
  return {
    projectId,
    skipped,
    deleted: {
      projects: 0,
      analyses: 0,
      chats: 0,
      checkpoints: 0,
      deepAnalysisJobs: 0,
      dubbingJobs: 0,
      mgRenderJobs: 0,
      uploadBatches: 0,
      assetAliases: 0,
    },
  };
}
