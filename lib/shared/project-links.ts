import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

export const PROJECT_LINKS_COLLECTION = 'project_links';

export interface ProjectLink {
  universalId: string;
  userId: string;
  brandId?: string;
  sessionId?: string;
  sourceScriptId?: string;
  /** The ProductionBrief this project was authored from (§5.2.7). */
  briefId?: string;
  storyboardIds: string[];
  projectIds: string[];
  videoIds: string[];
  /** Source Ledger referenceIds this project is based on — inherited by Editron/Clickatron (§5.5). */
  referenceIds?: string[];
  thumbnailIds?: string[];
  schemaVersion: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectLinkThumbnailRecord {
  thumbnailId: string;
  sessionId: string;
  variationId: string;
  thumbnailUrl: string;
  imageRef?: string;
  thumbnailRef?: string;
  prompt?: string;
  aspectRatio?: string;
  modelId?: string;
  sourceService?: string;
  sourceSessionId?: string;
  sourceScriptId?: string;
  projectId?: string;
  brandId?: string;
  committedAt: string;
}

async function getCollection() {
  const db = await getDatabase();
  return db.collection<ProjectLink>(PROJECT_LINKS_COLLECTION);
}

export async function createProjectLink(
  userId: string,
  fields: {
    sessionId?: string;
    sourceScriptId?: string;
    briefId?: string;
    storyboardId?: string;
    projectId?: string;
    brandId?: string;
    referenceIds?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<ProjectLink> {
  const col = await getCollection();
  const now = new Date();

  const link: ProjectLink = {
    universalId: `plink_${nanoid(12)}`,
    userId,
    brandId: fields.brandId,
    sessionId: fields.sessionId,
    sourceScriptId: fields.sourceScriptId,
    briefId: fields.briefId,
    storyboardIds: fields.storyboardId ? [fields.storyboardId] : [],
    projectIds: fields.projectId ? [fields.projectId] : [],
    videoIds: [],
    referenceIds: fields.referenceIds ?? [],
    thumbnailIds: [],
    schemaVersion: 1,
    metadata: fields.metadata,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(link as any);
  return link;
}

export async function addStoryboardToLink(
  userId: string,
  universalId: string,
  storyboardId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { universalId, userId },
    { $addToSet: { storyboardIds: storyboardId }, $set: { updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function addProjectToLink(
  userId: string,
  storyboardId: string,
  projectId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { userId, storyboardIds: storyboardId },
    { $addToSet: { projectIds: projectId }, $set: { updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function addProjectToLinkBySessionId(
  userId: string,
  sessionId: string,
  projectId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { userId, sessionId },
    { $addToSet: { projectIds: projectId }, $set: { updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function addVideoToLink(
  userId: string,
  projectId: string,
  videoId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { userId, projectIds: projectId },
    { $addToSet: { videoIds: videoId }, $set: { updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function addReferenceToLink(
  userId: string,
  universalId: string,
  referenceId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { userId, universalId },
    { $addToSet: { referenceIds: referenceId }, $set: { updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function setBriefOnLink(
  userId: string,
  universalId: string,
  briefId: string,
): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { userId, universalId },
    { $set: { briefId, updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function findLinkByReferenceId(
  userId: string,
  referenceId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, referenceIds: referenceId }) as Promise<ProjectLink | null>;
}

export async function recordThumbnailOnLink(
  userId: string,
  universalId: string,
  thumbnail: ProjectLinkThumbnailRecord,
): Promise<boolean> {
  const col = await getCollection();
  await col.updateOne(
    { userId, universalId },
    {
      $pull: {
        'metadata.clickatron.committedThumbnails': {
          thumbnailId: thumbnail.thumbnailId,
        },
      },
    } as any,
  );

  const result = await col.updateOne(
    { userId, universalId },
    {
      $addToSet: { thumbnailIds: thumbnail.thumbnailId },
      $push: {
        'metadata.clickatron.committedThumbnails': {
          $each: [thumbnail],
          $slice: -20,
        },
      },
      $set: {
        'metadata.clickatron.lastCommittedThumbnail': thumbnail,
        'metadata.clickatron.lastCommittedAt': new Date(thumbnail.committedAt),
        updatedAt: new Date(),
      },
    } as any,
  );
  return result.matchedCount > 0;
}

export async function findLinkByStoryboardId(
  userId: string,
  storyboardId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, storyboardIds: storyboardId }) as Promise<ProjectLink | null>;
}

export async function findLinkByProjectId(
  userId: string,
  projectId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, projectIds: projectId }) as Promise<ProjectLink | null>;
}

export async function findLinkByVideoId(
  userId: string,
  videoId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, videoIds: videoId }) as Promise<ProjectLink | null>;
}

export async function findLinksByBrand(
  userId: string,
  brandId: string,
): Promise<ProjectLink[]> {
  const col = await getCollection();
  return col.find({ userId, brandId }).sort({ updatedAt: -1 }).toArray() as Promise<ProjectLink[]>;
}

export async function findLinkByUniversalId(
  userId: string,
  universalId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, universalId }) as Promise<ProjectLink | null>;
}

export async function findLinkBySessionId(
  userId: string,
  sessionId: string,
): Promise<ProjectLink | null> {
  const col = await getCollection();
  return col.findOne({ userId, sessionId }) as Promise<ProjectLink | null>;
}

export interface ProjectLinkSessionDetachmentResult {
  topLevelLinksModified: number;
  thumbnailCollectionsModified: number;
  lastThumbnailLinksModified: number;
}

/**
 * Remove ThinkForge source lineage without deleting downstream Clickatron/Editron assets.
 * Each write is independently idempotent so a durable deletion job can retry after a
 * cross-database failure without losing progress.
 */
export async function detachThinkForgeSessionFromLinks(
  userId: string,
  sessionId: string,
): Promise<ProjectLinkSessionDetachmentResult> {
  const normalizedUserId = userId.trim();
  const normalizedSessionId = sessionId.trim();
  if (!normalizedUserId || !normalizedSessionId) {
    throw new Error('Project-link detachment requires exact user and session identifiers.');
  }

  const col = await getCollection();
  const now = new Date();
  const topLevel = await col.updateMany(
    { userId: normalizedUserId, sessionId: normalizedSessionId },
    {
      $unset: { sessionId: '', sourceScriptId: '' },
      $set: { updatedAt: now },
    },
  );
  const committedThumbnails = await col.updateMany(
    {
      userId: normalizedUserId,
      'metadata.clickatron.committedThumbnails.sourceSessionId': normalizedSessionId,
    },
    {
      $unset: {
        'metadata.clickatron.committedThumbnails.$[thumbnail].sourceSessionId': '',
        'metadata.clickatron.committedThumbnails.$[thumbnail].sourceScriptId': '',
      },
      $set: { updatedAt: now },
    } as any,
    { arrayFilters: [{ 'thumbnail.sourceSessionId': normalizedSessionId }] },
  );
  const lastCommittedThumbnail = await col.updateMany(
    {
      userId: normalizedUserId,
      'metadata.clickatron.lastCommittedThumbnail.sourceSessionId': normalizedSessionId,
    },
    {
      $unset: {
        'metadata.clickatron.lastCommittedThumbnail.sourceSessionId': '',
        'metadata.clickatron.lastCommittedThumbnail.sourceScriptId': '',
      },
      $set: { updatedAt: now },
    } as any,
  );

  return {
    topLevelLinksModified: topLevel.modifiedCount,
    thumbnailCollectionsModified: committedThumbnails.modifiedCount,
    lastThumbnailLinksModified: lastCommittedThumbnail.modifiedCount,
  };
}

export async function removeVideoFromLinks(
  userId: string,
  videoId: string,
): Promise<void> {
  const col = await getCollection();
  await col.updateMany(
    { userId, videoIds: videoId },
    { $pull: { videoIds: videoId } as any, $set: { updatedAt: new Date() } },
  );
}

export async function removeProjectFromLinks(
  userId: string,
  projectId: string,
): Promise<void> {
  const col = await getCollection();
  await col.updateMany(
    { userId, projectIds: projectId },
    { $pull: { projectIds: projectId } as any, $set: { updatedAt: new Date() } },
  );
}

export async function removeStoryboardFromLinks(
  userId: string,
  storyboardId: string,
): Promise<void> {
  const col = await getCollection();
  await col.updateMany(
    { userId, storyboardIds: storyboardId },
    { $pull: { storyboardIds: storyboardId } as any, $set: { updatedAt: new Date() } },
  );
}
