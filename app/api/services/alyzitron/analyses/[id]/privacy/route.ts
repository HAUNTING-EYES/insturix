import { NextResponse } from "next/server";
import { getCollections } from "../../../utils/mongodb";
import { auth } from "@clerk/nextjs/server";
import { logger } from "../../../utils/logger";
import { ObjectId } from "mongodb";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
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

    // Skip favicon.ico requests and other static file requests
    if (id === 'favicon.ico' || id === 'robots.txt' || id === 'manifest.json') {
      return NextResponse.json(
        { error: 'Invalid analysis ID' },
        { status: 400 }
      );
    }

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid analysis ID' },
        { status: 400 }
      );
    }

    const { isPublic } = await request.json();

    if (typeof isPublic !== 'boolean') {
      return NextResponse.json(
        { error: 'isPublic must be a boolean' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();

    const result = await analyses.updateOne(
      {
        _id: new ObjectId(id),
        clerkUserId: session.userId
      } as any,
      {
        $set: {
          'metadata.isPublic': isPublic,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      logger.warn('Analysis not found or access denied', {
        userId: session.userId,
        analysisId: id
      });
      return NextResponse.json(
        { error: 'Analysis not found or access denied' },
        { status: 404 }
      );
    }

    logger.info('Analysis privacy updated', {
      userId: session.userId,
      analysisId: id,
      isPublic: isPublic
    });

    return NextResponse.json({ 
      success: true,
      isPublic: isPublic
    });

  } catch (error) {
    logger.error('Failed to update analysis privacy', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to update analysis privacy' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';