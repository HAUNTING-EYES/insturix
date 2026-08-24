/** Smoke: distribute executor — real suggestCadence over the dev brand.
 *  BRAND_VAULT_MONGODB_DB_NAME=insturix_dev npx tsx --env-file=.env.local scripts/studio/smoke-distribute-turn.ts */
import mongoose from "mongoose";
import { runDistributeTurn } from "../../lib/studio/orchestrator/distribute";
async function main() {
  const ctx = { userId: "user_39thc9JTDrECB50Lmv886FqlAqN", orgId: null, brandId: null, forwardHeaders: {}, origin: "http://studio.test" };
  for await (const ev of runDistributeTurn(ctx, "plan our week")) {
    console.log(ev.type === "turn.done" ? `DONE · ${ev.summary}` : ev.type === "step.done" ? `receipt ✓ ${ev.receipt.label} · ${ev.receipt.detail}` : ev.type);
    if (ev.type === "turn.capability_gap") process.exitCode = 2;
  }
  await mongoose.disconnect();
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
