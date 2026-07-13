"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Send,
  Plus,
  Loader2,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  History,
  ChevronLeft,
  Terminal,
  Bot,
  User,
  Settings2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEditorContext } from "../../contexts/editor-context";
import { getUserId } from "../../utils/user-id";
import { cn } from "@/lib/utils";
import { EDLSuggestions } from "./edl-suggestions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/editron/use-toast";
import { ToolCallIndicator } from "./tool-call-indicator";
import { getUserFriendlyErrorMessage } from "@/lib/editron/utils/error-handling";
import html2canvas from "html2canvas";
import { useAIDebugStore } from "@/lib/editron/stores/ai-debug-store";
import { useCredits } from "@/hooks/useCredits";
import { getChatToolLabel, shouldReloadProjectAfterTool } from "@/lib/editron/agent/chat-tool-registry";

interface ContentSegment {
  type: 'text' | 'tool';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    args: any;
    output?: string;
  };
}

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: any;
    output?: string;
  }>;
  // Segments track the interleaved order of text and tool calls
  contentSegments?: ContentSegment[];
  // Credits consumed for this message (token-based billing)
  creditsConsumed?: number;
}

interface ChatSession {
  sessionId: string;
  userId: string;
  projectId: string;
  name: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export function AIChatPanel() {
  const { overlays, setOverlays, playerDimensions, durationInFrames, getAspectRatioDimensions, playerRef, saveProject,
    setIsAIProcessing, selectedOverlayId, currentFrame, projectId: editorProjectId
  } = useEditorContext();
  const { toast } = useToast();
  const userId = getUserId();
  const { invalidateCredits } = useCredits();
  
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeProjectIdRef = useRef('');
  const activeSessionIdRef = useRef<string | null>(null);
  const projectId = editorProjectId?.trim() ?? '';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // A route change must never retain chat state from the previous project.
  useEffect(() => {
    activeProjectIdRef.current = projectId;
    activeSessionIdRef.current = null;
    abortControllerRef.current?.abort();
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([]);
    setShowHistory(false);
    setIsProcessing(false);
    setIsAIProcessing(false);

    if (!projectId) {
      setIsLoadingSessions(false);
      return;
    }

    void loadSessions(projectId);
  }, [projectId]);

  // Load messages only for the active project/session pair.
  useEffect(() => {
    activeSessionIdRef.current = currentSessionId;
    if (currentSessionId && projectId) {
      void loadSessionMessages(currentSessionId, projectId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, projectId]);

  const loadSessions = async (expectedProjectId: string = projectId) => {
    if (!expectedProjectId) return;

    try {
      setIsLoadingSessions(true);
      const res = await fetch(
        '/api/services/editron/chat/sessions/list?projectId=' + encodeURIComponent(expectedProjectId),
      );
      if (!res.ok) throw new Error('Failed to load chat sessions');

      const data = await res.json();
      if (activeProjectIdRef.current !== expectedProjectId) return;

      if (data.success) {
        const projectSessions: ChatSession[] = Array.isArray(data.sessions)
          ? data.sessions.filter((session: ChatSession) => session.projectId === expectedProjectId)
          : [];
        setSessions(projectSessions);
        setCurrentSessionId((activeSessionId) => {
          if (
            activeSessionId &&
            projectSessions.some((session) => session.sessionId === activeSessionId)
          ) {
            return activeSessionId;
          }
          return projectSessions[0]?.sessionId ?? null;
        });
      }
    } catch (error) {
      if (activeProjectIdRef.current === expectedProjectId) {
        console.error('Failed to load sessions:', error);
      }
    } finally {
      if (activeProjectIdRef.current === expectedProjectId) {
        setIsLoadingSessions(false);
      }
    }
  };

  const loadSessionMessages = async (
    sessionId: string,
    expectedProjectId: string = projectId,
  ) => {
    if (!expectedProjectId) return;

    try {
      const res = await fetch(
        '/api/services/editron/chat/sessions/' +
          encodeURIComponent(sessionId) +
          '/history?projectId=' +
          encodeURIComponent(expectedProjectId),
      );
      if (!res.ok) throw new Error('Failed to load chat history');

      const data = await res.json();
      if (
        activeProjectIdRef.current !== expectedProjectId ||
        activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      if (data.success) {
        // Transform messages to merge toolResults into toolCalls and generate contentSegments
        setMessages(data.messages.map((m: any) => {
          const message: ChatMessage = {
            ...m,
            timestamp: new Date(m.timestamp),
          };
          
          // Merge toolResults into toolCalls so UI shows completed state
          if (m.toolCalls && m.toolResults) {
            message.toolCalls = m.toolCalls.map((tc: any) => {
              // Find matching result by toolCallId
              const result = m.toolResults.find(
                (tr: any) => tr.toolCallId === tc.id || tr.toolName === tc.name
              );
              return {
                ...tc,
                output: result?.result || undefined,
              };
            });
          }
          
          // Generate contentSegments for historical messages
          // Since we don't store exact order, we show text first, then tool calls
          if (message.role === 'assistant') {
            const segments: ContentSegment[] = [];
            
            // Add text content as first segment if present
            if (message.content?.trim()) {
              segments.push({ type: 'text', text: message.content });
            }
            
            // Add tool calls as segments (with merged output)
            if (message.toolCalls && message.toolCalls.length > 0) {
              message.toolCalls.forEach((tc: any) => {
                segments.push({ type: 'tool', toolCall: tc });
              });
            }
            
            message.contentSegments = segments;
          }
          
          return message;
        }));
      }
    } catch (error) {
      if (
        activeProjectIdRef.current === expectedProjectId &&
        activeSessionIdRef.current === sessionId
      ) {
        console.error('Failed to load messages:', error);
      }
    }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch('/api/services/editron/chat/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success) {
        await loadSessions();
        setCurrentSessionId(data.sessionId);
        setMessages([]);
        setShowHistory(false);
        toast({
          title: "New chat created",
          description: "Start a conversation with AI",
        });
      }
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Error",
        description: "Failed to create new chat",
        variant: "destructive",
      });
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/services/editron/chat/sessions/${sessionId}/delete`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await loadSessions();
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
        toast({
          title: "Chat deleted",
        });
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      });
    }
  };

  const renameSession = async (sessionId: string, newName: string) => {
    try {
      const res = await fetch(`/api/services/editron/chat/sessions/${sessionId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (data.success) {
        await loadSessions();
        setEditingSessionId(null);
        toast({
          title: "Chat renamed",
        });
      }
    } catch (error) {
      console.error("Failed to rename session:", error);
      toast({
        title: "Error",
        description: "Failed to rename chat",
        variant: "destructive",
      });
    }
  };

  const addLog = useAIDebugStore((state) => state.addLog);

  const handleSendMessage = async (overrideMessage?: string) => {
    const messageToSend = overrideMessage || inputMessage;
    if (!messageToSend.trim() || !currentSessionId || isProcessing) return;

    setIsProcessing(true);
    setIsAIProcessing(true); // Lock editor
    setInputMessage("");
    
    // Force save current state before sending to AI to ensure it sees the latest data
    if (saveProject) {
      await saveProject();
    }

    addLog('info', 'Sending message', { message: messageToSend, sessionId: currentSessionId });

    // Add user message immediately
    const userMsg: ChatMessage = {
      role: "user",
      content: messageToSend,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Create placeholder assistant message
    // We need a unique ID to reliably update this message in the state
    const assistantMsgId = Date.now(); 
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date(assistantMsgId), // Use timestamp as ID for now since interface doesn't have ID
      toolCalls: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      // Create AbortController for this stream (allows cancellation)
      abortControllerRef.current?.abort(); // Cancel any previous stream
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/services/editron/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          projectId,
          sessionId: currentSessionId,
          selectedOverlayId: selectedOverlayId || undefined,
          clientContext: {
            currentFrame,
            selectedOverlayId: selectedOverlayId ?? null,
            durationInFrames,
            overlayCount: overlays.length,
            canvas: getAspectRatioDimensions(),
            playerDimensions,
          },
        }),
        signal: controller.signal,
      });

