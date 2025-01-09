import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  avatarSrc?: string;
  avatarFallback?: string;
  className?: string;
}

const getAvatarInfo = (role: ChatMessageProps["role"]) => {
  switch (role) {
    case "user":
      return { src: "/user-avatar.png", fallback: "U" };
    case "assistant":
      return { src: "/ai-avatar.png", fallback: "AI" };
    case "system":
      return { src: "/system-avatar.png", fallback: "S" };
    default:
      return { src: "", fallback: "?" };
  }
};

export function ChatMessage({
  role,
  content,
  avatarSrc,
  avatarFallback,
  className,
}: ChatMessageProps) {
  const { src, fallback } = getAvatarInfo(role);

  return (
    <div
      className={cn(
        "flex items-start space-x-4 mb-4",
        role === "assistant" && "flex-row-reverse space-x-reverse",
        className
      )}
    >
      <Avatar className="mt-1">
        <AvatarImage src={avatarSrc || src} alt={`${role} avatar`} />
        <AvatarFallback>{avatarFallback || fallback}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex-1 rounded-lg p-4 max-w-[80%] sm:max-w-[70%]",
          role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <ReactMarkdown
          className="prose dark:prose-invert max-w-none text-sm sm:text-base"
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
