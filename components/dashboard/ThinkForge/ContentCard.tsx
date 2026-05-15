'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Calendar, Tag, Lightbulb, Sparkles, X, ExternalLink, Clock, MoreHorizontal, ChevronDown, ChevronUp, Trash2, Edit2 } from 'lucide-react';
import { ContentCard as ContentCardType } from '@/app/dashboard/thinkforge/types';
import { format } from 'date-fns';
import TagEditor from './TagEditor';
import { getToneColorClass } from '@/lib/thinkforge/tone';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ContentCardProps {
  card: ContentCardType;
  onUpdate?: (id: string, updates: Partial<ContentCardType>) => void;
  onOpenScript?: (sessionId: string) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

export default function ContentCard({ card, onUpdate, onOpenScript, onDelete, compact = false }: ContentCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  const handleTagChange = (tags: string[]) => {
    onUpdate?.(card.id, { customTags: tags });
  };

  const handleDetailsChange = (details: string) => {
    onUpdate?.(card.id, { details });
  };

  const handleOpenScript = () => {
    if (card.sessionId && onOpenScript) {
      onOpenScript(card.sessionId);
    }
  };

  const handleStatusChange = (status: ContentCardType['status']) => {
    onUpdate?.(card.id, { status });
  };

  // Truncate script preview
  const scriptPreview = card.scriptPreview || '';
  const truncatedScript = scriptPreview.length > 150 
    ? scriptPreview.substring(0, 150) + '...' 
    : scriptPreview;

  const statusColors = {
    draft: 'bg-[#1C1B19] text-neutral-400 border-neutral-700',
    scheduled: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
    in_production: 'bg-yellow-950/30 text-yellow-400 border-yellow-900/50',
    published: 'bg-green-950/30 text-green-400 border-green-900/50',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group w-full rounded-xl border border-[#1C1B19]/60 bg-[#0F0F0E]/40 backdrop-blur-md shadow-sm hover:shadow-md hover:border-neutral-700/80 transition-all overflow-hidden"
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide border ${statusColors[card.status] || statusColors.draft}`}>
                {card.status.replace('_', ' ')}
              </span>
              <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                <Calendar size={10} />
                {format(new Date(card.date), 'MMM d')}
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-neutral-200 line-clamp-2 leading-tight group-hover:text-[#ECE9E1] transition-colors">
              {card.title}
            </h3>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-500 hover:text-[#ECE9E1] hover:bg-[#1C1B19]">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0F0F0E] border-[#1C1B19] text-neutral-200">
              <DropdownMenuItem onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                {isExpanded ? 'Collapse' : 'Expand'}
              </DropdownMenuItem>
              {card.sessionId && (
                <DropdownMenuItem onClick={handleOpenScript}>
                  <FileText className="mr-2 h-4 w-4" />
                  Open Script
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDelete?.(card.id)} className="text-[#D4A652] focus:text-[#D4A652] focus:bg-[#D4A652]/20">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick Details (Always Visible) */}
        <div className="flex items-center gap-2 flex-wrap">
           {card.idea?.platform && (
             <div className="flex items-center gap-1 text-[11px] text-neutral-400 bg-[#1C1B19]/50 px-2 py-1 rounded-md">
               <span className="capitalize">{card.idea.platform}</span>
             </div>
           )}
           {card.aiScore !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#D4A652]/20 border border-[#D4A652]/30 text-[11px] text-[#D4A652]">
              <Sparkles size={10} />
              <span>{card.aiScore}</span>
            </div>
          )}
        </div>

        {/* Expandable Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-2 border-t border-[#1C1B19]/50"
            >
              {/* Idea Snippet */}
              {card.idea && (
                <div className="text-sm text-neutral-400 bg-[#0B0B0A]/30 p-3 rounded-lg border border-[#1C1B19]/30">
                  <div className="flex items-center gap-2 mb-1 text-[11px] font-medium text-neutral-500 uppercase">
                    <Lightbulb size={10} /> Idea
                  </div>
                  <p className="line-clamp-2">{card.idea.idea}</p>
                </div>
              )}

              {/* Tags */}
              <TagEditor
                tags={card.customTags || []}
                onChange={handleTagChange}
                placeholder="+ Tag"
                maxTags={5}
              />

              {/* Script Preview */}
              {card.sessionId && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-neutral-500 uppercase flex items-center gap-1">
                      <FileText size={10} /> Script
                    </span>
                    <button
                      onClick={handleOpenScript}
                      className="text-[10px] text-[#D4A652] hover:text-[#D4A652] flex items-center gap-1 transition-colors"
                    >
                      Open Editor <ExternalLink size={10} />
                    </button>
                  </div>
                  <div 
                    className="text-[11px] text-neutral-400 leading-relaxed bg-[#0B0B0A]/50 p-3 rounded-lg border border-[#1C1B19]/30 cursor-pointer hover:border-neutral-700/50 transition-colors"
                    onClick={handleOpenScript}
                  >
                    {truncatedScript || <span className="italic opacity-50">No script content yet...</span>}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <span className="text-[11px] font-medium text-neutral-500 uppercase block mb-1.5">Notes</span>
                <textarea
                  value={card.details || ''}
                  onChange={(e) => handleDetailsChange(e.target.value)}
                  placeholder="Add details..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0B0B0A]/50 border border-[#1C1B19]/50 rounded-lg text-[11px] text-neutral-300 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-[#D4A652]/50 focus:border-[#D4A652]/50 transition-all resize-none"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Expand Toggle (Bottom) */}
        {!isExpanded && (
           <button 
             onClick={() => setIsExpanded(true)}
             className="w-full flex items-center justify-center pt-1 text-neutral-600 hover:text-neutral-400 transition-colors"
           >
             <ChevronDown size={14} />
           </button>
        )}
        {isExpanded && (
           <button 
             onClick={() => setIsExpanded(false)}
             className="w-full flex items-center justify-center pt-1 text-neutral-600 hover:text-neutral-400 transition-colors"
           >
             <ChevronUp size={14} />
           </button>
        )}
      </div>
    </motion.div>
  );
}
