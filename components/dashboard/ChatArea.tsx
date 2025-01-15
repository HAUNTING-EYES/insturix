"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { ChatMessage } from "@/components/dashboard/ChatMessage";
import TypingIndicator from "@/components/dashboard/TypingIndicator";
import { v4 as uuidv4 } from "uuid";

interface ChatAreaProps {
  selectedModel: string;
}


export function ChatArea({ selectedModel }: ChatAreaProps) {
  const [messages, setMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (input.trim()) {
      const newMessage = {
        id: uuidv4(),
        role: "user" as const,
        content: input,
      };
      setMessages([...messages, newMessage]);
      setInput("");
      setIsTyping(true);
      // Simulate AI response
      setTimeout(() => {
        const aiMessage = {
          id: uuidv4(),
          role: "assistant" as const,
          content: `This is a simulated AI response using the ${selectedModel} model. Here's some example code:\n\n\`\`\`python\ndef hello_world():\n    print("Hello, world!")\n\nhello_world()\n\`\`\`\n\nAnd here's some **bold** and *italic* text.`,
        };
        setMessages((prev) => [...prev, aiMessage]);
        setIsTyping(false);
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <ScrollArea className="flex-1 p-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
          />
        ))}
        {isTyping && <TypingIndicator />}
      </ScrollArea>
      <div className="border-t p-4">
        <div className="flex items-center space-x-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} size="icon">
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
