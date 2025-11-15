import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.MONOLITHIC_BACKEND_URL;
const BACKEND_SECRET = process.env.MONOLITHIC_BACKEND_SECRET;

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!BACKEND_URL || !BACKEND_SECRET) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scriptId = searchParams.get('scriptId');
    const sessionId = searchParams.get('sessionId');

    if (!scriptId && !sessionId) {
      return NextResponse.json(
        { error: 'scriptId or sessionId query parameter is required' },
        { status: 400 }
      );
    }

    // Build query string - prefer sessionId if both provided
    const queryParam = sessionId 
      ? `sessionId=${encodeURIComponent(sessionId)}`
      : `scriptId=${encodeURIComponent(scriptId!)}`;

    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, '')}/thinkforge/script/blocks?${queryParam}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BACKEND_SECRET}`,
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, body: errorText.slice(0, 800) },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching script blocks:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch script blocks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!BACKEND_URL || !BACKEND_SECRET) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { scriptId, blocks } = body;

    if (!scriptId || !blocks) {
      return NextResponse.json(
        { error: 'scriptId and blocks are required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, '')}/thinkforge/script/blocks`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BACKEND_SECRET}`,
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify({ scriptId, blocks }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Backend error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, body: errorText.slice(0, 800) },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error saving script blocks:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save script blocks' },
      { status: 500 }
    );
  }
}

