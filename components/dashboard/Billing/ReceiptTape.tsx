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

/* ── Barcode: varying-height bars with shimmer ── */
function Barcode() {
  const pattern = [3,1,2,1,3,2,1,3,1,2,3,1,1,2,3,1,2,1,3,2,1,1,3,2,1,3,1,2,1,3,2,1,1,2,3,1,2,3,1,2];
  // Pre-compute heights deterministically (18 + pseudo-random * 18)
  const heights = pattern.map((_, i) => 18 + ((i * 7 + 13) % 18));

  return (
    <>
      <style>{`
        @keyframes barcodeShimmer {
          0%   { left: -50%; }
          40%  { left: 120%; }
          100% { left: 120%; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          marginBottom: 10,
          height: 36,
          alignItems: "flex-end",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {pattern.map((w, i) => (
          <div
            key={i}
            style={{
              width: w,
              height: heights[i],
              background: "#ECE9E1",
              borderRadius: 1,
            }}
          />
        ))}
        {/* Shimmer overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "-50%",
            width: "30%",
            background:
              "linear-gradient(105deg, transparent 0%, transparent 35%, rgba(212,166,82,0.25) 50%, transparent 65%, transparent 100%)",
            animation: "barcodeShimmer 4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      </div>
    </>
  );
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
    ? plan.name.toUpperCase()
    : "FREE";
  const planPrice = plan?.price ?? 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const acctDisplay = accountId
    ? `#${accountId.slice(0, 8).toUpperCase()}`
    : "#INS-0000";

  /* Zigzag SVG data URI (matching mockup: 12px triangles, gold stroke) */
  const zigzagTop =
    "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0 L6 12 L12 0' fill='%23131312' stroke='%23D4A652' stroke-width='0.5' stroke-opacity='0.35'/%3E%3C/svg%3E\")";
  const zigzagBottom =
    "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 12 L6 0 L12 12' fill='%23131312' stroke='%23D4A652' stroke-width='0.5' stroke-opacity='0.35'/%3E%3C/svg%3E\")";

  return (
    <>
      <style>{`
        @keyframes receiptPrint {
          0%   { clip-path: inset(0 0 100% 0); }
          100% { clip-path: inset(0 0 0% 0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(212,166,82,0.4); }
          50%      { opacity: 0.7; box-shadow: 0 0 0 6px rgba(212,166,82,0); }
        }
        @keyframes btnBorderGlow {
          0%, 100% { border-color: #282724; box-shadow: 0 0 0 transparent; }
          50%      { border-color: rgba(212,166,82,0.4); box-shadow: 0 0 20px rgba(212,166,82,0.08); }
        }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
        {/* ── Header: "Credit Receipt" + plan badge ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: -0.5,
              color: "#ECE9E1",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              margin: 0,
            }}
          >
            Credit <span style={{ color: "#D4A652" }}>Receipt</span>
          </h1>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "linear-gradient(135deg, rgba(212,166,82,0.15), rgba(212,166,82,0.05))",
              border: "1px solid rgba(212,166,82,0.3)",
              borderRadius: 100,
              padding: "8px 20px",
              fontWeight: 700,
              fontSize: 13,
              color: "#D4A652",
              letterSpacing: 1.5,
              textTransform: "uppercase" as const,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                background: "#D4A652",
                borderRadius: "50%",
                animation: "pulseDot 2s ease infinite",
              }}
            />
            {planName}
          </div>
        </div>

        {/* ── Receipt wrapper with print animation ── */}
        <div
          style={{
            position: "relative",
            marginBottom: 32,
            clipPath: "inset(0 0 100% 0)",
            animation: "receiptPrint 2.5s cubic-bezier(.16,1,.3,1) 0.3s forwards",
          }}
        >
          {/* Top tear edge */}
          <div style={{ height: 12, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 12,
                background: `${zigzagTop} repeat-x`,
                backgroundSize: "12px 12px",
                filter: "drop-shadow(0 1px 6px rgba(212,166,82,.12))",
              }}
            />
          </div>

          {/* ── Receipt body ── */}
          <div
            style={{
              background: "#131312",
              color: "#ECE9E1",
              fontFamily: "'JetBrains Mono', monospace",
              padding: "0 32px",
              position: "relative",
              overflow: "hidden",
              borderLeft: "1px solid #1C1B19",
              borderRight: "1px solid #1C1B19",
            }}
          >
            {/* Scanline texture overlay */}
            <div
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                background:
                  "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.012) 1px, rgba(255,255,255,0.012) 2px)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            {/* Side highlight for depth */}
            <div
              style={{
                position: "absolute",
                top: 0, bottom: 0,
                left: 0, width: 8,
                background: "linear-gradient(90deg, rgba(255,255,255,0.02), transparent)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />

            {/* ── Receipt header (inside receipt body) ── */}
            <div
              style={{
                textAlign: "center",
                padding: "24px 0 20px",
                borderBottom: "2px dashed #282724",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 3,
                  textTransform: "uppercase" as const,
                  color: "#D4A652",
                  marginBottom: 4,
                }}
              >
                INSTURIX
              </div>
              <div
                style={{
                  display: "inline-block",
                  background: "#D4A652",
                  color: "#0B0B0A",
                  padding: "3px 14px",
                  borderRadius: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                {planName} PLAN
              </div>
              <div style={{ fontSize: 10, color: "#7A776E", lineHeight: 1.6 }}>
                Creative Production Platform<br />
                {planPrice > 0 ? (
                  <>
                    ${planPrice}.00/mo &middot; {plan?.credits ?? "---"} credits/month<br />
                  </>
                ) : (
                  <>
                    Free tier<br />
                  </>
                )}
                Account {acctDisplay} &middot; {dateStr}
              </div>
            </div>

            {/* ── Recent Activity section ── */}
            <div style={{ padding: "16px 0", borderBottom: "1px dashed #282724" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: 2,
                  color: "#D4A652",
                  marginBottom: 12,
                }}
              >
                Recent Activity
              </div>

              {transactions.length === 0 ? (
                <p style={{ fontSize: 11, color: "#5F5E5A", textAlign: "center", padding: "16px 0" }}>
                  No transactions yet
                </p>
              ) : (
                transactions.map((txn, i) => (
                  <ReceiptLineItem
                    key={txn.id}
                    transaction={txn}
                    isLatest={i === 0}
                    animDelay={i === 0 ? 400 : 400 + (i * 200)}
                  />
                ))
              )}
            </div>

            {/* ── Totals section ── */}
            <ReceiptTotal balance={balance} />

            {/* ── Footer inside receipt ── */}
            <div
              style={{
                textAlign: "center",
                padding: "16px 0 28px",
                borderTop: "1px dashed #282724",
              }}
            >
              <Barcode />
              <div style={{ fontSize: 10, color: "#7A776E", lineHeight: 1.5 }}>
                <strong style={{ color: "#ECE9E1" }}>
                  Thank you for creating with Insturix
                </strong>
                <br />
                Powered by Razorpay &middot; Secure Payments
                <br />
                insturix.com/billing
              </div>
            </div>
          </div>

          {/* Bottom tear edge */}
          <div style={{ height: 12, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 12,
                background: `${zigzagBottom} repeat-x`,
                backgroundSize: "12px 12px",
                filter: "drop-shadow(0 -1px 6px rgba(212,166,82,.12))",
              }}
            />
          </div>

          {/* Receipt shadow with gold glow */}
          <div
            style={{
              height: 40,
              boxShadow: "0 0 60px rgba(212,166,82,.06), 0 20px 40px rgba(0,0,0,.4)",
              margin: "10px 20px 0",
            }}
          />
        </div>

        {/* ── Action buttons ── */}
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Add Credits — primary CTA */}
          <button
            onClick={onTopup}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 7,
              border: "none",
              background: "#D4A652",
              color: "#0B0B0A",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#C49840";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(212,166,82,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#D4A652";
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            Add Credits
          </button>

          {/* Upgrade Plan — secondary */}
          <button
            onClick={() => { window.location.href = "/upgrade"; }}
            style={{
              width: "100%",
              padding: "12px 24px",
              borderRadius: 7,
              border: "1px solid #1C1B19",
              background: "transparent",
              color: "#7A776E",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#D4A652";
              e.currentTarget.style.color = "#D4A652";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#1C1B19";
              e.currentTarget.style.color = "#7A776E";
              e.currentTarget.style.transform = "";
            }}
          >
            Upgrade Plan
          </button>
        </div>
      </div>
    </>
  );
}
