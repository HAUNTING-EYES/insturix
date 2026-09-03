"use client";

/**
 * Real turn client — POSTs a StudioTurnRequest to /api/studio/turns and
 * yields contract-typed StudioTurnEvents off the SSE body. Same consumption
 * shape as the Phase 1 mock orchestrator, so the session component treats
 * them interchangeably.
 */

import type { StudioTurnEvent, StudioTurnRequest } from "@/lib/studio/contracts/turn";

export async function* runRealTurn(request: StudioTurnRequest, signal?: AbortSignal): AsyncGenerator<StudioTurnEvent> {
  const res = await fetch("/api/studio/turns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `turn failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      /* keep default */
    }
    yield { type: "turn.error", turnId: "t_http", message, retryable: res.status >= 500 || res.status === 429, refundIssued: false };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          yield JSON.parse(line.slice(5).trim()) as StudioTurnEvent;
        } catch {
          /* skip malformed frame */
        }
      }
    }
  }
}

export const studioRealTurnsEnabled = process.env.NEXT_PUBLIC_STUDIO_REAL_TURNS === "1";

export interface StudioWalletBalance {
  main: number;
  media: number;
}

/** /api/user/credits responses come in two shapes (nested balance or flat) —
 *  accept both; anything without a numeric main balance is "unknown", so the
 *  UI hides the number instead of guessing. */
export function parseWalletCredits(body: unknown): StudioWalletBalance | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { balance?: { totalCredits?: unknown; totalMediaCredits?: unknown }; totalCredits?: unknown; totalMediaCredits?: unknown };
  const main = b.balance?.totalCredits ?? b.totalCredits;
  const media = b.balance?.totalMediaCredits ?? b.totalMediaCredits;
  if (typeof main !== "number") return null;
  return { main, media: typeof media === "number" ? media : 0 };
}

/** Real credit balance for headers and quote cards. Returns null on any
 * failure — real mode never falls back to a mock number. */
export async function fetchWalletBalance(): Promise<StudioWalletBalance | null> {
  try {
    const res = await fetch("/api/user/credits?wallet=auto");
    if (!res.ok) return null;
    return parseWalletCredits(await res.json());
  } catch {
    return null;
  }
}

/** The SERVER's real-mode flag — lets the client detect a split between
 *  STUDIO_REAL_TURNS (server) and NEXT_PUBLIC_STUDIO_REAL_TURNS (this
 *  bundle) instead of silently running the wrong mode. */
export async function fetchServerRealMode(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/studio/mode");
    if (!res.ok) return null;
    const data = (await res.json()) as { real?: boolean };
    return typeof data.real === "boolean" ? data.real : null;
  } catch {
    return null;
  }
}
