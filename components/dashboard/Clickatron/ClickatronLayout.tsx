"use client";

import { VideoIdeaInput } from './VideoIdeaInput';
import { ClickatronHistory } from './ClickatronHistory';

/**
 * Main layout component for Clickatron - handles the Spark stage
 * Similar to Alyzitron's ClientWrapper but focused on thumbnail generation
 */
export function ClickatronLayout() {
  return (
    <div className="space-y-8">
      {/* Video Idea Input - The "Spark" */}
      <VideoIdeaInput />
      
      {/* History Section */}
      <ClickatronHistory />
    </div>
  );
}