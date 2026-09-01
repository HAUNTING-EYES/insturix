import { describe, expect, it } from "vitest";

import {
  assertProjectRenderSourceCleanupOutboxV1,
  createProjectRenderSourceCleanupOutboxV1,
} from "@/lib/editron/services/project-render-source-cleanup-v1";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";

const now = new Date("2026-09-01T04:00:00.000Z");

function binding() {
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: "rnd_cleanup_1",
    ownerId: "owner_1",
    projectId: "project_1",
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: "2026-09-01T03:59:00.000Z",
    },
    sequenceId: "main",
    compositionId: "TestComponent",
    renderContract: { codec: "h264" },
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
}

function createOutbox() {
  return createProjectRenderSourceCleanupOutboxV1({
    binding: binding(),
    providerRenderId: "render_provider_1",
    bucketName: "remotion-bucket-1",
    region: "us-east-1",
    sourceOutputUrl: "https://remotion-bucket-1.s3.us-east-1.amazonaws.com/renders/render_provider_1/out.mp4",
    sourceOutputSize: 44_583_988,
    now,
  });
}

describe("project render source cleanup V1", () => {
  it("creates one deterministic immutable provider cleanup handoff", () => {
    const first = createOutbox();
    const replay = createOutbox();

    expect(replay).toEqual(first);
    expect(first._id).toMatch(/^project-render-source-cleanup_[a-f0-9]{64}$/);
    expect(first.descriptor).toMatchObject({
      scope: "PROJECT_RENDER_SOURCE_CLEANUP",
      artifactKind: "REMOTION_AWS_RENDER_OUTPUT",
      provider: "REMOTION_AWS_LAMBDA",
      credentialScopeId: "EDITRON_REMOTION_AWS_PRIMARY",
      providerRenderId: "render_provider_1",
      bucketName: "remotion-bucket-1",
      region: "us-east-1",
      renderPrefix: "renders/render_provider_1/",
      binding: {
        scope: "PROJECT_SNAPSHOT",
        artifactId: "rnd_cleanup_1",
        ownerId: "owner_1",
        projectId: "project_1",
      },
      sourceOutput: {
        sizeBytes: 44_583_988,
      },
    });
    expect(first).toMatchObject({
      status: "PENDING",
      attempts: 0,
      availableAt: now,
    });
    expect(() => assertProjectRenderSourceCleanupOutboxV1(first)).not.toThrow();
  });

  it("changes identity when provider deletion coordinates change", () => {
    const first = createOutbox();
    const changed = createProjectRenderSourceCleanupOutboxV1({
      binding: binding(),
      providerRenderId: "render_provider_2",
      bucketName: "remotion-bucket-1",
      region: "us-east-1",
      sourceOutputUrl: "https://remotion-bucket-1.s3.us-east-1.amazonaws.com/renders/render_provider_2/out.mp4",
      sourceOutputSize: 44_583_988,
      now,
    });

    expect(changed._id).not.toBe(first._id);
  });

  it("rejects tampering, insecure URLs, unsupported regions, and invalid lease state", () => {
    const original = createOutbox();
    expect(() => assertProjectRenderSourceCleanupOutboxV1({
      ...original,
      descriptor: {
        ...original.descriptor,
        sourceOutput: { ...original.descriptor.sourceOutput, sizeBytes: 1 },
      },
    })).toThrow("PROJECT_RENDER_SOURCE_CLEANUP_DESCRIPTOR_HASH_MISMATCH");
    expect(() => createProjectRenderSourceCleanupOutboxV1({
      binding: binding(),
      providerRenderId: "render_provider_1",
      bucketName: "remotion-bucket-1",
      region: "moon-1",
      sourceOutputUrl: "https://example.test/out.mp4",
      sourceOutputSize: 1,
      now,
    })).toThrow();
    expect(() => createProjectRenderSourceCleanupOutboxV1({
      binding: binding(),
      providerRenderId: "rnd_cleanup_1",
      bucketName: "chapter-render",
      region: "us-east-1",
      sourceOutputUrl: "https://example.test/chapter-output.mp4",
      sourceOutputSize: 1,
      now,
    })).toThrow();
    expect(() => createProjectRenderSourceCleanupOutboxV1({
      binding: binding(),
      providerRenderId: "../wrong-prefix",
      bucketName: "remotion-bucket-1",
      region: "us-east-1",
      sourceOutputUrl: "https://example.test/out.mp4",
      sourceOutputSize: 1,
      now,
    })).toThrow();
    expect(() => createProjectRenderSourceCleanupOutboxV1({
      binding: binding(),
      providerRenderId: "render_provider_1",
      bucketName: "remotion-bucket-1",
      region: "us-east-1",
      sourceOutputUrl: "http://example.test/out.mp4",
      sourceOutputSize: 1,
      now,
    })).toThrow();
    expect(() => assertProjectRenderSourceCleanupOutboxV1({
      ...original,
      status: "RUNNING",
    })).toThrow("PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_INVALID");
  });
});
