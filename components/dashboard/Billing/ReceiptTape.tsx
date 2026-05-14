"use client";

import { CreditTransaction, CreditsBalance } from "@/hooks/useCredits";
import { ReceiptLineItem } from "./ReceiptLineItem";
import { ReceiptTotal } from "./ReceiptTotal";

interface CurrentPlanInfo {
  name: string;
  price: number;
  credits?: number;
}

interface ReceiptTapeProps {
  plan: CurrentPlanInfo | null;
  balance: CreditsBalance;
  transactions: CreditTransaction[];
  onTopup: () => void;
  accountId?: string;
}

/* ── Zigzag SVG for top/bottom tear ── */
function ZigzagTear({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className="w-full block"
      style={{
        height: 12,
        filter: "drop-shadow(0 0 6px rgba(212,166,82,0.15))",
        transform: flip ? "scaleY(-1)" : undefined,
      }}
      viewBox="0 0 640 12"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Fill matching receipt bg */}
      <path
        d={generateZigzagPath(640, 12, 16)}
        fill="#131312"
      />
      {/* Gold outline stroke */}
      <path
        d={generateZigzagPath(640, 12, 16)}
        fill="none"
        stroke="rgba(212,166,82,0.35)"
        strokeWidth="1"
      />
    </svg>
  );
}

/** Generate a zigzag path with triangles of given size */
function generateZigzagPath(width: number, height: number, toothWidth: number): string {
  const teeth = Math.ceil(width / toothWidth);
  let d = `M0,${height}`;
  for (let i = 0; i < teeth; i++) {
    const x1 = i * toothWidth + toothWidth / 2;
    const x2 = (i + 1) * toothWidth;
    d += ` L${Math.min(x1, width)},0`;
    d += ` L${Math.min(x2, width)},${height}`;
  }
  d += ` L${width},${height} Z`;
  return d;
}

/* ── Barcode SVG ── */
function Barcode() {
  // Deterministic pseudo-random barcode bars
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  const seed = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 1, 3, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1];
  for (let i = 0; i < seed.length; i++) {
    const w = seed[i];
    if (i % 2 === 0) {
      bars.push({ x, w });
    }
    x += w;
  }
  const totalWidth = x;

  return (
    <div className="relative mx-auto w-[200px] h-[40px] my-4 overflow-hidden">
      <svg
        viewBox={`0 0 ${totalWidth} 40`}
        className="w-full h-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={0}
            width={bar.w}
            height={40}
            fill="#ECE9E1"
            opacity={0.6}
          />
        ))}
      </svg>
      {/* Shimmer overlay */}
      <div className="absolute inset-0 animate-[barcodeShimmer_4s_ease-in-out_infinite] pointer-events-none" />
    </div>
  );
}

/* ── Dashed Separator ── */
function DashedSep() {
  return <div className="border-t border-dashed border-[#282724] my-3" />;
}

/* ── Main Receipt Component ── */
export function ReceiptTape({
  plan,
  balance,
  transactions,
  onTopup,
  accountId,
}: ReceiptTapeProps) {
  const planName = plan?.name && plan.name.toLowerCase() !== "free"
    ? plan.name
    : "Free";
  const planPrice = plan?.price ?? 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="w-full max-w-[640px] mx-auto px-6 py-12">
      {/* Plan badge */}
      <div className="flex justify-center mb-6">
        <span
          className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.15em]"
          style={{
            background: "linear-gradient(135deg, #D4A652, #C49840)",
            color: "#0B0B0A",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {planName} Plan
        </span>
      </div>

      {/* Receipt wrapper with print-reveal animation */}
      <div className="relative" style={{ animation: "receiptPrint 2.5s ease both" }}>
        {/* Top zigzag tear */}
        <ZigzagTear />

        {/* Receipt body */}
        <div
          className="bg-[#131312] relative overflow-hidden"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {/* Scanline overlay for thermal paper texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(236,233,225,0.15) 1px, rgba(236,233,225,0.15) 2px)",
            }}
            aria-hidden="true"
          />

          <div className="relative px-6 py-6">
            {/* Receipt header */}
            <div className="text-center space-y-2 mb-1">
              <h2
                className="text-[22px] font-bold tracking-[0.2em] uppercase"
                style={{ color: "#D4A652" }}
              >
                INSTURIX
              </h2>
              <div className="inline-block px-3 py-0.5 rounded bg-[rgba(212,166,82,0.08)] border border-[rgba(212,166,82,0.16)]">
                <span className="text-[10px] text-[#D4A652] uppercase tracking-[0.12em] font-medium">
                  {planName}
                </span>
              </div>
              <div className="text-[10px] text-[#7A776E] space-y-0.5">
                {planPrice > 0 && (
                  <p>${planPrice}/mo &middot; {plan?.credits ?? "---"} credits/mo</p>
                )}
                {accountId && <p>ACCT: {accountId.slice(0, 8).toUpperCase()}</p>}
                <p>{dateStr}</p>
              </div>
            </div>

            <DashedSep />

            {/* RECENT ACTIVITY section */}
            <div className="mb-1">
              <p className="text-[10px] text-[#7A776E] uppercase tracking-[0.15em] font-medium mb-2">
                RECENT ACTIVITY
              </p>

              {transactions.length === 0 ? (
                <p className="text-[11px] text-[#5F5E5A] text-center py-4">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-0">
                  {transactions.map((txn, i) => (
                    <ReceiptLineItem
                      key={txn.id}
                      transaction={txn}
                      isLatest={i === 0}
                    />
                  ))}
                </div>
              )}
            </div>

            <DashedSep />

            {/* Balance totals */}
            <ReceiptTotal balance={balance} />

            {/* Barcode */}
            <Barcode />

            {/* Footer */}
            <p className="text-center text-[10px] text-[#5F5E5A] tracking-[0.08em]">
              Powered by Razorpay
            </p>
          </div>
        </div>

        {/* Bottom zigzag tear */}
        <ZigzagTear flip />
      </div>

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-3 mt-8">
        <button
          onClick={onTopup}
          className="px-8 py-3 rounded-lg text-[12px] font-bold uppercase tracking-[0.12em] transition-all duration-300"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            background: "#D4A652",
            color: "#0B0B0A",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
        >
          Add Credits
        </button>
        <a
          href="/upgrade"
          className="text-[11px] uppercase tracking-[0.1em] transition-colors duration-200"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "#7A776E",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#D4A652"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#7A776E"; }}
        >
          ↑ Upgrade Plan
        </a>
      </div>
    </div>
  );
}
