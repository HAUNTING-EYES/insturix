/**
 * LangGraph Workflow for Video Editor AI Agent
 * 
 * Implements a stateful agent workflow using LangGraph's StateGraph.
 * Replaces custom multi-turn loop with declarative graph-based orchestration.
 * 
 * Key Features:
 * - State machine with agent → tools → agent loop
 * - Automatic tool execution and state propagation
 * - Streaming support for real-time updates
 * - Built-in error handling and retries
 * - Checkpoint integration
 */

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import {
  createVideoEditorTools,
  type ToolContext,
} from "./langchain-tools-v2";
import {
  createCheckpoint,
  type ProjectState,
} from "./ai-tools";
import { systemPrompt } from "./ai-tool-schemas-v2";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

/**
 * Model Provider Selection
 * 
 * Set to 'openrouter' to use OpenRouter's Kimi model
 * Set to 'gemini' to use Google's Gemini 2.0 Flash
 */
export const MODEL_PROVIDER: 'gemini' | 'openrouter' = 'openrouter';

/**
 * Model configurations
 */
const MODEL_CONFIGS = {
  gemini: {
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    temperature: 0.2,
  },
  openrouter: {
    model: "moonshotai/kimi-k2-thinking",
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    temperature: 0.2,
    defaultHeaders: {
      "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
      "X-Title": process.env.SITE_NAME || "React Video Editor Pro",
    },
  },
} as const;

// ============================================================================
// Graph State Definition
// ============================================================================

/**
 * State for the LangGraph workflow
 * 
 * Tracks conversation history, project state, and tool execution results
 */
const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  projectState: Annotation<ProjectState>({
    reducer: (x, y) => y ?? x,
  }),
  sessionId: Annotation<string>(),
  projectId: Annotation<string>(),
  // Accumulate tool call info for response
  toolExecutions: Annotation<Array<{ toolName: string; args: any; result: any }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

type GraphState = typeof GraphStateAnnotation.State;

// ============================================================================
// Graph Nodes
// ============================================================================

/**
 * Agent Node - Calls LLM with tools bound
 */
async function callAgent(state: GraphState): Promise<Partial<GraphState>> {
  const { messages, projectState, sessionId } = state;

  // Initialize model based on provider configuration
  let model: ChatGoogleGenerativeAI | ChatOpenAI;
  
  if (MODEL_PROVIDER === 'openrouter') {
    const config = MODEL_CONFIGS.openrouter;
    if (!config.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required when using OpenRouter provider');
    }
    
    console.log(`[LangGraph] Using OpenRouter model: ${config.model}`);
    
    model = new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature,
      apiKey: config.apiKey,
      configuration: {
        baseURL: config.baseURL,
        defaultHeaders: config.defaultHeaders,
      },
    });
  } else {
    const config = MODEL_CONFIGS.gemini;
    if (!config.apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required when using Gemini provider');
    }
    
    console.log(`[LangGraph] Using Gemini model: ${config.model}`);
    
    model = new ChatGoogleGenerativeAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
    });
  }

  // Create tools with context (tools need access to projectState for getProjectInfo)
  // Note: We use a dummy onStateUpdate here since state changes happen in executeTools node
  const tools = createVideoEditorTools({
    projectState,
    sessionId,
    onStateUpdate: () => {}, // State updates handled in executeTools node
  });
  
  const modelWithTools = model.bindTools(tools);

  // Build messages with system prompt
  const systemMessage = new HumanMessage({
    content: systemPrompt,
  });

  const allMessages = [systemMessage, ...messages];

  // Ensure we have at least one user message
  if (allMessages.length === 1) {
    // Only system message, add a default prompt
    allMessages.push(new HumanMessage({
      content: "I'm ready to help with your video project. What would you like to do?",
    }));
  }

  // Invoke model
  const response = await modelWithTools.invoke(allMessages);

  return {
    messages: [response],
  };
}

/**
 * Tools Node - Executes tool calls from agent
 * 
 * Custom implementation instead of prebuilt ToolNode to integrate with our state management
 */
