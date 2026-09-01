import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  S3Client,
  type DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";
import {
  AssumeRoleCommand,
  STSClient,
  type AssumeRoleCommandInput,
  type AssumeRoleCommandOutput,
} from "@aws-sdk/client-sts";
import type { Collection } from "mongodb";

import { getDatabase } from "@/lib/editron/db/mongodb";
import {
  CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  ProjectChapterConcatCleanupOutboxSchemaV1,
  assertProjectChapterConcatCleanupOutboxV1,
  type ProjectChapterConcatCleanupDescriptorV1,
  type ProjectChapterConcatCleanupOutboxV1,
} from "./chapter-concat-cleanup-v1";

const DEFAULT_LEASE_MS = 5 * 60_000;
const MAX_LEASE_MS = 15 * 60_000;
const MAX_BATCH_SIZE = 10;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60_000;
const CLEANUP_ACCESS_KEY_ENV = "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_ACCESS_KEY_ID";
const CLEANUP_SECRET_KEY_ENV = "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_SECRET_ACCESS_KEY";
const CLEANUP_SESSION_TOKEN_ENV = "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_SESSION_TOKEN";
const CLEANUP_ROLE_ARN_ENV = "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_ROLE_ARN";
const CLEANUP_EXTERNAL_ID_ENV = "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_EXTERNAL_ID";
const CLEANUP_STS_REGION = "us-east-1";
const CLEANUP_EXPECTED_AWS_ACCOUNT_ID = "699773898862";
const CLEANUP_STS_SESSION_NAME = "editron-chapter-concat-cleanup";
const CLEANUP_STS_DURATION_SECONDS = 900;
const CLEANUP_CREDENTIAL_REFRESH_SKEW_MS = 5 * 60_000;
const SAFE_CREDENTIAL = /^[^\u0000-\u001F\u007F]+$/;
const SAFE_EXTERNAL_ID = /^[A-Za-z0-9_+=,.@:/-]{1,1224}$/;
const CLEANUP_ROLE_ARN = new RegExp(
  `^arn:aws:iam::${CLEANUP_EXPECTED_AWS_ACCOUNT_ID}:role/[A-Za-z0-9+=,.@_-]+(?:/[A-Za-z0-9+=,.@_-]+)*$`,
);

export type ProjectChapterConcatCleanupAwsCredentialsV1 = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type ProjectChapterConcatCleanupStsClientV1 = {
  send(command: AssumeRoleCommand): Promise<AssumeRoleCommandOutput>;
};

export type ProjectChapterConcatCleanupAwsCredentialsOptionsV1 = {
  stsClient?: ProjectChapterConcatCleanupStsClientV1;
  now?: () => number;
};

type ProjectChapterConcatCleanupAssumeRoleConfigV1 = {
  baseCredentials: ProjectChapterConcatCleanupAwsCredentialsV1;
  roleArn: string;
  externalId?: string;
};

type CachedProjectChapterConcatCleanupAwsCredentialsV1 = {
  config: ProjectChapterConcatCleanupAssumeRoleConfigV1;
  credentials: ProjectChapterConcatCleanupAwsCredentialsV1;
  cacheExpiresAtMs: number;
};

let cachedProjectChapterConcatCleanupAwsCredentialsV1:
  CachedProjectChapterConcatCleanupAwsCredentialsV1 | null = null;

function resolveProjectChapterConcatCleanupAssumeRoleConfigV1(
  env: NodeJS.ProcessEnv = process.env,
): ProjectChapterConcatCleanupAssumeRoleConfigV1 {
  const accessKeyId = env[CLEANUP_ACCESS_KEY_ENV]?.trim() ?? "";
  const secretAccessKey = env[CLEANUP_SECRET_KEY_ENV]?.trim() ?? "";
  const sessionToken = env[CLEANUP_SESSION_TOKEN_ENV]?.trim() || undefined;
  if (!accessKeyId && !secretAccessKey && !sessionToken) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_NOT_CONFIGURED");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_INCOMPLETE");
  }
  if (![accessKeyId, secretAccessKey, sessionToken].every((value) => (
    value === undefined || SAFE_CREDENTIAL.test(value)
  ))) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_INVALID");
  }
  const roleArn = env[CLEANUP_ROLE_ARN_ENV]?.trim() ?? "";
  if (!roleArn) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_ROLE_ARN_NOT_CONFIGURED");
  }
  if (!CLEANUP_ROLE_ARN.test(roleArn)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_ROLE_ARN_INVALID");
  }
  const configuredExternalId = env[CLEANUP_EXTERNAL_ID_ENV];
  const externalId = configuredExternalId?.trim();
  if (
    configuredExternalId !== undefined
    && (!externalId || !SAFE_EXTERNAL_ID.test(externalId))
  ) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_EXTERNAL_ID_INVALID");
  }
  return {
    baseCredentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
    roleArn,
    ...(externalId ? { externalId } : {}),
  };
}

