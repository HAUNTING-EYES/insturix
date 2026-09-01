import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import {
  ProjectRenderSnapshotBindingSchema,
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "./project-render-snapshot-binding-v1";

/**
 * Immutable server-to-concat-worker identity for one long-form render.
 *
 * The output destination is deliberately not derived from a child URL.  The
 * Next server reads one fixed destination from its deployment configuration,
 * binds it to the complete project snapshot and ordered child manifest, and
 * then signs the canonical payload sent to Modal.  A retry can therefore
 * reuse the same generation/key without trusting a mutable chapter row.
 */

export const PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1 = 1 as const;
export const PROJECT_CHAPTER_CONCAT_SCOPE_V1 = "PROJECT_CHAPTER_CONCAT" as const;
export const PROJECT_CHAPTER_CONCAT_ARTIFACT_KIND_V1 =
  "REMOTION_AWS_CHAPTER_CONCAT_OUTPUT" as const;
export const PROJECT_CHAPTER_CONCAT_MAX_SOURCES_V1 = 64;
export const PROJECT_CHAPTER_CONCAT_WORKER_MESSAGE_SCHEMA_VERSION_V1 = 1 as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PARENT_ADMISSION_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const PROVIDER_RENDER_ID = /^[A-Za-z0-9_-]{1,200}$/;
const AWS_BUCKET_NAME = /^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
const OUTPUT_KEY = /^editron-concat\/v1\/[a-f0-9]{64}\.mp4$/;
const HMAC_SHA256 = /^[a-f0-9]{64}$/;

const ProjectChapterConcatSourceSchemaV1 = z.object({
  index: z.number().int().nonnegative().max(100_000),
  providerRenderId: z.string().regex(PROVIDER_RENDER_ID),
  bucketName: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "The chapter aggregate is not a provider child output.",
  ),
  region: z.string().regex(AWS_REGION),
  sourceUrl: z.string().url().refine(
    (value) => value.startsWith("https://"),
    "Chapter source output must use HTTPS.",
  ),
  sourceSizeBytes: z.number().int().positive().safe(),
}).strict();

export type ProjectChapterConcatSourceV1 = z.infer<
  typeof ProjectChapterConcatSourceSchemaV1
>;

const ProjectChapterConcatTargetUnsignedSchemaV1 = z.object({
  schemaVersion: z.literal(PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1),
  scope: z.literal(PROJECT_CHAPTER_CONCAT_SCOPE_V1),
  artifactKind: z.literal(PROJECT_CHAPTER_CONCAT_ARTIFACT_KIND_V1),
  parentAdmissionId: z.string().regex(PARENT_ADMISSION_ID),
  projectRenderSnapshotBinding: ProjectRenderSnapshotBindingSchema,
  sourceManifestHash: z.string().regex(HEX_SHA256),
  sources: z.array(ProjectChapterConcatSourceSchemaV1)
    .min(2)
    .max(PROJECT_CHAPTER_CONCAT_MAX_SOURCES_V1),
  outputBucket: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "The chapter aggregate bucket is not a concat destination.",
  ),
  outputRegion: z.string().regex(AWS_REGION),
  generation: z.string().regex(HEX_SHA256),
  outputKey: z.string().regex(OUTPUT_KEY),
}).strict();

export const ProjectChapterConcatTargetSchemaV1 =
  ProjectChapterConcatTargetUnsignedSchemaV1;
export type ProjectChapterConcatTargetV1 = z.infer<
  typeof ProjectChapterConcatTargetSchemaV1
>;

/**
 * QStash carries this immutable identity beside the job ID.  The persisted
 * target remains the source of truth; the message generation lets a delayed
 * delivery prove that it belongs to the same target before claiming work.
 */
export const ProjectChapterConcatWorkerMessageSchemaV1 = z.object({
  schemaVersion: z.literal(PROJECT_CHAPTER_CONCAT_WORKER_MESSAGE_SCHEMA_VERSION_V1),
  scope: z.literal(PROJECT_CHAPTER_CONCAT_SCOPE_V1),
  jobId: z.string().regex(PARENT_ADMISSION_ID),
  generation: z.string().regex(HEX_SHA256),
}).strict();
export type ProjectChapterConcatWorkerMessageV1 = z.infer<
  typeof ProjectChapterConcatWorkerMessageSchemaV1
