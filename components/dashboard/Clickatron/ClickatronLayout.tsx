"use client";

import React from 'react';
import { CanvasIdeaInput } from './CanvasIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';
import { UsageDisplay } from './UsageDisplay';

export function ClickatronLayout() {
  return (
    <div className="space-y-8">
      <UsageDisplay />
      <CanvasIdeaInput />
      <ClickatronHistory />
    </div>
  );
}