import { NextResponse } from 'next/server';
import { GCSManager } from '@/app/api/services/alyzitron/utils/gcs';

export async function POST(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  const serviceSecret = process.env.SERVICES_WEBHOOK_SECRET;

  if (!serviceSecret || authHeader !== `Bearer ${serviceSecret}`) {
    console.warn('Unauthorized webhook call for Alyzitron cleanup');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Parse request body
    const body = await request.json();
    const { taskType, userid: userId, videoUrl } = body;

    if (!taskType || !userId || !videoUrl) {
      return new NextResponse('Missing required fields: taskType, userid, or videoUrl', { status: 400 });
    }

    // 3. Check if videoUrl is a GCS URL (not YouTube)
    const isGCS = videoUrl.startsWith('gs://');
    
    if (!isGCS) {
      console.log('Video URL is not a GCS URL, skipping cleanup:', videoUrl);
      return new NextResponse('Video URL is not a GCS URL, skipping cleanup', { status: 200 });
    }

    // Extract GCS path from the URL
    const gcsPath = videoUrl.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');
    
    // 4. Delete the GCS file
    await GCSManager.deleteFile(gcsPath);
    
    console.log('Successfully cleaned up GCS file for failed analysis', {
      taskType,
      userId,
      gcsPath,
      videoUrl
    });

    return new NextResponse('Cleanup completed successfully', { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing Alyzitron cleanup webhook', { 
      errorMessage,
      error 
    });
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}