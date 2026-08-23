/**
 * Smoke: edit bridge frame translation (no auth needed — mocks the engine
 * stream). Feeds synthetic editron SSE frames through runEditTurn and
 * asserts the StudioTurnEvent sequence.
 * npx tsx --env-file=.env.local scripts/studio/smoke-edit-bridge.ts
 */
import { runEditTurn } from "../../lib/studio/orchestrator/edit";

function sseFrames(frames: object[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
}

async function main() {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(
      sseFrames([
        { type: "token", content: "Looking" },
        { type: "token", content: " at the cut" },
        { type: "tool_start", toolName: "get_timeline_view" },
        { type: "tool_end", toolName: "get_timeline_view" },
        { type: "tool_start", toolName: "cut_section" },
        { type: "tool_end", toolName: "cut_section" },
        { type: "done", content: "Re-cut the open." },
      ]),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  };

  const events: string[] = [];
  for await (const ev of runEditTurn(
    { userId: "user_test", orgId: null, projectId: "proj_test", forwardHeaders: {}, origin: "http://studio.test" },
    "tighten the open",
  )) {
    events.push(ev.type);
    if (ev.type === "step.done") console.log("receipt ✓", ev.receipt.label);
    if (ev.type === "turn.done") console.log("DONE ·", ev.summary, "· artifact:", ev.artifactPayload?.id, ev.artifactPayload?.sourceRef.engine);
    if (ev.type === "step.progress") console.log("progress ·", ev.stage);
  }
  (globalThis as { fetch: unknown }).fetch = originalFetch;

  console.log("bridge called:", calls[0]);
  console.log("event sequence:", events.join(" → "));
  const expected = ["turn.received", "turn.plan", "step.start", "step.done", "step.done", "turn.done"];
  const got = events.filter((e) => e !== "step.progress");
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  console.log(pass ? "PASS" : `FAIL — expected ${expected.join(",")} got ${got.join(",")}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
