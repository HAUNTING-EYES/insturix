import { describe, expect, it } from "vitest";

import {
  createPendingRenderJob,
  RenderJobSchema,
} from "@/lib/editron/schemas/render-job";
import {
  createProjectArtifactBindingV1,
} from "@/lib/editron/services/project-artifact-invalidation-v1";
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  assertProjectRenderSnapshotBindingV1,
  projectRenderSnapshotBindingContainsTargetV1,
  projectRenderSnapshotBindingHashV1,
  projectRenderSourceSnapshotHashV1,
  ProjectRenderSnapshotBindingSchema,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";

const OWNER_ID = "owner-project-render-test";
const PROJECT_ID = "project-project-render-test";
const BEFORE_REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-08-31T00:00:00.000Z",
};

const VIDEO_OVERLAY = {
  id: 12,
  type: "video" as const,
  from: 30,
  durationInFrames: 90,
  assetId: "asset-before",
  src: "https://signed.example.test/before.mp4",
  content: "https://signed.example.test/before.mp4",
  opacity: 1,
};

const RENDER_CONTRACT = {
  renderer: "remotion-lambda",
  codec: "h264",
  audioCodec: "aac",
  framesPerLambda: 20,
};

function makeProject(overlays: unknown[] = [VIDEO_OVERLAY]) {
  return {
    overlays,
    durationInFrames: 180,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
}

function makeBinding(
  project = makeProject(),
  sourceUrl = "https://signed.example.test/before.mp4",
) {
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { src: sourceUrl, renderMode: "preview" },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: "preview-project-render-1",
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: BEFORE_REVISION,
    sequenceId: "sequence-1",
    compositionId: "composition-1",
    renderContract: RENDER_CONTRACT,
    durationInFrames: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays ?? []),
  });
}

