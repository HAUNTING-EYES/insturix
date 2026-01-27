"use client";

import React, { useState } from 'react';
import { CanvasIdeaInput } from './CanvasIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';
import { CreditsCard } from '@/components/shared/CreditsCard';
import { BillingPaymentModal } from '@/components/shared/BillingPaymentModal';

export function ClickatronLayout() {
  const [showTopup, setShowTopup] = useState(false);

  return (
    <div className="space-y-8">
      <CreditsCard onTopupClick={() => setShowTopup(true)} />
      <CanvasIdeaInput />
      <ClickatronHistory />
      <BillingPaymentModal 
        isOpen={showTopup} 
        onClose={() => setShowTopup(false)} 
      />
    </div>
  );
}