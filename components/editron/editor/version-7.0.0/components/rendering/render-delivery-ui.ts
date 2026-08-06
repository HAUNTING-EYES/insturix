import {
  RenderDeliveryManifestSchema,
  type RenderDeliveryManifest,
} from "@/lib/editron/services/render-delivery-manifest";

export interface RenderItem {
  url?: string;
  timestamp: Date;
  id: string;
  status: "success" | "error" | "finalizing";
  error?: string;
  canRetryFinalization?: boolean;
  expiresAt?: Date;
  deliveryManifest?: RenderDeliveryManifest;
}

export function parseRenderHistoryItem(value: unknown): RenderItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = nonEmptyString(record.id);
  const timestamp = parseDate(record.completedAt) ?? parseDate(record.startedAt);
  const status = record.status === "done"
    ? "success"
    : record.status === "error"
      ? "error"
      : record.status === "finalizing"
        ? "finalizing"
        : null;
  if (!id || !timestamp || !status) return null;

  const url = nonEmptyString(record.url);
  if (status === "success" && !url) return null;

  const expiresAt = parseDate(record.expiresAt);
  const manifestResult = RenderDeliveryManifestSchema.safeParse(
    record.deliveryManifest,
  );

  return {
    id,
    timestamp,
    status,
    ...(url ? { url } : {}),
    ...(nonEmptyString(record.error) ? { error: nonEmptyString(record.error)! } : {}),
    ...(status === "error" && record.canRetryFinalization === true
      ? { canRetryFinalization: true }
      : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(manifestResult.success
      ? { deliveryManifest: manifestResult.data }
      : {}),
  };
}

export function formatCueTime(milliseconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const remainder = totalMilliseconds % 1_000;
  const wholeSeconds = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  if (remainder === 0) return wholeSeconds;
  return `${wholeSeconds}.${remainder.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDate(value: unknown): Date | null {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
