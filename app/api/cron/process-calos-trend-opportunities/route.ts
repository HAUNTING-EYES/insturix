import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { processNextTrendOpportunity } from "@/lib/calos/trend-opportunity-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH_LIMIT = 5;
const MAX_BATCH_LIMIT = 20;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function batchLimit(): number {
  const parsed = Number.parseInt(process.env.CALOS_TREND_OPPORTUNITY_BATCH_LIMIT ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH_LIMIT, Math.max(1, parsed)) : DEFAULT_BATCH_LIMIT;
}

/** Resolves public scan evidence against private accepted Brand Vault signals. It never mutates calendar cards. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const summary = { claimed: 0, suggested: 0, notRelevant: 0, blocked: 0, failed: 0, adapt: 0, add: 0 };
    for (let index = 0; index < batchLimit(); index++) {
      const result = await processNextTrendOpportunity();
      if (result.status === "idle") break;
      summary.claimed++;
      if (result.status === "suggested") {
        summary.suggested++;
        summary[result.recommendation]++;
      } else if (result.status === "not_relevant") {
        summary.notRelevant++;
      } else if (result.status === "blocked") {
        summary.blocked++;
      } else {
        summary.failed++;
      }
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[CalOS:TrendOpportunityCron] Failed", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Trend opportunity matching failed" }, { status: 500 });
  }
}