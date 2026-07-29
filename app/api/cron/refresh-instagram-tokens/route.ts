import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { refreshDueInstagramTokens } from "@/lib/uploaderx/instagram-token-health";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function batchLimit() {
  const parsed = Number.parseInt(process.env.INSTAGRAM_TOKEN_REFRESH_BATCH_LIMIT ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(MAX_BATCH_LIMIT, Math.max(1, parsed))
    : DEFAULT_BATCH_LIMIT;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const summary = await refreshDueInstagramTokens(batchLimit());
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[InstagramTokenRefreshCron] Failed", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Instagram token refresh failed" },
      { status: 500 },
    );
  }
}
