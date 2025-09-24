"use client";

import { ImageIcon } from 'lucide-react';
import { LimitDisplay } from './LimitDisplay';

export function UsageDisplay() {
  return (
    <div className="mt-4 text-xs text-zinc-400">
      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-300 mb-4">
        <ImageIcon className="h-3.5 w-3.5 text-purple-400" />
        Clickatron - Creative Lab
      </div>
      <p className="text-zinc-40 text-sm sm:text-base max-w-2xl">
        Transform ideas into stunning visuals. Describe what you want to create.
      </p>

      <div className="mt-4">
        <LimitDisplay compact />
      </div>
    </div>
  );
}