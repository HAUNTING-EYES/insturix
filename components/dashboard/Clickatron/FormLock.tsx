import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface FormLockProps {
  timeUntilReset?: { days: number; hours: number; minutes: number } | null;
}

export function FormLock({ timeUntilReset }: FormLockProps) {
  const formatTime = (time: { days: number; hours: number; minutes: number }) => {
    const parts = [];
    if (time.days > 0) parts.push(`${time.days}d`);
    if (time.hours > 0) parts.push(`${time.hours}h`);
    if (time.minutes > 0) parts.push(`${time.minutes}m`);
    return parts.join(' ');
  };

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg p-6 text-center overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at center, rgba(13, 13, 13, 0.7), rgba(13, 13, 13, 0.9) 70%),
                     linear-gradient(90deg, rgba(128, 0, 128, 0.2), rgba(0, 0, 255, 0.2), rgba(128, 0, 128, 0.2))`,
        backgroundSize: '200% 200%, 400% 400%',
        animation: 'animated-gradient 10s ease infinite',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="relative z-20 mb-6">
        <h3 className="text-3xl font-extrabold text-white tracking-tight mb-3">
          Usage Limit Reached
        </h3>
        <p className="text-zinc-200 max-w-md mx-auto">
          You&apos;ve used all your available thumbnail generations for this period.
          {timeUntilReset && (
            <span className="block mt-2 text-sm text-zinc-400">
              Your limits will reset in <strong>{formatTime(timeUntilReset)}</strong>.
            </span>
          )}
        </p>
      </div>
      <div className="relative z-20 flex gap-4 items-center">
        <Button
          asChild
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-transform transform hover:scale-105"
        >
          <Link href="/upgrade">Upgrade Plan</Link>
        </Button>
        <Button
          variant="outline"
          className="bg-transparent border-zinc-400 hover:bg-zinc-700/50 text-zinc-200 font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          <Link href="/resources/faq">Learn More</Link>
        </Button>
      </div>
    </div>
  );
}