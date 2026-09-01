import {
  buildOverlayRenderTruthSnapshot,
  buildProjectRenderInputProps,
} from "@/lib/editron/shared/render-request-payload";
import type { Overlay } from "@/components/editron/editor/version-7.0.0/types";

import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import {
  pipelineVideoDeliveryExactFrameRangeV1,
  pipelineVideoDeliveryTargetFingerprintV1,
} from "./pipeline-video-project-delivery-v1";
import {
  ProjectArtifactInvalidationDerivativeClassSchema,
  ProjectArtifactProjectRevisionSchema,
  ProjectArtifactTargetSchema,
  sameProjectArtifactRevisionV1,
  sameProjectArtifactTargetV1,
  type ProjectArtifactInvalidationDerivativeClassV1,
  type ProjectArtifactProjectRevisionV1,
  type ProjectArtifactTargetV1,
} from "./project-artifact-invalidation-v1";
import { z } from "zod";

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^[A-Za-z0-9_.:-]{1,500}$/;
const MAX_CONTAINED_VIDEO_TARGETS_V1 = 100_000;

const BOUNDED_IDENTIFIER_SCHEMA = z.string().min(1).max(200).refine(
  (value) => !/[\u0000-\u001F\u007F]/.test(value),
  "Identifier contains a control character.",
);

/**
 * Render options are intentionally opaque to this binding owner. The caller
 * must include every render-affecting option in this canonical JSON value;
 * binding identity then changes whenever that value changes.
 */
export const ProjectRenderContractSchema = z.unknown().superRefine((value, context) => {
  try {
    hashEditronCanonicalJsonV1(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Render contract must be canonical JSON.",
    });
  }
});
export type ProjectRenderContractV1 = z.infer<typeof ProjectRenderContractSchema>;

export const ProjectRenderSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  renderInputProps: z.record(z.string(), z.unknown()),
}).strict();
export type ProjectRenderSourceSnapshotV1 = z.infer<typeof ProjectRenderSourceSnapshotSchema>;

function compareTargets(left: ProjectArtifactTargetV1, right: ProjectArtifactTargetV1): number {
  if (left.overlayId !== right.overlayId) return left.overlayId - right.overlayId;
  if (left.expectedAssetId !== right.expectedAssetId) {
    return left.expectedAssetId < right.expectedAssetId ? -1 : 1;
  }
  if (left.exactFrameRange.startFrame !== right.exactFrameRange.startFrame) {
    return left.exactFrameRange.startFrame - right.exactFrameRange.startFrame;
  }
  if (left.exactFrameRange.endFrame !== right.exactFrameRange.endFrame) {
    return left.exactFrameRange.endFrame - right.exactFrameRange.endFrame;
  }
  if (left.targetFingerprint === right.targetFingerprint) return 0;
  return left.targetFingerprint < right.targetFingerprint ? -1 : 1;
}

const ContainedVideoTargetsSchema = z.array(ProjectArtifactTargetSchema)
  .max(MAX_CONTAINED_VIDEO_TARGETS_V1)
  .superRefine((targets, context) => {
    const seenOverlayIds = new Set<number>();
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      if (seenOverlayIds.has(target.overlayId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "overlayId"],
          message: "Contained video target identity is ambiguous.",
        });
      }
      seenOverlayIds.add(target.overlayId);
      if (index > 0 && compareTargets(targets[index - 1]!, target) >= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "Contained video targets must be strictly sorted.",
        });
      }
    }
  });

/**
 * Binding for a whole persisted-project render. This is deliberately a
 * separate scope from ProjectArtifactBindingV1, whose target identifies one
 * overlay artifact. The contained target list is an immutable coverage index;
 * it does not turn this whole-project artifact into an overlay artifact.
 */
export const ProjectRenderSnapshotBindingSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.literal("PROJECT_SNAPSHOT"),
  artifactKind: ProjectArtifactInvalidationDerivativeClassSchema,
  artifactId: z.string().regex(ARTIFACT_ID),
  ownerId: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  projectRevision: ProjectArtifactProjectRevisionSchema,
  sequenceId: BOUNDED_IDENTIFIER_SCHEMA,
  compositionId: BOUNDED_IDENTIFIER_SCHEMA,
  renderContract: ProjectRenderContractSchema,
  durationInFrames: z.number().int().positive(),
  fps: z.number().finite().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  projectRenderSourceSnapshotHash: z.string().regex(HEX_SHA256),
  containedVideoTargets: ContainedVideoTargetsSchema,
  bindingHash: z.string().regex(HEX_SHA256),
}).strict();
export type ProjectRenderSnapshotBindingV1 = z.infer<
  typeof ProjectRenderSnapshotBindingSchema
>;

