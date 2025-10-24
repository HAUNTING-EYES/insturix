"use client";

import { ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function Parallax({
  children,
  strength = 20,
  className,
}: {
  children: ReactNode;
  strength?: number; // px max translateY
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = 1 - Math.min(Math.max(rect.top / vh, 0), 1);
      const translate = (progress - 0.5) * 2 * strength; // -strength..strength
      el.style.setProperty("--parallax-y", `${translate.toFixed(2)}px`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [strength]);

  return (
    <div
      ref={ref}
      className={cn("will-change-transform [transform:translate3d(0,var(--parallax-y,0),0)]", className)}
    >
      {children}
    </div>
  );
}