>;

export function createProjectChapterConcatWorkerMessageV1(input: {
  jobId: string;
  generation: string;
}): ProjectChapterConcatWorkerMessageV1 {
  return ProjectChapterConcatWorkerMessageSchemaV1.parse({
    schemaVersion: PROJECT_CHAPTER_CONCAT_WORKER_MESSAGE_SCHEMA_VERSION_V1,
    scope: PROJECT_CHAPTER_CONCAT_SCOPE_V1,
    jobId: input.jobId,
    generation: input.generation.trim(),
  });
}

export function assertProjectChapterConcatWorkerMessageV1(
  input: unknown,
): asserts input is ProjectChapterConcatWorkerMessageV1 {
  if (!ProjectChapterConcatWorkerMessageSchemaV1.safeParse(input).success) {
    throw new Error("PROJECT_CHAPTER_CONCAT_WORKER_MESSAGE_INVALID");
  }
}

/** Stable queue identity shared by first publish and every replay. */
export function projectChapterConcatDispatchIdV1(
  message: ProjectChapterConcatWorkerMessageV1,
): string {
  assertProjectChapterConcatWorkerMessageV1(message);
  return hashEditronCanonicalJsonV1({
    schemaVersion: PROJECT_CHAPTER_CONCAT_WORKER_MESSAGE_SCHEMA_VERSION_V1,
    scope: PROJECT_CHAPTER_CONCAT_SCOPE_V1,
    jobId: message.jobId,
    generation: message.generation,
  });
}

export const ProjectChapterConcatSignedRequestSchemaV1 = z.object({
  schemaVersion: z.literal(PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1),
  scope: z.literal(PROJECT_CHAPTER_CONCAT_SCOPE_V1),
  /** Canonical JSON target bytes; only this signed value is trusted by Modal. */
  payload: z.string().min(2).max(16_000_000),
  payloadHash: z.string().regex(HEX_SHA256),
  signature: z.string().regex(HMAC_SHA256),
}).strict();
export type ProjectChapterConcatSignedRequestV1 = z.infer<
  typeof ProjectChapterConcatSignedRequestSchemaV1
>;

export const ProjectChapterConcatResultSchemaV1 = z.object({
  generation: z.string().regex(HEX_SHA256),
  sourceManifestHash: z.string().regex(HEX_SHA256),
  outputBucket: z.string().regex(AWS_BUCKET_NAME),
  outputRegion: z.string().regex(AWS_REGION),
  outputKey: z.string().regex(OUTPUT_KEY),
  url: z.string().url().refine(
    (value) => value.startsWith("https://"),
    "Concat output must use HTTPS.",
  ),
  sizeBytes: z.number().int().positive().safe(),
  chapters: z.number().int().positive().max(PROJECT_CHAPTER_CONCAT_MAX_SOURCES_V1),
}).strict();
export type ProjectChapterConcatResultV1 = z.infer<
  typeof ProjectChapterConcatResultSchemaV1
>;

type ProjectChapterConcatDestinationV1 = {
  outputBucket: string;
  outputRegion: string;
};

function assertOrderedSourcesV1(
  sources: readonly ProjectChapterConcatSourceV1[],
): void {
  for (let index = 0; index < sources.length; index += 1) {
    if (sources[index]?.index !== index) {
      throw new Error("PROJECT_CHAPTER_CONCAT_SOURCE_ORDER_INVALID");
    }
  }
}

function sourceManifestHashV1(
  sources: readonly ProjectChapterConcatSourceV1[],
): string {
  return hashEditronCanonicalJsonV1(sources);
}

function targetGenerationIdentityV1(input: {
  parentAdmissionId: string;
  projectRenderSnapshotBinding: ProjectRenderSnapshotBindingV1;
  sourceManifestHash: string;
  outputBucket: string;
  outputRegion: string;
}): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1,
    scope: PROJECT_CHAPTER_CONCAT_SCOPE_V1,
    artifactKind: PROJECT_CHAPTER_CONCAT_ARTIFACT_KIND_V1,
    parentAdmissionId: input.parentAdmissionId,
    projectRenderSnapshotBinding: input.projectRenderSnapshotBinding,
    sourceManifestHash: input.sourceManifestHash,
    outputBucket: input.outputBucket,
    outputRegion: input.outputRegion,
  });
}

