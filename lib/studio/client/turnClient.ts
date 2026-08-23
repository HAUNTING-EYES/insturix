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
