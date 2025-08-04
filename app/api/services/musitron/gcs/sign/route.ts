// app/api/services/musitron/gcs/sign/route.ts

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from "@google-cloud/storage";

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, "base64").toString())
  : null;
const hasGCSConfig = !!(gcsCredentials && process.env.GCS_BUCKET_NAME);

const storage = hasGCSConfig
  ? new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    })
  : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.GCS_BUCKET_NAME!) : null;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, gcsUrl } = await request.json();

    if (!filename && !gcsUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!hasGCSConfig || !bucket) {
      return NextResponse.json({ error: "Storage configuration error" }, { status: 500 });
    }

    // Derive GCS path from gcsUrl or filename
    let gcsPath = "";
    if (gcsUrl) {
      // The gcsUrl might be double-encoded (contains URL-encoded URL)
      // Decode it first to get the actual URL
      let decodedUrl = gcsUrl;
      try {
        decodedUrl = decodeURIComponent(gcsUrl);
      } catch {
        // If decoding fails, use the original URL
        console.warn("Failed to decode URL, using original:", gcsUrl);
      }
      
      // Extract the path from the decoded URL
      const url = new URL(decodedUrl);
      // Remove the first segment (bucket name) from the path
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        pathParts.shift(); // Remove bucket name
        gcsPath = pathParts.join('/');
      }
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
  } catch {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }
}