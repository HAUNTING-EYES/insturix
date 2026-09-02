import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Get all sessions for this user from database
    const allSessions = await db.getUserSessions(userId, orgId);

    // Transform database sessions to frontend metadata format
    const sessions = allSessions
      .sort((a: any, b: any) => {
        const aTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        const bTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        return aTime - bTime;
      })
      .slice(offset, offset + limit)
      .map((session: any) => ({
        id: session._id || session.id,
        name: session.projectMeta?.sessionName || session.projectMeta?.idea || session.projectMeta?.purpose || `Session ${String(session._id).slice(-6)}`,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt || session.createdAt,
        lastModified: session.updatedAt || session.createdAt,
        projectMeta: session.projectMeta || {},
        tone: session.projectMeta?.tone || 'blue'
      }));

    return NextResponse.json({
      success: true,
      sessions,
      total: allSessions.length
    });

  } catch (error: any) {
    console.error('Error fetching session metadata:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch session metadata'
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Truncate prompt for display name
 */
function truncatePrompt(prompt: string, maxLength: number = 50): string {
  if (prompt.length <= maxLength) return prompt;
  return prompt.substring(0, maxLength).trim() + '...';
}

/**
 * Helper: Determine session stage from backend data
 */
function determineStage(session: any): 'idea_generation' | 'chat' | 'script_generation' | 'completed' {
  if (session.generated_script) return 'completed';
  if (session.chat_history && session.chat_history.length > 0) return 'script_generation';
  if (session.ideas && session.ideas.length > 0) return 'chat';
  return 'idea_generation';
}

/**
 * Helper: Check if session has been actively used
 */
function isSessionUsed(session: any): boolean {
  return !!(
    (session.ideas && session.ideas.length > 0) ||
    (session.chat_history && session.chat_history.length > 0) ||
    session.generated_script
  );
}
