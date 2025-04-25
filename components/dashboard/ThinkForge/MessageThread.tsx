"use client"

import { useRef, useEffect } from "react"
import { ChatMessage } from "@/components/dashboard/ThinkForge/ChatMessage"
import { cn } from "@/lib/utils"

interface MessageThreadProps {
  messages: Array<{ role: string; content: string; id: string }>
  className?: string
}

export function MessageThread({ messages, className }: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className={cn("flex-1 overflow-y-auto py-4 space-y-6", className)}>
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-primary"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium">Start a conversation</h3>
          <p className="text-muted-foreground mt-2 max-w-md">
            Ask a question or start a conversation with the AI assistant.
          </p>
        </div>
      ) : (
        messages.map((message) => <ChatMessage key={message.id} message={message} isUser={message.role === "user"} />)
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