function sameProjectChapterConcatCleanupAssumeRoleConfigV1(
  left: ProjectChapterConcatCleanupAssumeRoleConfigV1,
  right: ProjectChapterConcatCleanupAssumeRoleConfigV1,
): boolean {
  return left.roleArn === right.roleArn
    && left.externalId === right.externalId
    && left.baseCredentials.accessKeyId === right.baseCredentials.accessKeyId
    && left.baseCredentials.secretAccessKey === right.baseCredentials.secretAccessKey
    && left.baseCredentials.sessionToken === right.baseCredentials.sessionToken;
}

function requiredAssumedCredentialV1(
  value: unknown,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_STS_CREDENTIALS_INCOMPLETE");
  }
  const normalized = value.trim();
  if (!SAFE_CREDENTIAL.test(normalized)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_STS_CREDENTIALS_INVALID");
  }
  return normalized;
}

export async function resolveProjectChapterConcatCleanupAwsCredentialsV1(
  env: NodeJS.ProcessEnv = process.env,
  options: ProjectChapterConcatCleanupAwsCredentialsOptionsV1 = {},
): Promise<ProjectChapterConcatCleanupAwsCredentialsV1> {
  const config = resolveProjectChapterConcatCleanupAssumeRoleConfigV1(env);
  const nowMs = options.now?.() ?? Date.now();
  if (!Number.isFinite(nowMs)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_TIME_INVALID");
  }
  const cached = cachedProjectChapterConcatCleanupAwsCredentialsV1;
  if (
    cached
    && sameProjectChapterConcatCleanupAssumeRoleConfigV1(cached.config, config)
    && cached.cacheExpiresAtMs > nowMs
  ) {
    return cached.credentials;
  }
  cachedProjectChapterConcatCleanupAwsCredentialsV1 = null;

  const stsClient = options.stsClient ?? new STSClient({
    region: CLEANUP_STS_REGION,
    credentials: config.baseCredentials,
  });
  const assumeRoleInput: AssumeRoleCommandInput = {
    RoleArn: config.roleArn,
    RoleSessionName: CLEANUP_STS_SESSION_NAME,
    DurationSeconds: CLEANUP_STS_DURATION_SECONDS,
    ...(config.externalId ? { ExternalId: config.externalId } : {}),
  };
  const response = await stsClient.send(new AssumeRoleCommand(assumeRoleInput));
  if (!response?.Credentials) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_STS_CREDENTIALS_NOT_RETURNED");
  }
  const assumedCredentials = response.Credentials;
  const accessKeyId = requiredAssumedCredentialV1(assumedCredentials.AccessKeyId);
  const secretAccessKey = requiredAssumedCredentialV1(assumedCredentials.SecretAccessKey);
  const sessionToken = requiredAssumedCredentialV1(assumedCredentials.SessionToken);
  if (!(assumedCredentials.Expiration instanceof Date)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_STS_CREDENTIALS_INCOMPLETE");
  }
  const expirationMs = assumedCredentials.Expiration.getTime();
  if (
    !Number.isFinite(expirationMs)
    || expirationMs <= nowMs + CLEANUP_CREDENTIAL_REFRESH_SKEW_MS
  ) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_STS_CREDENTIALS_EXPIRATION_INVALID");
  }
  const credentials: ProjectChapterConcatCleanupAwsCredentialsV1 = {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  };
  cachedProjectChapterConcatCleanupAwsCredentialsV1 = {
    config,
    credentials,
    cacheExpiresAtMs: expirationMs - CLEANUP_CREDENTIAL_REFRESH_SKEW_MS,
  };
  return credentials;
}

export function resetProjectChapterConcatCleanupAwsCredentialsCacheV1(): void {
  cachedProjectChapterConcatCleanupAwsCredentialsV1 = null;
}

export type ProjectChapterConcatCleanupDeleteInputV1 = {
  region: ProjectChapterConcatCleanupOutboxV1["descriptor"]["outputRegion"];
  bucket: string;
  key: string;
  versionId?: string;
  outputSizeBytes: number;
};
export type ProjectChapterConcatCleanupDeleteObjectV1 = (
  input: ProjectChapterConcatCleanupDeleteInputV1,
) => Promise<{ freedBytes?: number } | void>;
export type ProjectChapterConcatCleanupPrepareCredentialsV1 = () => Promise<
  ProjectChapterConcatCleanupAwsCredentialsV1 | void
