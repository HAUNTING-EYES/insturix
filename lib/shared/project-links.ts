import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

export const PROJECT_LINKS_COLLECTION = 'project_links';

export interface ProjectLink {
  universalId: string;
  userId: string;
  brandId?: string;
  sessionId?: string;
  sourceScriptId?: string;
  storyboardIds: string[];
  projectIds: string[];
  videoIds: string[];
  schemaVersion: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
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
    storyboardId?: string;
    brandId?: string;
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
    storyboardIds: fields.storyboardId ? [fields.storyboardId] : [],
    projectIds: [],
    videoIds: [],
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
