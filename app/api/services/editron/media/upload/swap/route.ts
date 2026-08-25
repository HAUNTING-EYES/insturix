/**
 * POST /api/services/editron/media/upload/swap
 *
 * Promotes a proxy only after the server finds the caller-owned, completed
 * multipart original. Browser URLs and storage keys are intentionally ignored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runMediaProxyMasterTransitionV1 } from '@/lib/editron/services/media-proxy-master-transition-v1';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { assetId?: unknown };
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'ASSET_ID_REQUIRED' },
        { status: 400 },
      );
    }

    const result = await runMediaProxyMasterTransitionV1({ assetId, userId });
    if (result.disposition === 'SKIPPED' && result.reason === 'ASSET_NOT_FOUND') {
      return NextResponse.json({ success: false, error: result.reason }, { status: 404 });
    }
    if (result.disposition === 'SKIPPED' || result.disposition === 'RACE_LOST') {
      return NextResponse.json({ success: false, error: result.disposition === 'SKIPPED' ? result.reason : result.disposition }, { status: 409 });
    }
    if (result.disposition === 'ALREADY_ACTIVE') {
      return NextResponse.json({ success: true, alreadySwapped: true });
    }
    return NextResponse.json(
      {
        success: true,
        qualification: result.qualification,
        proxySourceVersion: result.proxySourceVersion,
      },
      { status: result.qualification === 'DISPATCHED' ? 200 : 202 },
    );
  } catch {
    return NextResponse.json({ success: false, error: 'PROXY_MASTER_TRANSITION_FAILED' }, { status: 500 });
  }
}
