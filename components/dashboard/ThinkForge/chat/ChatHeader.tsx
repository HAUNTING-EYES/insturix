"use client";
import React from "react";
import { History, Settings, Plus, Brain, Sparkles } from "lucide-react";

interface ChatHeaderProps {
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onNewChat?: () => void;
  onOpenKnowledge?: () => void;
}

export function ChatHeader({ onOpenHistory, onOpenSettings, onNewChat, onOpenKnowledge }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-neutral-900/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80 tracking-wide">
          <Sparkles className="h-3.5 w-3.5 text-red-400" />
          AI Assistant
        </div>
        <div className="w-px h-4 bg-white/10" />
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Chat History"
          >
            <History className="h-4 w-4" />
          </button>
        )}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {onOpenKnowledge && (
          <button
            onClick={onOpenKnowledge}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Knowledge Bank"
          >
            <Brain className="h-4 w-4" />
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Project Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