      // Handle insufficient credits (402)
      if (response.status === 402) {
        const errorData = await response.json();
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: `⚠️ **Insufficient Credits**\n\nYou need more credits to use the AI assistant. You have ${errorData.creditsInfo?.available || 0} credits remaining.\n\n[🔗 Top up credits](/dashboard/billing)`,
          timestamp: new Date(),
        };
        setMessages((prev) => prev.map(msg => 
          (msg.role === 'assistant' && msg.timestamp.getTime() === assistantMsgId)
            ? errorMsg
            : msg
        ));
        setIsProcessing(false);
        setIsAIProcessing(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to start stream');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let currentToolCalls: any[] = [];
      // Track segments in order for proper interleaved display
      let segments: ContentSegment[] = [];
      let currentTextSegmentIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (activeProjectIdRef.current !== projectId) {
          await reader.cancel();
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'token') {
                assistantContent += data.content;
                
                // If we're currently accumulating text, update the current text segment
                // Otherwise, create a new text segment
                if (currentTextSegmentIndex >= 0 && segments[currentTextSegmentIndex]?.type === 'text') {
                  segments[currentTextSegmentIndex].text = (segments[currentTextSegmentIndex].text || '') + data.content;
                } else {
                  // Create new text segment
                  currentTextSegmentIndex = segments.length;
                  segments.push({ type: 'text', text: data.content });
                }
                
                // Update message with both content and segments
                setMessages((prev) => prev.map(msg => 
                  (msg.role === 'assistant' && msg.timestamp.getTime() === assistantMsgId)
                    ? { ...msg, content: assistantContent, contentSegments: [...segments] }
                    : msg
                ));
              } else if (data.type === 'tool_start') {
                addLog('tool_start', `Tool started: ${getChatToolLabel(data.tool)}`, { tool: data.tool, args: data.args });
                // Use server-provided ID for reliable matching
                const toolCall = { name: data.tool, id: data.id || `tool_${Date.now()}`, args: data.args };
                currentToolCalls.push(toolCall);
                
                // Add tool call as a segment (interrupts text flow)
                segments.push({ type: 'tool', toolCall });
                currentTextSegmentIndex = -1; // Reset so next text creates new segment
                
                setMessages((prev) => prev.map(msg => 
                  (msg.role === 'assistant' && msg.timestamp.getTime() === assistantMsgId)
                    ? { ...msg, toolCalls: [...currentToolCalls], contentSegments: [...segments] }
                    : msg
                ));
              } else if (data.type === 'tool_end') {
                addLog('tool_end', `Tool finished: ${getChatToolLabel(data.tool)}`, data);
                // Match by ID (reliable) or fallback to name without output
                const toolCallIndex = data.id 
                  ? currentToolCalls.findIndex(tc => tc.id === data.id)
                  : currentToolCalls.findIndex(tc => tc.name === data.tool && !tc.output);
                if (toolCallIndex !== -1) {
                  currentToolCalls[toolCallIndex].output = data.output;
                  
                  // Also update the segment's toolCall output
                  const segmentIndex = segments.findIndex(
                    s => s.type === 'tool' && s.toolCall?.id === currentToolCalls[toolCallIndex].id
                  );
                  if (segmentIndex !== -1 && segments[segmentIndex].toolCall) {
                    segments[segmentIndex].toolCall!.output = data.output;
                  }
                  
                  // Force update state to ensure re-render
                  setMessages((prev) => prev.map(msg =>
                    (msg.role === 'assistant' && msg.timestamp.getTime() === assistantMsgId)
                      ? { ...msg, toolCalls: [...currentToolCalls], contentSegments: [...segments] }
                      : msg
                  ));

                  // Video regen progress: detect batch ID and poll for completion
                  if (data.tool === 'regenerate_scene' && data.output) {
                    try {
                      const toolOutput = typeof data.output === 'string' ? JSON.parse(data.output) : data.output;
                      const resultText = (toolOutput?.results || toolOutput?.data?.results || []).join(' ');
                      const batchMatch = resultText.match(/batch: (vb_[A-Za-z0-9_-]+)/);
                      // Extract storyboardId from the tool output or from the project
                      const storyboardId = toolOutput?.storyboardId || toolOutput?.data?.storyboardId;

                      if (batchMatch && storyboardId) {
                        const batchId = batchMatch[1];
                        // Extract scene indices from tool args
                        const sceneIdx = toolOutput?.sceneIndex ?? toolOutput?.data?.sceneIndex;
                        const sceneIndices = sceneIdx !== undefined ? [sceneIdx] : [];

                        // Emit event for the persistent VideoRegenBanner (handles polling + UI)
                        try {
                          const { emitVideoRegenStart } = await import('../core/video-regen-banner');
                          emitVideoRegenStart(batchId, storyboardId, sceneIndices);
                        } catch {
                          // Fallback toast if import fails
                          toast({ title: 'Video regenerating...', description: 'This takes 1-3 minutes.' });
                        }
                      } else if (batchMatch) {
                        toast({ title: 'Video regenerating...', description: 'This takes 1-3 minutes. Reload the page to check.' });
                      }
                    } catch {} // Non-critical
                  }
                }
                // Reload project data immediately after a mutating registry tool finishes
                if (shouldReloadProjectAfterTool(data.tool)) {
                   try {
                     const projectRes = await fetch(`/api/services/editron/projects/${projectId}`);
                     if (projectRes.ok) {
                       const projectData = await projectRes.json();
                       if (projectData.project && projectData.project.overlays) {
                         setOverlays(projectData.project.overlays);
                       }
                     }
                   } catch (e) {
                     console.error("Failed to reload project data", e);
                   }
                }

              } else if (data.type === 'done') {
                 addLog('info', 'Stream finished', { creditsConsumed: data.creditsConsumed, tokensUsed: data.tokensUsed });
                 
                 // Update the message with credits consumed
                 if (data.creditsConsumed !== undefined) {
                   setMessages((prev) => prev.map(msg => 
                     (msg.role === 'assistant' && msg.timestamp.getTime() === assistantMsgId)
                       ? { ...msg, creditsConsumed: data.creditsConsumed }
                       : msg
                   ));
                   
                   // Refresh the credits badge in the navbar
                   invalidateCredits();
                 }

                 // Update session ID if it changed (e.g. backend created auto-session)
                 if (data.sessionId && data.sessionId !== currentSessionId) {
                   setCurrentSessionId(data.sessionId);
                   loadSessions();
                 }
                 // Final authoritative reload from DB after ALL tools complete.
                 // This is critical because per-tool reloads can be clobbered by
                 // intermediate state changes. This ensures the client has the
                 // definitive server-side state after the AI finishes all edits.
                 try {
                   const finalRes = await fetch(`/api/services/editron/projects/${projectId}`);
                   if (finalRes.ok) {
                     const finalData = await finalRes.json();
                     if (finalData.project && finalData.project.overlays) {
                       setOverlays(finalData.project.overlays);
                     }
                   }
                 } catch (e) {
                   console.error("Failed final overlay reload after AI stream", e);
                 }
              } else if (data.type === 'error') {
                addLog('error', 'Stream error', data);
                throw new Error(data.error);
              }
            } catch (e) {
              console.error('Error parsing stream chunk', e);
            }
          }
        }
      }

      // Check for pending client actions (capture_frame)
      const captureActionTool = currentToolCalls.find(tc => tc.name === 'visual_inspect_frame');
      if (captureActionTool && captureActionTool.output) {
        try {
          const output = JSON.parse(captureActionTool.output);
          if (output.action === 'capture_frame') {
            const { frame, question } = output;
            addLog('client_action', 'Capturing frame', { frame, question });
            
            // 1. Seek to frame
            if (playerRef?.current) {
              playerRef.current.seekTo(frame);
              
              // 2. Wait for seek/render (short delay)
              await new Promise(resolve => setTimeout(resolve, 800));
              
              // 3. Capture
              const element = document.getElementById("remotion-player-container");
              if (element) {
                const canvas = await html2canvas(element, {
                  useCORS: true,
                  scale: 0.5, // Reduce resolution for speed/token usage
                });
                const base64Image = canvas.toDataURL('image/jpeg', 0.7);
                
                const imageMessage = `[System: Frame ${frame} captured]\nHere is the visual snapshot you requested:\n${base64Image}\n\nQuestion was: ${question}`;
                
                addLog('client_action', 'Frame captured, sending back to AI');

                setTimeout(() => {
                   handleSendMessage(imageMessage);
                }, 100);
                return; // Exit this execution
              }
            }
          }
        } catch (e) {
          console.error("Failed to handle capture action", e);
          addLog('error', 'Failed to handle capture action', e);
        }
      }

    } catch (error: any) {
      if (error?.name === 'AbortError' || activeProjectIdRef.current !== projectId) {
        return;
      }

      console.error("LLM Error:", error);
      addLog('error', 'LLM Error', error);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `❌ Error: ${getUserFriendlyErrorMessage(error)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (activeProjectIdRef.current === projectId) {
        setIsProcessing(false);
        setIsAIProcessing(false); // Unlock editor when done
      }
    }
  };

  const currentSession = sessions.find((s) => s.sessionId === currentSessionId);

  if (showHistory) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* History Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowHistory(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-semibold">Chat History</h3>
          </div>
          <Button
            onClick={createNewSession}
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {sessions.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">
                No chat history yet
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent",
                    currentSessionId === session.sessionId && "bg-accent"
                  )}
                  onClick={() => {
                    setCurrentSessionId(session.sessionId);
                    setShowHistory(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {editingSessionId === session.sessionId ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameSession(session.sessionId, editingName);
                              } else if (e.key === 'Escape') {
                                setEditingSessionId(null);
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              renameSession(session.sessionId, editingName);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(null);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="font-medium text-sm truncate">
                          {session.name || `Chat ${new Date(session.createdAt).toLocaleDateString()}`}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {session.messages.length} messages • {new Date(session.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(session.sessionId);
                            setEditingName(session.name || '');
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.sessionId);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in-0 duration-300">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">
              {currentSession?.name || "AI Assistant"}
            </h3>
            {currentSession && (
              <p className="text-[11px] text-muted-foreground">
                {messages.length} messages
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowHistory(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            onClick={createNewSession}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      {isLoadingSessions ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <Loader2 className="h-8 w-8 text-muted-foreground mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground">Loading chats...</p>
          </div>
        </div>
      ) : !currentSessionId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-semibold text-lg">Start a new chat</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a new chat session to start editing your video with AI assistance
            </p>
            <Button onClick={createNewSession} className="gap-2">
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* EDL Suggestions — auto-loads on project open */}
          <EDLSuggestions
            projectId={projectId}
            onSuggestionClick={(prompt) => {
              setInputMessage(prompt);
            }}
          />

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-12">
                  <p>Ask me anything about your video</p>
                </div>
              ) : (
                messages
                  // Filter out empty assistant messages (no content AND no tool calls)
                  .filter(msg => msg.role === "user" || msg.content.trim() || (msg.toolCalls && msg.toolCalls.length > 0))
                  .map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"
                    )}>
                      {msg.role === "user" ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted/50 border rounded-tl-sm"
                      )}
                    >
                      {/* Credits consumed indicator for AI messages */}
                      {msg.role === "assistant" && msg.creditsConsumed !== undefined && msg.creditsConsumed > 0 && (
                        <div className="flex items-center justify-end mb-2 -mt-1 -mr-1">
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {msg.creditsConsumed.toFixed(1)} credits
                          </span>
                        </div>
                      )}
                      {/* User messages: just show content */}
                      {msg.role === "user" && msg.content.trim() && (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                      )}
                      
                      {/* Assistant messages: render segments in order for proper interleaving */}
                      {msg.role === "assistant" && msg.contentSegments && msg.contentSegments.length > 0 ? (
                        <div className="space-y-2">
                          {msg.contentSegments.map((segment, segIdx) => (
                            segment.type === 'text' && segment.text?.trim() ? (
                              <div key={`text-${segIdx}`} className="text-sm leading-relaxed">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>,
                                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                    code: ({ className, children, ...props }) => {
                                      const isInline = !className;
                                      return isInline ? (
                                        <code className="bg-black/20 dark:bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                                          {children}
                                        </code>
                                      ) : (
                                        <code className="block bg-black/10 dark:bg-white/10 rounded p-2 font-mono text-[11px] overflow-x-auto my-2" {...props}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    pre: ({ children }) => <pre className="m-0">{children}</pre>,
                                  }}
                                >
                                  {segment.text}
                                </ReactMarkdown>
                              </div>
                            ) : segment.type === 'tool' && segment.toolCall ? (
                              <ToolCallIndicator
                                key={`tool-${segIdx}`}
                                toolName={segment.toolCall.name}
                                isComplete={!!segment.toolCall.output}
                              />
                            ) : null
                          ))}
                        </div>
                      ) : msg.role === "assistant" && (
                        /* Fallback for assistant messages without segments (shouldn't happen but just in case) */
                        <>
                          {msg.content.trim() && (
                            <div className="text-sm leading-relaxed">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>,
                                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                  code: ({ className, children, ...props }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                      <code className="bg-black/20 dark:bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                                        {children}
                                      </code>
                                    ) : (
                                      <code className="block bg-black/10 dark:bg-white/10 rounded p-2 font-mono text-[11px] overflow-x-auto my-2" {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre: ({ children }) => <pre className="m-0">{children}</pre>,
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}
                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div className={cn("space-y-2", msg.content.trim() && "mt-3")}>
                              {msg.toolCalls.map((call, i) => (
                                <ToolCallIndicator
                                  key={i}
                                  toolName={call.name}
                                  isComplete={!!call.output}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              
              {/* Loading Indicator */}
              {isProcessing && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted/50 border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-background p-4 space-y-3">
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
                placeholder="Ask AI to edit your video..."
                className="min-h-[50px] max-h-[200px] resize-none"
                disabled={isProcessing}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isProcessing}
                size="icon"
                className="h-[50px] w-[50px] shrink-0"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center opacity-70">
              AI can make mistakes. Please review generated edits.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
