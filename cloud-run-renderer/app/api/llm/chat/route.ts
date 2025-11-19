import { NextRequest, NextResponse } from 'next/server';
import type { ProjectState } from '@/components/editor/version-7.0.0/ai-tools';
import type { CoreMessage } from 'ai';
import { getCheckpoints } from '@/components/editor/version-7.0.0/checkpoint-manager';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  createVideoEditorGraph,
  streamGraphExecution,
  type StreamEvent,
} from '@/components/editor/version-7.0.0/langgraph-workflow';
import { assetResolver } from '@/lib/services/asset-resolver';
import { chatService } from '@/lib/services/chat-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

// Use Node.js runtime to support all imports
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Convert CoreMessage to LangChain message format
 */
function convertToLangChainMessage(msg: CoreMessage) {
  if (msg.role === 'user') {
    return new HumanMessage({ content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  } else if (msg.role === 'assistant') {
    return new AIMessage({ content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  }
  // Default to human message
  return new HumanMessage({ content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages: incomingMessages, state, sessionId, projectId } = body as {
      messages: any[]; // Accept any format from client
      state: ProjectState;
      sessionId: string;
      projectId?: string;
    };

    const userId = getUserId();
    const actualProjectId = projectId || sessionId;

    // Ensure session exists in database
    await chatService.getOrCreateSession(userId, actualProjectId, sessionId);

    // Save user message to database
    const lastUserMessage = incomingMessages[incomingMessages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await chatService.saveMessage(sessionId, {
        role: 'user',
        content: typeof lastUserMessage.content === 'string' 
          ? lastUserMessage.content 
          : JSON.stringify(lastUserMessage.content),
      });
    }

    // Strip URLs from overlays before sending to LLM (save tokens)
    const cleanState = {
      ...state,
      overlays: assetResolver.stripUrlsForLLM(state.overlays),
    };

    // Convert incoming messages to LangChain format
    const langchainMessages = incomingMessages.map(convertToLangChainMessage);

    // Create LangGraph workflow
    const graph = createVideoEditorGraph();

    // Initial graph state (with clean overlays)
    const initialState = {
      messages: langchainMessages,
      projectState: cleanState,
      sessionId,
      projectId: projectId || sessionId, // Fallback to sessionId if no projectId
      toolExecutions: [],
    };

    // Stream graph execution and collect events
    const events: StreamEvent[] = [];
    let fullText = '';
    const textSegments: string[] = []; // Collect all text segments to join at the end
    const toolResults: Array<{ toolName: string; args: any; result: any }> = [];
    let finalProjectState: ProjectState | null = null;

    for await (const event of streamGraphExecution(graph, initialState)) {
      events.push(event);

      if (event.type === 'thought' || event.type === 'final_response') {
        // Replace instead of accumulate - we only want the LAST text response
        fullText = event.content;
      } else if (event.type === 'tool_result') {
        toolResults.push({
          toolName: event.toolName,
          args: event.args,
          result: event.result,
        });
      } else if (event.type === 'final_state') {
        finalProjectState = event.projectState;
      }
    }

    // Use final state from graph if available, otherwise fall back to checkpoints
    let updatedOverlays = state.overlays;
    if (finalProjectState) {
      updatedOverlays = finalProjectState.overlays;
    } else {
      // Fallback: Get from checkpoints (now async)
      const checkpoints = await getCheckpoints(sessionId);
      if (checkpoints.length > 0) {
        const latestCheckpoint = checkpoints[checkpoints.length - 1];
        updatedOverlays = latestCheckpoint.overlays;
      }
    }

    // Resolve asset IDs to URLs before returning to client
    const overlaysWithUrls = await assetResolver.resolveProjectAssets(updatedOverlays);

    // Get checkpoints from server-side store (now async)
    const checkpoints = await getCheckpoints(sessionId);

    // Get checkpoint IDs created during this interaction
    const checkpointIds = checkpoints
      .filter(cp => cp.timestamp > Date.now() - 60000) // Last minute
      .map(cp => cp.checkpointId);

    // Save assistant message to database
    await chatService.saveMessage(sessionId, {
      role: 'assistant',
      content: fullText,
      toolCalls: toolResults.length > 0 ? toolResults.map(tr => ({
        id: `tool_${Date.now()}`,
        name: tr.toolName,
        args: tr.args,
      })) : undefined,
      toolResults: toolResults.length > 0 ? toolResults.map(tr => ({
        toolCallId: `tool_${Date.now()}`,
        toolName: tr.toolName,
        result: tr.result,
      })) : undefined,
      checkpointIds: checkpointIds.length > 0 ? checkpointIds : undefined,
    });

    // Convert back to CoreMessage format for response
    const responseMessages: CoreMessage[] = [
      {
        role: 'assistant' as const,
        content: fullText,
      },
    ];

    // Return the response in same format as before
    return NextResponse.json({
      success: true,
      text: fullText,
      toolCalls: toolResults,
      overlays: overlaysWithUrls, // Return with URLs resolved
      checkpoints, // Send server-side checkpoints to client
      messages: responseMessages,
    });
  } catch (error: any) {
    console.error('LLM API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process LLM request',
      },
      { status: 500 }
    );
  }
}
