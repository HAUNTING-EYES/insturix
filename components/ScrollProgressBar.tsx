"use client";

import { useEffect, useState } from "react";

export default function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.body.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setProgress(Math.max(0, Math.min(100, pct)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="scroll-progress fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent">
      <div
        className="h-full origin-left rounded-r-full"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, #3A9EFF, #FF2EE6)",
          boxShadow: "0 0 18px rgba(58,158,255,0.45)",
          transition: "width 120ms ease-out",
        }}
      />
    </div>
  );
}
