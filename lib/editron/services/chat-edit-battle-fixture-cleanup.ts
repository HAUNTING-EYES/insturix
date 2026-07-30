import type { Db } from 'mongodb';

export interface ChatBattleFixtureCleanupCollections {
  projects: string;
  analyses: string;
  chats: string;
  checkpoints: string;
  referenceAttachments: string;
  referenceStyleJobs: string;
  editorialIntentJobs: string;
  deepAnalysisJobs: string;
  dubbingJobs: string;
  mgRenderJobs: string;
  uploadBatches: string;
  mediaAssets: string;
  storyboards: string;
}

export interface ChatBattleFixtureCleanupResult {
  projectId: string;
  skipped: boolean;
  deleted: {
    projects: number;
    analyses: number;
    chats: number;
    checkpoints: number;
    referenceAttachments: number;
    referenceStyleJobs: number;
    editorialIntentJobs: number;
    deepAnalysisJobs: number;
    dubbingJobs: number;
    mgRenderJobs: number;
    uploadBatches: number;
    assetAliases: number;
    storyboards: number;
    generatedSceneAssets: number;
  };
}

const DISPOSABLE_FIXTURE_ID = /^proj_(?:chatbattle|cb)_[a-z0-9_-]+$/i;
const DISPOSABLE_FIXTURE_PREFIX = /^proj_(?:chatbattle|cb)_/i;

export async function cleanupDisposableChatBattleFixture(
  projectId: string,
): Promise<ChatBattleFixtureCleanupResult> {
  const { COLLECTIONS, connectToDatabase } = await import('@/lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  const collections: ChatBattleFixtureCleanupCollections = {
    projects: COLLECTIONS.PROJECTS,
    analyses: COLLECTIONS.PROJECT_ASSET_ANALYSES,
    chats: COLLECTIONS.CHAT_SESSIONS,
    checkpoints: COLLECTIONS.CHECKPOINTS,
    referenceAttachments: COLLECTIONS.CHAT_REFERENCE_ATTACHMENTS,
    referenceStyleJobs: COLLECTIONS.CHAT_REFERENCE_STYLE_JOBS,
    editorialIntentJobs: COLLECTIONS.CHAT_EDITORIAL_INTENT_JOBS,
    deepAnalysisJobs: COLLECTIONS.CHAT_DEEP_ANALYSIS_JOBS,
    dubbingJobs: COLLECTIONS.CHAT_DUBBING_JOBS,
    mgRenderJobs: COLLECTIONS.MG_RENDER_JOBS,
    uploadBatches: COLLECTIONS.MEDIA_UPLOAD_BATCHES,
    mediaAssets: COLLECTIONS.MEDIA_ASSETS,
    storyboards: 'storyboards',
  };
  try {
    const { deleteFromR2, isR2Available } = await import('@/lib/editron/services/r2-service');
    await deleteDisposableStoryboardGeneratedAssets(db, projectId, collections, async (assetId) => {
      if (!isR2Available()) {
        throw new Error(`Cannot clean generated scene asset ${assetId}: R2 is not configured.`);
      }
      await deleteFromR2(assetId);
    });
    return await cleanupDisposableChatBattleFixtureInDatabase(db, projectId, collections);
  } finally {
    await client.close();
  }
}

