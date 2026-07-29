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
import { useTimeline } from "../../contexts/timeline-context";
import { useSidebar } from "../../contexts/sidebar-context";
import { OverlayType } from "../../types";
import { buildAssistBriefing } from "@/lib/editron/services/assist-briefing";
import { useAssistScanDoc } from "../../hooks/use-assist-scan-doc";
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
import html2canvas from "html2canvas-pro";
import { useAIDebugStore } from "@/lib/editron/stores/ai-debug-store";
import { useCredits } from "@/hooks/useCredits";
import { getChatToolLabel, shouldReloadProjectAfterTool } from "@/lib/editron/agent/chat-tool-registry";
import { ChatSseJsonParser } from "@/lib/editron/services/chat-sse-parser";
import {
  buildChatEditClientContext,
  canApplyChatProjectResponse,
  type ChatEditSpatialCursor,
} from "@/lib/editron/agent/chat-edit-context";
import {
  CHAT_FRAME_EVIDENCE_MAX_BYTES,
  estimateChatFrameDataUrlBytes,
  extractChatFrameCaptureRequest,
  sanitizeChatFrameEvidence,
  type ChatFrameEvidence,
} from "@/lib/editron/agent/chat-frame-evidence";
import {
  describeRecoveredChatEditOperation,
  recoverChatEditOperation,
} from "@/lib/editron/agent/chat-operation-recovery";
import {
  ChatAttachmentPicker,
  toChatAttachmentInput,
  type ChatAttachmentDraft,
} from "./chat-attachment-picker";

const clampUnit = (value: number) => Math.max(0, Math.min(value, 1));

interface ChatSendOptions {
  allowWhileProcessing?: boolean;
  visualEvidence?: ChatFrameEvidence;
  // Director Mode: set ONLY by the explicit "Run Auto-Director" confirm button.
  autoDirectorConfirmed?: boolean;
}

