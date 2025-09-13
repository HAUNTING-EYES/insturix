import { NextRequest, NextResponse } from 'next/server';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';
import { z } from 'zod';

const requestSchema = z.object({
  gcsUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gcsUrl } = requestSchema.parse(body);
    
    console.log('Getting signed URL for:', gcsUrl);

    const signedUrl = await ClickatronGCSManager.getSignedUrl(gcsUrl);
    
    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    return NextResponse.json({ error: 'Failed to get signed URL' }, { status: 500 });
  }
}