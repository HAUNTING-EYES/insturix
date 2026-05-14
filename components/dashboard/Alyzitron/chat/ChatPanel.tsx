"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  MessageSquare,
  X,
  Trash2,
  ChevronRight,
  Mic,
  Send,
  Square,
  RotateCcw,
  Sparkles,
  Clock,
  Languages,
  FileText,
  AlertTriangle,
} from "lucide-react";
import ChatMessage from "./Chatmessage";
import TypingIndicator from "./TypingIndicator";
import SuggestedPrompts from "./Suggestedprompts";

export interface VideoAnalysis {
  title?: string;
  summary?: string;
  topics?: string[];
  keyMoments?: { timestamp: string; description: string }[];
  speakers?: { label: string; description?: string }[];
  sentiment?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface TranscriptionMeta {
  status: "not_found" | "processing" | "completed" | "error";
  detectedLanguage?: string | null;
  wordCount?: number;
  durationMs?: number | null;
}

interface ChatPanelProps {
  taskId: string;
  videoUrl: string; // YouTube URL or GCS gs:// URL
  videoAnalysis: VideoAnalysis | null;
  videoTitle?: string;
  userId?: string;
  /** Whether the panel is open */
  open: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "Is this analysis positive or negative?",
  "What are the key moments?",
  "What are the points to be improved?",
  "What is the overall sentiment?",
];

export default function ChatPanel({
  taskId,
  videoUrl,
  videoAnalysis,
  videoTitle,
  userId,
  open,
  onClose,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasSummarized, setHasSummarized] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [transcriptionMeta, setTranscriptionMeta] = useState<TranscriptionMeta | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Init session on open — creates session + auto-triggers transcription
  useEffect(() => {
    if (!open) return;
    initSession();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [open, taskId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  /**
   * Single call to POST /chat-session:
   *  - Creates or finds the session
   *  - Auto-triggers transcription in the background if not already done
   *  - Returns session history + transcription status in one round-trip
   */
  async function initSession() {
    setIsLoadingHistory(true);
    try {
      const res = await fetch("/api/services/alyzitron/chat-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, videoUrl, userId }),
      });
      const data = await res.json();

      if (data.messages?.length) {
        setMessages(
          data.messages
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
            }))
        );
      }
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.hasSummary)  setHasSummarized(true);

      // Set initial transcription status from session response
      setTranscriptionMeta({ status: data.transcriptionStatus });

      // If transcription is still processing, poll until done
      if (data.transcriptionStatus !== "completed") {
        pollTranscriptionStatus();
      }
    } catch (err) {
      console.error("[ChatPanel] Failed to init session:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function pollTranscriptionStatus() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/services/alyzitron/transcribe?taskId=${taskId}`);
        const d = await r.json();
        setTranscriptionMeta(d);
        if (d.status !== "processing") {
          clearInterval(pollIntervalRef.current!);
        }
      } catch {
        clearInterval(pollIntervalRef.current!);
      }
    }, 4000);
  }

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? input).trim();
      if (!text || isStreaming) return;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text, timestamp: new Date() },
      ]);
      setInput("");
      setIsStreaming(true);

      // Optimistic assistant placeholder
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: new Date() },
      ]);

      try {
        abortControllerRef.current = new AbortController();

        const res = await fetch("/api/services/alyzitron/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId,
            sessionId,
            message: text,
            videoAnalysis,
            videoTitle,
            userId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "chunk") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + event.text,
                    };
                  }
                  return updated;
                });
              } else if (event.type === "summarized") {
                setHasSummarized(true);
              } else if (event.type === "done") {
                setSessionId(event.sessionId);
              } else if (event.type === "error") {
                throw new Error(event.message);
              }
            } catch (parseErr) {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "Something went wrong. Please try again.",
              timestamp: new Date(),
            };
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, taskId, sessionId, videoAnalysis, videoTitle, userId]
  );

  function stopStreaming() {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }

  async function clearChat() {
    const params = new URLSearchParams({ taskId });
    if (userId) params.set("userId", userId);
    await fetch(`/api/services/alyzitron/chat-session?${params}`, {
      method: "DELETE",
    });
    setMessages([]);
    setSessionId(null);
    setHasSummarized(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = !isLoadingHistory && messages.length === 0;
  const title = videoTitle || videoAnalysis?.title || "Video";

  return (
    <Tooltip.Provider delayDuration={400}>
      {/* Panel */}
      <div
        data-state={open ? "open" : "closed"}
        className="
          fixed top-0 right-0 z-50 h-full w-[420px] max-w-[100vw]
          flex flex-col
          bg-[#0B0B0A] border-l border-[#1C1B19]
          shadow-[-24px_0_60px_rgba(0,0,0,0.6)]
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          data-[state=open]:translate-x-0
          data-[state=closed]:translate-x-full
        "
        style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex-none flex flex-col border-b border-[#1C1B19]">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[#D4A652]/10 border border-[#D4A652]/20">
                <MessageSquare className="h-4 w-4 text-[#D4A652]" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[13px] font-semibold text-[#ECE9E1] leading-none">
                  Analysis Chat
                </p>
                <p className="text-[11px] text-[#5F5E5A] mt-0.5 leading-none truncate max-w-[180px]">
                  {title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {hasSummarized && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#D4A652]/10 border border-[#D4A652]/20 cursor-default">
                      <Sparkles className="h-3 w-3 text-[#D4A652]" />
                      <span className="text-[10px] text-[#D4A652] font-medium">Summarized</span>
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-[#0F0F0E] border border-[#282724] text-[#B5B2A8] text-[11px] px-3 py-1.5 rounded-lg shadow-xl max-w-[200px] text-center"
                      sideOffset={6}
                    >
                      Older messages were summarized to preserve context
                      <Tooltip.Arrow className="fill-[#282724]" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              {messages.length > 0 && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={clearChat}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5F5E5A] hover:text-[#D46A5C] hover:bg-[#D46A5C]/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-[#0F0F0E] border border-[#282724] text-[#B5B2A8] text-[11px] px-3 py-1.5 rounded-lg shadow-xl"
                      sideOffset={6}
                    >
                      Clear chat history
                      <Tooltip.Arrow className="fill-[#282724]" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5F5E5A] hover:text-[#ECE9E1] hover:bg-[#131312] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Transcription meta bar */}
          <TranscriptionBar meta={transcriptionMeta} />
        </div>

        {/* Messages */}
        <ScrollArea.Root className="flex-1 min-h-0">
          <ScrollArea.Viewport className="h-full w-full">
            <div className="flex flex-col px-4 py-4 gap-1 min-h-full">

              {isLoadingHistory && (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 rounded-full border-2 border-[#282724] border-t-[#D4A652] animate-spin" />
                </div>
              )}

              {isEmpty && (
                <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0F0F0E] border border-[#1C1B19]">
                    <MessageSquare className="h-6 w-6 text-[#454340]" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-[#B5B2A8] mb-1">
                    Ask about this video
                  </p>
                  <p className="text-[11px] text-[#454340] max-w-[240px] leading-relaxed">
                    I have access to the full transcript and AI analysis.
                    Ask about content, speakers, timestamps, or key moments.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <ChatMessage key={i} message={msg} isLast={i === messages.length - 1} />
              ))}

              {isStreaming && messages[messages.length - 1]?.content === "" && (
                <TypingIndicator />
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-1.5 touch-none select-none p-0.5 transition-colors"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-full bg-[#282724]/50" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        {/* Suggested Prompts */}
        {isEmpty && !isLoadingHistory && (
          <SuggestedPrompts
            prompts={SUGGESTED_PROMPTS}
            onSelect={(p) => sendMessage(p)}
          />
        )}

        {/* Input */}
        <div className="flex-none border-t border-[#1C1B19] p-3">
          <div
            className="
              flex items-end gap-2 rounded-xl
              bg-[#0F0F0E] border border-[#1C1B19]
              focus-within:border-[#D4A652]/40 focus-within:bg-[#0F0F0E]
              transition-colors px-3 py-2.5
            "
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask about this video…"
              rows={1}
              className="
                flex-1 resize-none bg-transparent text-sm text-[#ECE9E1]
                placeholder-[#454340] outline-none leading-5
                disabled:opacity-50 min-h-[20px] max-h-[120px]
                scrollbar-none
              "
              style={{ scrollbarWidth: "none" }}
            />

            {isStreaming ? (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={stopStreaming}
                    className="
                      flex-shrink-0 flex h-8 w-8 items-center justify-center
                      rounded-lg bg-[#D46A5C]/15 border border-[#D46A5C]/30
                      text-[#D46A5C] hover:bg-[#D46A5C]/25 transition-colors
                    "
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-[#0F0F0E] border border-[#282724] text-[#B5B2A8] text-[11px] px-3 py-1.5 rounded-lg shadow-xl"
                    sideOffset={6}
                  >
                    Stop generating
                    <Tooltip.Arrow className="fill-[#282724]" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim()}
                className="
                  flex-shrink-0 flex h-8 w-8 items-center justify-center
                  rounded-lg bg-[#D4A652] hover:bg-[#B8860B]
                  disabled:opacity-30 disabled:cursor-not-allowed
                  text-[#0B0B0A] transition-colors
                "
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-[#454340] mt-1.5">
            Enter to send · Shift + Enter for new line
          </p>
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
    </Tooltip.Provider>
  );
}

// Transcription meta bar
function TranscriptionBar({ meta }: { meta: TranscriptionMeta | null }) {
  if (!meta || meta.status === "not_found") return null;

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#0B0B0A]/60 border-t border-[#1C1B19]/50">
      {meta.status === "processing" && (
        <>
          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[11px] text-[#5F5E5A]">Transcribing audio…</span>
        </>
      )}

      {meta.status === "error" && (
        <>
          <AlertTriangle className="h-3 w-3 text-[#D46A5C] flex-shrink-0" />
          <span className="text-[11px] text-[#D46A5C]">Transcription failed — answers may be limited</span>
        </>
      )}

      {meta.status === "completed" && (
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#5EC97E]" />
            <span className="text-[11px] text-[#5F5E5A] font-mono">Transcript ready</span>
          </div>

          <Separator.Root
            orientation="vertical"
            className="h-3 w-px bg-[#131312]"
          />

          {meta.detectedLanguage && (
            <div className="flex items-center gap-1">
              <Languages className="h-2.5 w-2.5 text-[#454340]" />
              <span className="text-[11px] font-mono text-[#5F5E5A] uppercase">
                {meta.detectedLanguage}
              </span>
            </div>
          )}

          {meta.wordCount != null && meta.wordCount > 0 && (
            <>
              <Separator.Root orientation="vertical" className="h-3 w-px bg-[#131312]" />
              <div className="flex items-center gap-1">
                <FileText className="h-2.5 w-2.5 text-[#454340]" />
                <span className="text-[11px] font-mono text-[#5F5E5A]">
                  {meta.wordCount.toLocaleString()} words
                </span>
              </div>
            </>
          )}

          {meta.durationMs && (
            <>
              <Separator.Root orientation="vertical" className="h-3 w-px bg-[#131312]" />
              <div className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5 text-[#454340]" />
                <span className="text-[11px] font-mono text-[#5F5E5A]">
                  {formatDuration(meta.durationMs)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}