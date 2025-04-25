"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FloatingPromptProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  actions?: Array<{
    icon: React.ReactNode;
    onClick: () => void;
  }>;
  className?: string;
}

export function FloatingPrompt({
  value,
  onChange,
  onSubmit,
  actions = [],
  className,
}: FloatingPromptProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 flex justify-center items-center z-10">
      <form
        onSubmit={onSubmit}
        className={cn(
          "w-full max-w-3xl bg-card/80 backdrop-blur-md rounded-2xl shadow-lg border border-border p-2 transition-all duration-300 ease-in-out",
          className
        )}
      >
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              value={value}
              onChange={onChange}
              placeholder="Ask me anything..."
              className="w-full resize-none bg-transparent border-none focus:outline-none focus:ring-0 p-3 min-h-[60px] max-h-[200px] overflow-y-auto text-foreground"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
          </div>
          <div className="flex items-center gap-1 p-1">
            {actions.map((action, index) => (
              <Button
                key={index}
                type={index === actions.length - 1 ? "submit" : "button"}
                variant={index === actions.length - 1 ? "default" : "ghost"}
                size="icon"
                className={
                  index === actions.length - 1
                    ? "bg-primary text-primary-foreground"
                    : ""
                }
                onClick={
                  index !== actions.length - 1 ? action.onClick : undefined
                }
              >
                {action.icon}
              </Button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
