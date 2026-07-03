import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import {
  requireKnownImageProxyStorageKey,
  StorageOwnershipError,
} from "@/app/api/services/shared/storage-ownership";

function getStorageBucket() {
  const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS || "", "base64").toString()),
  });
  return storage.bucket(process.env.GCS_BUCKET_NAME || "");
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedPath = request.nextUrl.searchParams.get("path");
    if (!requestedPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const gcsPath = requireKnownImageProxyStorageKey(session.userId, requestedPath);
    const bucket = getStorageBucket();
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType || "image/jpeg");
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Unsupported media type" }, { status: 415 });
    }

    const nodeStream = file.createReadStream();
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => {
          controller.enqueue(chunk);
        });
        nodeStream.on("end", () => {
          controller.close();
        });
        nodeStream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof StorageOwnershipError) {
      return NextResponse.json({ error: error.status === 400 ? "Invalid path parameter" : "File not found" }, { status: error.status });
    }

    console.error("Error proxying image:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
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
