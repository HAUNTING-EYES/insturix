import { NextRequest, NextResponse } from 'next/server';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { z } from 'zod';

const requestSchema = z.object({
  r2Url: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { r2Url } = requestSchema.parse(body);
    
    console.log('Getting signed URL for:', r2Url);

    const signedUrl = await ClickatronR2Manager.getSignedUrl(r2Url);
    
    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    return NextResponse.json({ error: 'Failed to get signed URL' }, { status: 500 });
  }
}
