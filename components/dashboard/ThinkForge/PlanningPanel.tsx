'use client';

import React from 'react';
import PlanningPlaceholder from './PlanningPlaceholder';

type PlanningPanelProps = {
  isOpen: boolean; // Keep for API compatibility but unused in new mode
  onClose: () => void;
  onOpenScript?: (sessionId: string) => void;
  onCreateCardFromIdea?: (idea: any, date: Date) => void;
};

export default function PlanningPanel({ 
  isOpen: _isOpen, 
  onClose: _onClose,
  onOpenScript: _onOpenScript,
  onCreateCardFromIdea: _onCreateCardFromIdea
}: PlanningPanelProps) {
  return (
    <div className="relative w-full h-full bg-neutral-950 flex flex-col">
      <PlanningPlaceholder />
    </div>
  );
}
