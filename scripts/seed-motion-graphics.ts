/**
 * Seed Motion Graphics Templates into MongoDB
 *
 * Usage:
 *   npx tsx scripts/seed-motion-graphics.ts
 *
 * Requires MONGODB_URI and MONGODB_DB_NAME (or EDITRON_MONGODB_DB_NAME) in env.
 * Safe to re-run — uses upsert to avoid duplicates.
 */

import 'dotenv/config';

async function main() {
  // Dynamic imports so env vars are loaded first
  const { MOTION_GRAPHIC_TEMPLATES } = await import(
    '../lib/editron/data/motion-graphic-templates'
  );
  const {
    bulkUpsertTemplates,
    ensureIndexes,
  } = await import('../lib/editron/services/motion-graphics-service');

  console.log(`\n[seed] Seeding ${MOTION_GRAPHIC_TEMPLATES.length} motion graphic templates...\n`);

  // 1. Ensure indexes exist
  await ensureIndexes();

  // 2. Bulk upsert all templates
  const result = await bulkUpsertTemplates(MOTION_GRAPHIC_TEMPLATES);

  console.log(`[seed] Done.`);
  console.log(`  - Upserted (new): ${result.upserted}`);
  console.log(`  - Modified (updated): ${result.modified}`);
  console.log(`  - Total templates in seed: ${MOTION_GRAPHIC_TEMPLATES.length}\n`);

  // Exit cleanly (MongoDB connection may keep process alive)
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
