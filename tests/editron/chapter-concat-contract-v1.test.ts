import { describe, expect, it } from "vitest";

import {
  assertProjectChapterConcatCurrentnessV1,
  assertProjectChapterConcatLayoutIdentityV1,
  assertProjectChapterConcatResultV1,
  assertProjectChapterConcatTargetV1,
  assertProjectChapterConcatTargetBindingV1,
  createProjectChapterConcatWorkerMessageV1,
  createProjectChapterConcatTargetV1,
  createSignedProjectChapterConcatRequestV1,
  projectChapterConcatDispatchIdV1,
  projectChapterConcatCurrentnessV1,
  projectChapterConcatOutputUrlV1,
  verifySignedProjectChapterConcatRequestV1,
} from "@/lib/editron/services/chapter-concat-contract-v1";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";

const JOB_ID = "chr_123456789012";
const DESTINATION_ENV = {
  ...process.env,
  EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET: "editron-concat-output",
  EDITRON_CHAPTER_CONCAT_OUTPUT_REGION: "us-east-1",
};

function binding() {
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: JOB_ID,
    ownerId: "owner_1",
    projectId: "project_1",
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: "2026-09-01T03:59:00.000Z",
    },
    sequenceId: "main",
    compositionId: "MainComposition",
    renderContract: { codec: "h264" },
    durationInFrames: 54_000,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
}

function sources() {
  return [
    {
      index: 0,
      providerRenderId: "render_child_0",
      bucketName: "remotion-source-bucket",
      region: "us-east-1",
      sourceUrl: "https://remotion-source-bucket.s3.us-east-1.amazonaws.com/renders/render_child_0/out.mp4",
      sourceSizeBytes: 12_345,
    },
    {
      index: 1,
      providerRenderId: "render_child_1",
      bucketName: "remotion-source-bucket",
      region: "us-east-1",
      sourceUrl: "https://remotion-source-bucket.s3.us-east-1.amazonaws.com/renders/render_child_1/out.mp4",
      sourceSizeBytes: 23_456,
    },
  ];
}

function target() {
  return createProjectChapterConcatTargetV1({
    parentAdmissionId: JOB_ID,
    projectRenderSnapshotBinding: binding(),
    sources: sources(),
    env: DESTINATION_ENV,
  });
}