export async function deleteDisposableStoryboardGeneratedAssets(
  db: Pick<Db, 'collection'>,
  projectId: string,
  collections: Pick<ChatBattleFixtureCleanupCollections, 'projects' | 'storyboards'>,
  deleteAsset: (assetId: string) => Promise<void>,
): Promise<string[]> {
  if (!DISPOSABLE_FIXTURE_ID.test(projectId)) {
    throw new Error('Refusing cleanup: project id is not a disposable chat-battle fixture.');
  }
  const fixture = await db.collection(collections.projects).findOne({
    projectId,
    'metadata.battleTest.disposable': true,
  });
  if (!fixture) return [];
  const storyboard = await db.collection(collections.storyboards).findOne({
    projectId,
    'metadata.battleTest.disposable': true,
  });
  const generatedAssetIds = disposableStoryboardGeneratedAssetIds(storyboard);
  for (const assetId of generatedAssetIds) {
    await deleteAsset(assetId);
  }
  return generatedAssetIds;
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

  const storyboards = db.collection(collections.storyboards);
  const storyboard = await storyboards.findOne({
    projectId,
    'metadata.battleTest.disposable': true,
  });
  const generatedSceneAssetIds = disposableStoryboardGeneratedAssetIds(storyboard);

  const [
    analyses,
    chats,
    checkpoints,
    referenceAttachments,
    referenceStyleJobs,
    editorialIntentJobs,
    deepAnalysisJobs,
    dubbingJobs,
    mgRenderJobs,
    uploadBatches,
    storyboardDelete,
    generatedSceneAssets,
  ] = await Promise.all([
    db.collection(collections.analyses).deleteMany({ projectId }),
    db.collection(collections.chats).deleteMany({ projectId }),
    db.collection(collections.checkpoints).deleteMany({ projectId }),
    db.collection(collections.referenceAttachments).deleteMany({ projectId }),
    db.collection(collections.referenceStyleJobs).deleteMany({ projectId }),
    db.collection(collections.editorialIntentJobs).deleteMany({ projectId }),
    db.collection(collections.deepAnalysisJobs).deleteMany({ projectId }),
    db.collection(collections.dubbingJobs).deleteMany({ projectId }),
    db.collection(collections.mgRenderJobs).deleteMany({ projectId }),
    db.collection(collections.uploadBatches).deleteMany({ projectId }),
    storyboards.deleteOne({
      projectId,
      'metadata.battleTest.disposable': true,
    }),
    generatedSceneAssetIds.length > 0
      ? db.collection(collections.mediaAssets).deleteMany({
          userId: storyboard?.userId,
          assetId: { $in: generatedSceneAssetIds },
        })
      : Promise.resolve({ deletedCount: 0 }),
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
      referenceAttachments: referenceAttachments.deletedCount,
      referenceStyleJobs: referenceStyleJobs.deletedCount,
      editorialIntentJobs: editorialIntentJobs.deletedCount,
      deepAnalysisJobs: deepAnalysisJobs.deletedCount,
      dubbingJobs: dubbingJobs.deletedCount,
      mgRenderJobs: mgRenderJobs.deletedCount,
      uploadBatches: uploadBatches.deletedCount,
      assetAliases: scopedAliasDelete.deletedCount + legacyAliasDelete.deletedCount,
      storyboards: storyboardDelete.deletedCount,
      generatedSceneAssets: Math.max(
        generatedSceneAssetIds.length,
        generatedSceneAssets.deletedCount,
      ),
    },
  };
}

function disposableStoryboardGeneratedAssetIds(
  storyboard: Record<string, any> | null,
): string[] {
  if (!storyboard || storyboard.metadata?.battleTest?.disposable !== true) return [];
  const sourceAssetIds = new Set(
    arrayOfStrings(storyboard.metadata?.battleTest?.sourceSceneAssetIds),
  );
  return [...new Set(
    (Array.isArray(storyboard.scenes) ? storyboard.scenes : [])
      .flatMap((scene: Record<string, any>) => [
        scene?.imageAssetId,
        scene?.videoAssetId,
        scene?.voiceover?.audioAssetId,
        ...(Array.isArray(scene?.generationHistory)
          ? scene.generationHistory.map((entry: Record<string, any>) => entry?.assetId)
          : []),
      ])
      .filter((assetId: unknown): assetId is string => (
        typeof assetId === 'string'
        && assetId.length > 0
        && !sourceAssetIds.has(assetId)
      )),
  )];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
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
      referenceAttachments: 0,
      referenceStyleJobs: 0,
      editorialIntentJobs: 0,
      deepAnalysisJobs: 0,
      dubbingJobs: 0,
      mgRenderJobs: 0,
      uploadBatches: 0,
      assetAliases: 0,
      storyboards: 0,
      generatedSceneAssets: 0,
    },
  };
}
