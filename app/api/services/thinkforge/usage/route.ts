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
const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Use MongoDB-based limits only (backend no longer handles limits)
    console.log('Using MongoDB-based limits for ThinkForge usage data');
    
    try {
      const allServiceUsage = await ServiceUsageService.getServiceUsageForAllServices(session.userId);
      const thinkforgeLimits = allServiceUsage.thinkforge || {};
      
      // Transform MongoDB limits to frontend usage format
      const sessionsLimit = thinkforgeLimits.maxSessions || { currentUsage: 0, maxUsage: 5, remaining: 5, resetPeriod: 'weekly' };
      
      const usage: ThinkForgeUsage = {
        sessionsThisWeek: sessionsLimit.currentUsage,
        ideasReshufflesInSession: 0, // Session-based limits not tracked in MongoDB
        chatRepliesInSession: 0,
        scriptRegenerationsInSession: 0,
        askAIFixScriptInSession: 0,
        lastWeekReset: sessionsLimit.lastReset?.toISOString() || new Date().toISOString(),
        
        // Transform MongoDB data to planLimits format
        planLimits: {
          sessions: {
            used: sessionsLimit.currentUsage,
            limit: sessionsLimit.maxUsage,
            remaining: sessionsLimit.remaining,
            reset_period: sessionsLimit.resetPeriod,
            reset_date: sessionsLimit.lastReset?.toISOString()
          },
          ideaReshuffles: { used: 0, limit: -1, remaining: -1 }, // These are session-based, not tracked in MongoDB
          chatReplies: { used: 0, limit: -1, remaining: -1 },
          scriptRegens: { used: 0, limit: -1, remaining: -1 },
          aiFixes: { used: 0, limit: -1, remaining: -1 },
          maxConcurrentTasks: { used: 0, limit: 1, remaining: 1 }
        },
        serviceUsage: thinkforgeLimits,
        concurrentUsage: {},
        plan: 'free' // TODO: Get actual plan from user data
      };
      
      return NextResponse.json(usage);
      
    } catch (mongoError) {
      console.error('Failed to fetch ThinkForge limits from MongoDB:', mongoError);
      
      // Final fallback to default values
      const defaultUsage: ThinkForgeUsage = {
        sessionsThisWeek: 0,
        ideasReshufflesInSession: 0,
        chatRepliesInSession: 0,
        scriptRegenerationsInSession: 0,
        askAIFixScriptInSession: 0,
        lastWeekReset: new Date().toISOString(),
        planLimits: {
          sessions: { used: 0, limit: 5, remaining: 5, reset_period: 'weekly' },
          ideaReshuffles: { used: 0, limit: 5, remaining: 5 },
          chatReplies: { used: 0, limit: 10, remaining: 10 },
          scriptRegens: { used: 0, limit: 1, remaining: 1 },
          aiFixes: { used: 0, limit: 5, remaining: 5 },
          maxConcurrentTasks: { used: 0, limit: 1, remaining: 1 }
        },
        serviceUsage: {},
        concurrentUsage: {},
        plan: 'free'
      };
      
      return NextResponse.json(defaultUsage);
    }

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

    const usage: ThinkForgeUsage = await request.json();

    // Try backend first, but fall back to MongoDB on any failure
    try {
      const backendResponse = await fetch(
        `${THINKFORGE_BACKEND_URL}/api/thinkforge/usage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.userId}`
          },
          body: JSON.stringify({
            user_id: session.userId,
            ...usage
          }),
          signal: AbortSignal.timeout(5000)
        }
      );

      if (backendResponse.ok) {
        const result = await backendResponse.json();
        return NextResponse.json(result);
      }
    } catch (backendError) {
      console.warn('ThinkForge backend unavailable for usage update, falling back to MongoDB');
    }

    // Fallback to MongoDB-based usage update
    try {
      // Use ServiceUsageService to update usage
      if (usage.sessionsThisWeek > 0) {
        await ServiceUsageService.useService(session.userId, 'thinkforge', 'maxSessions', 1);
      }
      
      return NextResponse.json({ success: true, message: 'Usage updated via MongoDB' });
      
    } catch (mongoError) {
      console.error('Failed to update ThinkForge usage in MongoDB:', mongoError);
      return NextResponse.json(
        { error: 'Failed to update usage data' },
        { status: 500 }
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