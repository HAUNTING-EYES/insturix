"use client";

import { useEffect, useMemo, useState } from "react";

function getTimeRemaining(target: Date) {
  const total = target.getTime() - new Date().getTime();
  const clamp = (n: number) => (n < 0 ? 0 : n);
  const days = clamp(Math.floor(total / (1000 * 60 * 60 * 24)));
  const hours = clamp(Math.floor((total / (1000 * 60 * 60)) % 24));
  const minutes = clamp(Math.floor((total / (1000 * 60)) % 60));
  const seconds = clamp(Math.floor((total / 1000) % 60));
  return { total, days, hours, minutes, seconds };
}

export default function Countdown({
  to,
  className = "",
  label = "Event starts in",
}: {
  to: string | Date;
  className?: string;
  label?: string;
}) {
  const targetDate = useMemo(() => (typeof to === "string" ? new Date(to) : to), [to]);
  const [timeLeft, setTimeLeft] = useState(() => getTimeRemaining(targetDate));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Update immediately on mount to sync with client time
    setTimeLeft(getTimeRemaining(targetDate));
  }, [targetDate]);

  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => setTimeLeft(getTimeRemaining(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate, mounted]);

  // Don't render on server to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`inline-flex items-center gap-4 px-5 py-3 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-white/60 dark:border-white/10 hover:shadow-[0_0_30px_rgba(255,46,230,0.2),0_0_60px_rgba(58,158,255,0.1)] transition-all duration-300 ${className}`}>
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
        <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100 font-semibold">
          <TimeBox value={0} unit="days" />
          <span className="opacity-40">:</span>
          <TimeBox value={0} unit="hrs" />
          <span className="opacity-40">:</span>
          <TimeBox value={0} unit="min" />
          <span className="opacity-40">:</span>
          <TimeBox value={0} unit="sec" />
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-4 px-5 py-3 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-white/60 dark:border-white/10 hover:shadow-[0_0_30px_rgba(255,46,230,0.2),0_0_60px_rgba(58,158,255,0.1)] transition-all duration-300 ${className}`}>
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100 font-semibold">
        <TimeBox value={timeLeft.days} unit="days" />
        <span className="opacity-40">:</span>
        <TimeBox value={timeLeft.hours} unit="hrs" />
        <span className="opacity-40">:</span>
        <TimeBox value={timeLeft.minutes} unit="min" />
        <span className="opacity-40">:</span>
        <TimeBox value={timeLeft.seconds} unit="sec" />
      </div>
    </div>
  );
}

function TimeBox({ value, unit }: { value: number; unit: string }) {
  const v = value.toString().padStart(2, "0");
  return (
    <div className="flex flex-col items-center">
      <div className="min-w-12 text-center px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/10">
        {v}
      </div>
      <div className="text-[10px] mt-1 uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{unit}</div>
    </div>
  );
}
