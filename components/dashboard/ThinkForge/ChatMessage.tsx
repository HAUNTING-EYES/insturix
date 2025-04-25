"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react"

interface ChatMessageProps {
  message: { role: string; content: string; id: string }
  isUser: boolean
  className?: string
}

export function ChatMessage({ message, isUser, className }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"liked" | "disliked" | null>(null)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("group flex gap-3 px-4", isUser ? "justify-end" : "justify-start", className)}>
      {!isUser && (
        <Avatar className="h-8 w-8 bg-primary/10 flex items-center justify-center text-primary">
          <span className="text-xs font-bold">AI</span>
        </Avatar>
      )}

      <div className="flex flex-col max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm",
            isUser ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none",
          )}
        >
          {message.content}
        </div>

        {!isUser && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyToClipboard}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="sr-only">Copy message</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", feedback === "liked" && "text-green-500")}
              onClick={() => setFeedback("liked")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              <span className="sr-only">Like</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", feedback === "disliked" && "text-red-500")}
              onClick={() => setFeedback("disliked")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              <span className="sr-only">Dislike</span>
            </Button>
          </div>
        )}
      </div>

      {isUser && (
        <Avatar className="h-8 w-8 bg-primary flex items-center justify-center text-primary-foreground">
          <span className="text-xs font-bold">You</span>
        </Avatar>
      )}
    </div>
  )
}
