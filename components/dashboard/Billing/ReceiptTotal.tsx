"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CreditsBalance } from "@/hooks/useCredits";

interface ReceiptTotalProps {
  balance: CreditsBalance;
}

/** Animate a number from 0 to target using requestAnimationFrame */
function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

function formatExpiry(dateStr: string | null): { text: string; isUrgent: boolean } {
  if (!dateStr) return { text: "N/A", isUrgent: false };
  const date = new Date(dateStr);
  const now = new Date();
  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return { text: "EXPIRED", isUrgent: true };
  if (daysLeft === 1) return { text: "1 DAY LEFT", isUrgent: true };
  if (daysLeft <= 7) return { text: `${daysLeft} DAYS LEFT`, isUrgent: true };
  return { text: `${daysLeft} DAYS LEFT`, isUrgent: false };
}

/** Render each digit as an individual span for the roll-up animation */
function AnimatedDigits({ value }: { value: number }) {
  const digits = String(value).split("");

  return (
    <span className="inline-flex" aria-label={String(value)}>
      {digits.map((digit, i) => (
        <span
          key={`${i}-${digit}`}
          className="inline-block animate-[counterRoll_0.4s_cubic-bezier(.16,1,.3,1)_both]"
          style={{
            animationDelay: `${i * 60}ms`,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {digit}
        </span>
      ))}
    </span>
  );
}

export function ReceiptTotal({ balance }: ReceiptTotalProps) {
  const total = balance.totalCredits;
  const animatedTotal = useCountUp(total, 1400);
  const expiry = formatExpiry(balance.subscriptionCreditsExpiry);

  return (
    <div
      className="space-y-0"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {/* Double dashed divider */}
      <div className="border-t border-dashed border-[#282724] mt-2" />
      <div className="border-t border-dashed border-[#282724] mt-[2px] mb-3" />

      {/* SUBSCRIPTION line */}
      <div className="flex justify-between items-baseline py-1">
        <span className="text-[11px] text-[#7A776E] uppercase tracking-wider">
          SUBSCRIPTION
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-[#ECE9E1] tabular-nums">
            {balance.subscriptionCredits}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider",
              expiry.isUrgent
                ? "animate-[expiryPulse_2s_ease-in-out_infinite]"
                : "text-[#7A776E]"
            )}
          >
            {expiry.text}
          </span>
        </div>
      </div>

      {/* TOP-UP line */}
      <div className="flex justify-between items-baseline py-1">
        <span className="text-[11px] text-[#7A776E] uppercase tracking-wider">
          TOP-UP
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-[#ECE9E1] tabular-nums">
            {balance.topupCredits}
          </span>
          <span className="text-[10px] text-[#5EC97E] uppercase tracking-wider">
            PERMANENT
          </span>
        </div>
      </div>

      {/* Thick divider */}
      <div className="border-t-2 border-[#282724] my-2" />

      {/* TOTAL line */}
      <div className="flex justify-between items-center py-2">
        <span className="text-[13px] text-[#ECE9E1] font-bold uppercase tracking-wider">
          TOTAL
        </span>
        <span
          className="text-[28px] font-bold text-[#ECE9E1] tabular-nums animate-[balanceGlow_3s_ease-in-out_infinite]"
        >
          <AnimatedDigits value={animatedTotal} />
        </span>
      </div>
    </div>
  );
}
