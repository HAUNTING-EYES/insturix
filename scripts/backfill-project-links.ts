/**
 * Backfill script: Create project_links for existing storyboard→project pairs.
 *
 * Idempotent — safe to run multiple times. Skips storyboards that already have
 * a project link. Does NOT overwrite existing links.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod npx tsx scripts/backfill-project-links.ts
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prev npx tsx scripts/backfill-project-links.ts --dry-run
 */

import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

  if (!uri || !dbName) {
    console.error('ERROR: Set MONGODB_URI and MONGODB_DB_NAME environment variables.');
    process.exit(1);
  }

  console.log(`Connecting to ${dbName}${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const storyboards = db.collection('storyboards');
  const projectLinks = db.collection('project_links');

  const cursor = storyboards.find(
    { projectId: { $exists: true, $nin: [null, ''] } },
    { projection: { storyboardId: 1, projectId: 1, userId: 1, sourceScriptId: 1 } },
  );

  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for await (const doc of cursor) {
    scanned++;
    const { storyboardId, projectId, userId, sourceScriptId } = doc as any;

    if (!storyboardId || !userId) {
      console.warn(`  SKIP: Missing storyboardId or userId on doc ${doc._id}`);
      skipped++;
      continue;
    }

    const existing = await projectLinks.findOne({
      userId,
      storyboardIds: storyboardId,
    });

    if (existing) {
      if (projectId && !existing.projectIds?.includes(projectId)) {
        if (DRY_RUN) {
          console.log(`  WOULD UPDATE: Add projectId ${projectId} to existing link ${existing.universalId}`);
        } else {
          await projectLinks.updateOne(
            { universalId: existing.universalId },
            { $addToSet: { projectIds: projectId }, $set: { updatedAt: new Date() } },
          );
          console.log(`  UPDATED: Added projectId ${projectId} to link ${existing.universalId}`);
        }
        created++;
      } else {
        skipped++;
      }
      continue;
    }

    const link = {
      universalId: `plink_${nanoid(12)}`,
      userId,
      storyboardIds: [storyboardId],
      projectIds: projectId ? [projectId] : [],
      videoIds: [],
      sourceScriptId: sourceScriptId || undefined,
      schemaVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${link.universalId} — storyboard ${storyboardId} → project ${projectId}`);
    } else {
      try {
        await projectLinks.insertOne(link);
        console.log(`  CREATED: ${link.universalId} — storyboard ${storyboardId} → project ${projectId}`);
      } catch (err: any) {
        console.error(`  ERROR creating link for storyboard ${storyboardId}: ${err.message}`);
        errors++;
        continue;
      }
    }
    created++;
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:  ${scanned} storyboards`);
  console.log(`Created:  ${created} links`);
  console.log(`Skipped:  ${skipped} (already linked)`);
  console.log(`Errors:   ${errors}`);
  if (DRY_RUN) console.log('(DRY RUN — no changes written)');

  await client.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
