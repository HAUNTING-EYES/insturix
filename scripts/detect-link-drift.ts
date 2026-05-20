/**
 * Drift detection: Find entities missing from the project_links chain.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod npx tsx scripts/detect-link-drift.ts
 */

import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

  if (!uri || !dbName) {
    console.error('ERROR: Set MONGODB_URI and MONGODB_DB_NAME environment variables.');
    process.exit(1);
  }

  console.log(`Drift detection on ${dbName}...\n`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const storyboards = db.collection('storyboards');
  const projects = db.collection('projects');
  const renderJobs = db.collection('editron_render_jobs');
  const links = db.collection('project_links');

  console.log('--- 1. Storyboards with projectId but no project link ---');
  const finalizedStoryboards = await storyboards
    .find({ projectId: { $exists: true, $nin: [null, ''] } })
    .project({ storyboardId: 1, projectId: 1, userId: 1 })
    .toArray();

  let unlinkedStoryboards = 0;
  for (const sb of finalizedStoryboards) {
    const link = await links.findOne({ userId: sb.userId, storyboardIds: sb.storyboardId });
    if (!link) {
      unlinkedStoryboards++;
      console.log(`  DRIFT: storyboard ${sb.storyboardId} → project ${sb.projectId} (user ${sb.userId})`);
    }
  }
  console.log(`  ${unlinkedStoryboards} unlinked / ${finalizedStoryboards.length} total\n`);

  console.log('--- 2. Editron projects with no project link ---');
  const allProjects = await projects.find({}).project({ projectId: 1, userId: 1 }).toArray();
  let unlinkedProjects = 0;
  for (const proj of allProjects) {
    const link = await links.findOne({ userId: proj.userId, projectIds: proj.projectId });
    if (!link) {
      unlinkedProjects++;
      console.log(`  DRIFT: project ${proj.projectId} (user ${proj.userId})`);
    }
  }
  console.log(`  ${unlinkedProjects} unlinked / ${allProjects.length} total\n`);

  console.log('--- 3. Completed renders with no video in project link ---');
  const completedRenders = await renderJobs
    .find({ status: 'done' })
    .project({ _id: 1, projectId: 1, userId: 1 })
    .toArray();
  let unlinkedRenders = 0;
  for (const job of completedRenders) {
    const link = await links.findOne({ userId: job.userId, videoIds: job._id });
    if (!link) {
      unlinkedRenders++;
      console.log(`  DRIFT: render ${job._id} → project ${job.projectId} (user ${job.userId})`);
    }
  }
  console.log(`  ${unlinkedRenders} unlinked / ${completedRenders.length} total\n`);

  console.log('--- 4. Orphaned project link shells ---');
  const orphanedLinks = await links
    .find({
      $and: [
        { $or: [{ storyboardIds: { $size: 0 } }, { storyboardIds: { $exists: false } }] },
        { $or: [{ projectIds: { $size: 0 } }, { projectIds: { $exists: false } }] },
      ],
    })
    .project({ universalId: 1, userId: 1, createdAt: 1 })
    .toArray();
  for (const link of orphanedLinks) {
    console.log(`  ORPHAN: ${link.universalId} (user ${link.userId}, created ${link.createdAt})`);
  }
  console.log(`  ${orphanedLinks.length} orphaned shells\n`);

  console.log('=== SUMMARY ===');
  console.log(`Storyboards without link:  ${unlinkedStoryboards}/${finalizedStoryboards.length}`);
  console.log(`Projects without link:     ${unlinkedProjects}/${allProjects.length}`);
  console.log(`Renders without link:      ${unlinkedRenders}/${completedRenders.length}`);
  console.log(`Orphaned link shells:      ${orphanedLinks.length}`);

  const totalDrift = unlinkedStoryboards + unlinkedProjects + unlinkedRenders + orphanedLinks.length;
  if (totalDrift === 0) {
    console.log('\nNo drift detected.');
  } else {
    console.log(`\n${totalDrift} total drift items. Run backfill-project-links.ts to fix storyboard/project gaps.`);
  }

  await client.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