function destinationFromServerEnvironmentV1(
  env: NodeJS.ProcessEnv = process.env,
): ProjectChapterConcatDestinationV1 {
  const outputBucket = env.EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET?.trim() ?? "";
  const outputRegion = env.EDITRON_CHAPTER_CONCAT_OUTPUT_REGION?.trim() ?? "";
  if (!AWS_BUCKET_NAME.test(outputBucket) || outputBucket === "chapter-render") {
    throw new Error("PROJECT_CHAPTER_CONCAT_OUTPUT_BUCKET_INVALID");
  }
  if (!AWS_REGION.test(outputRegion)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_OUTPUT_REGION_INVALID");
  }
  return { outputBucket, outputRegion };
}

export function isProjectChapterConcatDestinationConfiguredV1(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    destinationFromServerEnvironmentV1(env);
    return true;
  } catch {
    return false;
  }
}

export function createProjectChapterConcatTargetV1(input: {
  parentAdmissionId: string;
  projectRenderSnapshotBinding: ProjectRenderSnapshotBindingV1;
  sources: readonly ProjectChapterConcatSourceV1[];
  env?: NodeJS.ProcessEnv;
}): ProjectChapterConcatTargetV1 {
  assertProjectRenderSnapshotBindingV1(input.projectRenderSnapshotBinding);
  if (
    !PARENT_ADMISSION_ID.test(input.parentAdmissionId)
    || input.parentAdmissionId !== input.projectRenderSnapshotBinding.artifactId
  ) {
    throw new Error("PROJECT_CHAPTER_CONCAT_PARENT_BINDING_MISMATCH");
  }

  const sources = input.sources.map((source) => ProjectChapterConcatSourceSchemaV1.parse(
    cloneCanonicalEditronJsonV1(source),
  ));
  if (
    sources.length < 2
    || sources.length > PROJECT_CHAPTER_CONCAT_MAX_SOURCES_V1
  ) {
    throw new Error("PROJECT_CHAPTER_CONCAT_SOURCE_COUNT_INVALID");
  }
  assertOrderedSourcesV1(sources);

  const projectRenderSnapshotBinding = cloneCanonicalEditronJsonV1(
    input.projectRenderSnapshotBinding,
  );
  const sourceManifestHash = sourceManifestHashV1(sources);
  const destination = destinationFromServerEnvironmentV1(input.env);
  const generation = targetGenerationIdentityV1({
    parentAdmissionId: input.parentAdmissionId,
    projectRenderSnapshotBinding,
    sourceManifestHash,
    outputBucket: destination.outputBucket,
    outputRegion: destination.outputRegion,
  });
  const target: ProjectChapterConcatTargetV1 = {
    schemaVersion: PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1,
    scope: PROJECT_CHAPTER_CONCAT_SCOPE_V1,
    artifactKind: PROJECT_CHAPTER_CONCAT_ARTIFACT_KIND_V1,
    parentAdmissionId: input.parentAdmissionId,
    projectRenderSnapshotBinding,
    sourceManifestHash,
    sources,
    outputBucket: destination.outputBucket,
    outputRegion: destination.outputRegion,
    generation,
    outputKey: `editron-concat/v1/${generation}.mp4`,
  };
  assertProjectChapterConcatTargetV1(target);
  return target;
}

