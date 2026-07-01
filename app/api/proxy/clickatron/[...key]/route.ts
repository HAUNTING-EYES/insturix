import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  requireClickatronOwnedStorageKey,
  StorageOwnershipError,
} from "@/app/api/services/shared/storage-ownership";

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID_CLICKATRON;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID_CLICKATRON;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY_CLICKATRON;
  const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("R2 credentials not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function bodyToBuffer(body: any): Promise<Buffer> {
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  if (typeof body.getReader === "function") {
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key: keyParts } = await params;
    const rawKey = keyParts.join("/");
    const key = requireClickatronOwnedStorageKey(session.userId, rawKey);

    const response = await getR2Client().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME_CLICKATRON!,
      Key: key,
    }));

    if (!response.Body) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const buffer = await bodyToBuffer(response.Body);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": response.ContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "ETag": response.ETag || "",
      },
    });
  } catch (error: any) {
    if (error instanceof StorageOwnershipError) {
      return NextResponse.json({ error: error.status === 400 ? "Invalid asset key" : "Asset not found" }, { status: error.status });
    }
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    console.error("Proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Allow": "GET, OPTIONS",
    },
  });
}
