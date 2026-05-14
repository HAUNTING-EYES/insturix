"use client";

import { cn } from "@/lib/utils";
import { CreditTransaction } from "@/hooks/useCredits";

interface ReceiptLineItemProps {
  transaction: CreditTransaction;
  isLatest: boolean;
}

const typeLabels: Record<string, string> = {
  usage: "",
  subscription_grant: "Monthly Grant",
  topup: "Credit Top-up",
  refund: "Refund",
  expiry: "Credits Expired",
  adjustment: "Adjustment",
  bonus: "Bonus",
};

function getServiceLabel(txn: CreditTransaction): string {
  if (txn.type === "usage") {
    return txn.service
      ? `${txn.service}${txn.action ? ` / ${txn.action}` : ""}`
      : "Usage";
  }
  return typeLabels[txn.type] || txn.type;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceiptLineItem({ transaction, isLatest }: ReceiptLineItemProps) {
  const isPositive = transaction.amount > 0;
  const label = getServiceLabel(transaction);

  return (
    <div
      className={cn(
        "relative grid grid-cols-[1fr_auto] items-baseline gap-1 py-[6px]",
        isLatest && "animate-[latestSlideIn_0.6s_cubic-bezier(.16,1,.3,1)_both]"
      )}
    >
      {/* Top row: service name ... amount */}
      <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
        <span
          className="shrink-0 font-mono text-[13px] text-[#ECE9E1] uppercase truncate"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {label}
        </span>
        {/* Dotted filler */}
        <span
          className="flex-1 border-b border-dotted border-[#282724] translate-y-[-3px] min-w-[12px]"
          aria-hidden="true"
        />
      </div>
      <span
        className={cn(
          "font-mono text-[13px] font-medium tabular-nums shrink-0",
          isPositive ? "text-[#5EC97E]" : "text-[#D46A5C]"
        )}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {isPositive ? "+" : ""}
        {transaction.amount}
      </span>

      {/* Timestamp row */}
      <span
        className="col-span-2 font-mono text-[10px] text-[#7A776E] mt-[-2px]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {formatTimestamp(transaction.timestamp)}
      </span>

      {/* Gold flash on latest */}
      {isLatest && (
        <span
          className="absolute inset-0 pointer-events-none animate-[goldFlash_0.8s_ease-out_both]"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
