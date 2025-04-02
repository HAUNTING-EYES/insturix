import { NextResponse } from "next/server";
import { getCollections } from "../utils/mongodb";
import { auth } from "@clerk/nextjs/server";
import { logger } from "../utils/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { analyses } = await getCollections();
const userAnalyses = await analyses
  .find({ clerkUserId: session.userId })
  .sort({ createdAt: -1 })
  .toArray();

logger.info('Fetched analyses', {
  userId: session.userId,
  count: userAnalyses.length
});

return NextResponse.json(userAnalyses);
    return NextResponse.json(userAnalyses);

  } catch (error) {
    logger.error('Failed to fetch analyses', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to fetch analyses' },
      { status: 500 }
    );
  }
}