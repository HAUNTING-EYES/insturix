/**
 * Phase 1 mock orchestrator — an async generator that emits contract-typed
 * StudioTurnEvents with realistic pacing, proving the whole turn protocol
 * (plan → steps → receipts → typed outcomes → confirm gates) client-side.
 * Phase 2 replaces this with POST /api/studio/turns over SSE; the session
 * component consumes the same event stream either way.
 */

import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let turnSeq = 100;
const nextTurnId = () => `t${turnSeq++}`;

export type ConfirmAnswer = { accepted: boolean; adjustment?: string | null };

/** A pending confirm the UI must answer before the turn resumes. */
export interface MockTurnHandle {
  turnId: string;
  /** resolves when the user answers a turn.confirm_required card */
  answer: (a: ConfirmAnswer) => void;
  /** cooperative cancel */
  interrupt: () => void;
}

export function createMockTurnHandle(turnId: string): MockTurnHandle {
  const handle: MockTurnHandle = {
    turnId,
    answer: () => {},
    interrupt: () => {},
  };
  return handle;
}

function deferredAnswer(): { promise: Promise<ConfirmAnswer>; resolve: (a: ConfirmAnswer) => void } {
  let resolve!: (a: ConfirmAnswer) => void;
  const promise = new Promise<ConfirmAnswer>((r) => (resolve = r));
  return { promise, resolve };
}

interface MockTurnResult {
  events: AsyncGenerator<StudioTurnEvent>;
  handle: MockTurnHandle;
}

/**
 * Intent routing is deliberately dumb here — the real orchestrator plans
 * against domain manifests. The mock proves the PROTOCOL and the UI states.
 */