describe("ProjectRenderSnapshotBindingV1", () => {
  it("binds the exact project snapshot and derives sorted half-open video targets", () => {
    const binding = makeBinding();

    expect(binding.scope).toBe("PROJECT_SNAPSHOT");
    expect(binding.artifactKind).toBe("RENDERED_PREVIEW");
    expect(binding.ownerId).toBe(OWNER_ID);
    expect(binding.projectId).toBe(PROJECT_ID);
    expect(binding.projectRevision).toEqual(BEFORE_REVISION);
    expect(binding.sequenceId).toBe("sequence-1");
    expect(binding.compositionId).toBe("composition-1");
    expect(binding.renderContract).toEqual(RENDER_CONTRACT);
    expect(binding.durationInFrames).toBe(180);
    expect(binding.fps).toBe(30);
    expect(binding.width).toBe(1920);
    expect(binding.height).toBe(1080);
    expect(binding.containedVideoTargets).toHaveLength(1);
    expect(binding.containedVideoTargets[0]).toMatchObject({
      overlayId: 12,
      expectedAssetId: "asset-before",
      exactFrameRange: { startFrame: 30, endFrame: 120 },
    });

    const { bindingHash, ...unsigned } = binding;
    expect(bindingHash).toBe(projectRenderSnapshotBindingHashV1(unsigned));
    expect(() => assertProjectRenderSnapshotBindingV1(binding)).not.toThrow();
  });

  it("keeps identity stable across hydrated or signed URL changes", () => {
    const projectA = makeProject();
    const projectB = makeProject([
      {
        ...VIDEO_OVERLAY,
        src: "https://signed.example.test/after.mp4",
        content: "https://signed.example.test/after.mp4",
      },
    ]);
    const sourceA = buildProjectRenderSourceSnapshotV1({
      project: projectA,
      inputProps: { src: "https://signed.example.test/root.mp4" },
    });
    const sourceB = buildProjectRenderSourceSnapshotV1({
      project: projectB,
      inputProps: { src: "https://signed.example.test/root.mp4" },
    });

    expect(projectRenderSourceSnapshotHashV1(sourceA))
      .toBe(projectRenderSourceSnapshotHashV1(sourceB));
    expect(makeBinding(projectA, "https://signed.example.test/root.mp4").bindingHash)
      .toBe(makeBinding(projectB, "https://signed.example.test/root.mp4").bindingHash);

    const topLevelSourceA = buildProjectRenderSourceSnapshotV1({
      project: projectA,
      inputProps: { src: "https://signed.example.test/root-a.mp4" },
    });
    const topLevelSourceB = buildProjectRenderSourceSnapshotV1({
      project: projectA,
      inputProps: { src: "https://signed.example.test/root-b.mp4" },
    });
    expect(projectRenderSourceSnapshotHashV1(topLevelSourceA))
      .not.toBe(projectRenderSourceSnapshotHashV1(topLevelSourceB));

    const nestedSourceA = buildProjectRenderSourceSnapshotV1({
      project: projectA,
      inputProps: { src: "https://signed.example.test/root.mp4", nested: { src: "nested-a" } },
    });
    const nestedSourceB = buildProjectRenderSourceSnapshotV1({
      project: projectA,
      inputProps: { src: "https://signed.example.test/root.mp4", nested: { src: "nested-b" } },
    });
    expect(projectRenderSourceSnapshotHashV1(nestedSourceA))
      .not.toBe(projectRenderSourceSnapshotHashV1(nestedSourceB));
  });

  it("changes identity for render-affecting non-URL source fields", () => {
    const original = makeProject();
    const changed = makeProject([
      { ...VIDEO_OVERLAY, opacity: 0.5, src: "https://signed.example.test/after.mp4" },
    ]);
    const originalSource = buildProjectRenderSourceSnapshotV1({ project: original });
    const changedSource = buildProjectRenderSourceSnapshotV1({ project: changed });

    expect(projectRenderSourceSnapshotHashV1(originalSource))
      .not.toBe(projectRenderSourceSnapshotHashV1(changedSource));
    expect(makeBinding(original).bindingHash).not.toBe(makeBinding(changed).bindingHash);

    const textA = makeProject([{
      id: 99,
      type: "text",
      from: 0,
      durationInFrames: 30,
      content: "https://visible.example.test/a",
    }]);
    const textB = makeProject([{
      id: 99,
      type: "text",
      from: 0,
      durationInFrames: 30,
      content: "https://visible.example.test/b",
    }]);
    const textSourceA = buildProjectRenderSourceSnapshotV1({ project: textA });
    const textSourceB = buildProjectRenderSourceSnapshotV1({ project: textB });
    expect(projectRenderSourceSnapshotHashV1(textSourceA))
      .not.toBe(projectRenderSourceSnapshotHashV1(textSourceB));
  });

  it("requires exact owner, project, revision, and one exact contained target", () => {
    const binding = makeBinding();
    const target = binding.containedVideoTargets[0]!;

    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      beforeRevision: BEFORE_REVISION,
      target,
    })).toBe(true);
    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: "another-owner",
      projectId: PROJECT_ID,
      beforeRevision: BEFORE_REVISION,
      target,
    })).toBe(false);
    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: OWNER_ID,
      projectId: "another-project",
      beforeRevision: BEFORE_REVISION,
      target,
    })).toBe(false);
    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      beforeRevision: { ...BEFORE_REVISION, value: 8 },
      target,
    })).toBe(false);
    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      beforeRevision: BEFORE_REVISION,
      target: { ...target, expectedAssetId: "asset-after" },
    })).toBe(false);
    expect(projectRenderSnapshotBindingContainsTargetV1(binding, {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      beforeRevision: BEFORE_REVISION,
      target: {
        ...target,
        exactFrameRange: {
          ...target.exactFrameRange,
          endFrame: target.exactFrameRange.endFrame + 1,
        },
      },
    })).toBe(false);
  });

  it("fails closed for duplicate, unsorted, forged, and legacy-shaped bindings", () => {
    const binding = makeBinding();
    const target = binding.containedVideoTargets[0]!;

    expect(() => createProjectRenderSnapshotBindingV1({
      artifactKind: binding.artifactKind,
      artifactId: binding.artifactId,
      ownerId: binding.ownerId,
      projectId: binding.projectId,
      projectRevision: binding.projectRevision,
      sequenceId: binding.sequenceId,
      compositionId: binding.compositionId,
      renderContract: binding.renderContract,
      durationInFrames: binding.durationInFrames,
      fps: binding.fps,
      width: binding.width,
      height: binding.height,
      projectRenderSourceSnapshotHash: binding.projectRenderSourceSnapshotHash,
      containedVideoTargets: [target, target],
    })).toThrow("PROJECT_RENDER_VIDEO_TARGETS_INVALID");

    const multiTargetBinding = makeBinding(makeProject([
      VIDEO_OVERLAY,
      {
        ...VIDEO_OVERLAY,
        id: 13,
        from: 0,
        assetId: "asset-second",
        src: "https://signed.example.test/second.mp4",
      },
    ]));
    const { bindingHash: _bindingHash, ...unsigned } = multiTargetBinding;
    const reversed = [...multiTargetBinding.containedVideoTargets].reverse();
    const forgedUnsorted = { ...unsigned, containedVideoTargets: reversed };
    expect(() => ProjectRenderSnapshotBindingSchema.parse({
      ...forgedUnsorted,
      bindingHash: projectRenderSnapshotBindingHashV1(forgedUnsorted),
    })).toThrow();
    expect(() => assertProjectRenderSnapshotBindingV1({
      ...binding,
      bindingHash: "0".repeat(64),
    })).toThrow("PROJECT_RENDER_SNAPSHOT_BINDING_HASH_MISMATCH");
    expect(() => assertProjectRenderSnapshotBindingV1({
      ...binding,
      scope: "ARTIFACT",
    })).toThrow("PROJECT_RENDER_SNAPSHOT_BINDING_INVALID");
  });

  it("travels as a separate optional render-job contract", () => {
    const binding = makeBinding();
    const job = createPendingRenderJob(
      "job-project-render-1",
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      5_000,
      undefined,
      binding,
    );
    const parsed = RenderJobSchema.parse(job);

    expect(parsed.projectRenderSnapshotBinding).toEqual(binding);
    expect(parsed.artifactBinding).toBeUndefined();
    expect(parsed.artifactState).toBe("ACTIVE");
  });

  it("rejects ambiguous jobs carrying both binding scopes", () => {
    const projectBinding = makeBinding();
    const artifactBinding = createProjectArtifactBindingV1({
      artifactKind: "RENDERED_PREVIEW",
      artifactId: "preview-artifact-1",
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      projectRevision: BEFORE_REVISION,
      target: projectBinding.containedVideoTargets[0]!,
    });

    expect(() => createPendingRenderJob(
      "job-dual-scope-1",
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      5_000,
      artifactBinding,
      projectBinding,
    )).toThrow("RENDER_JOB_BINDING_SCOPES_AMBIGUOUS");

    const artifactJob = createPendingRenderJob(
      "job-artifact-only-1",
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      5_000,
      artifactBinding,
    );
    expect(() => RenderJobSchema.parse({
      ...artifactJob,
      projectRenderSnapshotBinding: projectBinding,
    })).toThrow();
  });
});
