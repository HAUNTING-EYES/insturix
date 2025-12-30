import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, inputProps, compositionId } = body;

    // Use the custom Cloud Run service URL
    const cloudRunUrl = process.env.REMOTION_CLOUDRUN_URL;
    if (!cloudRunUrl) {
      throw new Error('REMOTION_CLOUDRUN_URL is not defined');
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
       throw new Error('GCS_BUCKET_NAME is not defined');
    }

    console.log('Triggering render on Cloud Run:', cloudRunUrl);

    // Create an authentication client
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(cloudRunUrl);
    const clientHeaders = await client.getRequestHeaders();

    // Call the custom renderer service
    const response = await fetch(`${cloudRunUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': (clientHeaders as any)['Authorization'] || '',
      },
      body: JSON.stringify({
        id: id || compositionId, // The server expects 'id' as the composition ID
        inputProps,
        bucketName,
        outName: `renders/${Date.now()}-${id || compositionId}.mp4`
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Renderer service failed: ${errorText}`);
    }

    const data = await response.json();

    // Wrap in ApiResponse format expected by frontend
    return NextResponse.json({
      type: 'success',
      data: data
    });
  } catch (error: any) {
    console.error('Cloud Run render error:', error);
    return NextResponse.json(
      { 
        type: 'error', 
        message: error.message || 'Failed to trigger render' 
      },
      { status: 500 }
    );
  }
}
