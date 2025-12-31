'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CalendarComponent, { CalendarEvent } from './Calendar';
import { ContentCard } from '@/app/dashboard/thinkforge/types';
import { useContentPlanning } from '@/app/dashboard/thinkforge/hooks/useContentPlanning';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';

type PlanningPanelProps = {
  isOpen: boolean; // Keep for API compatibility but unused in new mode
  onClose: () => void;
  onOpenScript?: (sessionId: string) => void;
  onCreateCardFromIdea?: (idea: any, date: Date) => void;
};

export default function PlanningPanel({ 
  isOpen, 
  onClose,
  onOpenScript,
  onCreateCardFromIdea
}: PlanningPanelProps) {
  const { cards, loading, createCard, updateCard, deleteCard, refreshCards } = useContentPlanning();
  const [isCreating, setIsCreating] = useState(false);

  // Convert ContentCards to Calendar events format (with backward compatibility)
  const calendarEvents = cards.map(card => {
    // Convert ContentCard to calendar event format
    const event: ContentCard | CalendarEvent = {
      ...card,
      date: card.plannedDates?.[0] || card.date,
    };
    return event;
  });

  // Handle creating a new card
  const handleCreateCard = useCallback(async (date: Date) => {
    setIsCreating(true);
    try {
      const newCard: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'> = {
        title: 'New Content',
        date: date.toISOString(),
        platform: 'youtube',
        status: 'draft',
        tags: [],
        customTags: [],
        plannedDates: [date.toISOString()],
        details: '',
      };

      await createCard(newCard);
    } catch (error) {
      console.error('Failed to create card:', error);
    } finally {
      setIsCreating(false);
    }
  }, [createCard]);

  // Handle card update
  const handleCardUpdate = useCallback(async (id: string, updates: Partial<ContentCard>) => {
    await updateCard(id, updates);
  }, [updateCard]);

  // Handle card deletion
  const handleCardDelete = useCallback(async (id: string) => {
    await deleteCard(id);
  }, [deleteCard]);

  // Handle event drop (reschedule)
  const handleEventDrop = useCallback(async (eventId: string, newDate: Date) => {
    const card = cards.find(c => c.id === eventId);
    if (!card) return;

    const newDateStr = newDate.toISOString();
    const updatedDates = card.plannedDates.includes(newDateStr)
      ? card.plannedDates
      : [...card.plannedDates, newDateStr];

    await updateCard(eventId, {
      date: newDateStr,
      plannedDates: updatedDates,
    });
  }, [cards, updateCard]);

  // Handle cell click (create card on empty date)
  const handleCellClick = useCallback((date: Date) => {
    // This will be handled by Calendar's onCreateCard if cell is empty
  }, []);

  return (
    <div className="relative w-full h-full bg-neutral-950 flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        <CalendarComponent
            events={calendarEvents}
            onCellClick={handleCellClick}
            onEventClick={(event) => {
              // Handled by Calendar component
            }}
            onEventDrop={handleEventDrop}
            onClose={onClose}
            onEventUpdate={handleCardUpdate}
            onCreateCard={handleCreateCard}
            onDeleteCard={handleCardDelete}
            onOpenScript={onOpenScript}
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
              <p className="text-sm text-neutral-300">Loading content cards...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
