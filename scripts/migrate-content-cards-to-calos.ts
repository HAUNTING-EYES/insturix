/**
 * One-time migration: thinkforge_content_cards -> calos_deliverables.
 *
 * The old content planner stored cards in `thinkforge_content_cards` (userId-scoped).
 * CalOS stores deliverables in `calos_deliverables` (ownerUserId + brandId scoped).
 *
 * Legacy cards WITHOUT a brandId cannot be scoped to a client and are SKIPPED (assign a
 * client in the calendar instead). Idempotent: a card already migrated (same card.id +
 * owner + brand) is skipped. Dry-run by default; pass --apply to write.
 *
 *   npx tsx scripts/migrate-content-cards-to-calos.ts           # dry run (reports only)
 *   npx tsx scripts/migrate-content-cards-to-calos.ts --apply   # actually migrate
 *
 * Reads MONGODB_URI + MONGODB_DB_NAME from the environment (NO hardcoded credentials).
 */
import { MongoClient } from "mongodb";
import { mapLegacyStatusToEditorial } from "@/lib/calos/deliverable-mapper";

const SOURCE = "thinkforge_content_cards";
const TARGET = "calos_deliverables";

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) {
    console.error("MONGODB_URI and MONGODB_DB_NAME must be set.");
    process.exit(1);
    return;
  }

  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const source = db.collection(SOURCE);
    const target = db.collection(TARGET);

    const cards = await source.find({}).toArray();
    let migrated = 0;
    let skippedNoClient = 0;
    let alreadyExists = 0;

    for (const card of cards) {
      const ownerUserId = card.userId as string | undefined;
      const brandId = card.brandId as string | undefined;
      const cardId = card.id as string | undefined;

      if (!ownerUserId || !brandId || !cardId) {
        skippedNoClient++;
        console.warn(
          `SKIP (no client/owner/id): "${card.title ?? "(untitled)"}" — assign a client in the calendar to migrate it.`
        );
        continue;
      }

      const exists = await target.findOne({ "card.id": cardId, ownerUserId, brandId });
      if (exists) {
        alreadyExists++;
        continue;
      }

      const now = new Date();
      const doc = {
        ownerUserId,
        orgId: null,
        brandId,
        campaignId: card.campaignId ?? null,
        editorialStatus: mapLegacyStatusToEditorial(card.status),
        version: 1,
        serviceRef: undefined,
        assetUrl: null,
        assetText: null,
        errorMessage: null,
        approvals: [],
        plannedDates: Array.isArray(card.plannedDates)
          ? card.plannedDates
          : card.date
            ? [card.date]
            : [],
        platform: card.platform ?? "generic",
        card,
        deletedAt: null,
        createdAt: card.createdAt ? new Date(card.createdAt) : now,
        updatedAt: now,
      };

      if (apply) {
        await target.insertOne(doc);
      }
      migrated++;
      console.log(`${apply ? "MIGRATED" : "WOULD MIGRATE"}: "${card.title}" -> brand ${brandId}`);
    }

    console.log("---");
    console.log(
      `Total: ${cards.length} | ${apply ? "migrated" : "would migrate"}: ${migrated} | already in CalOS: ${alreadyExists} | skipped (no client): ${skippedNoClient}`
    );
    if (!apply) console.log("Dry run. Re-run with --apply to write.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
