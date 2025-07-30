import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;
const hasGCSConfig = !!(gcsCredentials && process.env.GCS_BUCKET_NAME);

const storage = hasGCSConfig
  ? new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    })
  : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.GCS_BUCKET_NAME!) : null;

export async function GET(
  request: NextRequest
) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
      return NextResponse.json({ error: 'Missing or invalid ID' }, { status: 400 });
    }

    const decodedId = decodeURIComponent(id);
    
    // Extract the GCS path from the URL
    let gcsPath = '';
    try {
      // The id might be a full GCS URL that needs to be processed
      if (decodedId.startsWith('https://storage.googleapis.com/')) {
        const url = new URL(decodedId);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          pathParts.shift(); // Remove bucket name
          gcsPath = pathParts.join('/');
        }
      } else {
        // It's already a path
        gcsPath = decodedId;
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid file path format' }, { status: 400 });
    }

    if (!hasGCSConfig || !bucket) {
      return NextResponse.json({ error: 'Storage configuration error' }, { status: 500 });
    }

    const file = bucket.file(gcsPath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return new NextResponse(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Generate signed URL for read access
    const signUrlConfig: GetSignedUrlConfig = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      // Do NOT set contentType for read signed URLs
    };

    const [signedUrl] = await file.getSignedUrl(signUrlConfig);

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl, 302);
  } catch (error: any) {
    console.error('Error fetching thumbnail:', error);
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}