>;

export type ProjectChapterConcatCleanupBatchResultV1 = {
  claimed: number;
  completed: number;
  failed: number;
  results: Array<{
    outboxId: string;
    state: "DONE" | "RETRY_SCHEDULED";
    freedBytes?: number;
  }>;
};

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
function boundedLeaseMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LEASE_MS;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_LEASE_MS) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_LEASE_INVALID");
  }
  return value;
}
function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BATCH_SIZE) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_BATCH_SIZE_INVALID");
  }
  return value;
}
function retryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 30_000 * (2 ** Math.max(0, Math.min(attempts - 1, 10))));
}
function sanitizedCleanupError(error: unknown): string {
  const name = error instanceof Error && error.name.trim()
    ? error.name.trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)
    : "UNKNOWN";
  return `PROJECT_CHAPTER_CONCAT_CLEANUP_PROVIDER_${name}`;
}
function isNoSuchKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; Code?: unknown };
  return candidate.name === "NoSuchKey"
    || candidate.code === "NoSuchKey"
    || candidate.Code === "NoSuchKey";
}

async function cleanupCollection(): Promise<Collection<ProjectChapterConcatCleanupOutboxV1>> {
  const db = await getDatabase();
  return db.collection<ProjectChapterConcatCleanupOutboxV1>(
    CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  );
}

function exactDeleteInputV1(
  descriptor: ProjectChapterConcatCleanupDescriptorV1,
): ProjectChapterConcatCleanupDeleteInputV1 {
  return {
    region: descriptor.outputRegion,
    bucket: descriptor.outputBucket,
    key: descriptor.outputKey,
    ...(descriptor.versionId === undefined ? {} : { versionId: descriptor.versionId }),
    outputSizeBytes: descriptor.output.sizeBytes,
  };
}

async function deleteConcatObjectFromS3V1(
  input: ProjectChapterConcatCleanupDeleteInputV1,
  credentials: ProjectChapterConcatCleanupAwsCredentialsV1,
): Promise<{ freedBytes: number }> {
  const commandInput: DeleteObjectCommandInput = {
    Bucket: input.bucket,
    Key: input.key,
    ...(input.versionId === undefined ? {} : { VersionId: input.versionId }),
  };
  const client = new S3Client({ region: input.region, credentials });
  try {
    await client.send(new DeleteObjectCommand(commandInput));
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return { freedBytes: input.outputSizeBytes };
    throw error;
  }
  return { freedBytes: input.outputSizeBytes };
}

export async function claimProjectChapterConcatCleanupV1(input: {
  collection?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
} = {}): Promise<ProjectChapterConcatCleanupOutboxV1 | null> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_TIME_INVALID");
  const claimToken = (input.claimToken ?? randomUUID()).trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(claimToken)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_CLAIM_TOKEN_INVALID");
  }
  const leaseMs = boundedLeaseMs(input.leaseMs);
  const collection = input.collection ?? await cleanupCollection();
  const claimed = await collection.findOneAndUpdate(
    {
      $or: [
        { status: "PENDING", availableAt: { $lte: now } },
        { status: "RUNNING", "lease.leaseExpiresAt": { $lte: now } },
      ],
    },
    {
      $set: {
        status: "RUNNING",
        lease: {
          claimToken,
          claimedAt: now,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
        updatedAt: now,
      },
      $inc: { attempts: 1 },
      $unset: { completion: "", lastError: "" },
    },
    { sort: { availableAt: 1, createdAt: 1, _id: 1 }, returnDocument: "after" },
  );
  if (!claimed) return null;
  const parsed = ProjectChapterConcatCleanupOutboxSchemaV1.parse(claimed);
  assertProjectChapterConcatCleanupOutboxV1(parsed);
  return parsed;
}

