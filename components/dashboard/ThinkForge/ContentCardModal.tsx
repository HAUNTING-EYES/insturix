'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { ContentCard as ContentCardType } from '@/app/dashboard/thinkforge/types';
import { format } from 'date-fns';
import ContentCard from './ContentCard';
import TagEditor from './TagEditor';
import { stageMeta } from '@/lib/calos/stages';

export interface ContentCardModalProps {
  card: ContentCardType | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<ContentCardType>) => void;
  onOpenScript?: (sessionId: string) => void;
  onDelete?: (id: string) => void;
  onGenerate?: (id: string) => void;
  onDecision?: (id: string, decision: 'approved' | 'rejected' | 'changes_requested') => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function ContentCardModal({
  card,
  isOpen,
  onClose,
  onUpdate,
  onOpenScript,
  onDelete,
  onGenerate,
  onDecision,
  onPrev,
  onNext
}: ContentCardModalProps) {
  const [localCard, setLocalCard] = useState<ContentCardType | null>(card);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Update local card when card prop changes
  useEffect(() => {
    if (card) {
      setLocalCard(card);
    }
  }, [card]);

  // Keyboard: Escape closes; Left/Right move between cards (unless typing in a field).
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') onClose();
      else if (!typing && e.key === 'ArrowLeft') onPrev?.();
      else if (!typing && e.key === 'ArrowRight') onNext?.();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, onPrev, onNext]);

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

  const stage = stageMeta(localCard.editorialStatus);
  const reviewable =
    !!onDecision &&
    ['generated', 'in_review', 'changes_requested'].includes(localCard.editorialStatus ?? '');
  const isApproved = localCard.editorialStatus === 'approved';

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return; // ignore small drags
    if (dx < 0) onNext?.();
    else onPrev?.();
  };

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
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="h-full w-full bg-[#0B0B0A]/95 backdrop-blur-xl border border-[#1C1B19]/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-[#1C1B19]/50 bg-[#0F0F0E]/30">
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
                      className="w-full bg-transparent text-[18px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#D4A652]/40 px-2 py-1 rounded"
                      autoFocus
                    />
                  ) : (
                    <h2
                      onClick={() => setIsEditingTitle(true)}
                      className="text-[18px] font-semibold text-white cursor-text hover:text-[#D4A652] transition-colors line-clamp-2"
                    >
                      {localCard.title}
                    </h2>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      <span>{format(new Date(localCard.date), 'MMM d, yyyy')}</span>
                    </div>
                    {localCard.plannedDates.length > 1 && (
                      <span className="text-neutral-500">
                        {localCard.plannedDates.length} planned dates
                      </span>
                    )}
                    {stage && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${stage.chip}`}>
                        {stage.label}
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
                      className="px-4 py-2 text-sm font-medium bg-[#D4A652]/20 border border-[#D4A652]/40 text-[#D4A652] rounded-xl hover:bg-[#D4A652]/30 transition-colors flex items-center gap-2"
                    >
                      <FileText size={14} />
                      <span>Open Script</span>
                    </button>
                  )}
                  {onGenerate && (
                    <button
                      onClick={() => onGenerate(card.id)}
                      className="px-4 py-2 text-sm font-medium bg-[#5CCCB8]/20 border border-[#5CCCB8]/40 text-[#5CCCB8] rounded-xl hover:bg-[#5CCCB8]/30 transition-colors flex items-center gap-2"
                    >
                      <FileText size={14} />
                      <span>Generate</span>
                    </button>
                  )}
                  {reviewable && (
                    <>
                      <button
                        onClick={() => onDecision?.(card.id, 'changes_requested')}
                        className="px-4 py-2 text-sm font-medium bg-[#1C1B19]/60 border border-neutral-700/70 text-neutral-300 rounded-xl hover:bg-[#D4A652]/20 hover:border-[#D4A652]/40 hover:text-[#D4A652] transition-colors"
                      >
                        Request changes
                      </button>
                      <button
                        onClick={() => onDecision?.(card.id, 'approved')}
                        className="px-4 py-2 text-sm font-medium bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 rounded-xl hover:bg-emerald-600/30 transition-colors"
                      >
                        Approve
                      </button>
                    </>
                  )}
                  {isApproved && (
                    <span className="px-4 py-2 text-sm font-medium bg-emerald-600/15 border border-emerald-500/40 text-emerald-300 rounded-xl">
                      Approved ✓
                    </span>
                  )}
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm font-medium bg-[#1C1B19]/60 border border-neutral-700/70 text-neutral-300 rounded-xl hover:bg-[#D4A652]/20 hover:border-[#D4A652]/40 hover:text-[#D4A652] transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  {(onPrev || onNext) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onPrev?.()}
                        disabled={!onPrev}
                        aria-label="Previous content (←)"
                        className="p-2 rounded-xl border border-[#1C1B19]/70 bg-[#0F0F0E]/60 hover:bg-[#0F0F0E]/80 text-neutral-400 hover:text-[#ECE9E1] disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        onClick={() => onNext?.()}
                        disabled={!onNext}
                        aria-label="Next content (→)"
                        className="p-2 rounded-xl border border-[#1C1B19]/70 bg-[#0F0F0E]/60 hover:bg-[#0F0F0E]/80 text-neutral-400 hover:text-[#ECE9E1] disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl border border-[#1C1B19]/70 bg-[#0F0F0E]/60 hover:bg-[#0F0F0E]/80 text-neutral-400 hover:text-[#ECE9E1] transition-colors"
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
                    // Child ContentCard's onUpdate is (id, updates); the modal already knows
                    // card.id. OLD: passed the 1-arg handleUpdate directly, so the child's id
                    // landed in the `updates` slot and corrupted the edit. NEW: bridge correctly.
                    onUpdate={(_id, updates) => handleUpdate(updates)}
                    onOpenScript={onOpenScript ? (id) => {
                      onOpenScript(id);
                      onClose();
                    } : undefined}
                    compact={false}
                  />

                  {localCard.scriptPreview && (
                    <div className="mt-6 p-4 rounded-xl bg-[#0F0F0E]/40 border border-[#1C1B19]/50">
                      <span className="text-sm font-medium text-neutral-300">Generated draft</span>
                      <p className="mt-2 text-[13px] text-neutral-300 whitespace-pre-wrap leading-relaxed">
                        {localCard.scriptPreview}
                      </p>
                    </div>
                  )}

                  {/* Status Selector */}
                  <div className="mt-6 p-4 rounded-xl bg-[#0F0F0E]/40 border border-[#1C1B19]/50">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-neutral-300">Status:</span>
                      <div className="flex gap-2">
                        {(['draft', 'scheduled', 'in_production', 'published'] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                              localCard.status === status
                                ? 'bg-[#D4A652]/20 border-[#D4A652]/40 text-[#D4A652]'
                                : 'bg-[#1C1B19]/60 border-neutral-700/70 text-neutral-400 hover:bg-[#1C1B19]/80'
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
                    <div className="mt-6 p-4 rounded-xl bg-[#0F0F0E]/40 border border-[#1C1B19]/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-neutral-300">Planned Dates</span>
                        <button
                          onClick={handleAddDate}
                          className="px-3 py-1.5 text-[11px] font-medium bg-[#1C1B19]/60 border border-neutral-700/70 text-neutral-300 rounded-lg hover:bg-[#1C1B19]/80 transition-colors"
                        >
                          + Add Date
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {localCard.plannedDates.map((dateStr, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1C1B19]/40 border border-neutral-700/50"
                          >
                            <span className="text-[11px] text-neutral-300">
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

