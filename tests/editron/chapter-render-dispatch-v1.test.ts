import { describe, expect, it, vi } from "vitest";

import {
  bindChapterChildDispatchV1,
  ChapterChildDispatchSchemaV1,
  createChapterChildDispatchIdentityV1,
  createChapterChildDispatchV1,
  fenceChapterChildProjectRevisionV1,
  markChapterChildDispatchAttemptingV1,
  quarantineChapterChildDispatchV1,
  reconcileChapterChildTerminalCallbackV1,
} from "@/lib/editron/services/chapter-render-dispatch-v1";
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";

const PARENT_ADMISSION_ID = "chr_123456789012";
const OWNER_ID = "chapter-dispatch-owner";
const PROJECT_ID = "chapter-dispatch-project";
const PROJECT_REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-08-31T00:00:00.000Z",
};
const PROVIDER_TUPLE = {
  providerRenderId: "child-render-1",
  bucketName: "remotion-child-output",
  region: "us-east-1",
};

function makeBinding() {
  const project = {
    overlays: [],
    durationInFrames: 120,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: "preview" },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: PARENT_ADMISSION_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: PROJECT_REVISION,
    sequenceId: "sequence-1",
    compositionId: "composition-1",
    renderContract: { renderer: "remotion-lambda", codec: "h264" },
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function baseInput() {
  const binding = makeBinding();
  const dispatch = createChapterChildDispatchV1({
    parentAdmissionId: PARENT_ADMISSION_ID,
    childIndex: 0,
    bindingHash: binding.bindingHash,
  });
  return { binding, dispatch };
}

function acknowledgedResult(matchedCount = 1, modifiedCount = 1) {
  return { acknowledged: true, matchedCount, modifiedCount };
}

function callbackParent() {
  const { binding, dispatch } = baseInput();
  return {
    binding,
    dispatch,
    row: {
      _id: PARENT_ADMISSION_ID,
      projectRenderSnapshotBinding: binding,
      chapters: [{
        index: 0,
        status: "rendering",
        renderId: PROVIDER_TUPLE.providerRenderId,
        bucketName: PROVIDER_TUPLE.bucketName,
        region: PROVIDER_TUPLE.region,
        dispatch: {
          ...dispatch,
          phase: "ATTEMPTING" as const,
          attemptStartedAt: new Date("2026-09-01T00:00:01.000Z"),
        },
      }],
    },
  };
}

describe("chapter child dispatch ledger v1", () => {
  it("derives a stable parent-child-snapshot token and rejects incomplete UNKNOWN evidence", () => {
    const { binding, dispatch } = baseInput();

    expect(dispatch.phase).toBe("NOT_ATTEMPTED");
    expect(dispatch.attemptToken).toBe(
      createChapterChildDispatchIdentityV1({
        parentAdmissionId: PARENT_ADMISSION_ID,
        childIndex: 0,
        bindingHash: binding.bindingHash,
      }).attemptToken,
    );
    expect(createChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      bindingHash: binding.bindingHash,
    })).toEqual(dispatch);
    expect(createChapterChildDispatchIdentityV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 1,
      bindingHash: binding.bindingHash,
    }).attemptToken).not.toBe(dispatch.attemptToken);

    const malformedUnknown = {
      ...dispatch,
      phase: "UNKNOWN" as const,
      providerAcceptedAt: new Date("2026-09-01T00:00:02.000Z"),
      unknownAt: new Date("2026-09-01T00:00:03.000Z"),
      unknownReason: "ambiguous provider response",
      providerRenderId: PROVIDER_TUPLE.providerRenderId,
      providerBucketName: PROVIDER_TUPLE.bucketName,
      providerRegion: PROVIDER_TUPLE.region,
    };
    expect(ChapterChildDispatchSchemaV1.safeParse(malformedUnknown).success).toBe(false);
  });

  it("requires an actual marker modification before binding an exact provider tuple", async () => {
    const { binding, dispatch } = baseInput();
    const updateOne = vi.fn().mockResolvedValueOnce(acknowledgedResult(1, 0));
    const collection = { updateOne } as any;

    const marker = await markChapterChildDispatchAttemptingV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      now: new Date("2026-09-01T00:00:01.000Z"),
      collection,
    });

    expect(marker).toEqual({ ok: false, status: "NOT_CURRENT", reason: "DISPATCH_NOT_READY" });
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it("binds once, then proves an exact BOUND replay without rewriting timestamps", async () => {
    const { binding, dispatch } = baseInput();
    const attemptStartedAt = new Date("2026-09-01T00:00:01.000Z");
    const providerAcceptedAt = new Date("2026-09-01T00:00:02.000Z");
    const providerBoundAt = new Date("2026-09-01T00:00:03.000Z");
    const boundDispatch = {
      ...dispatch,
      phase: "BOUND" as const,
      attemptStartedAt,
      providerAcceptedAt,
      providerBoundAt,
      providerRenderId: PROVIDER_TUPLE.providerRenderId,
      providerBucketName: PROVIDER_TUPLE.bucketName,
      providerRegion: PROVIDER_TUPLE.region,
    };

    const firstUpdate = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult())
      .mockResolvedValueOnce(acknowledgedResult());
    const firstCollection = { updateOne: firstUpdate } as any;
    const marker = await markChapterChildDispatchAttemptingV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      now: attemptStartedAt,
      collection: firstCollection,
    });
    expect(marker.ok).toBe(true);
    const bound = await bindChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      now: providerBoundAt,
      collection: firstCollection,
    });
    expect(bound).toEqual({ ok: true, status: "CURRENT", phase: "BOUND" });

    const replayUpdate = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult(0, 0))
      .mockResolvedValueOnce(acknowledgedResult(0, 0));
    const replayFindOne = vi.fn().mockResolvedValue({
      _id: PARENT_ADMISSION_ID,
      chapters: [{
        index: 0,
        status: "completed",
        renderId: PROVIDER_TUPLE.providerRenderId,
        bucketName: PROVIDER_TUPLE.bucketName,
        region: PROVIDER_TUPLE.region,
        dispatch: boundDispatch,
      }],
    });
    const replayCollection = { updateOne: replayUpdate, findOne: replayFindOne } as any;
    const replay = await bindChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      now: new Date("2026-09-01T00:01:00.000Z"),
      collection: replayCollection,
    });

    expect(replay).toEqual({ ok: true, status: "CURRENT", phase: "BOUND" });
    expect(replayFindOne).toHaveBeenCalledTimes(1);
    expect(replayUpdate.mock.calls).toHaveLength(2);
    for (const [filter] of replayUpdate.mock.calls) {
      expect(filter.chapters.$elemMatch["dispatch.phase"]).not.toBe("BOUND");
    }
    expect(boundDispatch.providerAcceptedAt).toBe(providerAcceptedAt);
    expect(boundDispatch.providerBoundAt).toBe(providerBoundAt);
  });

  it("preserves acceptance evidence when recovering or quarantining an UNKNOWN tuple", async () => {
    const { binding, dispatch } = baseInput();
    const attemptStartedAt = new Date("2026-09-01T00:00:01.000Z");
    const providerAcceptedAt = new Date("2026-09-01T00:00:02.000Z");
    const unknownDispatch = {
      ...dispatch,
      phase: "UNKNOWN" as const,
      attemptStartedAt,
      providerAcceptedAt,
      unknownAt: new Date("2026-09-01T00:00:03.000Z"),
      unknownReason: "provider response/write boundary was ambiguous",
      providerRenderId: PROVIDER_TUPLE.providerRenderId,
      providerBucketName: PROVIDER_TUPLE.bucketName,
      providerRegion: PROVIDER_TUPLE.region,
    };
    expect(ChapterChildDispatchSchemaV1.safeParse(unknownDispatch).success).toBe(true);

    const bindUpdate = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult(0, 0))
      .mockResolvedValueOnce(acknowledgedResult());
    const bound = await bindChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      now: new Date("2026-09-01T00:00:04.000Z"),
      collection: { updateOne: bindUpdate } as any,
    });
    expect(bound.ok).toBe(true);
    expect(bindUpdate.mock.calls[1][1].$set).not.toHaveProperty(
      "chapters.$.dispatch.providerAcceptedAt",
    );

    const quarantineUpdate = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult(0, 0))
      .mockResolvedValueOnce(acknowledgedResult());
    const quarantined = await quarantineChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      error: "recovery boundary remained uncertain",
      now: new Date("2026-09-01T00:00:05.000Z"),
      collection: { updateOne: quarantineUpdate } as any,
    });
    expect(quarantined.ok).toBe(true);
    expect(quarantineUpdate.mock.calls[1][1].$set).not.toHaveProperty(
      "chapters.$.dispatch.providerAcceptedAt",
    );
  });

  it("never attaches a provider tuple to a child without a durable attempt marker", async () => {
    const { binding, dispatch } = baseInput();
    const updateOne = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult(0, 0))
      .mockResolvedValueOnce(acknowledgedResult(0, 0));

    const result = await quarantineChapterChildDispatchV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      binding,
      attemptToken: dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      error: "provider tuple cannot precede durable attempt evidence",
      now: new Date("2026-09-01T00:00:06.000Z"),
      collection: { updateOne } as any,
    });

    expect(result).toEqual({
      ok: false,
      status: "NOT_CURRENT",
      reason: "DISPATCH_NOT_READY",
    });
    expect(updateOne).toHaveBeenCalledTimes(2);
    for (const [filter] of updateOne.mock.calls) {
      expect(filter.chapters.$elemMatch["dispatch.phase"].$in).not.toContain("NOT_ATTEMPTED");
      expect(filter.chapters.$elemMatch["dispatch.attemptStartedAt"]).toEqual({ $exists: true });
    }
  });

  it("fences the exact live project revision before bind and terminal callback writes", async () => {
    const fixture = callbackParent();
    const projectRevisionReader = vi.fn().mockResolvedValue(PROJECT_REVISION);
    const updateOne = vi.fn()
      .mockResolvedValueOnce(acknowledgedResult())
      .mockResolvedValueOnce(acknowledgedResult());
    const result = await reconcileChapterChildTerminalCallbackV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      bindingHash: fixture.binding.bindingHash,
      attemptToken: fixture.dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      event: {
        type: "success",
        outputUrl: "https://render.example.test/chapter-0.mp4",
        outputSize: 42_000,
      },
      projectRevisionReader,
      collection: {
        findOne: vi.fn().mockResolvedValue(fixture.row),
        updateOne,
      } as any,
    });

    expect(result).toEqual({ ok: true, status: "RECONCILED" });
    expect(projectRevisionReader).toHaveBeenCalledTimes(2);
    expect(projectRevisionReader).toHaveBeenCalledWith(OWNER_ID, PROJECT_ID);
    expect(updateOne).toHaveBeenCalledTimes(2);
    const terminalFilter = updateOne.mock.calls[1]![0];
    expect(terminalFilter).toMatchObject({
      "projectRenderSnapshotBinding.ownerId": OWNER_ID,
      "projectRenderSnapshotBinding.projectId": PROJECT_ID,
      "projectRenderSnapshotBinding.projectRevision.value": PROJECT_REVISION.value,
      "projectRenderSnapshotBinding.bindingHash": fixture.binding.bindingHash,
    });
  });

  it("rejects a stale callback before binding provider evidence", async () => {
    const fixture = callbackParent();
    const updateOne = vi.fn();
    const result = await reconcileChapterChildTerminalCallbackV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      bindingHash: fixture.binding.bindingHash,
      attemptToken: fixture.dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      event: { type: "error", error: "provider failed" },
      projectRevisionReader: vi.fn().mockResolvedValue({
        ...PROJECT_REVISION,
        value: PROJECT_REVISION.value + 1,
      }),
      collection: {
        findOne: vi.fn().mockResolvedValue(fixture.row),
        updateOne,
      } as any,
    });

    expect(result).toEqual({
      ok: false,
      status: "REJECTED",
      reason: "CHAPTER_CHILD_CALLBACK_PROJECT_REVISION_STALE",
    });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("rejects terminal publication when the project changes after binding", async () => {
    const fixture = callbackParent();
    const projectRevisionReader = vi.fn()
      .mockResolvedValueOnce(PROJECT_REVISION)
      .mockResolvedValueOnce({ ...PROJECT_REVISION, value: PROJECT_REVISION.value + 1 });
    const updateOne = vi.fn().mockResolvedValueOnce(acknowledgedResult());
    const result = await reconcileChapterChildTerminalCallbackV1({
      parentAdmissionId: PARENT_ADMISSION_ID,
      childIndex: 0,
      bindingHash: fixture.binding.bindingHash,
      attemptToken: fixture.dispatch.attemptToken,
      ...PROVIDER_TUPLE,
      event: { type: "error", error: "provider failed" },
      projectRevisionReader,
      collection: {
        findOne: vi.fn().mockResolvedValue(fixture.row),
        updateOne,
      } as any,
    });

    expect(result).toEqual({
      ok: false,
      status: "REJECTED",
      reason: "CHAPTER_CHILD_CALLBACK_PROJECT_REVISION_STALE",
    });
    expect(projectRevisionReader).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledOnce();
  });

  it("distinguishes unavailable live revision evidence from a stale revision", async () => {
    const { binding } = baseInput();
    await expect(fenceChapterChildProjectRevisionV1({
      binding,
      projectRevisionReader: vi.fn().mockRejectedValue(new Error("database unavailable")),
    })).resolves.toEqual({
      ok: false,
      status: "NOT_CURRENT",
      reason: "PROJECT_REVISION_UNAVAILABLE",
    });
  });
});
