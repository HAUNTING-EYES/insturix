import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { chatService } from '@/lib/editron/services/chat-service';
import { projectService } from '@/lib/editron/services/project-service';
import { generateProjectSummary, formatSummaryForPrompt } from '@/lib/editron/utils/project-summary';

export const maxDuration = 60; // Allow longer timeout for agent execution

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, projectId, sessionId } = await req.json();

    if (!message || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get or create session
    const actualSessionId = await chatService.getOrCreateSession(userId, projectId, sessionId);

    // Save user message
    await chatService.saveMessage(actualSessionId, {
      role: 'user',
      content: message,
    });

    // Load history
    const history = await chatService.getSessionHistory(actualSessionId);
    
    // Convert history to LangChain format
    const langchainHistory: (HumanMessage | AIMessage | ToolMessage)[] = [];
    
    history.forEach(msg => {
      if (msg.role === 'user') {
        langchainHistory.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        // 1. Add the assistant message (with tool calls if any)
        const toolCalls = msg.toolCalls?.map(tc => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          type: 'tool_call' as const, // Explicitly cast to literal type
        }));

        langchainHistory.push(new AIMessage({
          content: msg.content,
          tool_calls: toolCalls,
        }));

        // 2. Add separate ToolMessages for results if they exist
        // These must come immediately after the AIMessage that requested them
        if (msg.toolResults && msg.toolResults.length > 0) {
          msg.toolResults.forEach(tr => {
            langchainHistory.push(new ToolMessage({
              tool_call_id: tr.toolCallId,
              name: tr.toolName,
              content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
            }));
          });
        }
      }
    });

    // Load project for context injection
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    // Generate project summary for smart context
    const summary = generateProjectSummary(project);
    const contextMessage = formatSummaryForPrompt(summary);

    // Initialize agent with project context
    const agent = createAgent(userId, contextMessage);

    // Create a stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Run agent in background and stream chunks
    (async () => {
      try {
        const inputs = {
          messages: [
            ...langchainHistory,
            new HumanMessage(message) // The new message
          ]
        };

        // We want to stream the events
        const eventStream = await agent.streamEvents(inputs, {
          version: "v2",
          configurable: {
            projectId,
          }
        });

        let finalResponse = "";
        const toolCalls: any[] = [];
        const toolResults: any[] = [];

        for await (const event of eventStream) {
          const eventType = event.event;
          
          if (eventType === "on_chat_model_stream") {
            // IMPORTANT: Only stream tokens from the MAIN agent, not from nested sub-agents inside tools
            // Sub-agent events have different metadata. We check if this is from the main "agent" node.
            // LangGraph events include the node name in event.metadata or tags.
            const tags = event.tags || [];
            const metadata = event.metadata || {};
            
            // Skip if this event is from a tool execution (sub-agent)
            // The main agent runs in the "agent" node, sub-agents run during "tools" node
            const isFromToolNode = tags.includes('seq:step:2') || metadata.langgraph_node === 'tools';
            const isFromSubAgent = event.name?.includes('ChatGoogleGenerativeAI') && isFromToolNode;
            
            // Also check: if we're currently between tool_start and tool_end, skip streaming
            const isInsideToolExecution = toolCalls.length > toolResults.length;
            
            if (isInsideToolExecution) {
              // Skip streaming while a tool is executing (this catches sub-agent output)
              continue;
            }
            
            const content = event.data.chunk.content;
            if (content) {
              finalResponse += content;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content })}\n\n`));
            }
          } else if (eventType === "on_tool_start") {
             console.log("Tool start:", event.name);
             // Store tool call info
             // Note: We might get multiple chunks for args, but usually on_tool_start has the initial call info
             // Actually, on_chat_model_stream might emit tool_calls chunks too.
             // But on_tool_start is cleaner for our tracking.
             // We need to generate an ID if one isn't provided, but usually it is.
             // LangGraph events usually have run_id or similar.
             // Let's use the event data.
             toolCalls.push({
               id: event.run_id, // Use run_id as tool call id
               name: event.name,
               args: event.data.input
             });
             
             await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: event.name, args: event.data.input })}\n\n`));
          } else if (eventType === "on_tool_end") {
             console.log("Tool end:", event.name);
             
             // Store tool result
             toolResults.push({
               toolCallId: event.run_id, // Match with start
               toolName: event.name,
               result: event.data.output
             });

             await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', tool: event.name, output: event.data.output })}\n\n`));
          }
        }

        // Save assistant response with tool info
        await chatService.saveMessage(actualSessionId, {
          role: 'assistant',
          content: finalResponse,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
        });

        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done', sessionId: actualSessionId })}\n\n`));
      } catch (error: any) {
        console.error("Agent error:", error);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
