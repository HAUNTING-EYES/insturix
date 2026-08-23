import mongoose from "mongoose";
import { runWriteTurn } from "../../lib/studio/orchestrator/write";
async function main() {
  const ctx = {
    userId: "user_39thc9JTDrECB50Lmv886FqlAqN",
    orgId: null,
    isOrgAdmin: false,
    deliverableTitle: "Studio smoke test",
    brandId: null as string | null,
    thinkforgeSessionId: null as string | null,
    scriptId: null as string | null,
  };
  for await (const ev of runWriteTurn(ctx, "Write a short launch post for a summer drop — punchy, 2 paragraphs.", undefined)) {
    const line = ev.type === "turn.done"
      ? `DONE · ${ev.summary} · credits=${ev.creditsConsumedTotal} · words=${ev.artifactPayload?.contentMarkdown?.trim().split(/\s+/).length ?? 0} · session=${ctx.thinkforgeSessionId} script=${ctx.scriptId}`
      : ev.type === "step.progress" ? `progress · ${ev.stage ?? ""}`
      : ev.type === "step.done" ? `step ✓ ${ev.receipt.label} · ${ev.receipt.detail ?? ""}`
      : ev.type === "turn.error" ? `ERROR · ${ev.message} refund=${ev.refundIssued}`
      : ev.type;
    console.log(line);
    if (ev.type === "turn.error") process.exitCode = 1;
    if (ev.type === "turn.capability_gap") process.exitCode = 2;
  }
  await mongoose.disconnect();
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