export type ProjectRenderSnapshotBindingInputV1 = {
  artifactKind: ProjectArtifactInvalidationDerivativeClassV1;
  artifactId: string;
  ownerId: string;
  projectId: string;
  projectRevision: ProjectArtifactProjectRevisionV1;
  sequenceId: string;
  compositionId: string;
  renderContract: ProjectRenderContractV1;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  /** Required when projectRenderSource is omitted; verified when both are supplied. */
  projectRenderSourceSnapshotHash?: string;
  /** Canonicalized before hashing; hydrated media URLs are not identity material. */
  projectRenderSource?: unknown;
  containedVideoTargets: readonly ProjectArtifactTargetV1[];
};

export type ProjectRenderSnapshotTargetContainmentInputV1 = {
  ownerId: string;
  projectId: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  target: ProjectArtifactTargetV1;
};

export function projectRenderSnapshotBindingHashV1(
  input: Omit<ProjectRenderSnapshotBindingV1, "bindingHash">,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    scope: "PROJECT_SNAPSHOT",
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    sequenceId: input.sequenceId,
    compositionId: input.compositionId,
    renderContract: input.renderContract,
    durationInFrames: input.durationInFrames,
    fps: input.fps,
    width: input.width,
    height: input.height,
    projectRenderSourceSnapshotHash: input.projectRenderSourceSnapshotHash,
    containedVideoTargets: input.containedVideoTargets,
  });
}

export function createProjectRenderSnapshotBindingV1(
  input: ProjectRenderSnapshotBindingInputV1,
): ProjectRenderSnapshotBindingV1 {
  const projectRenderSourceSnapshotHash = input.projectRenderSource === undefined
    ? (() => {
        const parsed = z.string().regex(HEX_SHA256).safeParse(input.projectRenderSourceSnapshotHash);
        if (!parsed.success) throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_HASH_REQUIRED");
        return parsed.data;
      })()
    : (() => {
        const computed = projectRenderSourceSnapshotHashV1(input.projectRenderSource);
        if (
          input.projectRenderSourceSnapshotHash !== undefined
          && input.projectRenderSourceSnapshotHash !== computed
        ) {
          throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_HASH_MISMATCH");
        }
        return computed;
      })();

  const containedVideoTargets = normalizeContainedVideoTargetsV1(input.containedVideoTargets);
  const unsigned = {
    schemaVersion: 1 as const,
    scope: "PROJECT_SNAPSHOT" as const,
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    projectRevision: cloneCanonicalEditronJsonV1(input.projectRevision),
    sequenceId: input.sequenceId,
    compositionId: input.compositionId,
    renderContract: cloneCanonicalEditronJsonV1(input.renderContract),
    durationInFrames: input.durationInFrames,
    fps: input.fps,
    width: input.width,
    height: input.height,
    projectRenderSourceSnapshotHash,
    containedVideoTargets,
  };
  const binding: ProjectRenderSnapshotBindingV1 = {
    ...unsigned,
    bindingHash: projectRenderSnapshotBindingHashV1(unsigned),
  };
  assertProjectRenderSnapshotBindingV1(binding);
  return binding;
}

export function assertProjectRenderSnapshotBindingV1(
  input: unknown,
): asserts input is ProjectRenderSnapshotBindingV1 {
  const parsed = ProjectRenderSnapshotBindingSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_RENDER_SNAPSHOT_BINDING_INVALID");
  const { bindingHash, ...unsigned } = parsed.data;
  if (projectRenderSnapshotBindingHashV1(unsigned) !== bindingHash) {
    throw new Error("PROJECT_RENDER_SNAPSHOT_BINDING_HASH_MISMATCH");
  }
}

/**
 * Return a canonical pre-hydration source snapshot using the existing
 * persisted-project render-input and overlay render-truth owners.
 */
export function buildProjectRenderSourceSnapshotV1(input: {
  project: Parameters<typeof buildProjectRenderInputProps>[0];
  inputProps?: Parameters<typeof buildProjectRenderInputProps>[1];
}): ProjectRenderSourceSnapshotV1 {
  const renderInputProps = buildProjectRenderInputProps(input.project, input.inputProps);
  return canonicalizeProjectRenderSourceSnapshotV1({
    schemaVersion: 1,
    renderInputProps,
  });
}

export function canonicalizeProjectRenderSourceSnapshotV1(
  input: unknown,
): ProjectRenderSourceSnapshotV1 {
  const record = asRecord(input);
  if (!record) throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_INVALID");
  const renderInputProps = asRecord(record.renderInputProps);
  if (record.schemaVersion !== 1 || !renderInputProps) {
    throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_INVALID");
  }
  const canonical = cloneCanonicalEditronJsonV1({
    schemaVersion: 1 as const,
    renderInputProps: normalizeProjectRenderSourceForHashV1(renderInputProps),
  });
  const parsed = ProjectRenderSourceSnapshotSchema.safeParse(canonical);
  if (!parsed.success) throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_INVALID");
  return parsed.data;
}