describe("ProjectChapterConcatTargetV1", () => {
  it("creates one deterministic target bound to the ordered child manifest", () => {
    const first = target();
    const retry = target();

    expect(retry).toEqual(first);
    expect(first.outputBucket).toBe("editron-concat-output");
    expect(first.outputRegion).toBe("us-east-1");
    expect(first.outputKey).toBe(`editron-concat/v1/${first.generation}.mp4`);
    expect(projectChapterConcatOutputUrlV1(first)).toBe(
      `https://editron-concat-output.s3.us-east-1.amazonaws.com/${first.outputKey}`,
    );
    expect(() => assertProjectChapterConcatTargetV1(first)).not.toThrow();
  });

  it("changes generation when source identity changes and rejects reordered indexes", () => {
    const first = target();
    const changedSources = sources();
    changedSources[1] = { ...changedSources[1]!, sourceSizeBytes: 23_457 };
    const changed = createProjectChapterConcatTargetV1({
      parentAdmissionId: JOB_ID,
      projectRenderSnapshotBinding: binding(),
      sources: changedSources,
      env: DESTINATION_ENV,
    });

    expect(changed.generation).not.toBe(first.generation);
    expect(() => createProjectChapterConcatTargetV1({
      parentAdmissionId: JOB_ID,
      projectRenderSnapshotBinding: binding(),
      sources: [...sources()].reverse(),
      env: DESTINATION_ENV,
    })).toThrow("PROJECT_CHAPTER_CONCAT_SOURCE_ORDER_INVALID");
  });

  it("binds strict worker identity and positive provider receipts to one generation", () => {
    const concatTarget = target();
    const message = createProjectChapterConcatWorkerMessageV1({
      jobId: JOB_ID,
      generation: concatTarget.generation,
    });
    expect(projectChapterConcatDispatchIdV1(message)).toBe(projectChapterConcatDispatchIdV1(message));
    expect(() => createProjectChapterConcatWorkerMessageV1({
      jobId: JOB_ID,
      generation: "not-a-generation",
    })).toThrow();
    const result = {
      generation: concatTarget.generation,
      sourceManifestHash: concatTarget.sourceManifestHash,
      outputBucket: concatTarget.outputBucket,
      outputRegion: concatTarget.outputRegion,
      outputKey: concatTarget.outputKey,
      url: projectChapterConcatOutputUrlV1(concatTarget),
      sizeBytes: 1,
      chapters: concatTarget.sources.length,
    };
    expect(() => assertProjectChapterConcatResultV1(result, concatTarget)).not.toThrow();
    expect(() => assertProjectChapterConcatResultV1({ ...result, sizeBytes: 0 }, concatTarget))
      .toThrow("PROJECT_CHAPTER_CONCAT_RESULT_INVALID");
    expect(() => assertProjectChapterConcatResultV1({ ...result, outputKey: "editron-concat/v1/" + "0".repeat(64) + ".mp4" }, concatTarget))
      .toThrow("PROJECT_CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH");
  });

  it("signs the canonical target and rejects signature or identity tampering", () => {
    const original = target();
    const signed = createSignedProjectChapterConcatRequestV1(original, "concat-secret");

    expect(verifySignedProjectChapterConcatRequestV1(signed, "concat-secret")).toEqual(original);
    expect(() => verifySignedProjectChapterConcatRequestV1(
      { ...signed, signature: "0".repeat(64) },
      "concat-secret",
    )).toThrow("PROJECT_CHAPTER_CONCAT_SIGNATURE_INVALID");
    expect(() => assertProjectChapterConcatTargetV1({
      ...original,
      generation: "0".repeat(64),
    })).toThrow("PROJECT_CHAPTER_CONCAT_GENERATION_MISMATCH");
  });

  it("rejects an absent or pseudo-bucket destination", () => {
    expect(() => createProjectChapterConcatTargetV1({
      parentAdmissionId: JOB_ID,
      projectRenderSnapshotBinding: binding(),
      sources: sources(),
      env: {
        ...process.env,
        EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET: undefined,
        EDITRON_CHAPTER_CONCAT_OUTPUT_REGION: undefined,
      },
    })).toThrow("PROJECT_CHAPTER_CONCAT_OUTPUT_BUCKET_INVALID");
    expect(() => createProjectChapterConcatTargetV1({
      parentAdmissionId: JOB_ID,
      projectRenderSnapshotBinding: binding(),
      sources: sources(),
      env: {
        ...process.env,
        EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET: "chapter-render",
        EDITRON_CHAPTER_CONCAT_OUTPUT_REGION: "us-east-1",
      },
    })).toThrow("PROJECT_CHAPTER_CONCAT_OUTPUT_BUCKET_INVALID");
  });

  it("binds claim currentness to the exact project revision and persisted layout identity", () => {
    const concatTarget = target();
    const currentness = projectChapterConcatCurrentnessV1(concatTarget);

    expect(() => assertProjectChapterConcatCurrentnessV1(
      currentness,
      concatTarget,
    )).not.toThrow();
    expect(() => assertProjectChapterConcatCurrentnessV1({
      ...currentness,
      projectRevision: {
        ...currentness.projectRevision,
        value: currentness.projectRevision.value + 1,
      },
    }, concatTarget)).toThrow("PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE");
    expect(() => assertProjectChapterConcatTargetBindingV1({
      target: concatTarget,
      jobId: JOB_ID,
      ownerId: "wrong_owner",
      projectId: currentness.projectId,
    })).toThrow("PROJECT_CHAPTER_CONCAT_JOB_BINDING_MISMATCH");
    expect(() => assertProjectChapterConcatLayoutIdentityV1(
      concatTarget,
      {},
    )).not.toThrow();
    expect(() => assertProjectChapterConcatLayoutIdentityV1(concatTarget, {
      layoutManifestHash: "c".repeat(64),
    })).toThrow("PROJECT_CHAPTER_CONCAT_LAYOUT_STALE");
  });
});
