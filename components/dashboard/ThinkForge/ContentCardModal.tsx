'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, FileText } from 'lucide-react';
import { ContentCard as ContentCardType } from '@/app/dashboard/thinkforge/types';
import { format } from 'date-fns';
import ContentCard from './ContentCard';
import TagEditor from './TagEditor';

export interface ContentCardModalProps {
  card: ContentCardType | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<ContentCardType>) => void;
  onOpenScript?: (sessionId: string) => void;
  onDelete?: (id: string) => void;
}

export default function ContentCardModal({
  card,
  isOpen,
  onClose,
  onUpdate,
  onOpenScript,
  onDelete
}: ContentCardModalProps) {
  const [localCard, setLocalCard] = useState<ContentCardType | null>(card);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Update local card when card prop changes
  useEffect(() => {
    if (card) {
      setLocalCard(card);
    }
  }, [card]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!card || !localCard) return null;

  const handleUpdate = (updates: Partial<ContentCardType>) => {
    const updated = { ...localCard, ...updates };
    setLocalCard(updated);
    onUpdate(card.id, updates);
  };

  const handleTitleChange = (title: string) => {
    handleUpdate({ title });
  };

  const handleTagChange = (tags: string[]) => {
    handleUpdate({ customTags: tags });
  };

  const handleDetailsChange = (details: string) => {
    handleUpdate({ details });
  };

  const handleStatusChange = (status: ContentCardType['status']) => {
    handleUpdate({ status });
  };

  const handleAddDate = () => {
    const newDate = new Date().toISOString();
    const updatedDates = [...localCard.plannedDates, newDate];
    handleUpdate({ plannedDates: updatedDates });
  };

  const handleRemoveDate = (dateToRemove: string) => {
    const updatedDates = localCard.plannedDates.filter(d => d !== dateToRemove);
    handleUpdate({ plannedDates: updatedDates });
  };

  const handleDelete = () => {
    if (onDelete && confirm('Are you sure you want to delete this content card?')) {
      onDelete(card.id);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-4 sm:inset-8 z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full w-full bg-neutral-950/95 backdrop-blur-xl border border-neutral-800/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-neutral-800/50 bg-neutral-900/30">
                <div className="flex-1 min-w-0">
                  {isEditingTitle ? (
                    <input
                      type="text"
                      value={localCard.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditingTitle(false);
                      }}
                      className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-700/40 px-2 py-1 rounded"
                      autoFocus
                    />
                  ) : (
                    <h2
                      onClick={() => setIsEditingTitle(true)}
                      className="text-xl font-semibold text-white cursor-text hover:text-red-200 transition-colors line-clamp-2"
                    >
                      {localCard.title}
                    </h2>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      <span>{format(new Date(localCard.date), 'MMM d, yyyy')}</span>
                    </div>
                    {localCard.plannedDates.length > 1 && (
                      <span className="text-neutral-500">
                        {localCard.plannedDates.length} planned dates
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {localCard.sessionId && onOpenScript && (
                    <button
                      onClick={() => {
                        onOpenScript(localCard.sessionId!);
                        onClose();
                      }}
                      className="px-4 py-2 text-sm font-medium bg-red-600/20 border border-red-500/40 text-red-200 rounded-xl hover:bg-red-600/30 transition-colors flex items-center gap-2"
                    >
                      <FileText size={14} />
                      <span>Open Script</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm font-medium bg-neutral-800/60 border border-neutral-700/70 text-neutral-300 rounded-xl hover:bg-red-600/20 hover:border-red-500/40 hover:text-red-200 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl border border-neutral-800/70 bg-neutral-900/60 hover:bg-neutral-900/80 text-neutral-400 hover:text-white transition-colors"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto p-6">
                  <ContentCard
                    card={localCard}
                    onUpdate={handleUpdate}
                    onOpenScript={onOpenScript ? (id) => {
                      onOpenScript(id);
                      onClose();
                    } : undefined}
                    compact={false}
                  />

                  {/* Status Selector */}
                  <div className="mt-6 p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/50">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-neutral-300">Status:</span>
                      <div className="flex gap-2">
                        {(['draft', 'scheduled', 'in_production', 'published'] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              localCard.status === status
                                ? 'bg-red-600/20 border-red-500/40 text-red-200'
                                : 'bg-neutral-800/60 border-neutral-700/70 text-neutral-400 hover:bg-neutral-800/80'
                            } border`}
                          >
                            {status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Planned Dates Manager */}
                  {localCard.plannedDates.length > 0 && (
                    <div className="mt-6 p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-neutral-300">Planned Dates</span>
                        <button
                          onClick={handleAddDate}
                          className="px-3 py-1.5 text-xs font-medium bg-neutral-800/60 border border-neutral-700/70 text-neutral-300 rounded-lg hover:bg-neutral-800/80 transition-colors"
                        >
                          + Add Date
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {localCard.plannedDates.map((dateStr, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/40 border border-neutral-700/50"
                          >
                            <span className="text-xs text-neutral-300">
                              {format(new Date(dateStr), 'MMM d, yyyy')}
                            </span>
                            {localCard.plannedDates.length > 1 && (
                              <button
                                onClick={() => handleRemoveDate(dateStr)}
                                className="p-0.5 rounded hover:bg-neutral-700/50 transition-colors"
                                aria-label="Remove date"
                              >
                                <X size={12} className="text-neutral-400" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

