"use client";

import React from 'react';
import { VideoIdeaInput } from './VideoIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';

export function ClickatronLayout() {
  return (
    <div className="space-y-8">
      <VideoIdeaInput />
      <ClickatronHistory />
    </div>
  );
}