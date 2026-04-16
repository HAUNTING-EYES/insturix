import { NextRequest, NextResponse } from "next/server";
import { extractMediaUri } from "@/lib/alyzitron/extraction/apify";

/**
 * POST /api/services/alyzitron/test-extract
 *
 * Sandbox route for testing Apify extraction speed and reliability.
 * Protected by x-development-bypass header.
 *
 * Body: { url: string }
 * Returns: { success, uri, mediaType, platform, timeTaken }
 */
export async function POST(request: NextRequest) {
  const bypass = request.headers.get("x-development-bypass");
  if (bypass !== "true") {
    return NextResponse.json(
      { error: "Not authorized. Set x-development-bypass header." },
      { status: 403 }
    );
  }

  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const result = await extractMediaUri(url);
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      uri: result.downloadUrl,
      mediaType: result.mediaType,
      platform: result.platform,
      timeTaken: `${elapsed}ms`,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Extraction failed",
        code: err.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
