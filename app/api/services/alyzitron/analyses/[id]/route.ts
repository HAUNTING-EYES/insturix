import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollections } from "../../utils/mongodb";
import { serializeAnalysis } from "@/app/dashboard/alyzitron/utils/serialization";
import { logError } from "../../utils/logger";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    
    if (!params?.id) {
      return NextResponse.json(
        { error: 'Missing analysis ID' },
        { status: 400 }
      );
    }

    const { id } = params;

    try {
      const session = await auth();
      if (!session?.userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const objectId = new ObjectId(id);
      const { analyses } = await getCollections();
      
      const analysis = await analyses.findOne({
        _id: objectId,
        clerkUserId: session.userId,
      });

      if (!analysis) {
        return NextResponse.json(
          { error: 'Analysis not found' },
          { status: 404 }
        );
      }

      const serializedAnalysis = serializeAnalysis(analysis);
      return NextResponse.json(serializedAnalysis);

    } catch (error) {
      logError('GET /analyses/[id]', error);
      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    logError('GET /analyses/[id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;

    if (!params?.id) {
      return NextResponse.json(
        { error: 'Missing analysis ID' },
        { status: 400 }
      );
    }

    const { id } = params;

    try {
      const session = await auth();
      if (!session?.userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const objectId = new ObjectId(id);
      const data = await request.json();
      const { analyses } = await getCollections();

      const updateResult = await analyses.updateOne(
        {
          _id: objectId,
          clerkUserId: session.userId,
        },
        {
          $set: data
        }
      );

      if (updateResult.matchedCount === 0) {
        return NextResponse.json(
          { error: 'Analysis not found' },
          { status: 404 }
        );
      }

      const updatedAnalysis = await analyses.findOne({
        _id: objectId,
        clerkUserId: session.userId,
      });

      const serializedAnalysis = serializeAnalysis(updatedAnalysis);
      return NextResponse.json(serializedAnalysis);

    } catch (error) {
      logError('PUT /analyses/[id]', error);
      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    logError('PUT /analyses/[id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}