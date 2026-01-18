"use client";

import React from "react";
import { Coins } from "lucide-react";
import { getCreditCost, CreditCostConfig, CREDIT_COSTS } from "@/lib/config/creditCosts";
import clsx from "clsx";

interface CreditCostBadgeProps {
  /**
   * The service name (e.g., 'thinkforge', 'musitron').
   */
  service: string;
  /**
   * The action within the service (e.g., 'chat_message', 'music_generation').
   */
  action: string;
  /**
   * Optional override for the cost. If not provided, it will be fetched from creditCosts.ts.
   */
  costOverride?: number;
  /**
   * Variant for visual styling.
   * - 'inline': Small, used inside button text.
   * - 'tooltip': Larger badge, used for separate display.
   */
  variant?: "inline" | "tooltip";
  /**
   * Optional model ID for model-specific pricing lookup.
   */
  model?: string;
  /**
   * Custom class name for wrapping div.
   */
  className?: string;
}

/**
 * CreditCostBadge
 *
 * A minimal, reusable component to display the credit cost of any action.
 * Uses the centralized `creditCosts.ts` as the single source of truth.
 */
export function CreditCostBadge({
  service,
  action,
  costOverride,
  variant = "inline",
  model,
  className,
}: CreditCostBadgeProps) {
  const cost = costOverride ?? getCreditCost(service, action, { model });

  if (cost <= 0) {
    return null; // Don't render if no cost
  }

  const isInline = variant === "inline";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-medium text-muted-foreground",
        isInline ? "text-xs" : "text-sm px-2 py-0.5 rounded-md bg-muted/50 border border-border/50",
        className
      )}
    >
      <span>{cost}</span>
      <span className="opacity-70">credit{cost !== 1 ? "s" : ""}</span>
    </span>
  );
}
