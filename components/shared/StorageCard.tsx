"use client";

import { cn } from "@/lib/utils";
import { useStorage } from "@/hooks/useStorage";

/**
 * Storage flag for the dashboard: how much of the plan's storage cap is used,
 * plus the "use extra storage" (paid overage) toggle. When off, a full pool
 * overwrites the oldest unused files; when on, uploads over the cap are kept and
 * billed monthly in credits.
 */
export function StorageCard({ className }: { className?: string }) {
  const { storage, isLoading, error, setExtraStorage, isTogglingExtra } = useStorage();

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border border-border/50 bg-card/50 p-4", className)}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-2 w-full rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !storage) {
    return (
      <div className={cn("rounded-lg border border-border/50 bg-card/50 p-4", className)}>
        <p className="text-sm text-muted-foreground">{error || "Storage unavailable"}</p>
      </div>
    );
  }

  const over = storage.overageBytes > 0;
  const barColor =
    storage.percentUsed >= 90 ? "var(--status-danger, #E5484D)"
    : storage.percentUsed >= 70 ? "var(--accent-gold, #D4A652)"
    : "var(--status-success, #46A758)";

  return (
    <div className={cn("rounded-lg border border-border/50 bg-card/80 p-4", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Storage</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {storage.usedFormatted} of {storage.limitFormatted}
        </span>
      </div>

      {/* Usage bar */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${storage.percentUsed}%`, background: barColor }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{storage.remainingFormatted} left</span>
        {over && storage.extraStorageEnabled && (
          <span style={{ color: "var(--accent-gold, #D4A652)" }}>
            {storage.overageFormatted} over · ~{storage.estMonthlyCredits} credits/mo
          </span>
        )}
      </div>

      {/* Extra-storage toggle */}
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={storage.extraStorageEnabled}
          disabled={isTogglingExtra}
          onChange={(e) => setExtraStorage(e.target.checked).catch(() => {})}
        />
        <span className="font-medium">Use extra storage</span>
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {storage.extraStorageEnabled
          ? `Uploads over your ${storage.limitFormatted} cap are kept and charged monthly in credits (~3 credits/GB).`
          : `Off: when full, your oldest unused files are overwritten to stay within ${storage.limitFormatted}. Pinned + in-use files are never deleted.`}
      </p>
    </div>
  );
}
