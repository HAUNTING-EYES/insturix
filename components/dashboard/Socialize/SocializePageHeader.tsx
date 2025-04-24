"use client";

import { Share2 } from "lucide-react";

export function SocializePageHeader() {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
        <Share2 className="h-8 w-8 text-teal-500" />
        Socialize
      </h1>
      <p className="mt-3 text-lg text-zinc-400 font-light">
        Connect your audience to all your content with one simple link
      </p>
    </div>
  );
}