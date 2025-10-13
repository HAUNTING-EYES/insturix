import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS || '', 'base64').toString()),
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || '');

export async function GET(request: NextRequest) {
  try {
    const gcsPath = request.nextUrl.searchParams.get('path');
    if (!gcsPath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const file = bucket.file(decodeURIComponent(gcsPath));
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'image/jpeg';

    const nodeStream = file.createReadStream();

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        nodeStream.on('end', () => {
          controller.close();
        });
        nodeStream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      }
    });

    const response = new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

    return response;
  } catch (error) {
    console.error('Error proxying image:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  const response = NextResponse.json({});
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}