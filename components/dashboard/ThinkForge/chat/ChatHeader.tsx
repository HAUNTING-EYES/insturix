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
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1C1B19] bg-[#0F0F0E] shrink-0">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ECE9E1]/80 tracking-wide">
          <Sparkles className="h-3.5 w-3.5 text-[#D4A652]" />
          AI Assistant
        </div>
        <div className="w-px h-4 bg-[#282724]" />
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#1C1B19] transition-colors"
            title="Chat History"
          >
            <History className="h-4 w-4" />
          </button>
        )}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#1C1B19] transition-colors"
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
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#7A776E] hover:text-[#D4A652] hover:bg-[#D4A652]/10 transition-colors"
            title="Knowledge Bank"
          >
            <Brain className="h-4 w-4" />
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#1C1B19] transition-colors"
            title="Project Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
