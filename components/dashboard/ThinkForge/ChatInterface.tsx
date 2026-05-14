"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { ChatMessage, DynamicSuggestion, Idea } from "@/app/dashboard/thinkforge/types";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import ChatBubble from "@/components/chat/ChatBubble";
import SuggestionChip from "@/components/chat/SuggestionChip";
import MessageSkeleton from "@/components/chat/MessageSkeleton";

import { ChevronDown } from "lucide-react";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onGenerateScript: () => void;
  onGoHome?: () => void; // Add go home handler prop
  selectedIdea: Idea;
  suggestions: DynamicSuggestion[];
  onSelectSuggestion: (suggestion: DynamicSuggestion) => void;
  loading?: boolean;
  sendingMessage?: boolean;
  generatingScript?: boolean;
  goingHome?: boolean;
}

export default function ChatInterface({
  messages,
  onSendMessage,
  onGenerateScript,
  onGoHome,
  selectedIdea,
  suggestions,
  onSelectSuggestion,
  loading = false,
  sendingMessage = false,
  generatingScript = false,
  goingHome = false
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10); // lazy window size

  // Expand visible window when new messages arrive so latest are always shown
  useEffect(() => {
    setVisibleCount((prev) => {
      const nextCount = Math.max(10, Math.min(messages.length, prev));
      return nextCount > messages.length ? messages.length : nextCount;
    });
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Initialize component to prevent flickering during session restoration
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Improved auto-scroll logic with initialization check
  useEffect(() => {
    if (!isInitialized) return;
    
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // Check if user was already near bottom before adding new message
    const wasNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 150;
    
    if (wasNearBottom) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [messages, isInitialized]);

  // Detect scroll position to toggle FAB
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    setShowScrollFab(!nearBottom);

    // Load older messages when reaching close to top
    if (target.scrollTop < 40) {
      setVisibleCount((prev) => {
        const next = Math.min(messages.length, prev + 10);
        return next;
      });
    }
  };

  const handleSendMessage = () => {
    // Input validation and sanitization
    const sanitizedMessage = inputMessage.trim();
    if (!sanitizedMessage || sendingMessage || !isInitialized) return;
    
    // Additional security: check for malicious patterns and length
    if (sanitizedMessage.length > 2000) return;
    
    try {
      onSendMessage(sanitizedMessage);
      setInputMessage("");
    } catch (error) {
      // Failed to send message - silent failure for security
      // Don't clear input on error so user can retry
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: DynamicSuggestion) => {
    if (!isInitialized) return;
    
    try {
      // Sanitize suggestion input
      const sanitizedDescription = suggestion.description?.slice(0, 2000) || '';
      setInputMessage(sanitizedDescription);
      onSelectSuggestion(suggestion);
    } catch (error) {
      // Failed to handle suggestion click - silent failure for security
    }
  };

  // Map thinking hat to circle background ,  simple extraction to avoid
  // inline switch later; can be moved to toneUtils if reused elsewhere.
  const toneBgMap: Record<string, string> = {
    white: 'bg-white border border-gray-300',
    red: 'bg-[#D4A652]',
    black: 'bg-black',
    yellow: 'bg-yellow-400',
    green: 'bg-green-500',
    blue: 'bg-blue-500'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col lg:flex-row h-full space-y-4 lg:space-y-0 lg:space-x-6"
    >
      {/* Left: Chat column */}
      <div className="flex flex-col flex-1 h-full relative">
        {/* Chat header */}
        <div className="flex items-center gap-2 pb-3">
          <MessageSquare className="h-5 w-5 text-[#D4A652]" />
          <h2 className="text-lg font-medium text-[#ECE9E1]">Chat with ForgeAI</h2>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-2 scroll-smooth lg:max-h-[600px] break-words"
          style={{ 
            height: 'calc(100vh - 400px)',
            minHeight: '250px',
            maxHeight: '500px',
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
          onScroll={onScroll}
          ref={scrollContainerRef}
        >
          {isInitialized && Array.isArray(messages) && messages.slice(Math.max(0, messages.length - visibleCount)).map((m, idx) => (
            <ChatBubble
              key={`${m.id}-${idx}`}
              role={m.role}
              content={m.content}
              timestamp={m.timestamp}
              index={idx}
            />
          ))}

          {sendingMessage && <MessageSkeleton />}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {isInitialized && Array.isArray(suggestions) && suggestions.length > 0 && (
          <div className="w-full overflow-x-auto overflow-y-hidden py-2 bg-[#0B0B0A] backdrop-blur max-h-20">
            <div className="flex flex-wrap sm:flex-nowrap gap-2 px-2 sm:min-w-max">
              {suggestions.map((s) => (
                <SuggestionChip
                  key={s.id}
                  suggestion={s}
                  onClick={handleSuggestionClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="flex gap-2 pt-2 bg-[#0B0B0A] backdrop-blur">
          <Input
            aria-label="Chat message input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value.slice(0, 2000))} // Limit length for security
            onKeyPress={handleKeyPress}
            placeholder="Ask ForgeAI to help develop your idea..."
            className="flex-1 bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652] overflow-hidden text-ellipsis"
            disabled={sendingMessage}
            maxLength={2000}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || sendingMessage}
            size="icon"
            aria-label="Send message"
            className="bg-[#D4A652] hover:bg-[#D4A652]"
          >
            {sendingMessage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Scroll-to-latest */}
        {showScrollFab && (
          <button
            type="button"
            className="absolute bottom-20 right-4 p-3 rounded-full bg-[#D4A652]/90 hover:bg-[#D4A652] text-white shadow-lg backdrop-blur transition-all duration-200 hover:scale-105 z-10"
            aria-label="Scroll to latest message"
            onClick={scrollToBottom}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Right: Selected idea & actions */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        {isInitialized && selectedIdea && (
          <Card className="bg-[#0B0B0A] border-[#1C1B19] backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-medium text-[#ECE9E1] break-words overflow-hidden">
                    {selectedIdea.idea || 'Loading idea...'}
                  </CardTitle>
                  <p className="text-sm text-[#7A776E] mt-1 break-words overflow-hidden">{selectedIdea.purpose || ''}</p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full flex-shrink-0 ml-3 ${toneBgMap[selectedIdea.tone] || 'bg-[#454340]'}`}
                  title={getToneDescription(selectedIdea.tone)}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Style</span>
                  <p className="text-[#B5B2A8] mt-1 break-words overflow-hidden text-ellipsis">{selectedIdea.style || 'Loading...'}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Format</span>
                  <p className="text-[#B5B2A8] mt-1 break-words overflow-hidden text-ellipsis">{selectedIdea.format || 'Loading...'}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Platform</span>
                  <p className="text-[#B5B2A8] mt-1 break-words overflow-hidden text-ellipsis">{selectedIdea.platform || 'Loading...'}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Approach</span>
                  <p className="text-[#B5B2A8] mt-1 break-words overflow-hidden text-ellipsis">{getToneDescription(selectedIdea.tone)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isInitialized && (
          <>
            <Button
              onClick={onGenerateScript}
              disabled={generatingScript || !selectedIdea}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              {generatingScript ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening Script...
                </>
              ) : (
                <>Open Script</>
              )}
            </Button>

            <Button
              onClick={onGoHome}
              disabled={goingHome}
              className="w-full bg-[#D4A652] hover:bg-[#D4A652] text-white font-medium"
            >
              {goingHome ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing Session...
                </>
              ) : (
                <>Go Back Home</>
              )}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
} 