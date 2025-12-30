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
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import { getUserId } from "../../utils/user-id";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: any;
  }>;
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
  const { overlays, setOverlays, playerDimensions, durationInFrames, getAspectRatioDimensions } = useEditorContext();
  const { toast } = useToast();
  const userId = getUserId();
  
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const projectId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || 'default' : 'default';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (currentSessionId) {
      loadSessionMessages(currentSessionId);
    }
  }, [currentSessionId]);

  const loadSessions = async () => {
    try {
      const res = await fetch(`/api/services/editron/chat/sessions/list?projectId=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
        // Auto-select most recent session if none selected
        if (!currentSessionId && data.sessions.length > 0) {
          setCurrentSessionId(data.sessions[0].sessionId);
        }
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/services/editron/chat/sessions/${sessionId}/history`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })));
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
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

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentSessionId || isProcessing) return;

    setIsProcessing(true);
    const userMessage = inputMessage;
    setInputMessage("");

    // Add user message immediately
    const userMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Get actual composition dimensions (not preview player dimensions)
      const { width: compositionWidth, height: compositionHeight } = getAspectRatioDimensions();
      
      // Call LLM API
      const state = {
        overlays,
        width: compositionWidth,   // Use composition dimensions for positioning
        height: compositionHeight, // Use composition dimensions for positioning
        fps: 30,
        durationInFrames,
      };

      const llmMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      llmMessages.push({ role: "user", content: userMessage });

      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: llmMessages,
          state,
          sessionId: currentSessionId,
          projectId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to process request');
      }

      // Add assistant message
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.text,
        timestamp: new Date(),
        toolCalls: data.toolCalls?.map((tc: any) => ({
          id: `tool_${Date.now()}`,
          name: tc.toolName,
          args: tc.args,
        })),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update overlays if changed
      if (data.overlays) {
        setOverlays(data.overlays);
      }

      // Reload messages from server to ensure sync
      await loadSessionMessages(currentSessionId);
    } catch (error: any) {
      console.error("LLM Error:", error);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `❌ Error: ${error.message || "Failed to process request"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
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
                      <div className="text-xs text-muted-foreground mt-1">
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
    <div className="flex flex-col h-full bg-background">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <div>
            <h3 className="font-semibold text-sm">
              {currentSession?.name || "AI Assistant"}
            </h3>
            {currentSession && (
              <p className="text-xs text-muted-foreground">
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

      {!currentSessionId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <Sparkles className="h-12 w-12 text-purple-500 mx-auto" />
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
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-12">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 text-purple-500" />
                  <p>Ask me anything about your video</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-4 py-3",
                        msg.role === "user"
                          ? "bg-purple-500 text-white"
                          : "bg-muted border"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={cn(
                            "text-xs font-semibold uppercase tracking-wide",
                            msg.role === "user"
                              ? "text-purple-100"
                              : "text-muted-foreground"
                          )}
                        >
                          {msg.role === "user" ? "You" : "AI"}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            msg.role === "user"
                              ? "text-purple-200"
                              : "text-muted-foreground"
                          )}
                        >
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-400/20">
                          <div className="text-xs font-semibold mb-2 opacity-75">
                            🔧 Actions ({msg.toolCalls.length})
                          </div>
                          <div className="space-y-1">
                            {msg.toolCalls.map((call, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-xs bg-purple-400/10 rounded px-2 py-1"
                              >
                                <span className="font-mono">{call.name}</span>
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
                className="min-h-[60px] resize-none"
                disabled={isProcessing}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isProcessing}
                size="icon"
                className="h-[60px] w-[60px] shrink-0 bg-purple-500 hover:bg-purple-600"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              AI can help you add, edit, and organize your video elements
            </p>
          </div>
        </>
      )}
    </div>
  );
}
