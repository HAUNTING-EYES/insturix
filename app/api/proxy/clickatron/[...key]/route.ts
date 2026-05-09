export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize R2 client
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

export async function GET(
  request: Request,
  { params }: { params: { key: string[] } }
) {
  try {
    const key = params.key.join("/");
    
    if (!key) {
      return NextResponse.json(
        { error: "Missing asset key" },
        { status: 400 }
      );
    }

    const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;
    const s3Client = getR2Client();

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Convert ReadableStream to buffer
    const chunks: Uint8Array[] = [];
    const reader = (response.Body as ReadableStream).getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const buffer = Buffer.concat(chunks);

    // Return with CORS headers
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": response.ContentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "ETag": response.ETag || "",
      },
    });

  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
