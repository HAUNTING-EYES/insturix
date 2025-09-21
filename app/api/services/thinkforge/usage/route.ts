import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';

interface LimitInfo {
  used: number;
  limit: number;
  remaining: number;
  reset_period?: string;
  reset_date?: string;
}

interface ThinkForgeUsage {
  sessionsThisWeek: number;
  ideasReshufflesInSession: number;
  chatRepliesInSession: number;
  scriptRegenerationsInSession: number;
  askAIFixScriptInSession: number;
  lastWeekReset: string;
  currentSessionId?: string;
  
  // Comprehensive backend integration data
  planLimits?: {
    sessions: LimitInfo;
    ideaReshuffles: LimitInfo;
    chatReplies: LimitInfo;
    scriptRegens: LimitInfo;
    aiFixes: LimitInfo;
    maxConcurrentTasks: LimitInfo;
  };
  serviceUsage?: any;
  concurrentUsage?: any;
  plan?: string;
}

const serviceConfig = getServiceConfig('thinkforge');

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const allServiceUsage = await ServiceUsageService.getServiceUsageForAllServices(session.userId);
    const thinkforgeLimits = allServiceUsage.thinkforge || {};
    const sessionsLimit = thinkforgeLimits.maxSessions || { currentUsage: 0, maxUsage: 5, remaining: 5, resetPeriod: 'weekly' };

    const usage: ThinkForgeUsage = {
      sessionsThisWeek: sessionsLimit.currentUsage,
      ideasReshufflesInSession: 0,
      chatRepliesInSession: 0,
      scriptRegenerationsInSession: 0,
      askAIFixScriptInSession: 0,
      lastWeekReset: sessionsLimit.lastReset?.toISOString() || new Date().toISOString(),
      planLimits: {
        sessions: {
          used: sessionsLimit.currentUsage,
          limit: sessionsLimit.maxUsage,
          remaining: sessionsLimit.remaining ?? (sessionsLimit.maxUsage === -1 ? -1 : Math.max(0, sessionsLimit.maxUsage - sessionsLimit.currentUsage)),
          reset_period: sessionsLimit.resetPeriod,
          reset_date: sessionsLimit.lastReset?.toISOString()
        },
        ideaReshuffles: { used: 0, limit: -1, remaining: -1 },
        chatReplies: { used: 0, limit: -1, remaining: -1 },
        scriptRegens: { used: 0, limit: -1, remaining: -1 },
        aiFixes: { used: 0, limit: -1, remaining: -1 },
        maxConcurrentTasks: { used: 0, limit: 1, remaining: 1 }
      },
      serviceUsage: thinkforgeLimits,
      concurrentUsage: {},
      plan: 'free'
    };

    return NextResponse.json(usage);

  } catch (error) {
    console.error('Error in ThinkForge usage API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    let amount = 1;
    try {
      const body = await request.json().catch(() => null);
      if (body && typeof body.amount === 'number') amount = body.amount;
    } catch {}

    try {
      // Increment ThinkForge weekly sessions usage in MongoDB
      const updated = await ServiceUsageService.useService(session.userId, 'thinkforge' as any, 'maxSessions', amount);
      return NextResponse.json({ success: true, updated });
    } catch (mongoError: any) {
      const msg = mongoError?.message || 'Failed to update usage data';
      const status = msg.includes('limit exceeded') ? 429 : 500;
      return NextResponse.json(
        { success: false, error: msg },
        { status }
      );
    }

  } catch (error) {
    console.error('Error in ThinkForge usage update:', error);
    return NextResponse.json(
      { error: 'Failed to update usage data' },
      { status: 500 }
    );
  }
} 