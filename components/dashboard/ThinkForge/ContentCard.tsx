'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Calendar, Tag, Lightbulb, Sparkles, X, ExternalLink, Clock } from 'lucide-react';
import { ContentCard as ContentCardType } from '@/app/dashboard/thinkforge/types';
import { format } from 'date-fns';
import TagEditor from './TagEditor';
import { getToneColorClass } from '@/lib/thinkforge/tone';

export interface ContentCardProps {
  card: ContentCardType;
  onUpdate?: (id: string, updates: Partial<ContentCardType>) => void;
  onOpenScript?: (sessionId: string) => void;
  compact?: boolean;
}

export default function ContentCard({ card, onUpdate, onOpenScript, compact = false }: ContentCardProps) {
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

  // Truncate script preview
  const scriptPreview = card.scriptPreview || '';
  const truncatedScript = scriptPreview.length > 200 
    ? scriptPreview.substring(0, 200) + '...' 
    : scriptPreview;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl border border-neutral-800/70 bg-neutral-950/95 backdrop-blur-xl shadow-xl"
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1 line-clamp-2">
              {card.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Calendar size={12} />
              <span>{format(new Date(card.date), 'MMM d, yyyy')}</span>
              {card.plannedDates.length > 1 && (
                <span className="text-neutral-500">
                  (+{card.plannedDates.length - 1} more)
                </span>
              )}
            </div>
          </div>
          {card.aiScore !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600/10 border border-red-500/30">
              <Sparkles size={12} className="text-red-300" />
              <span className="text-xs font-medium text-red-200">{card.aiScore}</span>
            </div>
          )}
        </div>

        {/* Idea Section */}
        {card.idea && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2 p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/50"
          >
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} className="text-yellow-400" />
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">Idea</span>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-neutral-200 font-medium mb-1">{card.idea.idea}</p>
                <p className="text-neutral-400 text-xs">{card.idea.purpose}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-800/50">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Style:</span>
                  <span className="text-xs text-neutral-300">{card.idea.style}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Format:</span>
                  <span className="text-xs text-neutral-300">{card.idea.format}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Platform:</span>
                  <span className="text-xs text-neutral-300">{card.idea.platform}</span>
                </div>
                {card.idea.tone && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-neutral-500">Tone:</span>
                    <div className={`h-2.5 w-2.5 rounded-full ${getToneColorClass(card.idea.tone as any)}`} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Custom Tags */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-red-400" />
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">Tags</span>
          </div>
          <TagEditor
            tags={card.customTags || []}
            onChange={handleTagChange}
            placeholder="Add custom tag..."
            maxTags={10}
          />
        </div>

        {/* Details/Notes Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-blue-400" />
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">Details</span>
          </div>
          <textarea
            value={card.details || ''}
            onChange={(e) => handleDetailsChange(e.target.value)}
            placeholder="Add notes, production details, or any additional information..."
            rows={3}
            className="w-full px-3 py-2 bg-neutral-900/60 border border-neutral-800/70 rounded-xl text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-700/40 focus:border-red-800/60 transition-all backdrop-blur-sm resize-none"
          />
        </div>

        {/* Planned Dates */}
        {card.plannedDates.length > 1 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-purple-400" />
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
                Planned Dates ({card.plannedDates.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {card.plannedDates.map((dateStr, index) => (
                <div
                  key={index}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900/40 border border-neutral-800/50 text-xs text-neutral-300"
                >
                  {format(new Date(dateStr), 'MMM d, yyyy')}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Script Preview Section */}
        {card.sessionId && (
          <div className="pt-3 border-t border-neutral-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-green-400" />
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">Script Preview</span>
              </div>
              {truncatedScript && (
                <button
                  onClick={handleOpenScript}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-400 hover:text-green-300 transition-colors rounded-lg hover:bg-green-900/20"
                >
                  <span>View Full</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
            {truncatedScript ? (
              <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800/50">
                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {truncatedScript}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800/50 text-center">
                <p className="text-xs text-neutral-500">
                  No script preview available
                </p>
                {onOpenScript && (
                  <button
                    onClick={handleOpenScript}
                    className="mt-2 px-3 py-1.5 text-xs font-medium bg-red-600/20 border border-red-500/40 text-red-200 rounded-lg hover:bg-red-600/30 transition-colors"
                  >
                    Open in Scripting
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Status:</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
              card.status === 'published' ? 'bg-red-600/20 text-red-200' :
              card.status === 'scheduled' ? 'bg-blue-600/20 text-blue-200' :
              card.status === 'in_production' ? 'bg-yellow-600/20 text-yellow-200' :
              'bg-neutral-800/60 text-neutral-200'
            }`}>
              {card.status.replace('_', ' ')}
            </span>
          </div>
          {card.updatedAt && (
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              <Clock size={10} />
              <span>Updated {format(new Date(card.updatedAt), 'MMM d')}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

