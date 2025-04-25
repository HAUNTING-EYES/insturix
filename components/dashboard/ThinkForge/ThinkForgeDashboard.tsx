"use client";

import { useState, useRef } from "react";
import { FloatingPrompt } from "@/components/dashboard/ThinkForge/FloatingPrompt";
import { ChatCanvas } from "@/components/dashboard/ThinkForge/ChatCanvas";
import { ThoughtBubble } from "@/components/dashboard/ThinkForge/ThoughtBubble";
import { ActionWheel } from "@/components/dashboard/ThinkForge/ActionWheel";
import { VoiceInput } from "@/components/dashboard/ThinkForge/VoiceInput";
import { MessageThread } from "@/components/dashboard/ThinkForge/MessageThread";
import { Button } from "@/components/ui/button";
import { Sparkles, Mic, ImageIcon, Send, Paperclip } from "lucide-react";

export default function ThinkForgeDashboard() {
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string; id: string }>
  >([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showActionWheel, setShowActionWheel] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage = {
      role: "user",
      content: input,
      id: Date.now().toString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Simulate AI thinking
    setIsThinking(true);

    // Simulate AI response after delay
    setTimeout(() => {
      setIsThinking(false);
      const aiMessage = {
        role: "assistant",
        content: `Here's my response to "${input}"`,
        id: Date.now().toString(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 2000);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 relative bg-gradient-to-b from-background to-background/80">
      {/* Canvas Background */}
      <ChatCanvas ref={canvasRef} messages={messages} />

      {/* Message Thread */}
      <div className="w-full max-w-4xl mx-auto flex-1 overflow-hidden flex flex-col">
        <MessageThread messages={messages} />

        {/* Thinking Indicator */}
        {isThinking && <ThoughtBubble />}

        {/* Floating Action Button */}
        <div className="fixed bottom-24 right-8">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
            onClick={() => setShowActionWheel(!showActionWheel)}
          >
            <Sparkles className="h-6 w-6" />
          </Button>
        </div>

        {/* Action Wheel */}
        {showActionWheel && (
          <ActionWheel
            onClose={() => setShowActionWheel(false)}
            onSelectAction={(action) => {
              setShowActionWheel(false);
              // Handle different actions
              if (action === "voice") {
                setIsVoiceActive(true);
              }
            }}
          />
        )}

        {/* Voice Input Modal */}
        {isVoiceActive && (
          <VoiceInput
            onClose={() => setIsVoiceActive(false)}
            onTranscript={(text) => {
              setInput(text);
              setIsVoiceActive(false);
            }}
          />
        )}

        {/* Floating Prompt */}
        <FloatingPrompt
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          actions={[
            {
              icon: <Mic className="h-5 w-5" />,
              onClick: () => setIsVoiceActive(true),
            },
            { icon: <ImageIcon className="h-5 w-5" />, onClick: () => {} },
            { icon: <Paperclip className="h-5 w-5" />, onClick: () => {} },
            { icon: <Send className="h-5 w-5" />, onClick: handleSendMessage },
          ]}
        />
      </div>
    </main>
  );
}