async function executeTools(state: GraphState): Promise<Partial<GraphState>> {
  const { messages, projectState, sessionId, projectId, toolExecutions } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return {}; // No tools to execute
  }

  const toolMessages: ToolMessage[] = [];
  const newToolExecutions: Array<{ 
    toolCallId: string;
    toolName: string; 
    args: any; 
    result: any;
  }> = [];
  
  // Mutable state container that tools can update
  let currentState = { ...projectState };

  // Create checkpoint before tool execution
  if (sessionId && projectId) {
    await createCheckpoint(
      sessionId,
      projectId,
      currentState.overlays,
      `Before tool execution`,
      "before-llm"
    );
  }

  // Execute tools sequentially
  for (const toolCall of lastMessage.tool_calls) {
    // Recreate tools with latest state for each tool call
    // This ensures Tool B sees changes made by Tool A
    const tools = createVideoEditorTools({
      projectState: currentState,
      sessionId,
      onStateUpdate: (newState: ProjectState) => {
        currentState = newState; // Update for next tool in sequence
      },
    });
    
    const toolMap = new Map(tools.map(t => [t.name, t]));
    const tool = toolMap.get(toolCall.name);
    
    if (!tool) {
      const errorMsg = `Unknown tool: ${toolCall.name}`;
      toolMessages.push(
        new ToolMessage({
          content: errorMsg,
          tool_call_id: toolCall.id!,
        })
      );
      newToolExecutions.push({
        toolCallId: toolCall.id!,
        toolName: toolCall.name,
        args: toolCall.args,
        result: { success: false, error: errorMsg },
      });
      continue;
    }

    try {
      // Execute tool - tools update currentState via onStateUpdate callback
      const result = await tool.invoke(toolCall.args);

      // Add tool result message
      toolMessages.push(
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id!,
        })
      );

      // Track execution
      newToolExecutions.push({
        toolCallId: toolCall.id!,
        toolName: toolCall.name,
        args: toolCall.args,
        result: JSON.parse(result),
      });

    } catch (error: any) {
      const errorMsg = error.message || "Tool execution failed";
      toolMessages.push(
        new ToolMessage({
          content: JSON.stringify({ success: false, error: errorMsg }),
          tool_call_id: toolCall.id!,
        })
      );
      newToolExecutions.push({
        toolCallId: toolCall.id!,
        toolName: toolCall.name,
        args: toolCall.args,
        result: { success: false, error: errorMsg },
      });
    }
  }

  // Create checkpoint after tool execution (will be skipped if no changes)
  if (sessionId && projectId) {
    await createCheckpoint(
      sessionId,
      projectId,
      currentState.overlays,
      `After tool execution`,
      "after-llm"
    );
  }

  return {
    messages: toolMessages,
    projectState: currentState,
    toolExecutions: newToolExecutions,
  };
}

/**
 * Conditional Edge - Determines if agent should continue or end
 */
function shouldContinue(state: GraphState): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // If the agent made tool calls, execute them
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  // Otherwise, agent has finished (provided text response)
  return END;
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Build and compile the LangGraph workflow
 */
export function createVideoEditorGraph() {
  const workflow = new StateGraph(GraphStateAnnotation)
    .addNode("agent", callAgent)
    .addNode("tools", executeTools)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  return workflow.compile();
}

// ============================================================================
// Streaming Response Types
// ============================================================================

export type StreamEvent = 
  | { type: "thought"; content: string }
  | { type: "tool_call"; toolName: string; args: any }
  | { type: "tool_result"; toolName: string; args: any; result: any }
  | { type: "final_response"; content: string }
  | { type: "final_state"; projectState: ProjectState }
  | { type: "error"; error: string };

/**
 * Stream graph execution with typed events
 * 
 * Converts LangGraph stream events into our existing StreamEvent format
 * for backward compatibility with API route
 */
export async function* streamGraphExecution(
  graph: ReturnType<typeof createVideoEditorGraph>,
  initialState: Partial<GraphState>
): AsyncGenerator<StreamEvent> {
  try {
    // Stream graph execution with extremely high recursion limit
    // Each iteration = agent call + tool execution, so 500 allows ~250 tool calls
    // Will handle timeouts via UI/UX later
    const stream = await graph.stream(initialState, {
      streamMode: "values", // Get full state after each step
      recursionLimit: 500,   // Ridiculously high limit
    });

    let lastProcessedMessageIndex = 0;
    let seenToolCalls = new Set<string>();
    let finalState: GraphState | null = null;

    for await (const state of stream) {
      finalState = state; // Keep track of final state
      const messages = state.messages;
      
      // Only process new messages (avoid duplicates)
      for (let i = lastProcessedMessageIndex; i < messages.length; i++) {
        const message = messages[i];

        // Agent thinking (text content)
        if (message._getType() === "ai") {
          const aiMessage = message as AIMessage;
          
          // Stream text content if present
          if (aiMessage.content && typeof aiMessage.content === "string") {
            yield { type: "thought", content: aiMessage.content };
          }

          // Tool calls (will be executed next)
          if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            for (const toolCall of aiMessage.tool_calls) {
              const toolCallKey = `${toolCall.id}-${toolCall.name}`;
              if (!seenToolCalls.has(toolCallKey)) {
                seenToolCalls.add(toolCallKey);
                yield {
                  type: "tool_call",
                  toolName: toolCall.name,
                  args: toolCall.args,
                };
              }
            }
          }
        }

        // Tool results
        if (message._getType() === "tool") {
          const toolMessage = message as ToolMessage;
          // Match tool execution by tool_call_id
          const matchingExecution = state.toolExecutions?.find(
            (exec: any) => exec.toolCallId === toolMessage.tool_call_id
          );
          
          if (matchingExecution) {
            yield {
              type: "tool_result",
              toolName: matchingExecution.toolName,
              args: matchingExecution.args,
              result: matchingExecution.result,
            };
          }
        }
      }

      lastProcessedMessageIndex = messages.length;
    }

    // Yield final state with updated projectState
    if (finalState?.projectState) {
      yield {
        type: "final_state",
        projectState: finalState.projectState,
      };
    }

  } catch (error: any) {
    console.error("Graph execution error:", error);
    yield { type: "error", error: error.message || "Unknown error" };
  }
}
