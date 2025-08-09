import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse
} from '@/lib/middleware/services/thinkforge';

const serviceConfig = getServiceConfig('thinkforge');
const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Optional: limit check (use general type)
    const limitCheck = await checkThinkForgeLimits({ userId: session.userId, type: 'general' });
    if (!limitCheck.success || !limitCheck.hasAccess) {
      return createThinkForgeLimitResponse(limitCheck);
    }

    // Call backend list endpoint
    const backendResp = await fetch(
      `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${session.userId}/list`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.userId}`
        }
      }
    );

    if (!backendResp.ok) {
      const err = await backendResp.json().catch(() => ({}));
      return NextResponse.json({ success: false, error: err.detail || 'Failed to fetch sessions'}, { status: backendResp.status });
    }

    const data = await backendResp.json();
    return NextResponse.json({ success: true, sessions: data.sessions || [], count: data.count || 0 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
} 