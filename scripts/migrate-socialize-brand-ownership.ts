import mongoose from "mongoose";
// Explicit file extensions for ESM resolution under the ts-node ESM loader.
import Socialize from "../schemas/Socialize.ts";
import connectToDatabase from "../schemas/ConnectToDatabase.ts";
import { listAuthorizedBrandScopes } from "../lib/shared/brand-scope.ts";

/**
 * §17 Phase 9 backfill: migrate EXISTING user-owned public profiles to
 * brand ownership. Deterministic and deliberately conservative — a profile
 * is stamped with brandId ONLY when its owner has EXACTLY ONE authorized
 * brand scope. Zero or multiple scopes = ambiguous, logged, untouched
 * (the Brands-place editor can assign it deliberately later). Idempotent:
 * profiles that already have a brandId are skipped.
 */
const migrateSocializeBrandOwnership = async () => {
  console.log("Connecting to the database...");
  await connectToDatabase();
  console.log("Database connected.");

  const unowned = await Socialize.find({ brandId: null }).lean();
  console.log(`Profiles without brand ownership: ${unowned.length}`);

  let stamped = 0;
  const skipped: Array<{ username: string; reason: string }> = [];

  for (const doc of unowned) {
    const username = String((doc as unknown as { username: string }).username);
    const clerkUserId = String((doc as unknown as { clerkUserId: string }).clerkUserId);
    try {
      const scopes = await listAuthorizedBrandScopes({ userId: clerkUserId, orgId: null });
      if (scopes.length === 1) {
        await Socialize.updateOne({ _id: doc._id }, { $set: { brandId: scopes[0].brandId } });
        stamped += 1;
        console.log(`  ${username} → ${scopes[0].brandId} (${scopes[0].brandName})`);
      } else {
        skipped.push({ username, reason: scopes.length === 0 ? "owner has no brand scopes" : `owner has ${scopes.length} scopes — ambiguous` });
      }
    } catch (error) {
      skipped.push({ username, reason: `scope resolution failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  console.log(`\nStamped: ${stamped}`);
  if (skipped.length > 0) {
    console.log(`Skipped (deliberately untouched): ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s.username}: ${s.reason}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
};

migrateSocializeBrandOwnership().catch(async (error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => undefined);
});
