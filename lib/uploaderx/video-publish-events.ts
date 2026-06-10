import { getDatabase } from "@/lib/editron/db/mongodb";
import { emitBrandEvent } from "@/lib/shared/brand-events";
import { findLinkByVideoId } from "@/lib/shared/project-links";
import { transitionProjectStatus, type ProjectStatus } from "@/lib/shared/project-status";
import UploaderXVideo from "@/schemas/uploaderx-video";

export type UploaderXPublishPlatform =
  | "instagram"
  | "twitter"
  | "linkedin"
  | "youtube"
  | "facebook";

export type UploaderXPublishStatusTransition =
  | "transitioned_to_published"
  | "already_published";

export type UploaderXVideoPublishedResult =
  | {
      emitted: true;
      eventId: string;
      projectId: string;
      statusTransition: UploaderXPublishStatusTransition;
    }
  | {
      emitted: false;
      projectId?: string;
      statusTransition?: UploaderXPublishStatusTransition;
      reason:
        | "missing_video_uuid"
        | "missing_video_record"
        | "missing_project_link"
        | "missing_quality_score"
        | "missing_platform_post_id"
        | "missing_platform_url"
        | "project_not_publish_ready"
        | "project_status_transition_failed";
    };

export interface EmitUploaderXVideoPublishedInput {
  userId: string;
  videoUuid?: string | null;
  platform: UploaderXPublishPlatform;
  platformPostId: string;
  platformUrl: string;
  accountUsername?: string | null;
  mediaType?: string | null;
  postType?: string | null;
  organizationId?: string | null;
}

interface UploaderXVideoPublishRecord {
  videoUuid: string;
  userId: string;
  editronProjectId?: string | null;
}

interface ProjectPublishMetadata {
  brandId?: string | null;
  name?: string | null;
  qualityScore?: unknown;
  sourceSessionId?: string | null;
  status?: unknown;
}

export async function emitUploaderXVideoPublished(
  input: EmitUploaderXVideoPublishedInput,
): Promise<UploaderXVideoPublishedResult> {
  const videoUuid = nonEmptyString(input.videoUuid);
  if (!videoUuid) {
    return { emitted: false, reason: "missing_video_uuid" };
  }

  const platformPostId = nonEmptyString(input.platformPostId);
  if (!platformPostId) {
    return { emitted: false, reason: "missing_platform_post_id" };
  }

  const platformUrl = nonEmptyString(input.platformUrl);
  if (!platformUrl) {
    return { emitted: false, reason: "missing_platform_url" };
  }

  const video = await UploaderXVideo.findOne({
    userId: input.userId,
    videoUuid,
  }).lean<UploaderXVideoPublishRecord | null>();

  if (!video) {
    return { emitted: false, reason: "missing_video_record" };
  }

  const projectId =
    nonEmptyString(video.editronProjectId) ||
    (await resolveLinkedProjectId(input.userId, videoUuid));

  if (!projectId) {
    return { emitted: false, reason: "missing_project_link" };
  }

  const db = await getDatabase();
  const project = await db.collection<ProjectPublishMetadata>("projects").findOne(
    { userId: input.userId, projectId },
    { projection: { brandId: 1, name: 1, qualityScore: 1, sourceSessionId: 1, status: 1 } },
  );

  const projectStatus = publishReadyStatus(project?.status);
  if (!projectStatus) {
    return { emitted: false, projectId, reason: "project_not_publish_ready" };
  }

  let statusTransition: UploaderXPublishStatusTransition = "already_published";
  if (projectStatus === "rendered") {
    const statusResult = await transitionProjectStatus(
      projectId,
      input.userId,
      "published",
      "uploaderx_publish",
    );

    if (!statusResult.success) {
      return { emitted: false, projectId, reason: "project_status_transition_failed" };
    }

    statusTransition = "transitioned_to_published";
  }

  const qualityScore = finiteNumber(project?.qualityScore);
  if (qualityScore === undefined) {
    return { emitted: false, projectId, statusTransition, reason: "missing_quality_score" };
  }

  const payload: Record<string, unknown> = {
    videoUuid,
    platform: input.platform,
    platformPostId,
    platformUrl,
    qualityScore,
    projectStatusAtPublish: projectStatus,
  };

  setOptionalString(payload, "accountUsername", input.accountUsername);
  setOptionalString(payload, "mediaType", input.mediaType);
  setOptionalString(payload, "postType", input.postType);
  setOptionalString(payload, "organizationId", input.organizationId);
  setOptionalString(payload, "sessionId", project?.sourceSessionId);
  setOptionalString(payload, "projectName", project?.name);

  const eventId = await emitBrandEvent({
    userId: input.userId,
    projectId,
    brandId: nonEmptyString(project?.brandId),
    service: "uploaderx",
    type: "video_published",
    payload,
  });

  return { emitted: true, eventId, projectId, statusTransition };
}

async function resolveLinkedProjectId(
  userId: string,
  videoUuid: string,
): Promise<string | undefined> {
  const link = await findLinkByVideoId(userId, videoUuid);
  const linkedProjectId = link?.projectIds.find((id) => Boolean(nonEmptyString(id)));
  return nonEmptyString(linkedProjectId);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function publishReadyStatus(value: unknown): Extract<ProjectStatus, "rendered" | "published"> | undefined {
  return value === "rendered" || value === "published" ? value : undefined;
}

function setOptionalString(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const normalized = nonEmptyString(value);
  if (normalized) {
    target[key] = normalized;
  }
}
