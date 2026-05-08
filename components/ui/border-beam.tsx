"use client";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  borderWidth?: number;
  anchor?: number; // Kept for prop compatibility, not used in conic
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
}

export const BorderBeam = ({
  className,
  size = 250,
  duration = 12,
  borderWidth = 1.5,
  colorFrom = "#D4A652",
  colorTo = "#D4A652",
  delay = 0,
}: BorderBeamProps) => {
  return (
    <div
      style={
        {
          "--duration": duration,
          "--border-width": borderWidth,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--delay": delay,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]",
        // This mask forces the gradient to only appear within the border width
        "![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(white,white)]",
        className
      )}
    >
      <div
        className="absolute left-1/2 top-1/2 aspect-square w-[300%] -translate-x-1/2 -translate-y-1/2 animate-border-beam-spin"
        style={{
          animationDelay: `calc(var(--delay) * -1s)`,
          // Map size to the gradient spread. Higher size = lower transparency start = longer beam.
          background: `conic-gradient(from 0deg at 50% 50%, transparent ${Math.max(0, 100 - (size / 5)) }%, var(--color-from) 80%, var(--color-to) 100%)`,
        }}
      />
    </div>
  );
};