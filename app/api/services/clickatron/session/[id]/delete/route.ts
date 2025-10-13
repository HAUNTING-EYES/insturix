import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';

// DELETE /api/services/clickatron/session/:id/delete - Delete a session and all associated images
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    
    // Find the task first to get all image references
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Delete all associated images from GCS
    const variations = task.details?.canvas?.variations || [];
    const deletePromises = [];
    
    for (const variation of variations) {
      // Delete main image if it exists
      if (variation.imageRef) {
        try {
          // Extract raw GCS path (without query params)
          const rawGcsPath = variation.imageRef.split('?')[0];
          deletePromises.push(ClickatronGCSManager.deleteImage(rawGcsPath));
          console.log(`Queued deletion of GCS image for variation ${variation.id}: ${rawGcsPath}`);
        } catch (gcsError) {
          console.error(`Failed to queue GCS image deletion for variation ${variation.id}:`, gcsError);
        }
      }
      
      // Delete reference images if they exist
      if (variation.referenceImageRefs && Array.isArray(variation.referenceImageRefs)) {
        for (const refImage of variation.referenceImageRefs) {
          try {
            const rawGcsPath = refImage.split('?')[0];
            deletePromises.push(ClickatronGCSManager.deleteImage(rawGcsPath));
            console.log(`Queued deletion of GCS reference image: ${rawGcsPath}`);
          } catch (gcsError) {
            console.error(`Failed to queue GCS reference image deletion:`, gcsError);
          }
        }
      }
    }
    
    // Wait for all deletions to complete
    await Promise.allSettled(deletePromises);
    
    // Delete the task from MongoDB
    await ClickatronTask.deleteOne({ _id: objectId, clerkUserId: userId });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Session and all associated images deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}