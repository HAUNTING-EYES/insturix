import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { connectToDatabase } from '@/lib/editron/db/mongodb';
import { IClickatronTask, Variation } from '@/types/clickatron';
import { ObjectId } from 'mongodb';

/**
 * POST /api/services/clickatron/save-sketch-result
 * 
 * Saves a generated sketch-to-edit image as a new variation.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId, imageB64, prompt, modelId, parentVariationId, aspectRatio } = await request.json();

    if (!sessionId || !imageB64 || !aspectRatio) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Convert B64 to Buffer
    const base64Content = imageB64.includes(",") 
      ? imageB64.split(",")[1] 
      : imageB64;
    const buffer = Buffer.from(base64Content, 'base64');

    // 2. Upload to R2
    const variationId = `var_${Date.now()}`;
    const r2Url = await ClickatronR2Manager.uploadImageBuffer(
      userId,
      sessionId,
      variationId,
      buffer,
      'image/png'
    );
    const imageUrl = r2Url.split('?')[0];

    // 3. Create Variation Object
    const now = new Date();
    const newVar: Variation = {
      id: variationId,
      prompt: prompt || `Sketch edit using ${modelId}`,
      status: 'completed',
      imageRef: imageUrl,
      thumbnailRef: imageUrl,
      aspectRatio,
      fineTuning: {
        brightness: 100,
        contrast: 100,
        saturation: 100
      },
      createdAt: now,
      updatedAt: now,
      parentVariationId,
      modelId,
      metadata: {
        sketchToEdit: {
          sketchToEdit: true,
          model: modelId,
          imageDimensions: { width: 0, height: 0 },
          processingTimeMs: 0
        }
      }
    };

    // 4. Update Database
    const { db } = await connectToDatabase();
    const collectionName = process.env.CLICKATRON_MONGO_COLLECTION || 'clickatrontasks';
    
    // Owner-scope the write: a user may only save a sketch result into their OWN session.
    // Without clerkUserId in the filter this is an IDOR — any authed user who knows a
    // sessionId could push a variation into another user's canvas.
    const updateResult = await db.collection(collectionName).updateOne(
      { _id: new ObjectId(sessionId), clerkUserId: userId },
      {
        $push: { "details.canvas.variations": { $each: [newVar], $position: 0 } } as any,
        $set: { updatedAt: now }
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, variation: newVar });

  } catch (error: any) {
    console.error('[API SaveSketch] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
