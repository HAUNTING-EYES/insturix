"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@/types/clickatron';
import { User, Bot, Image } from 'lucide-react';

interface ChatHistoryProps {
  messages: ChatMessage[];
  isVisible: boolean;
  onToggle: () => void;
}

export function ChatHistory({ messages, isVisible, onToggle }: ChatHistoryProps) {
  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="text-[11px] text-[#7A776E] hover:text-[#B5B2A8] transition-colors"
      >
        Show Chat History ({messages.length})
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-[#282724]/50 pt-4 mt-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-[#B5B2A8]">Chat History</h4>
        <button
          onClick={onToggle}
          className="text-[11px] text-[#7A776E] hover:text-[#B5B2A8] transition-colors"
        >
          Hide
        </button>
      </div>
      
      <div className="max-h-48 overflow-y-auto space-y-2">
        <AnimatePresence>
          {messages.slice(0, 10).map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-2 text-sm"
            >
              <div className="flex-shrink-0 mt-1">
                {message.role === 'user' ? (
                  <User className="h-3 w-3 text-blue-400" />
                ) : (
                  <Bot className="h-3 w-3 text-[#D4A652]" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-[#B5B2A8] break-words">
                  {message.content}
                </div>
                
                {message.referenceImages && message.referenceImages.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-[#7A776E]">
                    <Image className="h-3 w-3" />
                    <span>{message.referenceImages.length} reference image{message.referenceImages.length > 1 ? 's' : ''}</span>
                  </div>
                )}
                
                <div className="text-[11px] text-[#7A776E] mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {messages.length === 0 && (
          <div className="text-center text-[#7A776E] text-sm py-4">
            No messages yet
          </div>
        )}
      </div>
    </motion.div>
  );
}