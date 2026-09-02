import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export async function runProjectRenderR2LiveProofV1(
  fixtureNonce: string,
): Promise<Record<string, unknown>> {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET_NAME");
  const key = `editron-live-proof/${fixtureNonce}`;
  const bytes = Buffer.from("editron-project-render-r2-live-proof-v1");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId, secretAccessKey },
  });
  let putSucceeded = false;
  let cleanupAttempted = false;
  let cleanupVerified = false;
  let outcome: Record<string, unknown> = {
    status: "BLOCKED",
    reason: "R2_PROOF_NOT_RUN",
  };
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: "application/octet-stream",
      Metadata: { purpose: "editron-project-render-live-proof" },
    }));
    putSucceeded = true;
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const fetched = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const fetchedBytes = Buffer.from(await fetched.Body!.transformToByteArray());
    if (
      head.ContentLength !== bytes.length
      || createHash("sha256").update(fetchedBytes).digest("hex") !== digest
    ) {
      throw new Error("R2_EXACT_READ_MISMATCH");
    }
    cleanupAttempted = true;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      cleanupVerified = isNotFound(error);
    }
    if (!cleanupVerified) throw new Error("R2_DELETE_UNPROVED");
    outcome = {
      status: "PASS",
      put: true,
      head: true,
      get: true,
      delete: true,
    };
  } catch (error) {
    outcome = {
      status: "BLOCKED",
      reason: error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN",
    };
  } finally {
    if (!cleanupVerified) {
      cleanupAttempted = true;
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        } catch (error) {
          cleanupVerified = isNotFound(error);
        }
      } catch {
        cleanupVerified = false;
      }
    }
  }
  if (putSucceeded && !cleanupVerified) {
    outcome = {
      status: "FAIL",
      reason: "R2_TEMPORARY_OBJECT_CLEANUP_UNPROVED",
    };
  }
  return {
    ...outcome,
    configured: true,
    putSucceeded,
    cleanupAttempted,
    cleanupVerified,
  };
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === "NotFound"
    || candidate.name === "NoSuchKey"
    || candidate.$metadata?.httpStatusCode === 404;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LIVE_PROOF_${name}_MISSING`);
  return value;
}
