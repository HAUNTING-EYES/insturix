import { Play } from "lucide-react";
import React from "react";

// Responsive YouTube embed with premium frame; optimized for use inside the Hero
export default function ThinkForgeVideo() {
  const videoId = "LVen-6KJYO4"; // Provided demo video ID
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;

  return (
    <div className="relative mt-8 sm:mt-10">
      {/* Eyebrow badge */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-medium">
          <Play className="w-4 h-4" />
          Product Demo
        </div>
      </div>

      {/* Premium framed video */}
      <div className="relative max-w-5xl mx-auto">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -inset-6 rounded-[28px] bg-[conic-gradient(from_180deg_at_50%_50%,rgba(244,63,94,0.12),rgba(236,72,153,0.08),rgba(244,63,94,0.12))] blur-2xl" aria-hidden />

        {/* Gradient frame */}
        <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-r from-rose-500/60 via-pink-500/40 to-red-500/60 shadow-[0_20px_60px_-20px_rgba(244,63,94,0.35)]">
          <div className="rounded-2xl bg-white/70 dark:bg-neutral-900/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md border border-white/40 dark:border-white/10">
            <div className="aspect-video w-full overflow-hidden rounded-[14px]">
              <iframe
                className="w-full h-full"
                src={`${embedUrl}?rel=0&modestbranding=1&playsinline=1`}
                title="ThinkForge Demo Video"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
