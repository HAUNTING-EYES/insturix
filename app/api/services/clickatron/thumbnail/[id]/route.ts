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
    // Keep auth, but do not block HEAD requests from preflight/Next Image checks
    const isHead = request.method === 'HEAD';
    const session = await auth();
    if (!session?.userId) {
      // For HEAD, respond 200 with no body to avoid breaking prefetchers
      if (isHead) {
        return new NextResponse(null, { status: 200 });
      }
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
        const parsed = new URL(decodedId);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          pathParts.shift(); // Remove bucket name
          gcsPath = pathParts.join('/');
        }
      } else {
        // It's already a path
        gcsPath = decodedId;
      }
    } catch {
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

    // If the client prefers direct bytes (we use this to avoid extra redirect hops)
    const prefer = request.headers.get('x-prefer-bytes');
    if (prefer === '1') {
      // Stream the image bytes directly with proper headers
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || 'image/png';
      const [buffer] = await file.download();

      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Otherwise, generate signed URL for read access and redirect
    const signUrlConfig: GetSignedUrlConfig = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
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