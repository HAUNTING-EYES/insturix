"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Code2,
  Send,
  Plus as PlusIcon,
  Circle,
  RotateCcw,
  Sparkles,
  Loader2,
  MessageSquare,
  Clock,
  FileJson,
  Database,
} from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import {
  serializeProject,
  addTrack,
  editTrack,
  deleteTrack,
  getCheckpoints,
  restoreCheckpoint,
  clearCheckpoints,
  ProjectSummary,
  NewTrackInput,
  TrackPatch,
  Checkpoint,
  CheckpointType,
} from "../../ai-tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatProjectForLLM } from "../../ai-tool-schemas";
import type { CoreMessage } from 'ai';

/**
 * Helper functions to work with AI SDK's CoreMessage structure
 */

// Extract text content from a message (handles both string and parts array)
const getTextContent = (message: CoreMessage): string => {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.text)
      .join('\n');
  }
  return '';
};

// Check if message has tool calls (in content parts)
const hasToolCalls = (message: CoreMessage): boolean => {
  return Array.isArray(message.content) && 
    message.content.some((part: any) => part.type === 'tool-call');
};

// Extract tool calls from message content
const getToolCalls = (message: CoreMessage): any[] => {
  if (!Array.isArray(message.content)) return [];
  return message.content.filter((part: any) => part.type === 'tool-call');
};

// Extract tool results from message content
const getToolResults = (message: CoreMessage): any[] => {
  if (!Array.isArray(message.content)) return [];
  return message.content.filter((part: any) => part.type === 'tool-result');
};

type ToolCall = {
  id: string;
  name: string;
  params?: any;
  result: any;
};

type ToolResult = {
  toolCallId: string;
  result: any;
};

/**
 * UI-friendly message format for display in the debug panel.
 * This is simpler than CoreMessage for UI purposes but converts to CoreMessage for API calls.
 */
type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
};

type DebugPage = "chat" | "checkpoints" | "llm-history" | "llm-context" | "project-data";

