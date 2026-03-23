/**
 * GET /api/services/editron/lottie?q=search+term&page=1&perPage=12
 *
 * Search LottieFiles for motion graphics animations.
 * Returns Lottie JSON URLs that can be rendered as overlays in Editron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchLottieAnimations } from '@/lib/editron/services/lottie-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const q = request.nextUrl.searchParams.get('q') || '';
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const perPage = parseInt(request.nextUrl.searchParams.get('perPage') || '12', 10);
    const category = request.nextUrl.searchParams.get('category') || undefined;

    if (!q) {
      return NextResponse.json({ error: 'Search query (q) is required' }, { status: 400 });
    }

    const results = await searchLottieAnimations(q, { page, perPage, category });

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error: any) {
    console.error('[Lottie API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
