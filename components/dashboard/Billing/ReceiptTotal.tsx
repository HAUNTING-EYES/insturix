"use client";

import { useEffect, useRef, useState } from "react";
import { CreditsBalance } from "@/hooks/useCredits";

interface ReceiptTotalProps {
  balance: CreditsBalance;
}

/** Animate a number from 0 to target using requestAnimationFrame */
function useCountUp(target: number, duration = 1200, delay = 0): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}

function formatExpiry(dateStr: string | null): { text: string; daysLeft: number } {
  if (!dateStr) return { text: "no expiry", daysLeft: -1 };
  const date = new Date(dateStr);
  const now = new Date();
  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return { text: "expired", daysLeft: 0 };
  return { text: `expires in ${daysLeft} days`, daysLeft };
}

export function ReceiptTotal({ balance }: ReceiptTotalProps) {
  const animSub = useCountUp(balance.subscriptionCredits, 1200, 1400);
  const animTop = useCountUp(balance.topupCredits, 1200, 1500);
  const animTotal = useCountUp(balance.totalCredits, 1500, 1600);
  const expiry = formatExpiry(balance.subscriptionCreditsExpiry);

  // AI media is a SEPARATE pay-as-you-go wallet (image/video/audio generation).
  // Always surfaced so users can see it and recharge — even at zero balance.
  const animMediaSub = useCountUp(balance.mediaCredits, 1200, 1700);
  const animMediaTop = useCountUp(balance.mediaTopupCredits, 1200, 1800);
  const animMediaTotal = useCountUp(balance.totalMediaCredits, 1500, 1900);
  const mediaExpiry = formatExpiry(balance.mediaCreditsExpiry);

  return (
    <>
      <style>{`
        @keyframes balanceGlow {
          0%, 100% { text-shadow: 0 0 0 transparent; }
          50%      { text-shadow: 0 0 20px rgba(212,166,82,0.15); }
        }
        @keyframes expiryColorPulse {
          0%, 100% { color: #D4A652; }
          50%      { color: #7A776E; }
        }
      `}</style>
      <div
        style={{
          padding: "16px 0",
          borderTop: "2px dashed #282724",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {/* SUBSCRIPTION CREDITS row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
            fontSize: 12,
            color: "#7A776E",
          }}
        >
          <span>SUBSCRIPTION CREDITS</span>
          <span style={{ fontWeight: 700 }}>{animSub}</span>
        </div>

        {/* Expiry sub-row (indented) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
            fontSize: 12,
            color: "#7A776E",
          }}
        >
          <span
            style={{
              paddingLeft: 8,
              animation: expiry.daysLeft >= 0 && expiry.daysLeft <= 30
                ? "expiryColorPulse 2s ease-in-out infinite"
                : undefined,
              color: expiry.daysLeft >= 0 && expiry.daysLeft <= 30 ? undefined : "#7A776E",
            }}
          >
            {expiry.text}
          </span>
          <span style={{ color: "#7A776E", fontWeight: 400, fontSize: 10 }}>
            monthly
          </span>
        </div>

        {/* TOP-UP CREDITS row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
            fontSize: 12,
            color: "#7A776E",
            marginTop: 4,
          }}
        >
          <span>TOP-UP CREDITS</span>
          <span style={{ fontWeight: 700 }}>{animTop}</span>
        </div>

        {/* No expiry sub-row (indented) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
            fontSize: 12,
            color: "#7A776E",
          }}
        >
          <span style={{ paddingLeft: 8 }}>no expiry</span>
          <span style={{ color: "#7A776E", fontWeight: 400, fontSize: 10 }}>
            permanent
          </span>
        </div>

        {/* Thin solid divider */}
        <div style={{ borderTop: "1px solid #282724", marginTop: 8 }} />

        {/* CREDIT BALANCE main row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0 4px",
            fontSize: 18,
            fontWeight: 700,
            color: "#D4A652",
          }}
        >
          <span>CREDIT BALANCE</span>
          <span
            style={{
              fontSize: 22,
              animation: "balanceGlow 3s ease-in-out infinite",
            }}
          >
            {animTotal}
          </span>
        </div>

        {/* ── AI MEDIA WALLET — separate pay-as-you-go pool (image/video/audio) ── */}
        <div style={{ borderTop: "2px dashed #282724", marginTop: 12, paddingTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "4px 0",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#D4A652",
            }}
          >
            <span>AI Media Wallet</span>
            <span style={{ fontSize: 9, color: "#7A776E", fontWeight: 400, letterSpacing: 1 }}>
              image &middot; video &middot; audio
            </span>
          </div>

          {/* Monthly allowance (subscription sample) */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#7A776E", marginTop: 4 }}>
            <span>MONTHLY ALLOWANCE</span>
            <span style={{ fontWeight: 700 }}>{animMediaSub}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#7A776E" }}>
            <span
              style={{
                paddingLeft: 8,
                animation: mediaExpiry.daysLeft >= 0 && mediaExpiry.daysLeft <= 30
                  ? "expiryColorPulse 2s ease-in-out infinite"
                  : undefined,
                color: mediaExpiry.daysLeft >= 0 && mediaExpiry.daysLeft <= 30 ? undefined : "#7A776E",
              }}
            >
              {mediaExpiry.text}
            </span>
            <span style={{ color: "#7A776E", fontWeight: 400, fontSize: 10 }}>monthly</span>
          </div>

          {/* Recharge (pay-as-you-go top-up) */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#7A776E", marginTop: 4 }}>
            <span>RECHARGE</span>
            <span style={{ fontWeight: 700 }}>{animMediaTop}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#7A776E" }}>
            <span style={{ paddingLeft: 8 }}>no expiry</span>
            <span style={{ color: "#7A776E", fontWeight: 400, fontSize: 10 }}>permanent</span>
          </div>

          <div style={{ borderTop: "1px solid #282724", marginTop: 8 }} />

          {/* Media balance total */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0 4px",
              fontSize: 15,
              fontWeight: 700,
              color: "#D4A652",
            }}
          >
            <span>MEDIA BALANCE</span>
            <span style={{ fontSize: 18 }}>{animMediaTotal}</span>
          </div>
        </div>
      </div>
    </>
  );
}