/** Hashes the canonical source snapshot, never hydrated/signed URL material. */
export function projectRenderSourceSnapshotHashV1(input: unknown): string {
  const record = asRecord(input);
  const source = record?.schemaVersion === 1 && asRecord(record.renderInputProps)
    ? canonicalizeProjectRenderSourceSnapshotV1(record)
    : {
        schemaVersion: 1 as const,
        renderInputProps: normalizeProjectRenderSourceForHashV1(input),
      };
  return hashEditronCanonicalJsonV1(source);
}

export const hashProjectRenderSourceSnapshotV1 = projectRenderSourceSnapshotHashV1;

/** Derive the existing pipeline target evidence without adding render-form logic. */
export function buildContainedVideoTargetsV1(
  overlays: readonly unknown[],
): ProjectArtifactTargetV1[] {
  if (!Array.isArray(overlays)) throw new Error("PROJECT_RENDER_OVERLAYS_INVALID");
  const targets = overlays
    .filter((overlay): overlay is Record<string, unknown> => (
      asRecord(overlay)?.type === "video"
    ))
    .map((overlay) => {
      if (
        !Number.isSafeInteger(overlay.id)
        || Number(overlay.id) < 0
        || typeof overlay.assetId !== "string"
        || !overlay.assetId.trim()
      ) {
        throw new Error("PROJECT_RENDER_VIDEO_TARGET_INVALID");
      }
      const from = typeof overlay.from === "number" ? overlay.from : undefined;
      const durationInFrames = typeof overlay.durationInFrames === "number"
        ? overlay.durationInFrames
        : undefined;
      const exactFrameRange = pipelineVideoDeliveryExactFrameRangeV1({
        from,
        durationInFrames,
      });
      return {
        overlayId: Number(overlay.id),
        expectedAssetId: overlay.assetId,
        exactFrameRange,
        targetFingerprint: pipelineVideoDeliveryTargetFingerprintV1(overlay as unknown as Overlay),
      } satisfies ProjectArtifactTargetV1;
    });
  return normalizeContainedVideoTargetsV1(targets);
}

export const buildProjectRenderContainedVideoTargetsV1 = buildContainedVideoTargetsV1;

export function projectRenderSnapshotBindingContainsTargetV1(
  binding: ProjectRenderSnapshotBindingV1,
  input: ProjectRenderSnapshotTargetContainmentInputV1,
): boolean {
  try {
    assertProjectRenderSnapshotBindingV1(binding);
    ProjectArtifactProjectRevisionSchema.parse(input.beforeRevision);
    ProjectArtifactTargetSchema.parse(input.target);
  } catch {
    return false;
  }
  return binding.ownerId === input.ownerId
    && binding.projectId === input.projectId
    && sameProjectArtifactRevisionV1(binding.projectRevision, input.beforeRevision)
    && binding.containedVideoTargets.some((target) => (
      sameProjectArtifactTargetV1(target, input.target)
    ));
}

export const projectRenderSnapshotBindingMatchesInvalidationV1 =
  projectRenderSnapshotBindingContainsTargetV1;

function normalizeContainedVideoTargetsV1(
  targets: readonly ProjectArtifactTargetV1[],
): ProjectArtifactTargetV1[] {
  if (!Array.isArray(targets)) throw new Error("PROJECT_RENDER_VIDEO_TARGETS_INVALID");
  const cloned = targets.map((target) => cloneCanonicalEditronJsonV1(target));
  const sorted = [...cloned].sort(compareTargets);
  const parsed = ContainedVideoTargetsSchema.safeParse(sorted);
  if (!parsed.success) throw new Error("PROJECT_RENDER_VIDEO_TARGETS_INVALID");
  return parsed.data;
}

function normalizeProjectRenderSourceForHashV1(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw new Error("PROJECT_RENDER_SOURCE_SNAPSHOT_INVALID");
  const normalized: Record<string, unknown> = { ...record };
  if (Array.isArray(record.overlays)) {
    normalized.overlays = record.overlays.map((overlay) => (
      stripDerivedRenderFieldsFromOverlayV1(buildOverlayRenderTruthSnapshot(overlay))
    ));
  }
  return normalized;
}

function stripDerivedRenderFieldsFromOverlayV1(value: unknown): unknown {
  const overlay = asRecord(value);
  if (!overlay || typeof overlay.assetId !== "string" || !overlay.assetId.trim()) {
    return value;
  }
  const output = { ...overlay };
  delete output.src;
  if (output.type === "sound" || output.type === "video") delete output.content;
  return output;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}
