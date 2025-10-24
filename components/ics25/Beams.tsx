"use client";

import { cn } from "@/lib/utils";
import { memo } from "react";

function Beams({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className
      )}
    >
      {/* Subtle moving gradient beams */}
      <div className="absolute -left-1/3 top-0 h-[140%] w-2/3 rotate-[18deg] bg-gradient-to-b from-[#3A9EFF]/15 via-transparent to-[#FF2EE6]/15 blur-3xl" />
      <div className="absolute -right-1/4 top-[-10%] h-[140%] w-2/3 -rotate-[14deg] bg-gradient-to-b from-[#FF2EE6]/12 via-transparent to-[#3A9EFF]/12 blur-3xl" />

      {/* Fine grain noise overlay for texture */}
      <div className="absolute inset-0 opacity-[0.05] mix-blend-soft-light [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:4px_4px]" />
    </div>
  );
}

export default memo(Beams);
