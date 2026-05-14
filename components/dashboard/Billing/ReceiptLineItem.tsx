"use client";

import { CreditTransaction } from "@/hooks/useCredits";

interface ReceiptLineItemProps {
  transaction: CreditTransaction;
  isLatest: boolean;
  animDelay?: number;
}

const typeLabels: Record<string, string> = {
  usage: "",
  subscription_grant: "Subscription",
  topup: "Top-up",
  refund: "Refund",
  expiry: "Credits Expired",
  adjustment: "Adjustment",
};

function getServiceLabel(txn: CreditTransaction): string {
  if (txn.type === "usage") {
    return txn.service || "Usage";
  }
  return typeLabels[txn.type] || txn.type;
}

function getDescription(txn: CreditTransaction): string {
  const date = new Date(txn.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  let timeAgo: string;
  if (diffMin < 1) timeAgo = "just now";
  else if (diffMin < 60) timeAgo = `${diffMin}m ago`;
  else if (diffHr < 24) timeAgo = `${diffHr}h ago`;
  else {
    timeAgo = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Build description: "Action · timeAgo" or "Type detail · timeAgo"
  if (txn.type === "usage") {
    const actionStr = txn.action || "Usage";
    return `${actionStr} · ${timeAgo}`;
  }
  if (txn.type === "subscription_grant") {
    const planStr = "Pro";
    const monthStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Monthly grant · ${planStr} · ${monthStr}`;
  }
  if (txn.type === "topup") {
    const monthStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Credit purchase · ${monthStr}`;
  }
  return timeAgo;
}

export function ReceiptLineItem({ transaction, isLatest, animDelay = 0 }: ReceiptLineItemProps) {
  const isPositive = transaction.amount > 0;
  const label = getServiceLabel(transaction);
  const description = getDescription(transaction);

  return (
    <>
      <style>{`
        @keyframes receiptTypeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes receiptSlideInLatest {
          0%   { opacity: 0; transform: translateX(40px); background: rgba(212,166,82,0.15); }
          50%  { opacity: 1; transform: translateX(0);    background: rgba(212,166,82,0.12); }
          100% { opacity: 1; transform: translateX(0);    background: transparent; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "6px 0",
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          opacity: 0,
          animation: isLatest
            ? `receiptSlideInLatest 0.6s cubic-bezier(.16,1,.3,1) ${animDelay}ms both`
            : `receiptTypeIn 0.3s cubic-bezier(.16,1,.3,1) ${animDelay}ms both`,
        }}
      >
        {/* Left: service name + description */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600, color: "#ECE9E1" }}>
            {label}
          </span>
          <span style={{ fontSize: 10, color: "#7A776E", marginTop: 1 }}>
            {description}
          </span>
        </div>

        {/* Dotted filler */}
        <div
          style={{
            flex: 1,
            borderBottom: "1px dotted #282724",
            margin: "0 8px",
            alignSelf: "flex-end",
            marginBottom: 4,
          }}
          aria-hidden="true"
        />

        {/* Amount */}
        <span
          style={{
            fontWeight: 700,
            whiteSpace: "nowrap",
            color: isPositive ? "#5EC97E" : "#D46A5C",
          }}
        >
          {isPositive ? "+" : ""}{transaction.amount}
        </span>
      </div>
    </>
  );
}