export async function completeProjectChapterConcatCleanupV1(input: {
  outbox: ProjectChapterConcatCleanupOutboxV1;
  claimToken: string;
  freedBytes?: number;
  collection?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  now?: Date;
}): Promise<{ completedAt: Date; freedBytes: number }> {
  assertProjectChapterConcatCleanupOutboxV1(input.outbox);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.claimToken)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_CLAIM_TOKEN_INVALID");
  }
  const completedAt = input.now ?? new Date();
  const expectedBytes = input.outbox.descriptor.output.sizeBytes;
  const freedBytes = input.freedBytes ?? expectedBytes;
  if (!validDate(completedAt) || !Number.isSafeInteger(freedBytes) || freedBytes < 0) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_COMPLETION_INVALID");
  }
  if (freedBytes !== expectedBytes) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_FREED_BYTES_MISMATCH");
  }
  const collection = input.collection ?? await cleanupCollection();
  const completion = { completedAt, freedBytes };
  const completed = await collection.updateOne(
    {
      _id: input.outbox._id,
      status: "RUNNING",
      "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
      "lease.claimToken": input.claimToken,
    },
    { $set: { status: "DONE", completion, updatedAt: completedAt }, $unset: { lease: "", lastError: "" } },
  );
  if (completed.modifiedCount === 1) return completion;
  const existing = await collection.findOne({
    _id: input.outbox._id,
    "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
  });
  if (
    existing?.status === "DONE"
    && existing.descriptor.descriptorHash === input.outbox.descriptor.descriptorHash
    && existing.completion?.freedBytes === freedBytes
  ) return existing.completion;
  throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_COMPLETION_WRITE_UNPROVED");
}

export async function releaseProjectChapterConcatCleanupV1(input: {
  outbox: ProjectChapterConcatCleanupOutboxV1;
  claimToken: string;
  error: unknown;
  collection?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  now?: Date;
}): Promise<Date> {
  assertProjectChapterConcatCleanupOutboxV1(input.outbox);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.claimToken)) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_CLAIM_TOKEN_INVALID");
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_TIME_INVALID");
  const availableAt = new Date(now.getTime() + retryDelayMs(input.outbox.attempts));
  const collection = input.collection ?? await cleanupCollection();
  const released = await collection.updateOne(
    {
      _id: input.outbox._id,
      status: "RUNNING",
      "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
      "lease.claimToken": input.claimToken,
    },
    {
      $set: {
        status: "PENDING",
        availableAt,
        updatedAt: now,
        lastError: sanitizedCleanupError(input.error),
      },
      $unset: { lease: "", completion: "" },
    },
  );
  if (released.modifiedCount !== 1) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_RELEASE_WRITE_UNPROVED");
  }
  return availableAt;
}

export async function runProjectChapterConcatCleanupBatchV1(input: {
  collection?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  limit?: number;
  leaseMs?: number;
  now?: Date;
  prepareCredentials?: ProjectChapterConcatCleanupPrepareCredentialsV1;
  deleteObject?: ProjectChapterConcatCleanupDeleteObjectV1;
} = {}): Promise<ProjectChapterConcatCleanupBatchResultV1> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_TIME_INVALID");
  const collection = input.collection ?? await cleanupCollection();
  const limit = boundedBatchSize(input.limit);
  const prepareCredentials = input.prepareCredentials
    ?? (async () => resolveProjectChapterConcatCleanupAwsCredentialsV1());
  const result: ProjectChapterConcatCleanupBatchResultV1 = {
    claimed: 0,
    completed: 0,
    failed: 0,
    results: [],
  };

  for (let index = 0; index < limit; index += 1) {
    const claimToken = randomUUID();
    const outbox = await claimProjectChapterConcatCleanupV1({
      collection,
      claimToken,
      leaseMs: input.leaseMs,
      now,
    });
    if (!outbox) break;
    result.claimed += 1;
    try {
      const credentials = await prepareCredentials();
      if (!input.deleteObject && !credentials) {
        throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_NOT_CONFIGURED");
      }
      const deleteObject = input.deleteObject
        ?? ((deleteInput: ProjectChapterConcatCleanupDeleteInputV1) => (
          deleteConcatObjectFromS3V1(deleteInput, credentials!)
        ));
      let deletion: { freedBytes?: number } | void;
      try {
        deletion = await deleteObject(exactDeleteInputV1(outbox.descriptor));
      } catch (error: unknown) {
        if (!isNoSuchKey(error)) throw error;
        deletion = undefined;
      }
      const freedBytes = deletion && deletion.freedBytes !== undefined
        ? deletion.freedBytes
        : outbox.descriptor.output.sizeBytes;
      const completion = await completeProjectChapterConcatCleanupV1({
        outbox,
        claimToken,
        freedBytes,
        collection,
        now,
      });
      result.completed += 1;
      result.results.push({ outboxId: outbox._id, state: "DONE", freedBytes: completion.freedBytes });
    } catch (error: unknown) {
      await releaseProjectChapterConcatCleanupV1({
        outbox,
        claimToken,
        error,
        collection,
        now,
      });
      result.failed += 1;
      result.results.push({ outboxId: outbox._id, state: "RETRY_SCHEDULED" });
    }
  }
  return result;
}

export const runChapterConcatCleanupBatchV1 = runProjectChapterConcatCleanupBatchV1;
