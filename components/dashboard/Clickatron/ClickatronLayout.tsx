"use client";

import React, { useState } from 'react';
import { CanvasIdeaInput } from './CanvasIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';
import { CreditsCard } from '@/components/shared/CreditsCard';
import { CreditsTopupModal } from '@/components/shared/CreditsTopupModal';

export function ClickatronLayout() {
  const [showTopup, setShowTopup] = useState(false);

  return (
    <div className="space-y-8">
      <CreditsCard onTopupClick={() => setShowTopup(true)} />
      <CanvasIdeaInput />
      <ClickatronHistory />
      <CreditsTopupModal 
        isOpen={showTopup} 
        onClose={() => setShowTopup(false)} 
      />
    </div>
  );
}