import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { chatService } from '@/lib/editron/services/chat-service';

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
    // We only take the last N messages to avoid context limit if needed, 
    // but Flash has huge context so full history is likely fine.
    const langchainHistory = history.map(msg => {
      if (msg.role === 'user') return new HumanMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      // Tool messages are tricky if we don't store them perfectly.
      // For now, let's just feed text history or simplify.
      // Ideally we should store the full trace.
      // If we just store text, the agent might get confused about previous tool calls.
      // For this MVP, let's just send the text content as context if it's simple,
      // or rely on the fact that we are starting a "fresh" turn with history.
      return new HumanMessage(msg.content); // Fallback for now
    });

    // Initialize agent
    const agent = createAgent(userId);

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

        for await (const event of eventStream) {
          const eventType = event.event;
          console.log("Event:", eventType, event.name, event.data?.chunk?.content ? "has content" : "no content");
          
          if (eventType === "on_chat_model_stream") {
            const content = event.data.chunk.content;
            if (content) {
              finalResponse += content;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content })}\n\n`));
            }
          } else if (eventType === "on_tool_start") {
             console.log("Tool start:", event.name);
             await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: event.name })}\n\n`));
          } else if (eventType === "on_tool_end") {
             console.log("Tool end:", event.name, event.data.output);
             await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', tool: event.name, output: event.data.output })}\n\n`));
          }
        }

        // Save assistant response
        if (finalResponse) {
          await chatService.saveMessage(actualSessionId, {
            role: 'assistant',
            content: finalResponse,
          });
        }

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
