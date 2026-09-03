import mongoose from "mongoose";
// Explicit file extensions for ESM resolution under the ts-node ESM loader.
import { ProjectModel, connectSpine } from "../lib/studio/persist/db.ts";

/**
 * Audit P0 backfill: org-null spine projects gain an owner of record.
 * session_* projects derive it from their ThinkForge session's owner; any
 * other ownerless org-null row is logged untouched (undecidable — assign
 * deliberately or delete if it's scratch data). Idempotent.
 */
const migrateSpineOwners = async () => {
  console.log("Connecting to the spine...");
  await connectSpine();
  /* TF sessions live on their own connection (thinkforge_db) — same cluster
   * in this deployment; reach the collection through a side connection */
  const tfUri = process.env.MONGODB_URI ?? "";
  const tfDbName = process.env.THINKFORGE_DB_NAME ?? "thinkforge_db";
  const tfConn = await mongoose.createConnection(tfUri, { dbName: tfDbName }).asPromise();
  const sessions = tfConn.collection("thinkforge_sessions");

  const rows = await ProjectModel.find({ organizationId: null, ownerUserId: null }).lean();
  console.log(`Ownerless org-null projects: ${rows.length}`);

  let stamped = 0;
  const undecidable: string[] = [];
  for (const doc of rows) {
    const id = String((doc as { _id: unknown })._id);
    if (id.startsWith("session_")) {
      const session = (await sessions.findOne({ _id: id } as never)) as unknown as { userId?: string } | null;
      if (session?.userId) {
        await ProjectModel.updateOne({ _id: id }, { $set: { ownerUserId: session.userId } });
        stamped += 1;
        console.log(`  ${id} → ${session.userId}`);
      } else {
        undecidable.push(`${id} (TF session missing or ownerless)`);
      }
    } else {
      undecidable.push(id);
    }
  }

  console.log(`\nStamped: ${stamped}`);
  if (undecidable.length > 0) {
    console.log(`Undecidable (left untouched): ${undecidable.length}`);
    for (const id of undecidable) console.log(`  ${id}`);
  }
  await tfConn.close().catch(() => undefined);
  await mongoose.disconnect();
  console.log("Done.");
};

migrateSpineOwners().catch(async (error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => undefined);
});
