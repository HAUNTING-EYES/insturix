/**
 * Turn confirm registry — lets an executor PAUSE on turn.confirm_required
 * until the client answers via POST /api/studio/turns/:turnId/confirm.
 * In-memory per server instance (dev-scale; the rewrite's orchestrator owns
 * durable confirm state).
 */

export interface ConfirmAnswerPayload {
  accepted: boolean;
  adjustment?: string | null;
}

interface PendingConfirm {
  resolve: (answer: ConfirmAnswerPayload) => void;
  createdAt: number;
}

const pending = new Map<string, PendingConfirm>();

const TTL_MS = 10 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [turnId, entry] of pending) {
    if (now - entry.createdAt > TTL_MS) {
      entry.resolve({ accepted: false, adjustment: "expired" });
      pending.delete(turnId);
    }
  }
}

export function awaitConfirm(turnId: string): Promise<ConfirmAnswerPayload> {
  sweep();
  return new Promise((resolve) => {
    pending.set(turnId, { resolve, createdAt: Date.now() });
  });
}

export function resolveConfirm(turnId: string, answer: ConfirmAnswerPayload): boolean {
  const entry = pending.get(turnId);
  if (!entry) return false;
  pending.delete(turnId);
  entry.resolve(answer);
  return true;
}