export function runMockTurn(text: string): MockTurnResult {
  const turnId = nextTurnId();
  const handle = createMockTurnHandle(turnId);
  const lower = text.toLowerCase();

  async function* script(): AsyncGenerator<StudioTurnEvent> {
    yield { type: "turn.received", turnId, deliverableId: "del_summer" };

    /* intent: user asks to SEE an artifact → stage follows, no mutation */
    if (lower.includes("show") || lower.includes("thumbnail")) {
      yield {
        type: "turn.plan",
        turnId,
        planId: `${turnId}_p`,
        summary: "Pulling the thumbnail forward.",
        steps: [
          { stepId: "v1", capability: "design", toolName: "get_canvas_view", label: "Read the canvas", riskLevel: "read" },
        ],
      };
      yield { type: "step.start", turnId, stepId: "v1", toolName: "get_canvas_view" };
      await sleep(900);
      yield {
        type: "step.done",
        turnId,
        stepId: "v1",
        receipt: { label: "Read canvas", detail: "6 variations · 3 done", artifactIds: ["art_thumb"], creditsConsumed: 0 },
      };
      yield {
        type: "turn.done",
        turnId,
        summary: "Here's the thumbnail — 3 of 6 variations done, generating the rest.",
        creditsConsumedTotal: 0,
        artifactIds: ["art_thumb"],
        stageFocus: { artifactId: "art_thumb", why: "you asked for it" },
      };
      return;
    }

    /* intent: confirm the thumbnail refresh → SPEND gate, then work */
    if (lower.includes("yes") || lower.includes("match") || lower.includes("regenerat")) {
      yield {
        type: "turn.plan",
        turnId,
        planId: `${turnId}_p`,
        summary: "Matching the thumbnail to the new hook.",
        steps: [
          { stepId: "g1", capability: "design", toolName: "generation-prompt-compiler", label: "Recompile the prompt", riskLevel: "low", quotedCost: 0 },
          { stepId: "g2", capability: "design", toolName: "create-image-job", label: "Regenerate 6 variations", riskLevel: "medium", quotedCost: 12 },
        ],
      };
      yield { type: "step.start", turnId, stepId: "g1", toolName: "generation-prompt-compiler", loadingMessage: "reading the new hook…" };
      await sleep(1100);
      yield { type: "step.done", turnId, stepId: "g1", receipt: { label: "Compiled prompt", detail: "hook line baked in", artifactIds: [], creditsConsumed: 0 } };

      // spend gate — pause until answered
      const { promise, resolve } = deferredAnswer();
      handle.answer = (a) => resolve(a);
      yield {
        type: "turn.confirm_required",
        turnId,
        stepId: "g2",
        kind: "spend",
        quote: JSON.stringify({
          quoteId: `q_${turnId}`,
          turnId,
          stepId: "g2",
          lines: [
            { service: "clickatron", action: "variation", pool: "media", unitCost: 1, quantity: 6, multiplier: 2, subtotal: 12, display: "6 variations · nano-banana-pro" },
          ],
          totalByPool: { main: 0, media: 12 },
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        }),
        publishTargets: [],
      };
      const answer = await promise;
      if (!answer.accepted) {
        yield { type: "turn.done", turnId, summary: "Left the thumbnail as-is.", creditsConsumedTotal: 0, artifactIds: [] };
        return;
      }

      yield { type: "step.start", turnId, stepId: "g2", toolName: "create-image-job", loadingMessage: "composing frames…" };
      await sleep(900);
      yield { type: "step.progress", turnId, stepId: "g2", stage: "stage 2/4 · variations", percent: null };
      await sleep(1400);
      yield { type: "step.progress", turnId, stepId: "g2", stage: "stage 4/4 · variations", percent: null };
      await sleep(1000);
      yield {
        type: "step.done",
        turnId,
        stepId: "g2",
        receipt: { label: "Created image job", detail: "6 variations · matched to hook", artifactIds: ["art_thumb"], creditsConsumed: 12 },
      };
      yield {
        type: "turn.done",
        turnId,
        summary: "Thumbnail regenerated to match the new hook — showing it.",
        creditsConsumedTotal: 12,
        artifactIds: ["art_thumb"],
        stageFocus: { artifactId: "art_thumb", why: "regenerated · just now" },
      };
      return;
    }

    /* intent: schedule/publish → PUBLISH hard gate */
    if (lower.includes("schedul") || lower.includes("publish") || lower.includes("post")) {
      yield {
        type: "turn.plan",
        turnId,
        planId: `${turnId}_p`,
        summary: "Locking the week — confirming before anything publishes.",
        steps: [
          { stepId: "p1", capability: "distribute", toolName: "cadence-suggest", label: "Confirmed the cadence", riskLevel: "low" },
          { stepId: "p2", capability: "distribute", toolName: "persist-deliverables", label: "Queue 4 posts", riskLevel: "high" },
        ],
      };
      yield { type: "step.start", turnId, stepId: "p1", toolName: "cadence-suggest" };
      await sleep(900);
      yield { type: "step.done", turnId, stepId: "p1", receipt: { label: "Cadence suggested", detail: "Tue–Fri · 4 channels", artifactIds: [], creditsConsumed: 0 } };

      const { promise, resolve } = deferredAnswer();
      handle.answer = (a) => resolve(a);
      yield {
        type: "turn.confirm_required",
        turnId,
        stepId: "p2",
        kind: "publish",
        quote: null,
        publishTargets: [
          { platform: "instagram", scheduledAt: new Date(Date.now() + 86400000).toISOString() },
          { platform: "youtube", scheduledAt: new Date(Date.now() + 90000000).toISOString() },
          { platform: "instagram", scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString() },
          { platform: "twitter", scheduledAt: new Date(Date.now() + 4 * 86400000).toISOString() },
        ],
      };
      const answer = await promise;
      if (!answer.accepted) {
        yield { type: "turn.done", turnId, summary: "Held — nothing queued. Say the word when you want it live.", creditsConsumedTotal: 0, artifactIds: [] };
        return;
      }
      yield { type: "step.start", turnId, stepId: "p2", toolName: "persist-deliverables" };
      await sleep(1100);
      yield { type: "step.done", turnId, stepId: "p2", receipt: { label: "Deliverables persisted", detail: "4 posts queued", artifactIds: ["art_sched"], creditsConsumed: 0 } };
      yield {
        type: "turn.done",
        turnId,
        summary: "Queued — 4 posts, first one Tuesday 09:00. Nothing publishes without you.",
        creditsConsumedTotal: 0,
        artifactIds: ["art_sched"],
        stageFocus: { artifactId: "art_sched", why: "4 posts queued" },
      };
      return;
    }

    /* intent: linkedin — capability gap, honest decline */
    if (lower.includes("linkedin")) {
      yield { type: "turn.received", turnId, deliverableId: "del_summer" };
      yield {
        type: "turn.capability_gap",
        turnId,
        reason: "LinkedIn native scheduling is planned, not live — the publisher isn't wired yet.",
        alternative: {
          description: "Queue the post in-app with a reminder, or schedule today on the four live platforms.",
          proposedSteps: [],
        },
      };
      return;
    }

    /* default: exactly one clarifying question */
    yield {
      type: "turn.needs_clarification",
      turnId,
      question: "Two directions — which am I making?",
      options: [
        { id: "o1", label: "A launch reel", detail: "30s vertical, brand voice, thumbnail + schedule" },
        { id: "o2", label: "A written piece", detail: "post, email, or blog — same engine" },
      ],
    };
  }

  return { events: script(), handle };
}