async function seekToRenderedFrame(player: any, frame: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      player.removeEventListener?.('seeked', handleSeeked);
      resolve();
    };
    const handleSeeked = () => {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    };
    const timeoutId = window.setTimeout(finish, 1_200);

    try {
      player.addEventListener?.('seeked', handleSeeked);
      player.seekTo(frame);
      if (typeof player.addEventListener !== 'function') {
        window.setTimeout(finish, 250);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      player.removeEventListener?.('seeked', handleSeeked);
      reject(error);
    }
  });
}

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
  attachments?: ChatAttachmentDraft[];
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
  const { timelineRef, zoomScale, scrollPosition } = useTimeline();
  const { activePanel, setActivePanel } = useSidebar();
  const { toast } = useToast();
  const userId = getUserId();
  const { invalidateCredits } = useCredits();
  const canvasDimensions = getAspectRatioDimensions();
  
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  
  // Director Mode (assist lane): the scan briefing rendered as chat's first
  // message. Derived from the shared scan doc (which polls until ready_for_chat,
  // so it appears even if chat mounted mid-scan). Zero model calls, zero billing.
  const assistScanDoc = useAssistScanDoc(editorProjectId);
  const assistBriefing = buildAssistBriefing(assistScanDoc);
  // True only when WE auto-created the very first session (genuine first open).
  // Reloading an already-chatted project loads existing sessions → stays false →
  // the briefing never reappears claiming "nothing has been edited" (battle-lane P2).
  const [assistFirstOpen, setAssistFirstOpen] = useState(false);
  const assistSessionBootstrappedRef = useRef<string | null>(null);

  // Battle-lane P0: a fresh assist project has NO chat session, so the briefing
  // (which lives inside the has-session branch) never rendered — the user hit a
  // generic "Start a new chat" wall. Silently bootstrap the first session so the
  // briefing + its starter chips appear on open. Fires once per project.
  useEffect(() => {
    if (!assistBriefing || !editorProjectId || currentSessionId || isLoadingSessions) return;
    if (assistSessionBootstrappedRef.current === editorProjectId) return;
    assistSessionBootstrappedRef.current = editorProjectId;
    let cancelled = false;
    fetch('/api/services/editron/chat/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: editorProjectId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.success && d.sessionId) { setCurrentSessionId(d.sessionId); setMessages([]); setAssistFirstOpen(true); } })
      .catch(() => { assistSessionBootstrappedRef.current = null; /* allow a retry */ });
    return () => { cancelled = true; };
  }, [assistBriefing, editorProjectId, currentSessionId, isLoadingSessions]);

  // Director Mode structured confirm: holds the goal to re-run with Auto-Director
  // when the last assistant turn asked for confirmation. Cleared on run/dismiss.
  const [autoDirectorConfirm, setAutoDirectorConfirm] = useState<string | null>(null);
  useEffect(() => {
    const AWAIT = 'assist-auto-director-needs-confirmation';
    // Walk from the end: the newest assistant turn decides.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role === 'user') { setAutoDirectorConfirm(null); return; }
      if (msg.role !== 'assistant') continue;
      const asked = (msg.toolCalls ?? []).some((tc) => typeof tc.output === 'string' && tc.output.includes(AWAIT));
      if (!asked) { setAutoDirectorConfirm(null); return; }
      // Find the user request that triggered this advisory.
      const goal = [...messages.slice(0, i)].reverse().find((m) => m.role === 'user')?.content ?? null;
      setAutoDirectorConfirm(goal);
      return;
    }
    setAutoDirectorConfirm(null);
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeProjectIdRef = useRef('');
  const activeSessionIdRef = useRef<string | null>(null);
  const latestSpatialCursorRef = useRef<ChatEditSpatialCursor | null>(null);
  const pointerContextRef = useRef({
    currentFrame,
    durationInFrames,
    canvas: canvasDimensions,
  });
  pointerContextRef.current = {
    currentFrame,
    durationInFrames,
    canvas: canvasDimensions,
  };
  const projectId = editorProjectId?.trim() ?? '';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const pointerState = pointerContextRef.current;
      const preview = document.getElementById('remotion-player-container');

      if (preview?.contains(target)) {
        const rect = preview.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const normalizedX = clampUnit((event.clientX - rect.left) / rect.width);
        const normalizedY = clampUnit((event.clientY - rect.top) / rect.height);
        latestSpatialCursorRef.current = {
          surface: 'preview',
          frame: pointerState.currentFrame,
          normalizedX,
          normalizedY,
          canvasX: Math.round(normalizedX * pointerState.canvas.width),
          canvasY: Math.round(normalizedY * pointerState.canvas.height),
          capturedAtMs: Date.now(),
          source: 'last-editor-pointer',
        };
        return;
      }

      const timeline = timelineRef.current;
      if (!timeline?.contains(target)) return;
      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || pointerState.durationInFrames <= 0) return;
      const contentWidth = Math.max(timeline.scrollWidth, rect.width);
      const internalScroll = timeline.scrollWidth > rect.width ? timeline.scrollLeft : 0;
      const normalizedX = clampUnit((event.clientX - rect.left + internalScroll) / contentWidth);
      latestSpatialCursorRef.current = {
        surface: 'timeline',
        frame: Math.round(normalizedX * pointerState.durationInFrames),
        normalizedX,
        normalizedY: clampUnit((event.clientY - rect.top) / rect.height),
        capturedAtMs: Date.now(),
        source: 'last-editor-pointer',
      };
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => document.removeEventListener('pointermove', handlePointerMove);
  }, [timelineRef]);

  // A route change must never retain chat state from the previous project.
  useEffect(() => {
    activeProjectIdRef.current = projectId;
    activeSessionIdRef.current = null;
    abortControllerRef.current?.abort();
    latestSpatialCursorRef.current = null;
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([]);
    setPendingAttachments([]);
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
    setPendingAttachments([]);
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

  const reloadProjectOverlays = async (
    expectedProjectId: string,
    signal: AbortSignal,
    reason: string,
  ): Promise<boolean> => {
    try {
      const projectResponse = await fetch(
        `/api/services/editron/projects/${encodeURIComponent(expectedProjectId)}`,
        { signal },
      );
      if (!projectResponse.ok) {
        addLog('error', 'Chat project reload failed', {
          expectedProjectId,
          reason,
          status: projectResponse.status,
        });
        return false;
      }
      const projectData = await projectResponse.json();
      if (!canApplyChatProjectResponse({
        expectedProjectId,
        activeProjectId: activeProjectIdRef.current,
        aborted: signal.aborted,
      })) {
        addLog('info', 'Skipped stale chat project reload', { expectedProjectId, reason });
        return false;
      }
      if (!Array.isArray(projectData.project?.overlays)) {
        addLog('error', 'Chat project reload omitted overlays', { expectedProjectId, reason });
        return false;
      }
      setOverlays(projectData.project.overlays);
      return true;
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error(`Failed to reload project after ${reason}`, error);
        addLog('error', 'Chat project reload threw', { expectedProjectId, reason, error });
      }
      return false;
    }
  };

  const handleSendMessage = async (
    overrideMessage?: string,
    options: ChatSendOptions = {},
  ) => {
    const messageToSend = overrideMessage || inputMessage;
    if (
      !messageToSend.trim()
      || !currentSessionId
      || (isProcessing && !options.allowWhileProcessing)
    ) return;
    const requestSessionId = currentSessionId;
    const operationId = crypto.randomUUID();
    const attachmentsForTurn = [...pendingAttachments];
    let pendingVisualFollowup: { message: string; evidence: ChatFrameEvidence } | null = null;

    setIsProcessing(true);
    setIsAIProcessing(true); // Lock editor
    setInputMessage("");
    
    // Force save current state before sending to AI to ensure it sees the latest data
    if (saveProject) {
      await saveProject();
    }
    if (
      activeProjectIdRef.current !== projectId
      || activeSessionIdRef.current !== requestSessionId
    ) {
      setIsProcessing(false);
      setIsAIProcessing(false);
      return;
    }

    addLog('info', 'Sending message', { message: messageToSend, sessionId: requestSessionId, operationId });

    // Add user message immediately
    const userMsg: ChatMessage = {
      role: "user",
      content: messageToSend,
      timestamp: new Date(),
      attachments: attachmentsForTurn,
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

    abortControllerRef.current?.abort(); // Cancel any previous stream
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let streamWasEstablished = false;
    let streamCompleted = false;
    let serverReportedStreamError = false;
    try {
      // Create AbortController for this stream (allows cancellation)
      const selectedOverlay = selectedOverlayId == null
        ? null
        : overlays.find((overlay) => String(overlay.id) === String(selectedOverlayId)) ?? null;
      const timeline = timelineRef.current;
      const timelineViewport = timeline?.parentElement ?? null;
      const viewportWidth = timelineViewport?.clientWidth ?? timeline?.clientWidth ?? 0;
      const contentWidth = Math.max(
        timelineViewport?.scrollWidth ?? 0,
        timeline?.scrollWidth ?? 0,
        timeline?.getBoundingClientRect().width ?? 0,
        viewportWidth * Math.max(1, zoomScale),
      );
      const scrollOwner = timelineViewport && timelineViewport.scrollWidth > timelineViewport.clientWidth
        ? timelineViewport
        : timeline && timeline.scrollWidth > timeline.clientWidth
          ? timeline
          : null;
      const clientContext = buildChatEditClientContext({
        currentFrame,
        selectedOverlayId: selectedOverlayId ?? null,
        selectedOverlay,
        durationInFrames,
        overlayCount: overlays.length,
        activePanel,
        canvas: canvasDimensions,
        playerDimensions,
        timelineViewport: {
          scrollLeft: scrollOwner?.scrollLeft ?? scrollPosition,
          viewportWidth,
          contentWidth,
          zoomScale,
        },
        spatialCursor: latestSpatialCursorRef.current,
      });

      const response = await fetch('/api/services/editron/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          projectId,
          operationId,
          sessionId: requestSessionId,
          selectedOverlayId: selectedOverlayId ?? undefined,
          clientContext,
          attachments: attachmentsForTurn.map(toChatAttachmentInput),
          visualEvidence: options.visualEvidence,
          ...(options.autoDirectorConfirmed ? { autoDirectorConfirmed: true } : {}),
        }),
        signal: controller.signal,
      });
      if (!canApplyChatProjectResponse({
        expectedProjectId: projectId,
        activeProjectId: activeProjectIdRef.current,
        aborted: controller.signal.aborted,
      })) return;

      // Handle insufficient credits (402)
      if (response.status === 402) {
        const errorData = await response.json();
        if (activeProjectIdRef.current !== projectId || controller.signal.aborted) return;
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

      if (response.status === 409) {
        const replay = await response.json();
        if (activeProjectIdRef.current !== projectId || controller.signal.aborted) return;
        if (replay.code !== 'CHAT_EDIT_OPERATION_REPLAY') {
          throw new Error(replay.error || 'Chat edit request conflicted with another operation.');
        }
        await reloadProjectOverlays(projectId, controller.signal, 'operation replay');
        if (!canApplyChatProjectResponse({
          expectedProjectId: projectId,
          activeProjectId: activeProjectIdRef.current,
          aborted: controller.signal.aborted,
        })) return;
        const replayMessage = replay.operationStatus === 'running'
          ? 'This exact edit request is already processing. It was not started twice.'
          : 'This exact edit request was already handled. The latest project state has been reloaded.';
        setMessages((previous) => previous.map((chatMessage) =>
          chatMessage.role === 'assistant' && chatMessage.timestamp.getTime() === assistantMsgId
            ? { ...chatMessage, content: replayMessage }
            : chatMessage,
        ));
        addLog('info', 'Duplicate chat edit operation blocked', {
          operationId,
          operationStatus: replay.operationStatus,
        });
        setPendingAttachments([]);
        return;
      }

      if (!response.ok) throw new Error('Failed to start stream');
      if (!response.body) throw new Error('No response body');
      streamWasEstablished = true;
      setPendingAttachments([]);

      const reader = response.body.getReader();
      const sseParser = new ChatSseJsonParser<Record<string, any>>();
      let assistantContent = "";
      let currentToolCalls: any[] = [];
      // Track segments in order for proper interleaved display
      let segments: ContentSegment[] = [];
      let currentTextSegmentIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (activeProjectIdRef.current !== projectId) {
          await reader.cancel();
          return;
        }

        const parsed = done ? sseParser.finish() : sseParser.push(value);
        if (parsed.errors.length > 0) {
          const detail = parsed.errors.map((error) => error.message).join('; ');
          throw new Error(`Invalid Chat-to-Edit stream: ${detail}`);
        }

        for (const data of parsed.events) {
            try {

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
                  await reloadProjectOverlays(projectId, controller.signal, `tool ${data.tool}`);
                }

              } else if (data.type === 'done') {
                 streamCompleted = true;
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
                 await reloadProjectOverlays(projectId, controller.signal, 'final stream state');
              } else if (data.type === 'error') {
                 serverReportedStreamError = true;
                 addLog('error', 'Stream error', data);
                 throw new Error(data.error);
              }
            } catch (e) {
              console.error('Error parsing stream chunk', e);
              throw e;
            }
        }
        if (streamCompleted) break;
        if (done) break;
      }
      streamCompleted = true;

      const captureActionTools = currentToolCalls.filter(
        (toolCall) => toolCall.name === 'visual_inspect_frame' && toolCall.output,
      );
      if (captureActionTools.length > 1) {
        throw new Error('The visual inspector requested multiple frames in one turn. Please retry the visual edit.');
      }
      const captureRequest = captureActionTools[0]?.output
        ? extractChatFrameCaptureRequest(captureActionTools[0].output)
        : null;
      if (captureRequest) {
        if (options.visualEvidence) {
          throw new Error('The visual inspector requested the same frame again after evidence was already attached.');
        }
        if (!playerRef?.current || durationInFrames <= 0) {
          throw new Error('The editor player is unavailable for visual inspection.');
        }

        const frame = Math.min(captureRequest.frame, Math.max(0, durationInFrames - 1));
        const previousFrame = currentFrame;
        addLog('client_action', 'Capturing editor frame', {
          frame,
          question: captureRequest.question,
        });

        let evidence: ChatFrameEvidence | null = null;
        try {
          await seekToRenderedFrame(playerRef.current, frame);
          const element = document.getElementById('remotion-player-container');
          if (!element) throw new Error('Rendered editor canvas was not found.');
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            throw new Error('Rendered editor canvas has invalid dimensions.');
          }
          const scale = Math.min(1, 960 / rect.width, 540 / rect.height);
          const canvas = await html2canvas(element, { useCORS: true, scale });
          let dataUrl = '';
          for (const quality of [0.78, 0.64, 0.5]) {
            const candidate = canvas.toDataURL('image/jpeg', quality);
            const bytes = estimateChatFrameDataUrlBytes(candidate);
            if (bytes != null && bytes <= CHAT_FRAME_EVIDENCE_MAX_BYTES) {
              dataUrl = candidate;
              break;
            }
          }
          if (!dataUrl) throw new Error('Captured frame exceeds the visual evidence size limit.');

          const capturedAtMs = Date.now();
          evidence = sanitizeChatFrameEvidence({
            frame,
            question: captureRequest.question,
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            capturedAtMs,
            source: 'editor-rendered-frame',
          }, capturedAtMs);
          if (!evidence) throw new Error('Captured frame failed visual evidence validation.');
        } finally {
          if (activeProjectIdRef.current === projectId) {
            playerRef.current?.seekTo(previousFrame);
          }
        }

        addLog('client_action', 'Editor frame captured; continuing with multimodal evidence', {
          frame,
          width: evidence.width,
          height: evidence.height,
        });
        pendingVisualFollowup = {
          message: `Continue the requested edit using the attached rendered frame ${frame}.`,
          evidence,
        };
      }

    } catch (error: any) {
      if (error?.name === 'AbortError' || activeProjectIdRef.current !== projectId) {
        return;
      }

      console.error("LLM Error:", error);
      addLog('error', 'LLM Error', error);
      let recoveredOperation = null;
      if (streamWasEstablished && !streamCompleted && !serverReportedStreamError) {
        try {
          recoveredOperation = await recoverChatEditOperation({
            projectId,
            sessionId: requestSessionId,
            operationId,
            signal: controller.signal,
          });
          addLog('info', 'Recovered chat edit operation after stream failure', {
            operationId,
            status: recoveredOperation.status,
            polls: recoveredOperation.polls,
            mutatingToolNames: recoveredOperation.snapshot?.mutatingToolNames ?? [],
          });
        } catch (recoveryError: any) {
          if (recoveryError?.name === 'AbortError') return;
          addLog('error', 'Chat edit operation recovery failed', {
            operationId,
            recoveryError,
          });
        }
      }
      await reloadProjectOverlays(projectId, controller.signal, 'chat transaction error');
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `❌ Error: ${getUserFriendlyErrorMessage(error)}`,
        timestamp: new Date(),
      };
      const recoveredMessage = recoveredOperation
        ? describeRecoveredChatEditOperation(recoveredOperation, error)
        : errorMsg.content;
      if (recoveredOperation && recoveredOperation.status !== 'unknown') {
        setPendingAttachments([]);
      }
      setMessages((previous) => previous.map((chatMessage) => {
        if (
          chatMessage.role !== 'assistant'
          || chatMessage.timestamp.getTime() !== assistantMsgId
        ) {
          return chatMessage;
        }
        return {
          ...chatMessage,
          content: recoveredMessage,
          contentSegments: [
            ...(chatMessage.contentSegments ?? []),
            { type: 'text', text: recoveredMessage },
          ],
        };
      }));
    } finally {
      if (activeProjectIdRef.current === projectId) {
        setIsProcessing(false);
        setIsAIProcessing(false); // Unlock editor when done
      }
    }

    if (
      pendingVisualFollowup
      && activeProjectIdRef.current === projectId
      && activeSessionIdRef.current === requestSessionId
    ) {
      await handleSendMessage(pendingVisualFollowup.message, {
        allowWhileProcessing: true,
        visualEvidence: pendingVisualFollowup.evidence,
      });
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
                (assistBriefing && assistFirstOpen) ? (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-muted border">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-muted/50 border space-y-3">
                      <p className="font-medium">{assistBriefing.summary}</p>
                      <p className="text-muted-foreground">
                        {assistBriefing.detail ? `${assistBriefing.detail} · ` : ""}
                        <button
                          type="button"
                          onClick={() => setActivePanel(OverlayType.SCAN_REPORT)}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          View scan report
                        </button>
                      </p>
                      {assistBriefing.chips.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {assistBriefing.chips.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              disabled={isProcessing}
                              // Director Mode exposes the direct tools (add_captions /
                              // regenerate_bgm / cut_section), so a chip directive
                              // executes on the specific tool — not the full Director.
                              onClick={() => void handleSendMessage(chip.prompt)}
                              className="rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        Tap a suggestion to load it, or just type what you want. Each instruction you send bills as a chat message.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground text-sm py-12">
                    <p>Ask me anything about your video</p>
                  </div>
                )
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
                      {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 space-y-1 border-b border-primary-foreground/20 pb-2">
                          {msg.attachments.map((attachment) => (
                            <div key={`${attachment.attachmentId}:${attachment.role}`} className="flex min-w-0 items-center gap-2 text-[10px]">
                              <span className="min-w-0 flex-1 truncate font-medium">{attachment.name}</span>
                              <span className="shrink-0 opacity-70">{attachment.role.replaceAll('-', ' ')}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
              
              {autoDirectorConfirm ? (
                <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="text-muted-foreground">
                    This hands the whole timeline to Auto-Director, which re-edits it automatically. Director Mode normally leaves the editing to you.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        const goal = autoDirectorConfirm;
                        setAutoDirectorConfirm(null);
                        void handleSendMessage(goal, { autoDirectorConfirmed: true });
                      }}
                      className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Run Auto-Director
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoDirectorConfirm(null)}
                      className="rounded-full border px-4 py-1.5 text-xs hover:bg-muted"
                    >
                      No, I'll direct it myself
                    </button>
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-background p-4 space-y-3">
            <ChatAttachmentPicker
              projectId={projectId}
              attachments={pendingAttachments}
              disabled={isProcessing}
              onChange={setPendingAttachments}
            />
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
