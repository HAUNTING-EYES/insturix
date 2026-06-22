'use client';

import React from 'react';
import Calendar from './Calendar';
import { useContentPlanning } from '@/app/dashboard/thinkforge/hooks/useContentPlanning';
import type { ContentCard } from '@/app/dashboard/thinkforge/types';

type PlanningPanelProps = {
  isOpen: boolean; // Kept for API compatibility; the panel is always-on in calendar mode.
  onClose: () => void;
  onOpenScript?: (sessionId: string) => void;
  onCreateCardFromIdea?: (idea: unknown, date: Date) => void;
};

export default function PlanningPanel({
  isOpen: _isOpen,
  onClose: _onClose,
  onOpenScript,
  onCreateCardFromIdea: _onCreateCardFromIdea,
}: PlanningPanelProps) {
  // OLD: rendered <PlanningPlaceholder/> ("Coming Soon"). The Calendar UI + CRUD hook were
  // both built but never wired (the hook was orphaned). NEW: mount the real Calendar fed by
  // live content cards from useContentPlanning (optimistic CRUD + localStorage fallback).
  const { cards, createCard, updateCard, deleteCard } = useContentPlanning();

  const handleCreateCard = (date: Date) => {
    const iso = date.toISOString();
    void createCard({
      title: 'Untitled content',
      date: iso,
      plannedDates: [iso],
      platform: 'generic',
      status: 'draft',
      tags: [],
      customTags: [],
    });
  };

  return (
    <div className="relative w-full h-full bg-[#0B0B0A] flex flex-col">
      <Calendar
        events={cards}
        onCreateCard={handleCreateCard}
        onEventUpdate={(id, patch) => {
          // Cards here are always ContentCard; Calendar types the patch as a ContentCard|CalendarEvent union.
          void updateCard(id, patch as Partial<ContentCard>);
        }}
        onEventDrop={(id, newDate) => {
          const iso = newDate.toISOString();
          void updateCard(id, { plannedDates: [iso], date: iso });
        }}
        onDeleteCard={(id) => {
          void deleteCard(id);
        }}
        onOpenScript={onOpenScript}
      />
    </div>
  );
}
