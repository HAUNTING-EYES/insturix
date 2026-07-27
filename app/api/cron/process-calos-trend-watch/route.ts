import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { processNextDueTrendWatch } from "@/lib/calos/trend-watch-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH_LIMIT = 3;
const MAX_BATCH_LIMIT = 10;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function batchLimit(): number {
  const parsed = Number.parseInt(process.env.CALOS_TREND_WATCH_BATCH_LIMIT ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH_LIMIT, Math.max(1, parsed)) : DEFAULT_BATCH_LIMIT;
}

/** Collects public evidence only. Private matching and calendar changes happen in later stages. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const summary = { claimed: 0, completed: 0, unavailable: 0, failed: 0, cached: 0 };

    for (let index = 0; index < batchLimit(); index++) {
      const result = await processNextDueTrendWatch();
      if (result.status === "idle") break;
      summary.claimed++;
      if (result.status === "completed") {
        summary.completed++;
        if (result.resultSource === "cached") summary.cached++;
      } else if (result.status === "unavailable") {
        summary.unavailable++;
      } else {
        summary.failed++;
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[CalOS:TrendWatchCron] Failed", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Trend watch scan failed" }, { status: 500 });
  }
}