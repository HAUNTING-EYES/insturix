import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcsCredentials) {
  throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set for GCS');
}

const storage = new Storage({
  projectId: gcsCredentials.project_id,
  credentials: gcsCredentials,
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await params;

  try {
    const decodedId = decodeURIComponent(id);
    const bucket = storage.bucket('clickatron');
    const file = bucket.file(decodedId);

    const [exists] = await file.exists();

    if (!exists) {
      return new NextResponse(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const [buffer] = await file.download();

    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'image/png';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': metadata.size?.toString() || buffer.length.toString(),
      },
    });
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