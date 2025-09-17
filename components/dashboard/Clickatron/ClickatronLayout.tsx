"use client";

import React from 'react';
import { CanvasIdeaInput } from './CanvasIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';

export function ClickatronLayout() {
  return (
    <div className="space-y-8">
      <CanvasIdeaInput />
      <ClickatronHistory />
    </div>
  );
}