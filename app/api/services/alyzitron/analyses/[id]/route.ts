import { NextResponse } from "next/server";
import { getCollections } from "../../utils/mongodb";
import { auth } from "@clerk/nextjs/server";
import { logger } from "../../utils/logger";
import { ObjectId } from "mongodb";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const [session, { id }] = await Promise.all([
      auth(),
      context.params
    ]);

    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid analysis ID' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();

    const analysis = await analyses.findOne({
      _id: new ObjectId(id),
      clerkUserId: session.userId
    });

    if (!analysis) {
      logger.warn('Analysis not found', {
        userId: session.userId,
        analysisId: id
      });
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    logger.info('Fetched analysis details', {
      userId: session.userId,
      analysisId: id,
      status: analysis.status
    });

    return NextResponse.json(analysis);

  } catch (error) {
    logger.error('Failed to fetch analysis', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to fetch analysis' },
      { status: 500 }
    );
  }
}

// Required for dynamic API routes
export const dynamic = 'force-dynamic';