export function assertProjectChapterConcatTargetV1(
  input: unknown,
): asserts input is ProjectChapterConcatTargetV1 {
  const parsed = ProjectChapterConcatTargetSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_CHAPTER_CONCAT_TARGET_INVALID");
  const target = parsed.data;
  try {
    assertProjectRenderSnapshotBindingV1(target.projectRenderSnapshotBinding);
    if (
      target.parentAdmissionId !== target.projectRenderSnapshotBinding.artifactId
      || target.projectRenderSnapshotBinding.scope !== "PROJECT_SNAPSHOT"
    ) {
      throw new Error("PROJECT_CHAPTER_CONCAT_PARENT_BINDING_MISMATCH");
    }
    assertOrderedSourcesV1(target.sources);
    if (sourceManifestHashV1(target.sources) !== target.sourceManifestHash) {
      throw new Error("PROJECT_CHAPTER_CONCAT_SOURCE_MANIFEST_HASH_MISMATCH");
    }
    const expectedGeneration = targetGenerationIdentityV1({
      parentAdmissionId: target.parentAdmissionId,
      projectRenderSnapshotBinding: target.projectRenderSnapshotBinding,
      sourceManifestHash: target.sourceManifestHash,
      outputBucket: target.outputBucket,
      outputRegion: target.outputRegion,
    });
    if (
      target.generation !== expectedGeneration
      || target.outputKey !== `editron-concat/v1/${expectedGeneration}.mp4`
    ) {
      throw new Error("PROJECT_CHAPTER_CONCAT_GENERATION_MISMATCH");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROJECT_CHAPTER_CONCAT_")) {
      throw error;
    }
    throw new Error("PROJECT_CHAPTER_CONCAT_TARGET_INVALID");
  }
}

/** Validate the provider receipt against the already-bound target. */
export function assertProjectChapterConcatResultV1(
  input: unknown,
  target: ProjectChapterConcatTargetV1,
): asserts input is ProjectChapterConcatResultV1 {
  assertProjectChapterConcatTargetV1(target);
  const parsed = ProjectChapterConcatResultSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_CHAPTER_CONCAT_RESULT_INVALID");
  const result = parsed.data;
  if (
    result.generation !== target.generation
    || result.sourceManifestHash !== target.sourceManifestHash
    || result.outputBucket !== target.outputBucket
    || result.outputRegion !== target.outputRegion
    || result.outputKey !== target.outputKey
    || result.url !== projectChapterConcatOutputUrlV1(target)
    || result.chapters !== target.sources.length
  ) {
    throw new Error("PROJECT_CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH");
  }
}

export function projectChapterConcatOutputUrlV1(
  target: ProjectChapterConcatTargetV1,
): string {
  assertProjectChapterConcatTargetV1(target);
  return `https://${target.outputBucket}.s3.${target.outputRegion}.amazonaws.com/${target.outputKey}`;
}

function concatSecretV1(secret?: string): string {
  const token = (secret ?? process.env.EDITRON_CHAPTER_CONCAT_TOKEN)?.trim() ?? "";
  if (!token) throw new Error("PROJECT_CHAPTER_CONCAT_SIGNING_SECRET_MISSING");
  return token;
}

function hmacSha256V1(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function createSignedProjectChapterConcatRequestV1(
  target: ProjectChapterConcatTargetV1,
  secret?: string,
): ProjectChapterConcatSignedRequestV1 {
  assertProjectChapterConcatTargetV1(target);
  const payload = canonicalizeEditronJsonV1(target);
  const signed: ProjectChapterConcatSignedRequestV1 = {
    schemaVersion: PROJECT_CHAPTER_CONCAT_CONTRACT_SCHEMA_VERSION_V1,
    scope: PROJECT_CHAPTER_CONCAT_SCOPE_V1,
    payload,
    payloadHash: hashEditronCanonicalJsonV1(target),
    signature: hmacSha256V1(payload, concatSecretV1(secret)),
  };
  return ProjectChapterConcatSignedRequestSchemaV1.parse(signed);
}

export function verifySignedProjectChapterConcatRequestV1(
  input: unknown,
  secret?: string,
): ProjectChapterConcatTargetV1 {
  const request = ProjectChapterConcatSignedRequestSchemaV1.parse(input);
  const expected = Buffer.from(hmacSha256V1(request.payload, concatSecretV1(secret)), "utf8");
  const supplied = Buffer.from(request.signature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_SIGNATURE_INVALID");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(request.payload);
  } catch {
    throw new Error("PROJECT_CHAPTER_CONCAT_PAYLOAD_INVALID");
  }
  assertProjectChapterConcatTargetV1(decoded);
  if (canonicalizeEditronJsonV1(decoded) !== request.payload) {
    throw new Error("PROJECT_CHAPTER_CONCAT_PAYLOAD_NOT_CANONICAL");
  }
  if (hashEditronCanonicalJsonV1(decoded) !== request.payloadHash) {
    throw new Error("PROJECT_CHAPTER_CONCAT_PAYLOAD_HASH_MISMATCH");
  }
  return decoded;
}
