import type { Db } from 'mongodb';

export interface ChatBattleFixtureCleanupCollections {
  projects: string;
  analyses: string;
  chats: string;
  checkpoints: string;
  mgRenderJobs: string;
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
    mgRenderJobs: number;
    assetAliases: number;
  };
}

const DISPOSABLE_FIXTURE_ID = /^proj_chatbattle_[a-z0-9_-]+$/i;

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
      mgRenderJobs: COLLECTIONS.MG_RENDER_JOBS,
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
    throw new Error('Refusing cleanup: project id is not a disposable proj_chatbattle_* fixture.');
  }

  const projects = db.collection(collections.projects);
  const fixture = await projects.findOne(
    { projectId, 'metadata.battleTest.disposable': true },
    { projection: { _id: 1 } },
  );
  if (!fixture) return emptyCleanupResult(projectId, true);

  const [analyses, chats, checkpoints, mgRenderJobs] = await Promise.all([
    db.collection(collections.analyses).deleteMany({ projectId }),
    db.collection(collections.chats).deleteMany({ projectId }),
    db.collection(collections.checkpoints).deleteMany({ projectId }),
    db.collection(collections.mgRenderJobs).deleteMany({ projectId }),
  ]);
  const projectDelete = await projects.deleteOne({
    projectId,
    'metadata.battleTest.disposable': true,
  });
  const remainingFixtures = await projects.countDocuments({
    projectId: { $regex: '^proj_chatbattle_' },
    'metadata.battleTest.disposable': true,
  }, { limit: 1 });
  const aliasDelete = remainingFixtures === 0
    ? await db.collection(collections.mediaAssets).deleteMany({ 'metadata.battleFixtureAlias': true })
    : { deletedCount: 0 };

  return {
    projectId,
    skipped: false,
    deleted: {
      projects: projectDelete.deletedCount,
      analyses: analyses.deletedCount,
      chats: chats.deletedCount,
      checkpoints: checkpoints.deletedCount,
      mgRenderJobs: mgRenderJobs.deletedCount,
      assetAliases: aliasDelete.deletedCount,
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
      mgRenderJobs: 0,
      assetAliases: 0,
    },
  };
}
