import { StatefulProjectServicePersistenceV1 } from "./stateful-project-service-persistence-v1";

export function stage25ProjectServiceConflictFixtureV1(input: {
  projectRevision?: number;
  updatedAt?: string;
  movableOverlayStart?: number;
} = {}) {
  const updatedAt = input.updatedAt ?? "2026-08-25T00:00:00.000Z";
  return {
    projectId: "proj_stage25_conflict",
    userId: "user_stage25_conflict",
    name: "Stage 2.5 stateful conflict trial",
    overlays: [
      {
        id: 1,
        type: "video",
        from: 0,
        row: 0,
        durationInFrames: 240,
        sourceStartFrame: 100,
        videoStartTime: 100,
      },
      {
        id: 2,
        type: "text",
        from: input.movableOverlayStart ?? 0,
        row: 1,
        durationInFrames: 20,
        content: "before user edit",
      },
      {
        id: 3,
        type: "text",
        from: 180,
        row: 1,
        durationInFrames: 30,
        content: "ripple tail",
      },
    ],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 240,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    projectRevision: input.projectRevision ?? 7,
    timelineRangeChangeReceipts: [],
    timelineRangeCutLocks: [],
    visibility: "private" as const,
  };
}

export function createStage25ProjectServiceConflictPersistenceV1(input: {
  projectRevision?: number;
  updatedAt?: string;
  movableOverlayStart?: number;
} = {}) {
  return new StatefulProjectServicePersistenceV1(
    stage25ProjectServiceConflictFixtureV1(input),
  );
}