// Chat Page Component
function ChatPage({
  messages,
  inputMessage,
  setInputMessage,
  isProcessing,
  isStreaming,
  streamingText,
  currentSessionId,
  useLLM,
  setUseLLM,
  selectedScenario,
  setSelectedScenario,
  handleSendMessage,
  messagesEndRef,
  playerDimensions,
  durationInFrames,
  overlays,
  getProjectState,
}: {
  messages: ChatMessage[];
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  isProcessing: boolean;
  isStreaming: boolean;
  streamingText: string;
  currentSessionId: string;
  useLLM: boolean;
  setUseLLM: (use: boolean) => void;
  selectedScenario: string;
  setSelectedScenario: (scenario: string) => void;
  handleSendMessage: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  playerDimensions: { width: number; height: number };
  durationInFrames: number;
  overlays: any[];
  getProjectState: () => any;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">
                Create a session to start testing
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-muted border"
                    }`}
                  >
                    {/* Role badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${
                        msg.role === "user" 
                          ? "text-blue-100" 
                          : "text-muted-foreground"
                      }`}>
                        {msg.role === "user" ? "You" : "Assistant"}
                      </span>
                      <span className={`text-xs ${
                        msg.role === "user" 
                          ? "text-blue-200" 
                          : "text-muted-foreground"
                      }`}>
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {/* Message content */}
                    <div className="text-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    
                    {/* Tool calls indicator */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
                        <div className="text-xs font-semibold mb-2 opacity-75">
                          🔧 Tool Calls ({msg.toolCalls.length})
                        </div>
                        <div className="space-y-1">
                          {msg.toolCalls.map((call, i) => (
                            <div 
                              key={i} 
                              className="flex items-center justify-between gap-2 text-xs bg-black/5 dark:bg-white/5 rounded px-2 py-1"
                            >
                              <span className="font-mono">{call.name}</span>
                              {call.result?.success !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  call.result.success
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                                }`}>
                                  {call.result.success ? "✓" : "✗"}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Project Info Sidebar */}
      <div className="border-t bg-muted/20 p-4 shrink-0">
        <div className="bg-muted rounded-lg p-3 text-xs space-y-1 mb-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dimensions:</span>
            <span className="font-mono">
              {playerDimensions.width}×{playerDimensions.height}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration:</span>
            <span className="font-mono">{durationInFrames}f</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tracks:</span>
            <span className="font-mono">{overlays.length}</span>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-background p-4 space-y-3 shrink-0">
        {/* LLM Toggle */}
        <div className="space-y-3 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="use-llm" className="text-sm font-medium">
                Use Real LLM
              </Label>
              <p className="text-xs text-muted-foreground">
                {useLLM ? "Gemini 2.5 Flash" : "Mock scenarios"}
              </p>
            </div>
            <Switch
              id="use-llm"
              checked={useLLM}
              onCheckedChange={setUseLLM}
            />
          </div>
        </div>

        {/* Mock Scenario Selector */}
        {!useLLM && (
          <Select
            value={selectedScenario}
            onValueChange={setSelectedScenario}
            disabled={!currentSessionId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select test scenario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add-text">Add Text Overlay</SelectItem>
              <SelectItem value="edit-first">Edit First Track</SelectItem>
              <SelectItem value="delete-video">Delete Video Track</SelectItem>
              <SelectItem value="multi-step">Multi-Step Operation</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Message Input */}
        <div className="flex gap-2">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              currentSessionId
                ? useLLM
                  ? "Ask me to edit your video..."
                  : "Type message (scenario will execute)..."
                : "Create a session first"
            }
            className="min-h-[80px] resize-none"
            disabled={isProcessing || !currentSessionId}
          />
          <Button
            onClick={handleSendMessage}
            disabled={
              !inputMessage.trim() || isProcessing || !currentSessionId
            }
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Checkpoints Page Component
function CheckpointsPage({
  checkpoints,
  selectedCheckpoint,
  handleRestoreCheckpoint,
  currentSessionId,
  clearAllCheckpoints,
  getCheckpointIcon,
}: {
  checkpoints: Checkpoint[];
  selectedCheckpoint: string | null;
  handleRestoreCheckpoint: (id: string) => void;
  currentSessionId: string;
  clearAllCheckpoints: () => void;
  getCheckpointIcon: (type: CheckpointType) => JSX.Element;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Checkpoints ({checkpoints.length})
          </h3>
          {checkpoints.length > 0 && (
            <Button
              onClick={clearAllCheckpoints}
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-2">
          {checkpoints.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-12">
              No checkpoints yet
            </div>
          ) : (
            checkpoints.map((cp) => (
              <div
                key={cp.id}
                className={`rounded-lg border-2 p-3 transition-colors ${
                  selectedCheckpoint === cp.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  {getCheckpointIcon(cp.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {cp.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(cp.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => handleRestoreCheckpoint(cp.id)}
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// LLM History Page Component - Shows complete conversation as sent to LLM
function LLMHistoryPage({
  messages,
  currentSessionId,
  getProjectState,
}: {
  messages: ChatMessage[];
  currentSessionId: string;
  getProjectState: () => any;
}) {
  const getFullConversationHistory = () => {
    if (!currentSessionId) {
      return [];
    }

    const state = getProjectState();
    const projectSummary = serializeProject(state, currentSessionId);
    const projectContext = formatProjectForLLM(projectSummary);
    
    const aspectRatio = state.width && state.height 
      ? `${state.width}:${state.height} (${(state.width / state.height).toFixed(2)})`
      : 'Unknown';

    const conversationHistory: Array<{
      type: 'system' | 'user' | 'assistant' | 'tool-call' | 'tool-result';
      role?: string;
      content?: string;
      toolName?: string;
      args?: any;
      result?: any;
      timestamp?: Date;
      metadata?: any;
    }> = [];

    // Add system prompt (always first in LLM calls)
    conversationHistory.push({
      type: 'system',
      role: 'system',
      content: `You are an AI assistant helping users edit videos...

=== PROJECT SPECIFICATIONS ===
Canvas Size: ${state.width}x${state.height}px
Aspect Ratio: ${aspectRatio}
FPS: ${state.fps || 30}
Duration: ${state.durationInFrames} frames

=== CURRENT PROJECT STATE ===
${projectContext}`,
      metadata: {
        projectSummary,
        canvasSize: `${state.width}x${state.height}`,
        aspectRatio,
        fps: state.fps || 30,
        duration: state.durationInFrames,
      }
    });

    // Add conversation messages with tool calls expanded
    messages.forEach((msg) => {
      if (msg.role === 'user') {
        conversationHistory.push({
          type: 'user',
          role: 'user',
          content: msg.content,
          timestamp: msg.timestamp,
        });
      } else if (msg.role === 'assistant') {
        conversationHistory.push({
          type: 'assistant',
          role: 'assistant',
          content: msg.content,
          timestamp: msg.timestamp,
        });

        // Add tool calls if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach((toolCall) => {
            conversationHistory.push({
              type: 'tool-call',
              toolName: toolCall.name,
              args: toolCall.params,
              timestamp: msg.timestamp,
            });

            conversationHistory.push({
              type: 'tool-result',
              toolName: toolCall.name,
              result: toolCall.result,
              timestamp: msg.timestamp,
            });
          });
        }
      }
    });

    return conversationHistory;
  };

  const history = getFullConversationHistory();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <h3 className="text-sm font-semibold">Complete LLM Conversation History</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Full agentic loop showing system prompts, messages, tool calls, and tool responses
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3">
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">
              No conversation history yet. Start a chat session to see the full LLM interaction flow.
            </div>
          ) : (
            history.map((item, idx) => (
              <div key={idx} className="relative">
                {/* System Message */}
                {item.type === 'system' && (
                  <div className="border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950/20 rounded-r-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase">
                          System Prompt
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        • Always sent first
                      </span>
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-purple-600 dark:text-purple-400 hover:underline mb-2">
                        Show full system prompt ({item.content?.split('\n').length} lines)
                      </summary>
                      <pre className="text-xs bg-purple-100 dark:bg-purple-900/30 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {item.content}
                      </pre>
                    </details>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-purple-100 dark:bg-purple-900/30 rounded p-2">
                        <span className="text-muted-foreground">Canvas:</span>{' '}
                        <span className="font-mono">{item.metadata?.canvasSize}</span>
                      </div>
                      <div className="bg-purple-100 dark:bg-purple-900/30 rounded p-2">
                        <span className="text-muted-foreground">Aspect:</span>{' '}
                        <span className="font-mono">{item.metadata?.aspectRatio}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* User Message */}
                {item.type === 'user' && (
                  <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 rounded-r-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">
                          User
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {item.timestamp?.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                      {item.content}
                    </div>
                  </div>
                )}

                {/* Assistant Message */}
                {item.type === 'assistant' && (
                  <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20 rounded-r-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">
                          Assistant
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {item.timestamp?.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-green-900 dark:text-green-100">
                      {item.content}
                    </div>
                  </div>
                )}

                {/* Tool Call */}
                {item.type === 'tool-call' && (
                  <div className="border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20 rounded-r-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase">
                        Tool Call: {item.toolName}
                      </span>
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-orange-600 dark:text-orange-400 hover:underline mb-2">
                        Show arguments
                      </summary>
                      <pre className="text-xs bg-orange-100 dark:bg-orange-900/30 p-3 rounded overflow-x-auto">
                        {JSON.stringify(item.args, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {/* Tool Result */}
                {item.type === 'tool-result' && (
                  <div className="border-l-4 border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20 rounded-r-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                      <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase">
                        Tool Result: {item.toolName}
                      </span>
                      {item.result?.success !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.result.success 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {item.result.success ? '✓ Success' : '✗ Failed'}
                        </span>
                      )}
                    </div>
                    <details className="group" open={!item.result?.success}>
                      <summary className="cursor-pointer text-xs text-cyan-600 dark:text-cyan-400 hover:underline mb-2">
                        {item.result?.success ? 'Show result data' : 'Show error details'}
                      </summary>
                      <pre className="text-xs bg-cyan-100 dark:bg-cyan-900/30 p-3 rounded overflow-x-auto">
                        {JSON.stringify(item.result, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {/* Connection Line */}
                {idx < history.length - 1 && (
                  <div className="flex justify-center my-2">
                    <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/50 to-muted-foreground/20"></div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// LLM Context Page Component
function LLMContextPage({
  messages,
  currentSessionId,
  getProjectState,
}: {
  messages: ChatMessage[];
  currentSessionId: string;
  getProjectState: () => any;
}) {
  const getLLMContext = () => {
    if (!currentSessionId) {
      return { error: "No active session" };
    }

    const state = getProjectState();
    const projectSummary = serializeProject(state, currentSessionId);
    const projectContext = formatProjectForLLM(projectSummary);

    // Convert ALL chat messages (including those with tool calls) to show complete context
    const llmMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.getTime(),
      toolCalls: m.toolCalls,
      toolResults: m.toolResults,
    }));

    return {
      messages: llmMessages,
      projectSummary,
      projectContext,
      state: {
        width: state.width,
        height: state.height,
        fps: state.fps,
        durationInFrames: state.durationInFrames,
        overlaysCount: state.overlays.length,
      },
    };
  };

  const context = getLLMContext();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <h3 className="text-sm font-semibold">LLM Context (Next Call)</h3>
        <p className="text-xs text-muted-foreground mt-1">
          This is the exact data that will be sent to the LLM on the next API call
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto">
            <code>{JSON.stringify(context, null, 2)}</code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}

// Project Data Page Component
function ProjectDataPage({
  currentSessionId,
  getProjectState,
}: {
  currentSessionId: string;
  getProjectState: () => any;
}) {
  const getProjectData = () => {
    if (!currentSessionId) {
      return { error: "No active session" };
    }

    const state = getProjectState();
    const projectSummary = serializeProject(state, currentSessionId);

    return {
      raw: state,
      serialized: projectSummary,
    };
  };

  const data = getProjectData();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <h3 className="text-sm font-semibold">Raw Project Data</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Full project state including raw overlays and serialized format
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto">
            <code>{JSON.stringify(data, null, 2)}</code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}

export function AIToolsDebugPanel() {
  const { overlays, setOverlays, playerDimensions, durationInFrames } =
    useEditorContext();

  // Page navigation
  const [currentPage, setCurrentPage] = useState<DebugPage>("chat");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>("add-text");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // LLM state
  const [useLLM, setUseLLM] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Session & checkpoints
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(
    null
  );

  const getProjectState = () => ({
    overlays,
    width: playerDimensions.width,
    height: playerDimensions.height,
    fps: 30,
    durationInFrames,
  });

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update checkpoints when session changes (but not when overlays change - we get checkpoints from API)
  useEffect(() => {
    if (currentSessionId) {
      setCheckpoints(getCheckpoints(currentSessionId));
    }
  }, [currentSessionId]); // Removed 'overlays' dependency - checkpoints now come from API response

  // Mock LLM scenarios
  const scenarios: Record<
    string,
    (state: any, sessionId: string) => {
      message: string;
      toolCalls: ToolCall[];
      overlays?: any[];
    }
  > = {
    "add-text": (state, sessionId) => {
      const newTrack: NewTrackInput = {
        type: "text",
        content: "Hello from AI!",
        start: Math.floor(durationInFrames / 2),
        duration: 90,
        row: 0,
        left: 100,
        top: 200,
        width: 600,
        height: 120,
        style: {
          fontSize: "48px",
          color: "#00ff00",
          fontWeight: "700",
        },
      };

      const result = addTrack(state, sessionId, newTrack);
      return {
        message: result.success
          ? `I've added a text overlay "${newTrack.content}" to your timeline.`
          : `Failed to add text: ${result.error?.message}`,
        toolCalls: [
          {
            id: `call_${Date.now()}_0`,
            name: "addTrack",
            params: newTrack,
            result: result.success ? result.data : result.error,
          },
        ],
        overlays: result.success ? result.data.overlays : undefined,
      };
    },

    "edit-first": (state, sessionId) => {
      const summary = serializeProject(state, sessionId);
      const textTrack = summary.tracks.find((t) => t.type === "text");

      if (!textTrack) {
        return {
          message: "No text tracks found in the project.",
          toolCalls: [],
        };
      }

      const patch: TrackPatch = {
        content: "EDITED BY AI",
        style: { color: "#ff0000", fontSize: "64px" },
      };

      const result = editTrack(state, sessionId, textTrack.trackId, patch);
      return {
        message: result.success
          ? `I've edited track ${textTrack.trackId}.`
          : `Failed to edit: ${result.error?.message}`,
        toolCalls: [
          {
            id: `call_${Date.now()}_0`,
            name: "editTrack",
            params: { trackId: textTrack.trackId, patch },
            result: result.success ? result.data : result.error,
          },
        ],
        overlays: result.success ? result.data.overlays : undefined,
      };
    },

    "delete-video": (state, sessionId) => {
      const summary = serializeProject(state, sessionId);
      const videoTrack = summary.tracks.find((t) => t.type === "video");

      if (!videoTrack) {
        return {
          message: "No video tracks found in the project.",
          toolCalls: [],
        };
      }

      const result = deleteTrack(state, sessionId, videoTrack.trackId);
      return {
        message: result.success
          ? `I've deleted video track ${videoTrack.trackId}.`
          : `Failed to delete: ${result.error?.message}`,
        toolCalls: [
          {
            id: `call_${Date.now()}_0`,
            name: "deleteTrack",
            params: { trackId: videoTrack.trackId },
            result: result.success ? result.data : result.error,
          },
        ],
        overlays: result.success ? result.data.overlays : undefined,
      };
    },

    "multi-step": (state, sessionId) => {
      const newTrack: NewTrackInput = {
        type: "text",
        content: "Step 1",
        start: 30,
        duration: 60,
        row: 1,
        left: 150,
        top: 150,
        width: 500,
        height: 100,
        style: { fontSize: "36px", color: "#0000ff" },
      };

      const addResult = addTrack(state, sessionId, newTrack);
      if (!addResult.success) {
        return {
          message: `Multi-step failed at add: ${addResult.error?.message}`,
          toolCalls: [],
        };
      }

      const stateAfterAdd = {
        ...state,
        overlays: addResult.data.overlays,
      };

      const patch: TrackPatch = {
        content: "Step 1 → Step 2",
        style: { color: "#ff00ff" },
      };

      const editResult = editTrack(
        stateAfterAdd,
        sessionId,
        addResult.data.trackId,
        patch
      );

      return {
        message: editResult.success
          ? `I've added a text track and then edited it to say "Step 1 → Step 2".`
          : `Multi-step: Add succeeded but edit failed: ${editResult.error?.message}`,
        toolCalls: [
          {
            id: `call_${Date.now()}_0`,
            name: "addTrack",
            params: newTrack,
            result: addResult.data,
          },
          {
            id: `call_${Date.now()}_1`,
            name: "editTrack",
            params: { trackId: addResult.data.trackId, patch },
            result: editResult.success ? editResult.data : editResult.error,
          },
        ],
        overlays: editResult.success ? editResult.data.overlays : undefined,
      };
    },
  };

  const handleNewSession = () => {
    const summary = serializeProject(getProjectState(), undefined);
    setCurrentSessionId(summary.sessionId);
    setMessages([]);
    setCheckpoints(getCheckpoints(summary.sessionId));
    setSelectedCheckpoint(null);
    setInputMessage("");
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentSessionId) return;

    // Check if using LLM
    if (useLLM) {
      setIsProcessing(true);
      setIsStreaming(true);
      setStreamingText("");

      // Add user message
      const userMsg: ChatMessage = {
        role: "user",
        content: inputMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputMessage("");

      try {
        // Build message history from stored messages
        // Convert UI messages to CoreMessage format (just role + content)
        const llmMessages: CoreMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        } as CoreMessage));
        // Add current user message
        llmMessages.push({
          role: "user",
          content: inputMessage,
        } as CoreMessage);

        // Call LLM API route (server-side, secure)
        const state = getProjectState();
        const apiResponse = await fetch('/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: llmMessages,
            state,
            sessionId: currentSessionId,
          }),
        });

        if (!apiResponse.ok) {
          throw new Error(`API error: ${apiResponse.statusText}`);
        }

        const result = await apiResponse.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to process request');
        }

        // Get the assistant's response
        const fullText = result.text;

        // Update checkpoints from server response (server has the authoritative checkpoint store)
        if (result.checkpoints) {
          setCheckpoints(result.checkpoints);
        }

        // Apply the updated overlays from API response
        if (result.overlays) {
          setOverlays(result.overlays);
        }

        // Add assistant message (no streaming simulation needed - instant response)
        const toolCalls = result.toolCalls || [];
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: fullText,
            timestamp: new Date(),
            toolCalls: toolCalls.map((tc: any) => ({
              name: tc.toolName,
              params: tc.args,
              result: tc.result,
            })),
          },
        ]);

        // Note: Checkpoints are now updated from API response above, no need to fetch from client store
      } catch (error: any) {
        console.error("LLM Error:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `❌ Error: ${error.message || "Failed to process request"}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsProcessing(false);
        setIsStreaming(false);
      }
      return;
    }

    // Original mock scenario handling
    setIsProcessing(true);

    // Add user message
    const userMsg: ChatMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Execute scenario
    setTimeout(() => {
      const scenario = scenarios[selectedScenario];
      if (scenario) {
        const state = getProjectState();
        const { message, toolCalls, overlays: updatedOverlays } = scenario(
          state,
          currentSessionId
        );

        // Apply overlays immediately
        if (updatedOverlays) {
          setOverlays(updatedOverlays);
        }

        // Add assistant message
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: message,
          timestamp: new Date(),
          toolCalls,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Refresh checkpoints
        setCheckpoints(getCheckpoints(currentSessionId));
      }

      setInputMessage("");
      setIsProcessing(false);
    }, 300);
  };

  const handleRestoreCheckpoint = (checkpointId: string) => {
    const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
    if (checkpoint) {
      // Restore directly from the checkpoint in state (not from client-side store)
      setOverlays(checkpoint.overlays);
      setSelectedCheckpoint(checkpointId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Restored checkpoint: "${checkpoint.description}"`,
          timestamp: new Date(),
        },
      ]);
    } else {
      console.warn(`[UI] Checkpoint ${checkpointId} not found in state`);
    }
  };

  const getCheckpointIcon = (type: CheckpointType) => {
    switch (type) {
      case "initial":
        return <Circle className="h-3 w-3 text-green-500 fill-green-500" />;
      case "before-llm":
        return <Circle className="h-3 w-3 text-blue-500" />;
      case "after-llm":
        return <Circle className="h-3 w-3 text-purple-500 fill-purple-500" />;
      case "user-edit":
        return <Circle className="h-3 w-3 text-yellow-500" />;
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900"
        >
          <Code2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="!w-[60vw] p-0 flex flex-col"
        style={{ maxWidth: 'none' }}
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Tools Debug Panel
          </SheetTitle>
          <SheetDescription>
            Test AI workflows with checkpoint system
          </SheetDescription>
        </SheetHeader>

        {/* Session Control Bar */}
        <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleNewSession}
              size="sm"
              variant="outline"
              className="h-8"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Session
            </Button>
            {currentSessionId && (
              <Alert className="flex-1 py-1.5 px-3">
                <AlertDescription className="text-xs font-mono truncate">
                  {currentSessionId}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Page Navigation Dropdown */}
        <div className="px-6 py-3 border-b shrink-0">
          <Select
            value={currentPage}
            onValueChange={(value) => setCurrentPage(value as DebugPage)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat & Testing</span>
                </div>
              </SelectItem>
              <SelectItem value="checkpoints">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Checkpoints</span>
                </div>
              </SelectItem>
              <SelectItem value="llm-history">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>LLM Conversation History</span>
                </div>
              </SelectItem>
              <SelectItem value="llm-context">
                <div className="flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  <span>LLM Context (Next Call)</span>
                </div>
              </SelectItem>
              <SelectItem value="project-data">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span>Raw Project Data</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Page Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {currentPage === "chat" && (
            <ChatPage
              messages={messages}
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              isProcessing={isProcessing}
              isStreaming={isStreaming}
              streamingText={streamingText}
              currentSessionId={currentSessionId}
              useLLM={useLLM}
              setUseLLM={setUseLLM}
              selectedScenario={selectedScenario}
              setSelectedScenario={setSelectedScenario}
              handleSendMessage={handleSendMessage}
              messagesEndRef={messagesEndRef}
              playerDimensions={playerDimensions}
              durationInFrames={durationInFrames}
              overlays={overlays}
              getProjectState={getProjectState}
            />
          )}
          {currentPage === "checkpoints" && (
            <CheckpointsPage
              checkpoints={checkpoints}
              selectedCheckpoint={selectedCheckpoint}
              handleRestoreCheckpoint={handleRestoreCheckpoint}
              currentSessionId={currentSessionId}
              clearAllCheckpoints={() => {
                if (currentSessionId) {
                  clearCheckpoints(currentSessionId);
                  setCheckpoints([]);
                }
              }}
              getCheckpointIcon={getCheckpointIcon}
            />
          )}
          {currentPage === "llm-history" && (
            <LLMHistoryPage
              messages={messages}
              currentSessionId={currentSessionId}
              getProjectState={getProjectState}
            />
          )}
          {currentPage === "llm-context" && (
            <LLMContextPage
              messages={messages}
              currentSessionId={currentSessionId}
              getProjectState={getProjectState}
            />
          )}
          {currentPage === "project-data" && (
            <ProjectDataPage
              currentSessionId={currentSessionId}
              getProjectState={getProjectState}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
