"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  DollarSign,
  Percent,
  RefreshCw,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GroupBy = "service" | "provider" | "org" | "user" | "day";

type Tone = "emerald" | "sky" | "violet" | "amber" | "red" | "zinc";

interface ProviderCostMarginGroup {
  key: string;
  service?: string;
  action?: string;
  provider?: string;
  model?: string;
  orgId?: string;
  userId?: string;
  day?: string;
  eventCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  chargedCredits: number;
  revenueUsdEstimate: number;
  providerCostUsd: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  grossMarginUsd: number;
  grossMarginPct: number | null;
  missingPricingEvents: number;
  failedProviderCostUsd: number;
  retryCount: number;
}

interface ProviderCostMarginReport {
  from: string;
  to: string;
  groupBy: GroupBy;
  totals: Omit<ProviderCostMarginGroup, "key">;
  groups: ProviderCostMarginGroup[];
  unknownPricing: ProviderCostMarginGroup[];
  negativeMargin: ProviderCostMarginGroup[];
}

interface ProviderCostMarginResponse {
  ok: boolean;
  report?: ProviderCostMarginReport;
  message?: string;
}

const GROUP_LABELS: Record<GroupBy, string> = {
  service: "Service",
  provider: "Provider",
  org: "Agency",
  user: "User",
  day: "Day",
};

const WINDOW_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "180 days", value: "180" },
] as const;

const TONE_CLASSES: Record<Tone, string> = {
  emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-500",
  violet: "border-violet-500/20 bg-violet-500/10 text-violet-500",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-500",
  red: "border-red-500/20 bg-red-500/10 text-red-500",
  zinc: "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
};

export default function ProviderCostFinancials() {
  const [groupBy, setGroupBy] = useState<GroupBy>("service");
  const [windowDays, setWindowDays] = useState("30");
  const [report, setReport] = useState<ProviderCostMarginReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(windowDays) * 24 * 60 * 60 * 1000);
    return new URLSearchParams({
      groupBy,
      limit: "100",
      from: from.toISOString(),
      to: to.toISOString(),
    }).toString();
  }, [groupBy, windowDays]);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/admin/financials/provider-cost-margin?${query}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ProviderCostMarginResponse;
      if (!response.ok || !data.ok || !data.report) {
        throw new Error(data.message || "Failed to load financials");
      }
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load financials");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const totals = report?.totals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
            <Database className="h-3.5 w-3.5" />
            Provider cost ledger
          </div>
          <h1 className="text-3xl font-bold tracking-normal text-zinc-950 dark:text-zinc-50 md:text-4xl">
            Financials
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Credits charged, provider cost, margin, failed spend, and missing pricing.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GROUP_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => void loadReport()} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={formatUsd(totals?.revenueUsdEstimate)} subValue={`${formatNumber(totals?.chargedCredits)} credits`} tone="emerald" />
        <MetricCard icon={<WalletCards className="h-5 w-5" />} label="Provider Cost" value={formatUsd(totals?.providerCostUsd)} subValue={`${formatUsd(totals?.failedProviderCostUsd)} failed spend`} tone="sky" />
        <MetricCard icon={<Percent className="h-5 w-5" />} label="Gross Margin" value={formatUsd(totals?.grossMarginUsd)} subValue={formatPercent(totals?.grossMarginPct)} tone={(totals?.grossMarginUsd ?? 0) < 0 ? "red" : "violet"} />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Unknown Pricing" value={formatNumber(totals?.missingPricingEvents)} subValue={`${formatNumber(totals?.eventCount)} total events`} tone={(totals?.missingPricingEvents ?? 0) > 0 ? "amber" : "zinc"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <StatusTile icon={<BarChart3 className="h-4 w-4" />} label="Successful events" value={formatNumber(totals?.successCount)} />
        <StatusTile icon={<TrendingDown className="h-4 w-4" />} label="Failed events" value={formatNumber(totals?.failedCount)} />
        <StatusTile icon={<Clock3 className="h-4 w-4" />} label="Retries" value={formatNumber(totals?.retryCount)} />
      </div>

      <div className="mt-8">
        <ReportTable title={`${GROUP_LABELS[groupBy]} margin`} rows={report?.groups ?? []} loading={loading} emptyLabel="No provider cost events found for this window." />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <ReportTable title="Unknown pricing" rows={report?.unknownPricing ?? []} loading={loading} emptyLabel="No missing pricing rows in this window." compact />
        <ReportTable title="Negative margin" rows={report?.negativeMargin ?? []} loading={loading} emptyLabel="No negative margin rows in this window." compact />
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subValue, tone }: { icon: ReactNode; label: string; value: string; subValue: string; tone: Tone }) {
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-normal text-zinc-950 dark:text-zinc-50">{value}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{subValue}</p>
        </div>
        <div className={`rounded-lg border p-2 ${TONE_CLASSES[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

function StatusTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200/70 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{value}</span>
    </div>
  );
}

function ReportTable({ title, rows, loading, emptyLabel, compact = false }: { title: string; rows: ProviderCostMarginGroup[]; loading: boolean; emptyLabel: string; compact?: boolean }) {
  const columnCount = compact ? 6 : 7;
  return (
    <section className="rounded-lg border border-zinc-200/70 bg-white/85 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/75">
      <div className="flex items-center justify-between border-b border-zinc-200/70 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-400">
            <tr>
              <th className="px-5 py-3 font-medium">Segment</th>
              <th className="px-4 py-3 font-medium">Events</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Unknown</th>
              {!compact ? <th className="px-4 py-3 font-medium">Failed spend</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={columnCount} className="px-5 py-10 text-center text-zinc-500">Loading financials...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-5 py-10 text-center text-zinc-500">{emptyLabel}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.key} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                <td className="px-5 py-4">
                  <div className="max-w-[360px]">
                    <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">{segmentTitle(row)}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{segmentSubtitle(row)}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-zinc-700 dark:text-zinc-300">{formatNumber(row.eventCount)}</td>
                <td className="px-4 py-4 text-zinc-700 dark:text-zinc-300">{formatUsd(row.revenueUsdEstimate)}</td>
                <td className="px-4 py-4 text-zinc-700 dark:text-zinc-300">{formatUsd(row.providerCostUsd)}</td>
                <td className="px-4 py-4">
                  <div className={row.grossMarginUsd < 0 ? "text-red-500" : "text-emerald-500"}>
                    <span className="font-semibold">{formatUsd(row.grossMarginUsd)}</span>
                    <span className="ml-2 text-xs">{formatPercent(row.grossMarginPct)}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={row.missingPricingEvents > 0 ? "font-semibold text-amber-500" : "text-zinc-500 dark:text-zinc-400"}>{formatNumber(row.missingPricingEvents)}</span>
                </td>
                {!compact ? <td className="px-4 py-4 text-zinc-700 dark:text-zinc-300">{formatUsd(row.failedProviderCostUsd)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function segmentTitle(row: ProviderCostMarginGroup): string {
  return row.provider || row.service || row.orgId || row.userId || row.day || row.key || "Unknown";
}

function segmentSubtitle(row: ProviderCostMarginGroup): string {
  return [row.service, row.action, row.model, row.orgId, row.userId, row.day].filter(Boolean).join(" / ") || row.key;
}

function formatUsd(value?: number | null): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value ?? 0);
}

function formatNumber(value?: number | null): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatPercent(value?: number | null): string {
  if (value === null || value === undefined) return "n/a";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}