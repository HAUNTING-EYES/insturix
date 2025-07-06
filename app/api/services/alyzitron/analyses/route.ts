import { NextResponse } from "next/server";
import { getCollections } from "../utils/mongodb";
import { auth } from "@clerk/nextjs/server";
import { logger } from "../utils/logger";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    const { analyses } = await getCollections();
    
    // Get total count for pagination
    const totalItems = await analyses
      .countDocuments({ clerkUserId: session.userId });

    // Get paginated data
    const query = analyses
      .find({ clerkUserId: session.userId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    const userAnalyses = await query.toArray();

    // Serialize processingStartTime to timestamp and convert ObjectId to string
    const serializedAnalyses = userAnalyses.map(a => ({
      ...a,
      _id: a._id.toString(),
      processingStartTime: a.processingStartTime ? new Date(a.processingStartTime).getTime() : null
    }));

    return NextResponse.json({
      data: serializedAnalyses,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });

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

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { analysisId } = await request.json();
    
    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();
    
    const result = await analyses.updateOne(
      {
        _id: analysisId,
        clerkUserId: session.userId
      },
      {
        $set: { unread: false }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    logger.info('Updated analysis unread status', {
      userId: session.userId,
      analysisId
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Failed to update analysis', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to update analysis' },
      { status: 500 }
    );
  }
}