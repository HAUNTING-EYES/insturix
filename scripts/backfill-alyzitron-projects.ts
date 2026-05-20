/**
 * Backfill script: Create lightweight Editron projects for standalone Alyzitron analyses.
 * Makes completed analyses visible on the Production Floor dashboard in the "Analyze" column
 * as grey (lateral-entry) cards.
 *
 * Reads from: insturix_prod/insturix_preview → alyzitron_tasks (Mongoose DB)
 * Writes to:  editron_prod/editron_prev → projects (Editron DB)
 *
 * Idempotent — safe to run multiple times. Skips tasks that already have projects.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prev ALYZITRON_DB_NAME=insturix_preview npx tsx scripts/backfill-alyzitron-projects.ts --dry-run
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod ALYZITRON_DB_NAME=insturix_prod npx tsx scripts/backfill-alyzitron-projects.ts
 */

import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  const editronDbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;
  const alyzitronDbName = process.env.ALYZITRON_DB_NAME;

  if (!uri || !editronDbName || !alyzitronDbName) {
    console.error('ERROR: Set MONGODB_URI, MONGODB_DB_NAME, and ALYZITRON_DB_NAME.');
    console.error('  Example: MONGODB_URI=... MONGODB_DB_NAME=editron_prod ALYZITRON_DB_NAME=insturix_prod');
    process.exit(1);
  }

  console.log(`Connecting...`);
  console.log(`  Alyzitron DB: ${alyzitronDbName}`);
  console.log(`  Editron DB:   ${editronDbName}`);
  console.log(`  Mode:         ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const client = new MongoClient(uri);
  await client.connect();

  const alyDb = client.db(alyzitronDbName);
  const editronDb = client.db(editronDbName);

  const tasks = alyDb.collection('alyzitron_tasks');
  const projects = editronDb.collection('projects');

  // Only backfill completed analyses (failed/processing ones aren't useful on dashboard)
  const cursor = tasks.find(
    { status: 'completed' },
    {
      projection: {
        _id: 1,
        taskId: 1,
        clerkUserId: 1,
        orgId: 1,
        videoUrl: 1,
        results: 1,
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      },
    },
  );

  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for await (const doc of cursor) {
    scanned++;
    const taskId = doc.taskId ? String(doc.taskId) : String(doc._id);
    const userId = doc.clerkUserId as string;
    const orgId = doc.orgId as string | undefined;
    const results = doc.results as any;

    if (!userId) {
      console.warn(`  SKIP: Task ${taskId} has no clerkUserId`);
      skipped++;
      continue;
    }

    // Idempotent: skip if project already exists for this task
    const existing = await projects.findOne({ userId, sourceAlyzitronTaskId: taskId });
    if (existing) {
      skipped++;
      continue;
    }

    // Derive a name from the video URL
    let name = 'Analyzed Video';
    if (doc.videoUrl) {
      const url = String(doc.videoUrl);
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        name = 'YouTube Analysis';
      } else if (url.includes('instagram.com')) {
        name = 'Instagram Analysis';
      } else if (url.match(/\.(jpeg|jpg|png|webp|gif)/i)) {
        name = 'Image Analysis';
      }
    }

    const projectId = `proj_${nanoid(12)}`;
    const now = new Date();

    const project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      visibility: orgId ? 'org' : 'private',
      pipelineStage: 'analyze',
      projectStatus: 'active',
      sourceAlyzitronTaskId: taskId,
      ...(orgId ? { orgId } : {}),
      ...(results ? {
        alyzitronAnalysis: {
          taskId,
          overallScore: results.overall_score ?? null,
          category: results.category ?? null,
          strengths: results.strengths ?? [],
          weaknesses: results.weaknesses ?? [],
          completedAt: doc.completedAt || now,
        },
        qualityScore: results.overall_score ?? null,
      } : {}),
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || doc.completedAt || now,
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: project ${projectId} for task ${taskId} ("${name}", score: ${results?.overall_score ?? 'N/A'})`);
    } else {
      try {
        await projects.insertOne(project);
        console.log(`  CREATED: project ${projectId} for task ${taskId} ("${name}", score: ${results?.overall_score ?? 'N/A'})`);
      } catch (err: any) {
        console.error(`  ERROR for task ${taskId}: ${err.message}`);
        errors++;
        continue;
      }
    }
    created++;
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:            ${scanned} completed Alyzitron tasks`);
  console.log(`Created:            ${created} analyze-stage projects`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Errors:             ${errors}`);
  if (DRY_RUN) console.log('\n(DRY RUN — no changes written)');

  await client.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
