"use client";

import { VideoIdeaInput } from './VideoIdeaInput';
import { Clickatron2History } from './Clickatron2History';

/**
 * Main layout component for Clickatron2 - handles the Spark stage
 * Similar to Alyzitron's ClientWrapper but focused on thumbnail generation
 */
export function Clickatron2Layout() {
  return (
    <div className="space-y-8">
      {/* Video Idea Input - The "Spark" */}
      <VideoIdeaInput />
      
      {/* History Section */}
      <Clickatron2History />
    </div>
  );
}