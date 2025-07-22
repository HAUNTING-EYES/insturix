// app/api/services/musitron/gcs/sign/route.ts

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from "@google-cloud/storage";

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, "base64").toString())
  : null;
const hasGCSConfig = !!(gcsCredentials && process.env.MUSITRON_GCS_BUCKET_NAME);

const storage = hasGCSConfig
  ? new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    })
  : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.MUSITRON_GCS_BUCKET_NAME!) : null;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType, gcsUrl } = await request.json();

    if (!filename && !gcsUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!hasGCSConfig || !bucket) {
      return NextResponse.json({ error: "Storage configuration error" }, { status: 500 });
    }

    // Derive GCS path from gcsUrl or filename
    let gcsPath = "";
    if (gcsUrl && gcsUrl.startsWith("https://storage.googleapis.com/")) {
      gcsPath = gcsUrl.replace(`https://storage.googleapis.com/${process.env.MUSITRON_GCS_BUCKET_NAME}/`, "");
    } else if (filename) {
      gcsPath = filename;
    } else {
      return NextResponse.json({ error: "Invalid GCS path" }, { status: 400 });
    }

    const file = bucket.file(gcsPath);

    // Remove contentType from signed URL config for read action
    const signUrlConfig: GetSignedUrlConfig = {
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60 * 1000 // 15 minutes
      // Do NOT set contentType for read signed URLs
    };

    const [signedUrl] = await file.getSignedUrl(signUrlConfig);

    return NextResponse.json({
      url: signedUrl,
      gcsPath,
      storage: "gcs"
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }
}