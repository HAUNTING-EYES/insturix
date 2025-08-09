import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';

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

    // Call ThinkForge backend to get session metadata only
    const backendResponse = await fetch(
      `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/metadata?user_id=${session.userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.userId}`
        }
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: errorData.detail || 'Failed to fetch session metadata',
          success: false 
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    // Transform backend data to frontend metadata format
    const sessions = result.sessions?.map((session: any) => ({
      id: session.id,
      name: truncatePrompt(session.initial_prompt || 'Untitled Session'),
      userId: session.user_id,
      createdAt: session.created_at,
      lastModified: session.updated_at || session.created_at,
      stage: determineStage(session),
      isUsed: isSessionUsed(session),
      ideaCount: session.ideas?.length || 0,
      chatMessageCount: session.chat_history?.length || 0,
      hasScript: !!session.generated_script
    })) || [];

    return NextResponse.json({
      success: true,
      sessions,
      total: sessions.length
    });

  } catch (error) {
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